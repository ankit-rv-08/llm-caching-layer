import { GoogleGenAI } from '@google/genai';

// Initialize the official GenAI SDK
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
