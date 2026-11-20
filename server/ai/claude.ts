import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export class AiConfigError extends Error {}

let client: Anthropic | null = null;
function getClient() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new AiConfigError("ANTHROPIC_API_KEY is not set on the server. Add it to .env and restart.");
  client ??= new Anthropic({ apiKey: key });
  return client;
}

export interface Usage { input: number; output: number }

/** Calls Claude, expects a single JSON object, validates with zod, retries once on invalid output. */
export async function askJson<T>(system: string, user: string, schema: z.ZodType<T>, maxTokens = 3000): Promise<{ data: T; usage: Usage }> {
  const c = getClient();
  const usage: Usage = { input: 0, output: 0 };
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await c.messages.create({
      model: MODEL(), max_tokens: maxTokens, system,
      messages: [{ role: "user", content: attempt === 0 ? user : `${user}\n\nYour previous reply was invalid (${lastErr}). Reply with ONLY one valid JSON object.` }],
    });
    usage.input += msg.usage.input_tokens; usage.output += msg.usage.output_tokens;
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    try {
      return { data: schema.parse(JSON.parse(json)), usage };
    } catch (e) {
      lastErr = (e as Error).message.slice(0, 300);
    }
  }
  throw new Error(`Model returned invalid output twice: ${lastErr}`);
}
