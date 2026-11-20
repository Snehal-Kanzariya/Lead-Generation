import { useEffect, useState } from "react";
import { api } from "./api";
import { DraftCard } from "./DraftCard";
import { STAGES, inr, type LeadDetail, type Proposal } from "./types";
import { Badge, Button, Dialog, ErrorNote, Field, ScoreRing, Spinner, inputCls, useApp, useAsync } from "./ui";

const WEIGHTS: [string, string, number][] = [
  ["service_fit", "Service fit", 25], ["evidence_of_need", "Evidence of need", 25], ["profile_fit", "Customer profile fit", 20],
  ["decision_maker_access", "Reach a decision-maker", 15], ["timing", "Timing / buying signals", 15],
];

function Block({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-bg p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="font-display text-sm font-semibold">{title}</h4>
        {tag && <Badge tone={tag === "Verified" ? "success" : tag === "Hypothesis" ? "warning" : "neutral"}>{tag}</Badge>}
      </div>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}
const List = ({ items, empty }: { items: string[]; empty: string }) =>
  items.length ? <ul className="list-disc space-y-1 pl-5">{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="text-muted">{empty}</p>;

function ProposalView({ proposal, leadName }: { proposal: Proposal; leadName: string }) {
  const { refresh, toast } = useApp();
  const [sections, setSections] = useState(proposal.sections);
  const dirty = JSON.stringify(sections) !== JSON.stringify(proposal.sections);
  const text = `Proposal for ${leadName}\n\n${sections.map((s) => `${s.title}\n${s.body}`).join("\n\n")}`;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-bg p-4">
      {proposal.flags.length > 0 && <p role="alert" className="rounded-lg bg-surface2 p-2 text-sm text-warning">Review wording: {proposal.flags.join(", ")}</p>}
      {sections.map((s, i) => (
        <label key={s.title} className="block text-xs font-medium text-muted">{s.title}{s.title === "Investment" && " (from your catalogue, not AI)"}
          <textarea className={`${inputCls} mt-1 min-h-20 text-ink`} value={s.body} onChange={(e) => setSections(sections.map((x, k) => (k === i ? { ...x, body: e.target.value } : x)))} />
        </label>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!dirty} onClick={() => api(`/proposals/${proposal.id}`, "PATCH", { sections }).then(() => { toast("Proposal saved"); refresh(); }).catch((e) => toast(e.message, "err"))}>Save edits</Button>
        <Button size="sm" variant="primary" onClick={() => navigator.clipboard?.writeText(text).then(() => toast("Proposal copied. Send it yourself."))}>Copy proposal</Button>
      </div>
    </div>
  );
}

export function LeadDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { refresh, toast } = useApp();
  const { data, error, loading } = useAsync(() => api<LeadDetail>(`/leads/${id}`), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [canvas, setCanvas] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [reply, setReply] = useState({ sentiment: "positive", text: "" });
  const [task, setTask] = useState({ title: "", due: "" });

  useEffect(() => { if (data) { setNotes(data.lead.notes); setCanvas(data.lead.canvas_notes); } }, [data?.lead.id, data?.lead.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok); refresh(); } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(null); }
  };
  const patch = (body: object) => api(`/leads/${id}`, "PATCH", body);

  return (
    <Dialog title={data?.lead.name ?? "Lead"} onClose={onClose} side>
      {loading && !data && <Spinner />}
      {error && <ErrorNote message={error} />}
      {data && (() => {
        const { lead, assessment: a, evidence, drafts, replies, tasks, activities, portfolio } = data;
        const verified = evidence.filter((e) => e.status === "verified");
        const evIdx = new Map(evidence.map((e, i) => [e.id, i + 1]));
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 text-sm">
                <p className="text-muted">{[lead.industry, lead.city, lead.country].filter(Boolean).join(" · ") || "No location yet"}</p>
                {lead.website && <a className="text-primary underline" href={/^https?:/.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer">{lead.website}</a>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {lead.do_not_contact && <Badge tone="danger">Do not contact</Badge>}
                  {lead.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                </div>
              </div>
              <div className="flex gap-4">
                <ScoreRing value={lead.score} label="Opportunity" />
                <ScoreRing value={lead.confidence} label="Confidence" />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <Field label="Stage">
                {(fid) => (
                  <select id={fid} className={inputCls} value={lead.stage} onChange={(e) => {
                    const s = e.target.value;
                    if (s === "Lost") { if (!lostReason.trim()) { toast("Enter a lost reason below first", "err"); return; } }
                    act("stage", () => patch({ stage: s, lost_reason: s === "Lost" ? lostReason : undefined }), `Moved to ${s}`);
                  }}>
                    {STAGES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Lost reason (if losing)">{(fid) => <input id={fid} className={inputCls} value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder={lead.lost_reason ?? "e.g. chose another agency"} />}</Field>
              <Field label="Deal value (₹)">
                {(fid) => <input id={fid} type="number" min={0} className={`${inputCls} num w-36`} defaultValue={lead.deal_value} key={lead.updated_at}
                  onBlur={(e) => { const v = Number(e.target.value); if (v !== lead.deal_value) act("val", () => patch({ deal_value: v }), "Deal value saved"); }} />}
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={busy !== null} onClick={() => act("analyze", () => api(`/leads/${id}/analyze`, "POST"), "Analysis complete")}>
                {busy === "analyze" ? <><Spinner /> Analyzing…</> : a ? "Re-run analysis" : "Analyze opportunity"}
              </Button>
              <Button disabled={busy !== null || !a || lead.do_not_contact} title={!a ? "Analyze first" : undefined} onClick={() => act("draft", () => api(`/leads/${id}/draft`, "POST"), "Draft ready for your review")}>
                {busy === "draft" ? <><Spinner /> Drafting…</> : "Draft outreach"}
              </Button>
              <Button onClick={() => act("dnc", () => patch({ do_not_contact: !lead.do_not_contact }), lead.do_not_contact ? "Contact allowed" : "Marked do-not-contact")}>
                {lead.do_not_contact ? "Allow contact" : "Mark do-not-contact"}
              </Button>
            </div>

            {/* Client Value Canvas (FR-027) */}
            <section aria-labelledby="canvas" className="space-y-3">
              <h3 id="canvas" className="font-display text-lg font-semibold">Client Value Canvas</h3>
              {!a ? (
                <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Run “Analyze opportunity” to build the canvas from the business’s public website and your catalogue. Nothing is guessed until then.</p>
              ) : (
                <>
                  <p className="text-sm text-muted">{a.business_summary}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Block title="What we know" tag="Verified">
                      {verified.length ? <ul className="space-y-1">{verified.map((e, i) => (
                        <li key={e.id}><span className="num text-muted">[{i + 1}]</span> {e.statement}{e.source_url && <> · <a className="text-primary underline" href={e.source_url} target="_blank" rel="noreferrer">source</a></>} <span className="num text-xs text-muted">({e.observed_at.slice(0, 10)})</span></li>
                      ))}</ul> : <p className="text-muted">No verified evidence yet.</p>}
                      {a.observed_issues.length > 0 && <div className="pt-2"><p className="font-medium">Observed issues</p><ul className="list-disc pl-5">{a.observed_issues.map((i, k) => <li key={k}>{i.text} <span className="num text-xs text-muted">{i.evidence_ids.map((x) => `[${evIdx.get(x)}]`).join("")}</span></li>)}</ul></div>}
                    </Block>
                    <Block title="What we suspect" tag="Hypothesis">
                      <List items={a.hypotheses.filter((h) => h.kind !== "owner_concern").map((h) => h.text)} empty="No hypotheses recorded." />
                      {a.unknowns.length > 0 && <div className="pt-2"><p className="font-medium">Still unknown</p><List items={a.unknowns} empty="" /></div>}
                    </Block>
                    <Block title="What may matter to them" tag="Hypothesis">
                      <p className="text-xs text-muted">Possible concerns to confirm in conversation, not facts.</p>
                      <List items={a.hypotheses.filter((h) => h.kind === "owner_concern").map((h) => h.text)} empty="None suggested." />
                    </Block>
                    <Block title="How we can help">
                      <p><span className="font-medium">{a.recommended_service}</span></p>
                      <p>{a.desired_outcome}</p>
                      {portfolio.length > 0 && <p className="text-muted">Proof: {portfolio.map((p) => p.title).join(", ")}</p>}
                      {a.estimated_value_inr ? <p className="text-muted">Indicative value: <span className="num">{inr(a.estimated_value_inr)}</span> ({a.value_assumptions}). A hypothesis, not a quote.</p> : null}
                    </Block>
                    <Block title="How to start the conversation">
                      <p>{a.conversation_opener}</p>
                      <p className="pt-1 font-medium">Discovery questions</p>
                      <List items={a.discovery_questions} empty="" />
                    </Block>
                    <Block title="What success could look like">
                      <p className="text-xs text-muted">Things to measure, not promises.</p>
                      <List items={a.success_measures} empty="" />
                    </Block>
                  </div>

                  <div className="rounded-xl border border-line bg-bg p-4">
                    <h4 className="mb-2 font-display text-sm font-semibold">Why this score</h4>
                    <p className="mb-2 text-xs text-muted">Initial weights are hypotheses; calibrate them against closed deals. Confidence is separate from the score.</p>
                    <ul className="space-y-1.5">{WEIGHTS.map(([k, label, w]) => (
                      <li key={k} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                        <div><div className="flex justify-between"><span>{label} <span className="text-xs text-muted">({w}%)</span></span><span className="num">{Math.round(a.sub_scores[k])}</span></div>
                          <div className="mt-1 h-1.5 rounded-full bg-surface2"><div className="h-1.5 rounded-full bg-accent t" style={{ width: `${a.sub_scores[k]}%` }} /></div></div><span />
                      </li>))}</ul>
                    <p className="mt-2 text-sm">Opportunity <span className="num font-semibold">{a.opportunity_score}</span> · Research confidence <span className="num font-semibold">{a.research_confidence}</span></p>
                  </div>
                </>
              )}
              <Field label="Your notes after discovery calls (edit assumptions here)">
                {(fid) => <textarea id={fid} className={`${inputCls} min-h-24`} value={canvas} onChange={(e) => setCanvas(e.target.value)} onBlur={() => canvas !== lead.canvas_notes && act("canvas", () => patch({ canvas_notes: canvas }), "Canvas notes saved")} />}
              </Field>
            </section>

            <section className="space-y-3" aria-labelledby="out">
              <h3 id="out" className="font-display text-lg font-semibold">Outreach</h3>
              {drafts.length === 0 ? <p className="text-sm text-muted">No drafts yet.</p> : drafts.map((d) => <DraftCard key={d.id} draft={d} />)}
              <div className="rounded-xl border border-line p-4">
                <p className="mb-2 text-sm font-medium">Log a reply</p>
                <div className="flex flex-wrap gap-2">
                  <select aria-label="Reply sentiment" className={`${inputCls} w-36`} value={reply.sentiment} onChange={(e) => setReply({ ...reply, sentiment: e.target.value })}>
                    <option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option>
                  </select>
                  <input aria-label="Reply text" className={`${inputCls} min-w-0 flex-1`} placeholder="What did they say?" value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} />
                  <Button disabled={busy !== null} onClick={() => act("reply", async () => { await api(`/leads/${id}/replies`, "POST", reply); setReply({ ...reply, text: "" }); }, "Reply logged")}>Log reply</Button>
                </div>
                {replies.length > 0 && <ul className="mt-3 space-y-1 text-sm">{replies.map((r) => <li key={r.id}><Badge tone={r.sentiment === "positive" ? "success" : r.sentiment === "negative" ? "danger" : "neutral"}>{r.sentiment}</Badge> {r.text}</li>)}</ul>}
              </div>
            </section>

            <section className="space-y-3" aria-labelledby="prop">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="prop" className="font-display text-lg font-semibold">Proposal</h3>
                <Button disabled={busy !== null || !a} title={!a ? "Analyze first" : undefined} onClick={() => act("proposal", () => api(`/leads/${id}/proposal`, "POST"), "Proposal draft ready for your review")}>
                  {busy === "proposal" ? <><Spinner /> Writing…</> : data.proposals.length ? "Regenerate proposal" : "Generate proposal"}
                </Button>
              </div>
              {data.proposals[0] ? <ProposalView key={data.proposals[0].id} proposal={data.proposals[0]} leadName={lead.name} /> : <p className="text-sm text-muted">A proposal draft uses only the verified evidence and your catalogue. You review, edit and send it yourself.</p>}
            </section>

            <section className="space-y-3" aria-labelledby="fu">
              <h3 id="fu" className="font-display text-lg font-semibold">Follow-ups</h3>
              <ul className="space-y-1 text-sm">{tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <input type="checkbox" aria-label={`Mark done: ${t.title}`} checked={Boolean(t.done)} onChange={(e) => act("task", () => api(`/tasks/${t.id}`, "PATCH", { done: e.target.checked }))} />
                  <span className={t.done ? "text-muted line-through" : ""}>{t.title}</span><span className="num ml-auto text-xs text-muted">{t.due_date}</span>
                </li>))}</ul>
              <div className="flex flex-wrap gap-2">
                <input aria-label="New follow-up" className={`${inputCls} min-w-0 flex-1`} placeholder="Add a follow-up" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
                <input aria-label="Due date" type="date" className={`${inputCls} w-40`} value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} />
                <Button disabled={!task.title.trim()} onClick={() => act("addtask", async () => { await api("/tasks", "POST", { title: task.title, due_date: task.due || null, lead_id: id }); setTask({ title: "", due: "" }); }, "Follow-up added")}>Add</Button>
              </div>
            </section>

            <section className="space-y-2" aria-labelledby="nt">
              <h3 id="nt" className="font-display text-lg font-semibold">Notes</h3>
              <textarea aria-label="Notes" className={`${inputCls} min-h-24`} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== lead.notes && act("notes", () => patch({ notes }), "Notes saved")} />
            </section>

            <section aria-labelledby="tl" className="space-y-2">
              <h3 id="tl" className="font-display text-lg font-semibold">Activity</h3>
              <ol className="space-y-2 border-l border-line pl-4 text-sm">{activities.map((x) => (
                <li key={x.id}><span className="num text-xs text-muted">{x.created_at.slice(0, 16).replace("T", " ")}</span><br />{x.text}</li>))}</ol>
            </section>

            <div className="border-t border-line pt-4">
              <Button variant="danger" onClick={() => { if (confirm(`Delete ${lead.name} and all its data?`)) act("del", async () => { await api(`/leads/${id}`, "DELETE"); onClose(); }, "Lead deleted"); }}>Delete lead</Button>
            </div>
          </div>
        );
      })()}
    </Dialog>
  );
}
