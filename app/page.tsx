"use client";

import { useState } from "react";
import { Send, Zap, Database, Cpu, DollarSign, Clock, Activity, ShieldCheck, BarChart3, ExternalLink } from "lucide-react";

type Message = { role: "user" | "ai"; content: string };
type Metrics = { 
  source: string; 
  latency: number; 
  costSaved: boolean; 
  threshold: string | number;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokensSaved: number;
  traceId: string;
  traceUrl: string;
};

export default function ExecutiveCachingHUD() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userQ = query;
    setQuery("");
    setMessages((prev) => [...prev, { role: "user", content: userQ }]);
    setLoading(true);

    try {
      const startTime = Date.now();
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userQ }),
      });

      const data = await res.json();
      const endTime = Date.now();

      setMessages((prev) => [...prev, { role: "ai", content: data.answer }]);
      
      setMetrics({
        source: data.source || "GEMINI_API_FRESH",
        latency: data.latencyMs || (endTime - startTime),
        costSaved: data.source !== "GEMINI_API_FRESH" && data.source !== undefined,
        threshold: data.threshold || "N/A",
        costUsd: data.cost_usd || 0,
        promptTokens: data.prompt_tokens || 0,
        completionTokens: data.completion_tokens || 0,
        totalTokens: data.tokens_used || 0,
        tokensSaved: data.tokens_saved || 0,
        traceId: data.trace_id || "Unavailable",
        traceUrl: data.trace_url || "#",
      });
    } catch {
      setMessages((prev) => [...prev, { role: "ai", content: "Error connecting to AI Routing Layer." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT: Chat Interface */}
        <div className="lg:col-span-8 flex flex-col h-[85vh] bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden relative">
          <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500" />
          
          <div className="p-6 border-b border-slate-800 bg-[#111827]/80 flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-3 text-white">
                <Cpu className="text-violet-400" size={24} />
                SF Cost-Aware LLM Router
              </h1>
              <p className="text-slate-400 text-xs mt-1 tracking-wide uppercase">Enterprise Dual-Cache Engine</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-full border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              SYSTEM ONLINE
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
                <Database className="h-16 w-16 opacity-20" />
                <p className="text-sm tracking-wide">Enter a query to initialize routing telemetry.</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user" ? "bg-violet-600/90 text-white" : "bg-slate-800 border border-slate-700 text-slate-300"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 p-4 rounded-2xl flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce delay-100" />
                  <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleAsk} className="p-4 bg-[#0B0F19] border-t border-slate-800">
            <div className="relative flex items-center">
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask a question..."
                className="w-full bg-[#111827] border border-slate-700 rounded-xl py-4 pl-5 pr-14 text-sm focus:outline-none focus:border-violet-500 text-white" disabled={loading} />
              <button type="submit" disabled={loading || !query.trim()} className="absolute right-2 p-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-white">
                <Send size={18} />
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT: Telemetry HUD */}
        <div className="lg:col-span-4 space-y-4 h-full flex flex-col">
          <div className="bg-[#111827] border border-slate-800 p-6 rounded-2xl shadow-xl flex-1">
            <h2 className="text-sm font-bold text-slate-300 border-b border-slate-800 pb-4 mb-6 flex items-center gap-2 uppercase tracking-wider">
              <Activity className="text-cyan-400" size={16} /> Live Telemetry
            </h2>
            
            {metrics ? (
              <div className="space-y-4">
                <div className="bg-[#0B0F19] p-4 rounded-xl border border-slate-800">
                  <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">Routing Engine</div>
                  <div className={`flex items-center gap-2 font-mono text-sm font-bold ${metrics.source.includes("REDIS") ? "text-emerald-400" : metrics.source.includes("SUPABASE") ? "text-cyan-400" : "text-amber-400"}`}>
                    {metrics.source.includes("REDIS") && <Zap size={16} />}
                    {metrics.source.includes("SUPABASE") && <Database size={16} />}
                    {metrics.source.includes("GEMINI") && <Cpu size={16} />}
                    {metrics.source.replace("_", " ")}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#0B0F19] p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">
                      <Clock size={12} /> Latency
                    </div>
                    <div className="text-xl font-mono text-white">{metrics.latency} <span className="text-xs text-slate-500">ms</span></div>
                  </div>
                  <div className="bg-[#0B0F19] p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">
                      <DollarSign size={12} /> API Cost
                    </div>
                    <div className={`text-sm font-mono font-bold mt-1 ${metrics.costSaved ? "text-emerald-400" : "text-rose-400"}`}>
                      {metrics.costSaved ? "$0.00000 (100% Saved)" : `$${metrics.costUsd.toFixed(5)}`}
                    </div>
                  </div>
                </div>

                <div className="bg-[#0B0F19] p-4 rounded-xl border border-slate-800 space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Cosine Similarity</span>
                      <span className="font-mono text-xs text-slate-300">{metrics.threshold}</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      <BarChart3 size={12} /> Tokens Saved
                    </span>
                    <span className="font-mono text-sm text-emerald-400">{metrics.tokensSaved}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-800 space-y-2 text-xs font-mono">
                    <div className="flex justify-between"><span className="text-slate-500">Prompt Tokens</span><span>{metrics.promptTokens}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Completion Tokens</span><span>{metrics.completionTokens}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Total Tokens</span><span>{metrics.totalTokens}</span></div>
                  </div>
                </div>

                <a href={metrics.traceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 bg-[#0B0F19] p-4 rounded-xl border border-slate-800 text-xs hover:border-cyan-500/60 transition-colors">
                  <span className="text-slate-500 uppercase tracking-wider">Langfuse Trace ID</span>
                  <span className="flex items-center gap-2 font-mono text-cyan-400 truncate"><span className="truncate">{metrics.traceId}</span><ExternalLink size={13} /></span>
                </a>
              </div>
            ) : (
              <div className="text-center text-slate-600 py-12"><ShieldCheck className="mx-auto h-10 w-10 opacity-20 mb-3" /><p className="text-xs uppercase tracking-widest">Awaiting First Query</p></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
