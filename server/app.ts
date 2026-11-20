import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { nowIso, todayStr } from "./db.ts";
import { STAGES, stageRank, PROMPT_VERSION } from "./lib/constants.ts";
import { hostOf } from "./lib/hosts.ts";
import { parseCsv, toCsv } from "./lib/csv.ts";
import { collectEvidence } from "./lib/evidence.ts";
import { opportunityScore, cappedConfidence } from "./lib/scoring.ts";
import { applyGrounding } from "./lib/grounding.ts";
import { findManipulation, stripCitations } from "./lib/outreachGuard.ts";
import { finalizeProposal } from "./lib/proposal.ts";
import { computeDashboard } from "./lib/dashboard.ts";
import { askJson, AiConfigError, activeModel, isAiConfigured, requireAi, resolveProvider } from "./ai/llm.ts";
import { discoverySource, geminiSearch, osmSearch, placesSearch, type Discovered } from "./lib/discovery.ts";
import { ANALYSIS_SYSTEM, AnalysisSchema, DRAFT_SYSTEM, DraftSchema, PROPOSAL_SYSTEM, ProposalSchema } from "./ai/prompts.ts";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Row = Record<string, any>;

const DEFAULT_SERVICES = [
  { name: "Business website", outcome: "Customers can find your services, trust your business and get in touch, even when you are busy.", price_range: "INR 15,000-20,000 / USD 199-299 (starting point, to validate)" },
  { name: "Conversion-focused landing page", outcome: "A clearer path from visitor to enquiry or booking request.", price_range: "Quote after discovery" },
  { name: "Website redesign", outcome: "A modern, mobile-friendly site that represents the business properly.", price_range: "Quote after discovery" },
  { name: "Custom CRM & automation", outcome: "Enquiries, projects and follow-ups organised in one place, with less manual work.", price_range: "Quote after discovery" },
  { name: "AI-powered business tool", outcome: "Less repetitive work and faster replies to common questions.", price_range: "Quote after discovery" },
];

