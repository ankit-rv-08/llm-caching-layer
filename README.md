# ⚡ SF Cost-Aware LLM Router

![Next.js](https://img.shields.io/badge/Next.js-14.x-black?style=for-the-badge&logo=next.js)
![Redis](https://img.shields.io/badge/Redis-Upstash-red?style=for-the-badge&logo=redis)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?style=for-the-badge&logo=vercel)
![Status](https://img.shields.io/badge/Status-Live_in_Production-success?style=for-the-badge)

An enterprise-grade middleware architecture built for the **SFCollab** ecosystem. This system is designed to intercept, cache, and serve LLM responses to drastically reduce API latency and protect global token budgets.

## 🚀 Live Environments

- **Frontend Dashboard / UI:** [Live on Vercel](https://llm-caching-layer.vercel.app/)
- **Core API Endpoint:** `https://llm-caching-layer.vercel.app/api/ask`

---

## 🧠 Architectural Strategy: The Dual-Cache Engine

LLM calls cost money and introduce severe latency (avg. 15s - 30s). When SFCollab scales, redundant or nearly identical user queries should never hit the core model twice. This middleware acts as a gatekeeper using a two-tier verification system:

### 1. Tier One: Exact-Match Cache (Redis)
- **Mechanism:** The incoming prompt is string-normalized and hashed.
- **Action:** If an exact key exists in the Upstash Redis store, the response is served instantly.
- **Latency Impact:** Drops from ~25,000ms to **<800ms**.

### 2. Tier Two: Semantic Cache (Vector Embeddings)
- **Mechanism:** The prompt is converted into vector embeddings and compared against previously cached queries using Cosine Similarity.
- **The Safety Threshold (0.92):** Semantic caching can silently serve destructive answers if tuned too aggressively (e.g., confusing "How do I add a user?" with "How do I delete a user?"). By enforcing a strict **0.92 cosine similarity threshold**, the router safely captures conversational variations while entirely neutralizing the risk of false positives.

---

## 🛠 Tech Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js (React) | Live telemetry dashboard and query simulation |
| **Styling** | TailwindCSS | Modern, dark-mode sleek UI components |
| **Backend API** | Next.js API Routes | Serverless routing engine |
| **Database / Cache** | Upstash (Redis) | High-speed persistent key-value caching |
| **Core LLM** | Gemini / OpenAI | Fallback generation engine for novel queries |

---

## 📡 API Reference

### 1. Submit Query
**POST** `/api/ask`

**Payload:**
```json
{
  "prompt": "What is SFCollab?"
}

Response:

JSON
{
  "source": "REDIS_EXACT_MATCH",
  "answer": "SFCollab is an AI-native startup ecosystem...",
  "latency_ms": 737,
  "tokens_saved": 505
}
2. Get Telemetry Stats
GET /api/cache-stats
Retrieves live hit-rates, total tokens saved, and cache performance metrics for the frontend dashboard.

💻 Local Setup & Development
To run this telemetry dashboard locally:

Clone the repository:

Bash
git clone [https://github.com/ankit-rv-08/llm-caching-layer.git](https://github.com/ankit-rv-08/llm-caching-layer.git)
cd llm-caching-layer
Install dependencies:

Bash
npm install
Configure Environment Variables:
Create a .env file in the root directory:

Code snippet
LLM_API_KEY=your_gemini_or_openai_key
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
Spin up the server:

Bash
npm run dev
Navigate to http://localhost:3000 to view the live LLM router.
