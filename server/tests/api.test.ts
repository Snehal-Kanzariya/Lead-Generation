import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { openDb } from "../db.ts";
import { createApp } from "../app.ts";
import { AnalysisSchema } from "../ai/prompts.ts";

let server: Server;
let base = "";
const db = openDb(":memory:");
delete process.env.ANTHROPIC_API_KEY;

before(async () => {
  const app = createApp(db, "test-secret-test-secret");
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, json, text };
}
const register = async (email: string) =>
  (await call("POST", "/api/auth/register", undefined, { email, password: "password123" })).json.token as string;

test("AC-001 duplicate registration -> 409", async () => {
  await register("a@test.com");
  const r = await call("POST", "/api/auth/register", undefined, { email: "a@test.com", password: "password123" });
  assert.equal(r.status, 409);
});

test("AC-002 no token -> 401; cross-workspace access -> 404", async () => {
  assert.equal((await call("GET", "/api/leads")).status, 401);
  const a = await register("owner@test.com");
  const b = await register("other@test.com");
  const lead = (await call("POST", "/api/leads", a, { name: "Salon One", city: "Pune" })).json;
  assert.equal((await call("GET", `/api/leads/${lead.id}`, b)).status, 404);
  assert.equal((await call("PATCH", `/api/leads/${lead.id}`, b, { notes: "x" })).status, 404);
  assert.equal((await call("GET", "/api/leads", b)).json.length, 0);
});

test("AC-003 duplicate website host -> 409, import skips it", async () => {
  const t = await register("dup@test.com");
  assert.equal((await call("POST", "/api/leads", t, { name: "A", website: "https://www.acme.com" })).status, 201);
  assert.equal((await call("POST", "/api/leads", t, { name: "B", website: "acme.com/about" })).status, 409);
  const imp = await call("POST", "/api/leads/import", t, { csv: "name,website\nC,acme.com\nD,d.com" });
  assert.equal(imp.json.created, 1);
  assert.equal(imp.json.skipped.length, 1);
});

test("AC-004 Lost requires reason; AC-006 stage change logged", async () => {
  const t = await register("stage@test.com");
  const lead = (await call("POST", "/api/leads", t, { name: "Cafe" })).json;
  assert.equal((await call("PATCH", `/api/leads/${lead.id}`, t, { stage: "Lost" })).status, 400);
  assert.equal((await call("PATCH", `/api/leads/${lead.id}`, t, { stage: "Lost", lost_reason: "Budget" })).status, 200);
  const d = (await call("GET", `/api/leads/${lead.id}`, t)).json;
  assert.equal(d.lead.lost_reason, "Budget");
  assert.equal(d.activities.some((a: any) => a.kind === "stage_change" && a.to_stage === "Lost"), true);
});

test("AC-005 CSV with quoted commas and unknown columns; bad rows reported", async () => {
  const t = await register("csv@test.com");
  const r = await call("POST", "/api/leads/import", t, { csv: 'Business Name,Mystery,Value\n"Acme, Inc",zzz,"5,000"\n,,\n' });
  assert.equal(r.json.created, 1);
  const leads = (await call("GET", "/api/leads", t)).json;
  assert.equal(leads[0].name, "Acme, Inc");
  assert.equal(leads[0].deal_value, 5000);
  const exp = await call("GET", "/api/leads/export.csv", t);
  assert.match(exp.text, /"Acme, Inc"/);
});

test("AC-025 analyze without API key -> 503 and lead unchanged", async () => {
  const t = await register("ai@test.com");
  const lead = (await call("POST", "/api/leads", t, { name: "NoKey" })).json;
  const r = await call("POST", `/api/leads/${lead.id}/analyze`, t);
  assert.equal(r.status, 503);
  const d = (await call("GET", `/api/leads/${lead.id}`, t)).json;
  assert.equal(d.lead.stage, "Discovered");
  assert.equal(d.assessment, null);
});

test("AC-026 invalid model JSON fails schema validation", () => {
  assert.equal(AnalysisSchema.safeParse({ business_summary: "x" }).success, false);
});

function seedDraft(ws: number, leadId: number, status = "draft", body = "Hello there, happy to share a few ideas for your site.") {
  return Number(
    db.prepare("INSERT INTO drafts(workspace_id,lead_id,subject,body,short_message,status,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(ws, leadId, "Idea", body, "Hi", status, new Date().toISOString()).lastInsertRowid,
  );
}
const wsOf = (leadId: number) => (db.prepare("SELECT workspace_id AS w FROM leads WHERE id=?").get(leadId) as { w: number }).w;

test("AC-040 cannot mark sent without approval; AC-042 sent -> Contacted + task +5d", async () => {
  const t = await register("out@test.com");
  const lead = (await call("POST", "/api/leads", t, { name: "Out" })).json;
  const did = seedDraft(wsOf(lead.id), lead.id);
  assert.equal((await call("POST", `/api/drafts/${did}/sent`, t)).status, 409);
  assert.equal((await call("POST", `/api/drafts/${did}/approve`, t)).status, 200);
  assert.equal((await call("POST", `/api/drafts/${did}/sent`, t)).status, 200);
  const d = (await call("GET", `/api/leads/${lead.id}`, t)).json;
  assert.equal(d.lead.stage, "Contacted");
  const due = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  assert.equal(d.tasks.some((x: any) => x.due_date === due), true);
});

test("AC-041 do-not-contact blocks approval", async () => {
  const t = await register("dnc@test.com");
  const lead = (await call("POST", "/api/leads", t, { name: "DNC", do_not_contact: true })).json;
  const did = seedDraft(wsOf(lead.id), lead.id);
  assert.equal((await call("POST", `/api/drafts/${did}/approve`, t)).status, 409);
});

test("AC-043 approval blocked while draft contains guarantee language", async () => {
  const t = await register("guard@test.com");
  const lead = (await call("POST", "/api/leads", t, { name: "Guard" })).json;
  const did = seedDraft(wsOf(lead.id), lead.id, "draft", "We offer guaranteed results for your business.");
  assert.equal((await call("POST", `/api/drafts/${did}/approve`, t)).status, 409);
});

test("AC-044 reply moves to Responded and counts in dashboard", async () => {
  const t = await register("reply@test.com");
  const lead = (await call("POST", "/api/leads", t, { name: "Reply" })).json;
  await call("POST", `/api/leads/${lead.id}/replies`, t, { sentiment: "positive", text: "Sounds good" });
  assert.equal((await call("GET", `/api/leads/${lead.id}`, t)).json.lead.stage, "Responded");
  assert.equal((await call("GET", "/api/dashboard", t)).json.metrics.responses, 1);
});

test("AC-060 empty workspace dashboard via API", async () => {
  const t = await register("empty@test.com");
  const d = (await call("GET", "/api/dashboard", t)).json;
  assert.equal(d.metrics.total_leads, 0);
  assert.equal(d.metrics.confirmed_revenue, 0);
  assert.equal(d.metrics.positive_reply_rate, null);
});
