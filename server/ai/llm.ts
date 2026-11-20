import type { z } from "zod";
import { askJson as claudeJson, MODEL as CLAUDE_MODEL, AiConfigError } from "./claude.ts";
import { geminiGenerate, geminiModels } from "./gemini.ts";

export { AiConfigError };
export type Provider = "gemini" | "anthropic" | null;
export interface Usage { input: number; output: number }

/** AC-100: provider resolution. */
export function resolveProvider(env: Record<string, string | undefined> = process.env): Provider {
  const pref = env.LLM_PROVIDER?.trim().toLowerCase();
  const g = Boolean(env.GEMINI_API_KEY?.trim()), a = Boolean(env.ANTHROPIC_API_KEY?.trim());
  if (pref === "gemini" && g) return "gemini";
  if (pref === "anthropic" && a) return "anthropic";
  if (g) return "gemini";
  if (a) return "anthropic";
  return null;
}
export const isAiConfigured = () => resolveProvider() !== null;
export const activeModel = () => {
  const p = resolveProvider();
  return p === "gemini" ? geminiModels()[0] : p === "anthropic" ? CLAUDE_MODEL() : "none";
};
export function requireAi() {
  if (!isAiConfigured()) throw new AiConfigError("No AI key configured. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in .env and restart.");
}

/** Single entry point used by analysis, drafting and proposals. Validates with zod, retries once. */
export async function askJson<T>(system: string, user: string, schema: z.ZodType<T>, maxTokens = 3000): Promise<{ data: T; usage: Usage }> {
  const p = resolveProvider();
  if (p === "anthropic") return claudeJson(system, user, schema, maxTokens);
  if (p !== "gemini") requireAi();
  const usage: Usage = { input: 0, output: 0 };
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await geminiGenerate(system, attempt === 0 ? user : `${user}\n\nYour previous reply was invalid (${lastErr}). Reply with ONLY one valid JSON object.`, Math.max(maxTokens * 2, 4096));
    usage.input += r.usage.input; usage.output += r.usage.output;
    try {
      const t = r.text;
      return { data: schema.parse(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1))), usage };
    } catch (e) { lastErr = (e as Error).message.slice(0, 300); }
  }
  throw new Error(`Model returned invalid output twice: ${lastErr}`);
}
