const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash"];

export interface GeminiResult { text: string; usage: { input: number; output: number }; sources: { title: string; uri: string }[]; model: string }

export function geminiModels(): string[] {
  const first = process.env.GEMINI_MODEL?.trim();
  return [...new Set([first, ...FALLBACK_MODELS].filter(Boolean) as string[])];
}

/** Pure: builds the request. Key goes in a header, never the URL (AC-101). */
export function buildGeminiRequest(model: string, key: string, system: string, user: string, maxTokens: number, opts: { json?: boolean; search?: boolean } = {}) {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: maxTokens, ...(opts.json !== false && !opts.search ? { responseMimeType: "application/json" } : {}) },
  };
  if (opts.search) body.tools = [{ google_search: {} }];
  return {
    url: `${BASE}/${model}:generateContent`,
    init: { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) } as RequestInit,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GeminiError extends Error {}

/** Tries each model; retries 429/503 with backoff; surfaces a readable error. */
export async function geminiGenerate(system: string, user: string, maxTokens: number, opts: { json?: boolean; search?: boolean } = {}): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set");
  let last = "";
  for (const model of geminiModels()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { url, init } = buildGeminiRequest(model, key, system, user, maxTokens, opts);
      let res: Response;
      try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }); } catch (e) { last = (e as Error).message; await sleep(800 * (attempt + 1)); continue; }
      const j: any = await res.json().catch(() => ({}));
      if (res.ok) {
        const cand = j.candidates?.[0];
        const text = (cand?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
        if (!text) { last = `empty response (${cand?.finishReason ?? "no candidate"})`; break; }
        const sources = (cand?.groundingMetadata?.groundingChunks ?? []).map((c: any) => ({ title: c.web?.title ?? "", uri: c.web?.uri ?? "" })).filter((s: any) => s.uri);
        return { text, sources, model, usage: { input: j.usageMetadata?.promptTokenCount ?? 0, output: j.usageMetadata?.candidatesTokenCount ?? 0 } };
      }
      last = `${res.status} ${j.error?.message ?? ""}`.slice(0, 200);
      if (res.status === 503 || res.status === 500) { await sleep(1500 * (attempt + 1)); continue; }
      break; // 429 / 404 / 400: try next model
    }
  }
  throw new GeminiError(/quota|RESOURCE_EXHAUSTED|429/.test(last) ? `Gemini free-tier quota reached for now (${last}). Wait a bit or try again later.` : `Gemini request failed: ${last}`);
}
