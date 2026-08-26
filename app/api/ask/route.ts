import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { Langfuse } from "langfuse";

const redis = Redis.fromEnv();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const INPUT_COST_PER_MILLION = Number(process.env.GEMINI_INPUT_COST_PER_MILLION || "0.075");
const OUTPUT_COST_PER_MILLION = Number(process.env.GEMINI_OUTPUT_COST_PER_MILLION || "0.3");
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_BASEURL,
});

async function flushTelemetry() {
  try {
    await langfuse.flushAsync();
  } catch (error) {
    console.error("Langfuse Flush Error", error);
  }
}

function estimateTokens(text: unknown) {
  return Math.ceil(String(text).length / 4);
}

function traceMetadata(trace: ReturnType<Langfuse["trace"]>) {
  return {
    trace_id: trace.id,
    trace_url: trace.getTraceUrl(),
  };
}

export async function POST(req: Request) {
  const { question } = await req.json();
  const trace = langfuse.trace({
    name: "SFCollab_LLM_Router",
    input: question,
  });

  try {
    const startTime = Date.now();
    const normalizedQuery = question.toLowerCase().trim();

    // Short-circuit for local demo mode to avoid external API calls
    if (process.env.DEV_MODE && process.env.DEV_MODE !== 'false') {
      const mock = `Demo answer (DEV_MODE): set GEMINI_API_KEY and SUPABASE keys for real responses.`;
      trace.update({ output: mock, tags: ["Mock_Dev_Fallback"] });
      await flushTelemetry();
      return NextResponse.json({
        answer: mock,
        source: "MOCK_DEV_FALLBACK",
        latencyMs: Date.now() - startTime,
        costSaved: false,
        threshold: "N/A",
        cost_usd: 0,
        prompt_tokens: estimateTokens(question),
        completion_tokens: estimateTokens(mock),
        tokens_used: estimateTokens(question) + estimateTokens(mock),
        tokens_saved: 0,
        ...traceMetadata(trace),
      });
    }

    // DEV_MODE shortcut: return a mock response without calling external services
    console.log('DEV_MODE flag:', process.env.DEV_MODE);
    const devModeEnabled = !!process.env.DEV_MODE && String(process.env.DEV_MODE).toLowerCase() !== 'false';
    if (devModeEnabled) {
      const mock = `Demo answer (DEV_MODE): "${normalizedQuery}" -> This is a local mock response.`;
      return NextResponse.json({
        answer: mock,
        source: "MOCK_DEV_FALLBACK",
        latencyMs: Date.now() - startTime,
        costSaved: true,
        threshold: "N/A",
        cost_usd: 0,
        prompt_tokens: estimateTokens(normalizedQuery),
        completion_tokens: estimateTokens(mock),
        tokens_used: estimateTokens(normalizedQuery) + estimateTokens(mock),
        tokens_saved: 0,
        ...traceMetadata(trace),
      });
    }

    // 1. EXACT MATCH (Upstash Redis)
    try {
      const exactCache = await redis.get(normalizedQuery);
      if (exactCache) {
        trace.update({
          output: exactCache,
          tags: ["Exact_Match_Cache", "Cost_Saved"],
        });
        await flushTelemetry();
        return NextResponse.json({
          answer: exactCache,
          source: "REDIS_EXACT_MATCH",
          latencyMs: Date.now() - startTime,
          costSaved: true,
          threshold: "1.0 (Exact)",
          cost_usd: 0,
          prompt_tokens: estimateTokens(normalizedQuery),
          completion_tokens: 0,
          tokens_used: estimateTokens(normalizedQuery),
          tokens_saved: estimateTokens(normalizedQuery) + estimateTokens(exactCache),
          ...traceMetadata(trace),
        });
      }
    } catch (e) {
      console.error("Redis Error", e);
    }

    // 2. SEMANTIC MATCH (Supabase pgvector)
    let queryEmbedding = null;
    try {
      // Use the official SDK instead of a raw REST fetch!
      const embedResponse = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: normalizedQuery,
      });
      
      if (embedResponse.embeddings && embedResponse.embeddings.length > 0) {
        queryEmbedding = embedResponse.embeddings[0].values;
      }

      if (queryEmbedding) {
        const { data: semanticMatches, error: matchError } = await supabase.rpc('match_cache', {
          query_embedding: queryEmbedding,
          match_threshold: 0.92,
          match_count: 1
        });

        if (matchError) console.error("Supabase RPC Error:", matchError);

        if (semanticMatches && semanticMatches.length > 0) {
          trace.update({
            output: semanticMatches[0].response_text,
            tags: ["Semantic_Match_Cache", "Cost_Saved"],
          });
          await flushTelemetry();
          return NextResponse.json({
            answer: semanticMatches[0].response_text,
            source: "SUPABASE_SEMANTIC_MATCH",
            latencyMs: Date.now() - startTime,
            costSaved: true,
            threshold: semanticMatches[0].similarity.toFixed(3),
            cost_usd: 0,
            prompt_tokens: estimateTokens(normalizedQuery),
            completion_tokens: 0,
            tokens_used: estimateTokens(normalizedQuery),
            tokens_saved: estimateTokens(normalizedQuery) + estimateTokens(semanticMatches[0].response_text),
            ...traceMetadata(trace),
          });
        }
      }
    } catch (e) {
      console.error("Vector/Embedding Error:", e);
      // Fails gracefully to Layer 3 if the embedding model errors out
    }

    // 3. FALLBACK TO LLM (Gemini)
    let freshAnswer = "I'm sorry, I could not generate an answer.";
    let promptTokens = estimateTokens(normalizedQuery);
    let completionTokens = estimateTokens(freshAnswer);
    let totalTokens = promptTokens + completionTokens;
    let costUsd = 0;
    const generation = trace.generation({
      name: "Gemini_API_Call",
      model: GEMINI_MODEL,
      input: normalizedQuery,
    });
    try {
      const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: normalizedQuery,
      });
      if (response.text) freshAnswer = response.text;
      const usage = (response as typeof response & {
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      }).usageMetadata;
      promptTokens = usage?.promptTokenCount ?? estimateTokens(normalizedQuery);
      completionTokens = usage?.candidatesTokenCount ?? estimateTokens(freshAnswer);
      totalTokens = usage?.totalTokenCount ?? promptTokens + completionTokens;
      costUsd = (promptTokens * INPUT_COST_PER_MILLION + completionTokens * OUTPUT_COST_PER_MILLION) / 1_000_000;
      generation.end({
        output: freshAnswer,
        usage: {
          input: promptTokens,
          output: completionTokens,
          total: totalTokens,
        },
      });
    } catch (e) {
      console.error("Gemini Gen Error", e);
      generation.end({ output: String(e) });
      trace.update({ tags: ["Error"] });
      await flushTelemetry();
      return NextResponse.json({ error: "LLM Generation Failed" }, { status: 500 });
    }

    // 4. ASYNC CACHE WRITE
    try {
      const dbWrites = [];
      dbWrites.push(redis.set(normalizedQuery, freshAnswer, { ex: 86400 })); 
      
      if (queryEmbedding) {
        dbWrites.push(supabase.from('semantic_cache').insert({
          query_text: normalizedQuery,
          response_text: freshAnswer,
          embedding: queryEmbedding
        }));
      }
      Promise.all(dbWrites).catch(err => console.error("Sync failed", err));
    } catch (e) {
      console.error("Cache Write Error", e);
    }

    trace.update({
      output: freshAnswer,
      tags: ["Fresh_API_Call"],
    });
    await flushTelemetry();

    return NextResponse.json({
      answer: freshAnswer,
      source: "GEMINI_API_FRESH",
      latencyMs: Date.now() - startTime,
      costSaved: false,
      threshold: "N/A",
      cost_usd: costUsd,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      tokens_used: totalTokens,
      tokens_saved: 0,
      ...traceMetadata(trace),
    });

  } catch (error) {
    console.error("Routing Error:", error);
    trace.update({ tags: ["Error"] });
    await flushTelemetry();
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
