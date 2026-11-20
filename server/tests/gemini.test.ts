import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { resolveProvider } from "../ai/llm.ts";
import { buildGeminiRequest } from "../ai/gemini.ts";
import { growthSignals, discoverySource } from "../lib/discovery.ts";
import { finalizeProposal } from "../lib/proposal.ts";
import { openDb } from "../db.ts";
import { createApp } from "../app.ts";

test("AC-100 provider resolution", () => {
  assert.equal(resolveProvider({ GEMINI_API_KEY: "k" }), "gemini");
  assert.equal(resolveProvider({ ANTHROPIC_API_KEY: "k" }), "anthropic");
  assert.equal(resolveProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", LLM_PROVIDER: "anthropic" }), "anthropic");
  assert.equal(resolveProvider({}), null);
});

test("AC-101 gemini request: key in header not URL, json mode, search only when asked", () => {
  const plain = buildGeminiRequest("m", "SECRET", "sys", "usr", 100);
  assert.equal(plain.url.includes("SECRET"), false);
  assert.equal((plain.init.headers as Record<string, string>)["x-goog-api-key"], "SECRET");
  const body = JSON.parse(plain.init.body as string);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.tools, undefined);
  const search = JSON.parse(buildGeminiRequest("m", "k", "s", "u", 100, { search: true }).init.body as string);
  assert.deepEqual(search.tools, [{ google_search: {} }]);
});

test("AC-102 growth signals are hedged and rule-based", () => {
  assert.equal(growthSignals({ website: null, rating: null, review_count: null }).some((s) => /no website/i.test(s)), true);
  assert.equal(growthSignals({ website: "x.com", rating: 4.6, review_count: 200 }).some((s) => /well reviewed/i.test(s)), true);
  assert.deepEqual(growthSignals({ website: "x.com", rating: null, review_count: null }), []);
  const all = [{ website: null, rating: 4.8, review_count: 300 }, { website: "a.com", rating: 4.5, review_count: 5 }].flatMap(growthSignals);
  assert.equal(all.some((s) => /\bis growing\b|\bare growing\b/i.test(s)), false);
});

test("AC-106 investment comes from catalogue or the to-be-confirmed text, never the model", () => {
  const model = [{ title: "Investment", body: "Only 99,999 rupees guaranteed" }, { title: "Your situation", body: "Context here" }];
  const withPrice = finalizeProposal(model, "INR 15,000-20,000");
  assert.equal(withPrice.length, 8);
  assert.equal(withPrice[0].title, "Your situation");
  assert.match(withPrice[6].body, /INR 15,000-20,000/);
  assert.equal(/99,999/.test(withPrice[6].body), false);
  assert.match(finalizeProposal(model, "Quote after discovery")[6].body, /to be confirmed/i);
  assert.match(finalizeProposal(model, null)[6].body, /to be confirmed/i);
});

let server: Server;
let base = "";
before(async () => {
  for (const k of ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_PLACES_API_KEY"]) delete process.env[k];
  const app = createApp(openDb(":memory:"), "test-secret-test-secret");
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
const reg = async (e: string) => (await call("POST", "/api/auth/register", undefined, { email: e, password: "password123" })).json.token as string;

test("AC-103 discovery source selection and disabled -> 503", async () => {
  assert.equal(discoverySource({ GOOGLE_PLACES_API_KEY: "k" }), "places");
  assert.equal(discoverySource({}), "osm");
  assert.equal(discoverySource({ DISCOVERY_SOURCE: "none" }), null);
  process.env.DISCOVERY_SOURCE = "none";
  const t = await reg("disc@test.com");
  assert.equal((await call("POST", "/api/discover", t, { query: "salons", location: "Pune" })).status, 503);
  delete process.env.DISCOVERY_SOURCE;
});

test("AC-104 adding the same discovered business twice skips the second", async () => {
  const t = await reg("add@test.com");
  const item = { name: "Green Leaf Salon", website: "greenleaf.in", city: "Pune", source: "places", signals: ["No website listed"], source_urls: ["https://maps.google.com/x"] };
  assert.equal((await call("POST", "/api/discover/add", t, { items: [item] })).json.created, 1);
  const again = (await call("POST", "/api/discover/add", t, { items: [item] })).json;
  assert.equal(again.created, 0);
  assert.deepEqual(again.skipped, ["Green Leaf Salon"]);
  const leads = (await call("GET", "/api/leads", t)).json;
  assert.equal(leads[0].source, "Google Places");
  assert.equal(leads[0].stage, "Discovered");
});

test("AC-105 proposal without analysis -> 400", async () => {
  const t = await reg("prop@test.com");
  const lead = (await call("POST", "/api/leads", t, { name: "P" })).json;
  assert.equal((await call("POST", `/api/leads/${lead.id}/proposal`, t)).status, 400);
});
