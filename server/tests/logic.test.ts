import { test } from "node:test";
import assert from "node:assert/strict";
import { opportunityScore, cappedConfidence } from "../lib/scoring.ts";
import { applyGrounding } from "../lib/grounding.ts";
import { blockedReason } from "../lib/ssrf.ts";
import { parseCsv } from "../lib/csv.ts";
import { findManipulation } from "../lib/outreachGuard.ts";
import { computeDashboard, type DashInput } from "../lib/dashboard.ts";

test("AC-020 weighted score is exact", () => {
  const s = opportunityScore({ service_fit: 80, evidence_of_need: 60, profile_fit: 50, decision_maker_access: 40, timing: 20 });
  assert.equal(s, 0.25 * 80 + 0.25 * 60 + 0.2 * 50 + 0.15 * 40 + 0.15 * 20);
});

test("AC-021 confidence capped at 30 with no verified evidence", () => {
  assert.equal(cappedConfidence(90, 0), 30);
  assert.equal(cappedConfidence(90, 2), 90);
  assert.equal(cappedConfidence(20, 0), 20);
});

test("AC-022 ungrounded issue becomes hypothesis; AC-023 unknown portfolio dropped", () => {
  const r = applyGrounding(
    [{ text: "real", evidence_ids: [1] }, { text: "fake", evidence_ids: [99] }],
    [], [5, 6], new Set([1]), new Set([5]),
  );
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].text, "real");
  assert.equal(r.hypotheses.some((h) => h.text === "fake"), true);
  assert.deepEqual(r.portfolio_proof_ids, [5]);
});

test("AC-024 SSRF guard blocks private targets", () => {
  for (const u of ["http://127.0.0.1/", "http://10.0.0.5", "http://169.254.169.254/", "http://localhost:3000", "file:///etc/passwd", "http://192.168.1.1", "http://[::1]/", "http://172.16.0.1"])
    assert.notEqual(blockedReason(u), null, u);
  assert.equal(blockedReason("https://example.com"), null);
});

test("AC-005 CSV handles quoted commas, quotes and blank lines", () => {
  const rows = parseCsv('name,notes\n"Acme, Inc","said ""hi"""\n\nBeta,ok\n');
  assert.deepEqual(rows, [["name", "notes"], ["Acme, Inc", 'said "hi"'], ["Beta", "ok"]]);
});

test("AC-043 manipulation phrases flagged", () => {
  assert.equal(findManipulation("We offer guaranteed results").length > 0, true);
  assert.deepEqual(findManipulation("Happy to share a few ideas"), []);
});

const base = (over: Partial<DashInput> = {}): DashInput => ({
  leads: [], activities: [], drafts: [], replies: [], tasks: [], runs: [], evidence: [], today: "2026-11-20", ...over,
});
const lead = (id: number, stage: string, over = {}) => ({
  id, name: `L${id}`, stage, deal_value: 0, source: null, do_not_contact: 0, score: null, confidence: null, recommended_service: null, opener: null, ...over,
});

test("AC-060 empty workspace: zeros, null rate, start focus", () => {
  const d = computeDashboard(base());
  assert.equal(d.metrics.total_leads, 0);
  assert.equal(d.metrics.positive_reply_rate, null);
  assert.equal(d.best, null);
  assert.equal(d.focus.length, 1);
  assert.equal(d.focus[0].kind, "start");
});

test("AC-061 won revenue separate from pipeline", () => {
  const d = computeDashboard(base({ leads: [lead(1, "Won", { deal_value: 1000 }), lead(2, "Proposal Sent", { deal_value: 500 })] }));
  assert.equal(d.metrics.confirmed_revenue, 1000);
  assert.equal(d.metrics.pipeline_value, 500);
});

test("AC-062 agent idle vs running reflects open runs", () => {
  const finished = { agent: "Opportunity Analyst", status: "succeeded", error: null, input_tokens: 1, output_tokens: 1, started_at: "2026-11-20T10:00:00Z", lead_id: 1 };
  assert.equal(computeDashboard(base({ runs: [finished] })).agents.find((a) => a.name === "Opportunity Analyst")!.status, "idle");
  assert.equal(computeDashboard(base({ runs: [{ ...finished, status: "running" }] })).agents.find((a) => a.name === "Opportunity Analyst")!.status, "running");
});

test("AC-063 stalled proposal appears in focus", () => {
  const d = computeDashboard(base({
    leads: [lead(1, "Proposal Sent")],
    activities: [{ lead_id: 1, kind: "stage_change", to_stage: "Proposal Sent", created_at: "2026-11-01T00:00:00Z" }],
  }));
  assert.equal(d.focus.some((f) => f.kind === "stalled"), true);
});

test("meetings counts leads that ever reached the stage, even if Lost later", () => {
  const d = computeDashboard(base({
    leads: [lead(1, "Lost")],
    activities: [{ lead_id: 1, kind: "stage_change", to_stage: "Meeting Scheduled", created_at: "2026-11-01T00:00:00Z" }],
  }));
  assert.equal(d.metrics.meetings, 1);
  assert.equal(d.metrics.active_deals, 0);
});

import { stripCitations } from "../lib/outreachGuard.ts";
test("AC-043b internal citation markers are stripped from customer-facing text", () => {
  assert.equal(stripCitations("lacks a viewport tag [4, 5, 6]. See my work [1]."), "lacks a viewport tag. See my work.");
  assert.equal(stripCitations("The site is live (Evidence 1, 2)."), "The site is live.");
  assert.equal(stripCitations("Plain sentence with 2 items."), "Plain sentence with 2 items.");
});
