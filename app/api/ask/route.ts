import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const redis = Redis.fromEnv();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

export async function POST(req: Request) {
  try {
    const { question } = await req.json();
    const startTime = Date.now();
    const normalizedQuery = question.toLowerCase().trim();

    // Short-circuit for local demo mode to avoid external API calls
    if (process.env.DEV_MODE && process.env.DEV_MODE !== 'false') {
      const mock = `Demo answer (DEV_MODE): set GEMINI_API_KEY and SUPABASE keys for real responses.`;
      return NextResponse.json({
        answer: mock,
        source: "MOCK_DEV_FALLBACK",
        latencyMs: Date.now() - startTime,
        costSaved: false,
        threshold: "N/A"
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
        threshold: "N/A"
      });
    }

    // 1. EXACT MATCH (Upstash Redis)
    try {
      const exactCache = await redis.get(normalizedQuery);
      if (exactCache) {
        return NextResponse.json({
          answer: exactCache,
          source: "REDIS_EXACT_MATCH",
          latencyMs: Date.now() - startTime,
          costSaved: true,
          threshold: "1.0 (Exact)"
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
          return NextResponse.json({
            answer: semanticMatches[0].response_text,
            source: "SUPABASE_SEMANTIC_MATCH",
            latencyMs: Date.now() - startTime,
            costSaved: true,
            threshold: semanticMatches[0].similarity.toFixed(3)
          });
        }
      }
    } catch (e) {
      console.error("Vector/Embedding Error:", e);
      // Fails gracefully to Layer 3 if the embedding model errors out
    }

    // 3. FALLBACK TO LLM (Gemini)
    let freshAnswer = "I'm sorry, I could not generate an answer.";
    try {
      const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: normalizedQuery,
      });
      if (response.text) freshAnswer = response.text;
    } catch (e) {
      console.error("Gemini Gen Error", e);
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

    return NextResponse.json({
      answer: freshAnswer,
      source: "GEMINI_API_FRESH",
      latencyMs: Date.now() - startTime,
      costSaved: false,
      threshold: "N/A"
    });

  } catch (error) {
    console.error("Routing Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