export function createApp(db: DatabaseSync, secret: string) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const all = (sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[];
  const get = (sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined;
  const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p);

  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 50, standardHeaders: true, legacyHeaders: false });
  const aiLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });

  app.get("/api/health", (_req, res) => res.json({ ok: true, ai_configured: isAiConfigured(), provider: resolveProvider(), model: activeModel(), discovery: discoverySource() }));

  /* ── Auth (FR-001) ── */
  const creds = z.object({ email: z.email(), password: z.string().min(8), name: z.string().min(1).max(80).optional() });
  const sign = (uid: number, ws: number) => jwt.sign({ uid, ws }, secret, { expiresIn: "7d" });

  app.post("/api/auth/register", authLimiter, (req, res) => {
    const b = creds.parse(req.body);
    const email = b.email.toLowerCase();
    if (get("SELECT id FROM users WHERE email=?", email)) throw new HttpError(409, "An account with this email already exists");
    const uid = Number(run("INSERT INTO users(email,password_hash,created_at) VALUES(?,?,?)", email, bcrypt.hashSync(b.password, 10), nowIso()).lastInsertRowid);
    const ws = Number(run("INSERT INTO workspaces(name,owner_id) VALUES(?,?)", b.name ? `${b.name}'s workspace` : "My workspace", uid).lastInsertRowid);
    for (const s of DEFAULT_SERVICES) run("INSERT INTO services(workspace_id,name,outcome,price_range) VALUES(?,?,?,?)", ws, s.name, s.outcome, s.price_range);
    run("INSERT INTO portfolio_items(workspace_id,title,url,industries,summary) VALUES(?,?,?,?,?)", ws,
      "Snehal Kanzariya portfolio site", "https://snehal-kanzariya-portfolio-sigma.vercel.app", "all",
      "React/TypeScript/Astro developer portfolio: websites and custom CRMs. Edit this list in Settings with your real client projects.");
    res.status(201).json({ token: sign(uid, ws), email, workspace: get("SELECT id,name FROM workspaces WHERE id=?", ws) });
  });

  app.post("/api/auth/login", authLimiter, (req, res) => {
    const b = creds.pick({ email: true, password: true }).parse(req.body);
    const u = get("SELECT * FROM users WHERE email=?", b.email.toLowerCase());
    if (!u || !bcrypt.compareSync(b.password, u.password_hash)) throw new HttpError(401, "Invalid email or password");
    const w = get("SELECT id,name FROM workspaces WHERE owner_id=?", u.id)!;
    res.json({ token: sign(u.id, w.id), email: u.email, workspace: w });
  });

  /* ── Auth middleware (FR-002) ── */
  app.use("/api", (req, res, next) => {
    const h = req.headers.authorization ?? "";
    if (!h.startsWith("Bearer ")) return next(new HttpError(401, "Authentication required"));
    try {
      const p = jwt.verify(h.slice(7), secret) as { uid: number; ws: number };
      res.locals.ws = p.ws; res.locals.uid = p.uid;
      next();
    } catch { next(new HttpError(401, "Session expired, please sign in again")); }
  });
  const WS = (res: Response) => res.locals.ws as number;
  const id = (req: Request) => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n)) throw new HttpError(400, "Invalid id");
    return n;
  };
  const leadOr404 = (ws: number, lid: number) => {
    const l = get("SELECT * FROM leads WHERE id=? AND workspace_id=?", lid, ws);
    if (!l) throw new HttpError(404, "Lead not found");
    return l;
  };
  const activity = (ws: number, lead: number, kind: string, text: string, to_stage: string | null = null) =>
    run("INSERT INTO activities(workspace_id,lead_id,kind,text,to_stage,created_at) VALUES(?,?,?,?,?,?)", ws, lead, kind, text, to_stage, nowIso());

  /** FR-004/005/008: single place where stage changes happen. */
  function setStage(ws: number, lead: Row, stage: string, reason?: string | null) {
    if (!(STAGES as readonly string[]).includes(stage)) throw new HttpError(400, "Unknown stage");
    if (stage === lead.stage) return;
    if (stage === "Lost" && !reason?.trim()) throw new HttpError(400, "A lost reason is required");
    run("UPDATE leads SET stage=?, lost_reason=?, won_at=?, updated_at=? WHERE id=?", stage,
      stage === "Lost" ? reason!.trim() : null, stage === "Won" ? nowIso() : null, nowIso(), lead.id);
    activity(ws, lead.id, "stage_change", `Stage: ${lead.stage} -> ${stage}${stage === "Lost" ? ` (${reason!.trim()})` : ""}`, stage);
  }
  const advanceTo = (ws: number, lead: Row, stage: string) => {
    const cur = get("SELECT * FROM leads WHERE id=?", lead.id)!;
    if (cur.stage !== "Lost" && cur.stage !== "Won" && stageRank(cur.stage) < stageRank(stage)) setStage(ws, cur, stage);
  };

  const shapeLead = (l: Row) => ({ ...l, tags: JSON.parse(l.tags || "[]"), do_not_contact: Boolean(l.do_not_contact) });
  const LEADS_SQL = `SELECT l.*, a.opportunity_score AS score, a.research_confidence AS confidence,
      json_extract(a.json,'$.recommended_service') AS recommended_service, json_extract(a.json,'$.conversation_opener') AS opener
    FROM leads l LEFT JOIN assessments a ON a.id=(SELECT MAX(id) FROM assessments WHERE lead_id=l.id)`;

  /* ── Leads (FR-003..008) ── */
  const leadFields = z.object({
    name: z.string().trim().min(1).max(200),
    industry: z.string().max(80).nullish(), website: z.string().max(300).nullish(), city: z.string().max(100).nullish(),
    country: z.string().max(80).nullish(), phone: z.string().max(60).nullish(), email: z.string().max(200).nullish(),
    source: z.string().max(100).nullish(), deal_value: z.number().min(0).optional(), notes: z.string().max(10000).optional(),
    canvas_notes: z.string().max(10000).optional(), tags: z.array(z.string().max(40)).max(20).optional(),
    owner: z.string().max(80).nullish(), do_not_contact: z.boolean().optional(),
    stage: z.string().optional(), lost_reason: z.string().max(500).nullish(),
  });

  const findDuplicate = (ws: number, name: string, city: string | null | undefined, website: string | null | undefined, exceptId = 0) => {
    const host = hostOf(website);
    if (host) { const d = get("SELECT id FROM leads WHERE workspace_id=? AND website_host=? AND id<>?", ws, host, exceptId); if (d) return d; }
    return get("SELECT id FROM leads WHERE workspace_id=? AND lower(name)=lower(?) AND lower(coalesce(city,''))=lower(?) AND id<>?", ws, name, city ?? "", exceptId);
  };
  const insertLead = (ws: number, b: z.infer<typeof leadFields>) => {
    if (findDuplicate(ws, b.name, b.city, b.website)) throw new HttpError(409, `Duplicate lead: ${b.name}`);
    const t = nowIso();
    const lid = Number(run(`INSERT INTO leads(workspace_id,name,industry,website,website_host,city,country,phone,email,source,deal_value,notes,tags,owner,do_not_contact,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ws, b.name, b.industry ?? null, b.website ?? null, hostOf(b.website), b.city ?? null, b.country ?? null,
      b.phone ?? null, b.email ?? null, b.source ?? null, b.deal_value ?? 0, b.notes ?? "", JSON.stringify(b.tags ?? []), b.owner ?? null, b.do_not_contact ? 1 : 0, t, t).lastInsertRowid);
    activity(ws, lid, "created", "Lead added", "Discovered");
    return lid;
  };

  app.get("/api/leads", (_req, res) => res.json(all(`${LEADS_SQL} WHERE l.workspace_id=? ORDER BY l.updated_at DESC`, WS(res)).map(shapeLead)));

  app.post("/api/leads", (req, res) => {
    const lid = insertLead(WS(res), leadFields.parse(req.body));
    res.status(201).json(shapeLead(get(`${LEADS_SQL} WHERE l.id=?`, lid)!));
  });

  // Registered before /:id routes so "import"/"export.csv" are not parsed as ids.
  const COLS: Record<string, string> = {
    name: "name", business: "name", company: "name", "business name": "name", industry: "industry", category: "industry",
    website: "website", url: "website", city: "city", country: "country", phone: "phone", email: "email", source: "source",
    deal_value: "deal_value", value: "deal_value", notes: "notes", tags: "tags", owner: "owner", stage: "stage",
  };
  app.post("/api/leads/import", (req, res) => {
    const ws = WS(res);
    const rows = parseCsv(z.object({ csv: z.string().max(2_000_000) }).parse(req.body).csv);
    if (rows.length < 2) throw new HttpError(400, "CSV needs a header row and at least one data row");
    const map = rows[0].map((h) => COLS[h.trim().toLowerCase()] ?? null);
    if (!map.includes("name")) throw new HttpError(400, "CSV needs a 'name' column (or business/company)");
    const out = { created: 0, skipped: [] as string[], errors: [] as string[] };
    rows.slice(1).forEach((r, i) => {
      const rec: Row = {};
      map.forEach((k, ci) => { if (k && r[ci]?.trim()) rec[k] = r[ci].trim(); });
      try {
        const parsed = leadFields.parse({
          ...rec, deal_value: rec.deal_value ? Number(rec.deal_value.replace(/[^0-9.]/g, "")) || 0 : undefined,
          tags: rec.tags ? rec.tags.split(";").map((t: string) => t.trim()).filter(Boolean) : undefined, stage: undefined,
        });
        insertLead(ws, parsed); out.created++;
      } catch (e) {
        const msg = e instanceof HttpError ? e.message : "invalid row";
        (e instanceof HttpError ? out.skipped : out.errors).push(`Row ${i + 2}: ${msg}`);
      }
    });
    res.json(out);
  });

  app.get("/api/leads/export.csv", (_req, res) => {
    const ls = all(`${LEADS_SQL} WHERE l.workspace_id=? ORDER BY l.id`, WS(res));
    res.type("text/csv").send(toCsv([
      ["name", "industry", "website", "city", "country", "phone", "email", "source", "stage", "deal_value", "opportunity_score", "research_confidence", "notes", "tags"],
      ...ls.map((l) => [l.name, l.industry, l.website, l.city, l.country, l.phone, l.email, l.source, l.stage, l.deal_value, l.score, l.confidence, l.notes, JSON.parse(l.tags).join(";")]),
    ]));
  });

  app.get("/api/leads/:id", (req, res) => {
    const ws = WS(res), lid = id(req);
    const lead = get(`${LEADS_SQL} WHERE l.id=? AND l.workspace_id=?`, lid, ws);
    if (!lead) throw new HttpError(404, "Lead not found");
    const a = get("SELECT * FROM assessments WHERE lead_id=? ORDER BY id DESC LIMIT 1", lid);
    const analysis = a ? JSON.parse(a.json) : null;
    res.json({
      lead: shapeLead(lead),
      evidence: all("SELECT * FROM evidence WHERE lead_id=? ORDER BY id", lid),
      assessment: a ? { ...analysis, opportunity_score: a.opportunity_score, research_confidence: a.research_confidence, created_at: a.created_at } : null,
      portfolio: analysis?.portfolio_proof_ids?.length ? all(`SELECT * FROM portfolio_items WHERE workspace_id=? AND id IN (${analysis.portfolio_proof_ids.map(() => "?").join(",")})`, ws, ...analysis.portfolio_proof_ids) : [],
      proposals: all("SELECT * FROM proposals WHERE lead_id=? ORDER BY id DESC", lid).map((p) => ({ ...p, sections: JSON.parse(p.sections), flags: JSON.parse(p.flags) })),
      drafts: all("SELECT * FROM drafts WHERE lead_id=? ORDER BY id DESC", lid).map((d) => ({ ...d, flags: JSON.parse(d.flags) })),
      replies: all("SELECT * FROM replies WHERE lead_id=? ORDER BY id DESC", lid),
      tasks: all("SELECT * FROM tasks WHERE lead_id=? ORDER BY done, due_date", lid),
      activities: all("SELECT * FROM activities WHERE lead_id=? ORDER BY id DESC", lid),
    });
  });

  app.patch("/api/leads/:id", (req, res) => {
    const ws = WS(res), lid = id(req);
    const lead = leadOr404(ws, lid);
    const b = leadFields.partial().parse(req.body);
    if (b.stage !== undefined) setStage(ws, lead, b.stage, b.lost_reason);
    const dup = b.name !== undefined || b.website !== undefined;
    if (dup && findDuplicate(ws, b.name ?? lead.name, b.city !== undefined ? b.city : lead.city, b.website !== undefined ? b.website : lead.website, lid))
      throw new HttpError(409, "Another lead already has this name/website");
    const set: string[] = [], vals: any[] = [];
    const put = (c: string, v: any) => { set.push(`${c}=?`); vals.push(v); };
    for (const k of ["name", "industry", "website", "city", "country", "phone", "email", "source", "deal_value", "notes", "canvas_notes", "owner"] as const)
      if (b[k] !== undefined) put(k, b[k]);
    if (b.website !== undefined) put("website_host", hostOf(b.website));
    if (b.tags !== undefined) put("tags", JSON.stringify(b.tags));
    if (b.do_not_contact !== undefined) put("do_not_contact", b.do_not_contact ? 1 : 0);
    if (set.length) { put("updated_at", nowIso()); run(`UPDATE leads SET ${set.join(",")} WHERE id=?`, ...vals, lid); }
    if (b.notes !== undefined && b.notes !== lead.notes) activity(ws, lid, "note", "Notes updated");
    res.json(shapeLead(get(`${LEADS_SQL} WHERE l.id=?`, lid)!));
  });

  app.delete("/api/leads/:id", (req, res) => {
    const ws = WS(res), lid = id(req);
    leadOr404(ws, lid);
    for (const t of ["evidence", "assessments", "drafts", "replies", "tasks", "activities", "agent_runs", "proposals"]) run(`DELETE FROM ${t} WHERE lead_id=? AND workspace_id=?`, lid, ws);
    run("DELETE FROM leads WHERE id=?", lid);
    res.status(204).end();
  });

  /* ── Tasks (FR-009) ── */
  app.get("/api/tasks", (_req, res) => res.json(all(`SELECT t.*, l.name AS lead_name FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id WHERE t.workspace_id=? ORDER BY t.done, t.due_date`, WS(res))));
  app.post("/api/tasks", (req, res) => {
    const ws = WS(res);
    const b = z.object({ title: z.string().trim().min(1).max(300), due_date: z.iso.date().nullish(), lead_id: z.number().int().nullish() }).parse(req.body);
    if (b.lead_id) { leadOr404(ws, b.lead_id); }
    const tid = Number(run("INSERT INTO tasks(workspace_id,lead_id,title,due_date,created_at) VALUES(?,?,?,?,?)", ws, b.lead_id ?? null, b.title, b.due_date ?? null, nowIso()).lastInsertRowid);
    if (b.lead_id) activity(ws, b.lead_id, "task", `Follow-up added: ${b.title}`);
    res.status(201).json(get("SELECT * FROM tasks WHERE id=?", tid));
  });
  app.patch("/api/tasks/:id", (req, res) => {
    const ws = WS(res), tid = id(req);
    if (!get("SELECT id FROM tasks WHERE id=? AND workspace_id=?", tid, ws)) throw new HttpError(404, "Task not found");
    const b = z.object({ done: z.boolean().optional(), title: z.string().trim().min(1).optional(), due_date: z.iso.date().nullish() }).parse(req.body);
    if (b.done !== undefined) run("UPDATE tasks SET done=? WHERE id=?", b.done ? 1 : 0, tid);
    if (b.title !== undefined) run("UPDATE tasks SET title=? WHERE id=?", b.title, tid);
    if (b.due_date !== undefined) run("UPDATE tasks SET due_date=? WHERE id=?", b.due_date ?? null, tid);
    res.json(get("SELECT * FROM tasks WHERE id=?", tid));
  });
  app.delete("/api/tasks/:id", (req, res) => { run("DELETE FROM tasks WHERE id=? AND workspace_id=?", id(req), WS(res)); res.status(204).end(); });

  /* ── Catalogue (FR-028) ── */
  const catalogue = (path: string, table: string, shape: z.ZodObject<any>) => {
    app.get(`/api/${path}`, (_req, res) => res.json(all(`SELECT * FROM ${table} WHERE workspace_id=? ORDER BY id`, WS(res))));
    app.post(`/api/${path}`, (req, res) => {
      const b = shape.parse(req.body) as Row, keys = Object.keys(b);
      const rid = Number(run(`INSERT INTO ${table}(workspace_id,${keys.join(",")}) VALUES(?,${keys.map(() => "?").join(",")})`, WS(res), ...keys.map((k) => b[k])).lastInsertRowid);
      res.status(201).json(get(`SELECT * FROM ${table} WHERE id=?`, rid));
    });
    app.patch(`/api/${path}/:id`, (req, res) => {
      const b = shape.partial().parse(req.body) as Row, keys = Object.keys(b);
      if (keys.length) run(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=? AND workspace_id=?`, ...keys.map((k) => b[k]), id(req), WS(res));
      res.json(get(`SELECT * FROM ${table} WHERE id=? AND workspace_id=?`, id(req), WS(res)));
    });
    app.delete(`/api/${path}/:id`, (req, res) => { run(`DELETE FROM ${table} WHERE id=? AND workspace_id=?`, id(req), WS(res)); res.status(204).end(); });
  };
  catalogue("services", "services", z.object({ name: z.string().trim().min(1).max(120), outcome: z.string().max(500), price_range: z.string().max(120) }));
  catalogue("portfolio", "portfolio_items", z.object({ title: z.string().trim().min(1).max(160), url: z.string().max(300), industries: z.string().max(200), summary: z.string().max(600) }));

  /* ── AI helpers ── */
  const startRun = (ws: number, agent: string, lid: number) =>
    Number(run("INSERT INTO agent_runs(workspace_id,agent,lead_id,status,model,prompt_version,started_at) VALUES(?,?,?,?,?,?,?)", ws, agent, lid, "running", activeModel(), PROMPT_VERSION, nowIso()).lastInsertRowid);
  const finishRun = (rid: number, status: "succeeded" | "failed", u = { input: 0, output: 0 }, error: string | null = null) =>
    run("UPDATE agent_runs SET status=?, input_tokens=?, output_tokens=?, error=?, finished_at=? WHERE id=?", status, u.input, u.output, error, nowIso(), rid);

  /* ── Analysis (FR-020..029) ── */
  app.post("/api/leads/:id/analyze", aiLimiter, async (req, res) => {
    const ws = WS(res), lid = id(req);
    const lead = leadOr404(ws, lid);
    requireAi();
    const rid = startRun(ws, "Opportunity Analyst", lid);
    try {
      const observedAt = nowIso();
      const items = await collectEvidence(lead.website);
      const services = all("SELECT id,name,outcome,price_range FROM services WHERE workspace_id=?", ws);
      const portfolio = all("SELECT id,title,url,industries,summary FROM portfolio_items WHERE workspace_id=?", ws);
      const user = JSON.stringify({
        LEAD: { name: lead.name, industry: lead.industry, website: lead.website, city: lead.city, country: lead.country, has_phone: Boolean(lead.phone), has_email: Boolean(lead.email), source: lead.source, user_notes: lead.notes },
        EVIDENCE: items.map((e, i) => ({ id: i + 1, kind: e.kind, statement: e.statement, source_url: e.source_url })),
        SERVICES: services, PORTFOLIO: portfolio, today: todayStr(),
      });
      const { data, usage } = await askJson(ANALYSIS_SYSTEM, user, AnalysisSchema, 3500);

      db.exec("BEGIN");
      try {
        run("DELETE FROM evidence WHERE lead_id=? AND workspace_id=?", lid, ws);
        const realIds: number[] = items.map((e) => Number(run("INSERT INTO evidence(workspace_id,lead_id,kind,statement,source_url,observed_at,status) VALUES(?,?,?,?,?,?,?)", ws, lid, e.kind, e.statement, e.source_url, observedAt, "verified").lastInsertRowid));
        const toReal = (ids: number[]) => ids.filter((n) => n >= 1 && n <= realIds.length).map((n) => realIds[n - 1]);
        const g = applyGrounding(
          data.observed_issues.map((i) => ({ text: i.text, evidence_ids: toReal(i.evidence_ids) })), data.hypotheses, data.portfolio_proof_ids,
          new Set(realIds), new Set(portfolio.map((p) => p.id)),
        );
        const score = opportunityScore(data.sub_scores);
        const conf = cappedConfidence(data.research_confidence, items.filter((e) => e.source_url !== null || e.kind === "no_website").length);
        const stored = { ...data, observed_issues: g.issues, hypotheses: g.hypotheses, portfolio_proof_ids: g.portfolio_proof_ids, sub_scores: data.sub_scores };
        run("INSERT INTO assessments(workspace_id,lead_id,run_id,json,opportunity_score,research_confidence,created_at) VALUES(?,?,?,?,?,?,?)", ws, lid, rid, JSON.stringify(stored), score, conf, nowIso());
        activity(ws, lid, "analysis", `Opportunity analysis completed (score ${score}, confidence ${conf})`);
        advanceTo(ws, lead, "Researched");
        finishRun(rid, "succeeded", usage);
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
      res.json({ ok: true });
    } catch (e) {
      finishRun(rid, "failed", undefined, (e as Error).message.slice(0, 500));
      if (e instanceof HttpError || e instanceof AiConfigError) throw e;
      throw new HttpError(502, `Analysis failed: ${(e as Error).message.slice(0, 200)}`);
    }
  });

  /* ── Drafts & approval (FR-040..046) ── */
  const draftOr404 = (ws: number, did: number) => {
    const d = get("SELECT * FROM drafts WHERE id=? AND workspace_id=?", did, ws);
    if (!d) throw new HttpError(404, "Draft not found");
    return d;
  };

  app.post("/api/leads/:id/draft", aiLimiter, async (req, res) => {
    const ws = WS(res), lid = id(req);
    const lead = leadOr404(ws, lid);
    if (lead.do_not_contact) throw new HttpError(409, "This lead is marked do-not-contact");
    const a = get("SELECT * FROM assessments WHERE lead_id=? ORDER BY id DESC LIMIT 1", lid);
    if (!a) throw new HttpError(400, "Analyze this lead before drafting outreach");
    requireAi();
    const rid = startRun(ws, "Outreach Specialist", lid);
    try {
      const analysis = JSON.parse(a.json);
      const evidence = all("SELECT id,kind,statement,source_url FROM evidence WHERE lead_id=?", lid);
      const portfolio = analysis.portfolio_proof_ids.length ? all(`SELECT id,title,url,summary FROM portfolio_items WHERE workspace_id=? AND id IN (${analysis.portfolio_proof_ids.map(() => "?").join(",")})`, ws, ...analysis.portfolio_proof_ids) : [];
      const input = JSON.stringify({
        founder_name: "Snehal Kanzariya", agency: "Shiv Creative Agency", lead: { name: lead.name, industry: lead.industry, city: lead.city },
        verified_observations: analysis.observed_issues, evidence, recommended_service: analysis.recommended_service,
        desired_outcome: analysis.desired_outcome, opener_idea: analysis.conversation_opener, PORTFOLIO: portfolio,
      });
      let { data, usage } = await askJson(DRAFT_SYSTEM, input, DraftSchema, 1500);
      const clean = (d: typeof data) => ({ subject: stripCitations(d.subject), body: stripCitations(d.body), short_message: stripCitations(d.short_message) });
      data = clean(data);
      let flags = findManipulation(`${data.subject} ${data.body} ${data.short_message}`);
      if (flags.length) {
        const retry = await askJson(DRAFT_SYSTEM, `${input}\n\nRewrite without these phrases: ${flags.join(", ")}. No urgency, guarantees or pressure.`, DraftSchema, 1500);
        usage = { input: usage.input + retry.usage.input, output: usage.output + retry.usage.output };
        data = clean(retry.data);
        flags = findManipulation(`${data.subject} ${data.body} ${data.short_message}`);
      }
      const did = Number(run("INSERT INTO drafts(workspace_id,lead_id,subject,body,short_message,flags,created_at) VALUES(?,?,?,?,?,?,?)", ws, lid, data.subject, data.body, data.short_message, JSON.stringify(flags), nowIso()).lastInsertRowid);
      activity(ws, lid, "draft", "Outreach draft created for review");
      advanceTo(ws, lead, "Outreach Prepared");
      finishRun(rid, "succeeded", usage);
      res.status(201).json({ id: did });
    } catch (e) {
      finishRun(rid, "failed", undefined, (e as Error).message.slice(0, 500));
      if (e instanceof HttpError || e instanceof AiConfigError) throw e;
      throw new HttpError(502, `Drafting failed: ${(e as Error).message.slice(0, 200)}`);
    }
  });

  app.get("/api/drafts", (_req, res) => res.json(all(`SELECT d.*, l.name AS lead_name, l.do_not_contact FROM drafts d JOIN leads l ON l.id=d.lead_id WHERE d.workspace_id=? ORDER BY d.id DESC`, WS(res)).map((d) => ({ ...d, flags: JSON.parse(d.flags), do_not_contact: Boolean(d.do_not_contact) }))));

  app.patch("/api/drafts/:id", (req, res) => {
    const ws = WS(res), d = draftOr404(ws, id(req));
    if (d.status !== "draft") throw new HttpError(409, "Only drafts awaiting review can be edited");
    const b = z.object({ subject: z.string().min(1).max(300).optional(), body: z.string().min(1).max(5000).optional(), short_message: z.string().max(1000).optional() }).parse(req.body);
    const next = { ...d, ...b };
    run("UPDATE drafts SET subject=?, body=?, short_message=?, flags=? WHERE id=?", next.subject, next.body, next.short_message, JSON.stringify(findManipulation(`${next.subject} ${next.body} ${next.short_message}`)), d.id);
    res.json(get("SELECT * FROM drafts WHERE id=?", d.id));
  });

  const transition = (path: string, from: string, to: string, after?: (ws: number, d: Row, lead: Row) => void) =>
    app.post(`/api/drafts/:id/${path}`, (req, res) => {
      const ws = WS(res), d = draftOr404(ws, id(req)), lead = leadOr404(ws, d.lead_id);
      if (d.status !== from) throw new HttpError(409, `Draft must be '${from}' first (currently '${d.status}')`);
      if ((to === "approved" || to === "sent") && lead.do_not_contact) throw new HttpError(409, "Lead is marked do-not-contact");
      if (to === "approved" && findManipulation(`${d.subject} ${d.body} ${d.short_message}`).length) throw new HttpError(409, "Remove flagged pressure/guarantee phrases before approving");
      const col = to === "approved" ? "approved_at" : to === "sent" ? "sent_at" : null;
      if (col) run(`UPDATE drafts SET status=?, ${col}=? WHERE id=?`, to, nowIso(), d.id);
      else run("UPDATE drafts SET status=? WHERE id=?", to, d.id);
      activity(ws, lead.id, "draft", `Draft ${to}`);
      after?.(ws, d, lead);
      res.json(get("SELECT * FROM drafts WHERE id=?", d.id));
    });
  transition("approve", "draft", "approved");
  transition("reject", "draft", "rejected");
  transition("sent", "approved", "sent", (ws, d, lead) => {
    advanceTo(ws, lead, "Contacted");
    const due = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    run("INSERT INTO tasks(workspace_id,lead_id,title,due_date,created_at) VALUES(?,?,?,?,?)", ws, lead.id, "Follow up on first message", due, nowIso());
  });

  app.post("/api/leads/:id/replies", (req, res) => {
    const ws = WS(res), lid = id(req), lead = leadOr404(ws, lid);
    const b = z.object({ sentiment: z.enum(["positive", "neutral", "negative"]), text: z.string().max(5000).default("") }).parse(req.body);
    run("INSERT INTO replies(workspace_id,lead_id,sentiment,text,created_at) VALUES(?,?,?,?,?)", ws, lid, b.sentiment, b.text, nowIso());
    activity(ws, lid, "reply", `Reply logged (${b.sentiment})`);
    advanceTo(ws, lead, "Responded");
    res.status(201).json({ ok: true });
  });

  /* ── Discovery (spec 006 FR-102..104) ── */
  app.post("/api/discover", aiLimiter, async (req, res) => {
    const ws = WS(res);
    const b = z.object({ query: z.string().trim().min(2).max(100), location: z.string().trim().min(2).max(100), limit: z.number().int().min(1).max(10).default(8) }).parse(req.body);
    const source = discoverySource();
    if (!source) throw new HttpError(503, "No discovery source is enabled. Set GOOGLE_PLACES_API_KEY, or DISCOVERY_SOURCE=osm (free, no key) in .env.");
    const rid = Number(run("INSERT INTO agent_runs(workspace_id,agent,status,model,prompt_version,started_at) VALUES(?,?,?,?,?,?)", ws, "Market Researcher", "running", source, PROMPT_VERSION, nowIso()).lastInsertRowid);
    try {
      let items: Discovered[] = [];
      let usage = { input: 0, output: 0 };
      if (source === "places") items = await placesSearch(b.query, b.location, b.limit);
      else if (source === "osm") items = await osmSearch(b.query, b.location, b.limit);
      else { const r = await geminiSearch(b.query, b.location, b.limit); items = r.items; usage = r.usage; }
      finishRun(rid, "succeeded", usage);
      res.json({ source, results: items.map((i) => ({ ...i, already_in_leads: Boolean(findDuplicate(ws, i.name, i.city, i.website)) })) });
    } catch (e) {
      finishRun(rid, "failed", undefined, (e as Error).message.slice(0, 500));
      throw new HttpError(502, (e as Error).message.slice(0, 300));
    }
  });

  app.post("/api/discover/add", (req, res) => {
    const ws = WS(res);
    const items = z.array(z.object({
      name: z.string().min(1).max(200), website: z.string().max(300).nullish(), phone: z.string().max(60).nullish(), city: z.string().max(100).nullish(),
      address: z.string().max(300).nullish(), source: z.enum(["places", "osm", "gemini_search"]), signals: z.array(z.string().max(300)).max(10), source_urls: z.array(z.string().max(500)).max(10),
      rating: z.number().nullish(), review_count: z.number().nullish(),
    })).min(1).max(25).parse(req.body.items);
    const out = { created: 0, skipped: [] as string[] };
    for (const i of items) {
      const notes = [
        `Found via discovery (${i.source === "places" ? "Google Places listing" : i.source === "osm" ? "OpenStreetMap listing" : "AI-assisted search, unverified"}).`,
        ...(i.address ? [`Address: ${i.address}`] : []),
        ...(i.rating ? [`Rating: ${i.rating} (${i.review_count ?? "?"} reviews)`] : []),
        ...(i.signals.length ? ["Possible signals (hypotheses):", ...i.signals.map((s) => `- ${s}`)] : []),
        ...(i.source_urls.length ? [`Sources: ${i.source_urls.join(", ")}`] : []),
      ].join("\n");
      try {
        insertLead(ws, { name: i.name, website: i.website ?? null, phone: i.phone ?? null, city: i.city ?? null, source: i.source === "places" ? "Google Places" : i.source === "osm" ? "OpenStreetMap" : "AI search (unverified)", notes });
        out.created++;
      } catch (e) { if (e instanceof HttpError) out.skipped.push(i.name); else throw e; }
    }
    res.json(out);
  });

  /* ── Proposals (spec 006 FR-105) ── */
  app.post("/api/leads/:id/proposal", aiLimiter, async (req, res) => {
    const ws = WS(res), lid = id(req);
    const lead = leadOr404(ws, lid);
    const a = get("SELECT * FROM assessments WHERE lead_id=? ORDER BY id DESC LIMIT 1", lid);
    if (!a) throw new HttpError(400, "Analyze this lead before generating a proposal");
    requireAi();
    const rid = startRun(ws, "Proposal Writer", lid);
    try {
      const analysis = JSON.parse(a.json);
      const services = all("SELECT id,name,outcome,price_range FROM services WHERE workspace_id=?", ws);
      const rec = String(analysis.recommended_service).toLowerCase();
      const match = services.find((s) => s.name.toLowerCase() === rec) ?? services.find((s) => rec.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(rec));
      const evidence = all("SELECT id,kind,statement,source_url,status FROM evidence WHERE lead_id=?", lid);
      const ids: number[] = analysis.portfolio_proof_ids;
      const portfolio = ids.length ? all(`SELECT id,title,url,summary FROM portfolio_items WHERE workspace_id=? AND id IN (${ids.map(() => "?").join(",")})`, ws, ...ids) : [];
      const input = JSON.stringify({
        founder: "Snehal Kanzariya", agency: "Shiv Creative Agency", lead: { name: lead.name, industry: lead.industry, city: lead.city },
        VERIFIED_EVIDENCE: evidence, observed_issues: analysis.observed_issues, hypotheses_to_confirm: analysis.hypotheses,
        recommended_service: analysis.recommended_service, desired_outcome: analysis.desired_outcome, success_measures: analysis.success_measures, PORTFOLIO: portfolio,
      });
      const { data, usage } = await askJson(PROPOSAL_SYSTEM, input, ProposalSchema, 3000);
      const sections = finalizeProposal(data.sections, match?.price_range).map((s) => ({ ...s, body: stripCitations(s.body) }));
      const flags = findManipulation(sections.map((s) => s.body).join(" "));
      const pid = Number(run("INSERT INTO proposals(workspace_id,lead_id,sections,flags,created_at) VALUES(?,?,?,?,?)", ws, lid, JSON.stringify(sections), JSON.stringify(flags), nowIso()).lastInsertRowid);
      activity(ws, lid, "proposal", "Proposal draft created for review");
      finishRun(rid, "succeeded", usage);
      res.status(201).json({ id: pid });
    } catch (e) {
      finishRun(rid, "failed", undefined, (e as Error).message.slice(0, 500));
      if (e instanceof HttpError || e instanceof AiConfigError) throw e;
      throw new HttpError(502, `Proposal failed: ${(e as Error).message.slice(0, 200)}`);
    }
  });
  app.patch("/api/proposals/:id", (req, res) => {
    const ws = WS(res), pid = id(req);
    if (!get("SELECT id FROM proposals WHERE id=? AND workspace_id=?", pid, ws)) throw new HttpError(404, "Proposal not found");
    const b = z.object({ sections: z.array(z.object({ title: z.string().max(100), body: z.string().max(5000) })).max(12) }).parse(req.body);
    run("UPDATE proposals SET sections=?, flags=? WHERE id=?", JSON.stringify(b.sections), JSON.stringify(findManipulation(b.sections.map((s) => s.body).join(" "))), pid);
    res.json({ ok: true });
  });

  /* ── Dashboard (FR-060..065) ── */
  app.get("/api/dashboard", (_req, res) => {
    const ws = WS(res);
    res.json(computeDashboard({
      leads: all(`${LEADS_SQL} WHERE l.workspace_id=?`, ws) as any,
      activities: all("SELECT lead_id,kind,to_stage,created_at FROM activities WHERE workspace_id=?", ws) as any,
      drafts: all("SELECT lead_id,status FROM drafts WHERE workspace_id=?", ws) as any,
      replies: all("SELECT sentiment FROM replies WHERE workspace_id=?", ws) as any,
      tasks: all("SELECT id,lead_id,title,due_date,done FROM tasks WHERE workspace_id=?", ws) as any,
      runs: all("SELECT agent,status,error,input_tokens,output_tokens,started_at,lead_id FROM agent_runs WHERE workspace_id=?", ws) as any,
      evidence: all("SELECT lead_id,statement,source_url FROM evidence WHERE workspace_id=?", ws) as any,
      today: todayStr(),
    }));
  });

  /* ── Errors ── */
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") });
    if (err instanceof AiConfigError) return res.status(503).json({ error: err.message });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
