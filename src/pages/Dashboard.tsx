import { api } from "../api";
import { inr, type Dashboard as D } from "../types";
import { Badge, Button, Card, Empty, ErrorNote, Spinner, cls, useApp, useAsync } from "../ui";

const KPIS: { key: string; label: string; money?: boolean; pct?: boolean }[] = [
  { key: "total_leads", label: "Total leads" }, { key: "researched", label: "Researched" }, { key: "qualified", label: "Qualified" },
  { key: "awaiting_review", label: "Awaiting review" }, { key: "outreach_sent", label: "Outreach sent" }, { key: "responses", label: "Responses" },
  { key: "positive_reply_rate", label: "Positive reply rate", pct: true }, { key: "meetings", label: "Meetings" }, { key: "proposals", label: "Proposals" },
  { key: "active_deals", label: "Active deals" }, { key: "pipeline_value", label: "Pipeline (estimated)", money: true },
  { key: "confirmed_revenue", label: "Confirmed revenue", money: true }, { key: "pending_followups", label: "Pending follow-ups" },
];

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export function Dashboard({ name, go }: { name: string; go: (p: string) => void }) {
  const { openLead } = useApp();
  const { data: d, error, loading } = useAsync(() => api<D>("/dashboard"), []);
  if (loading && !d) return <Spinner />;
  if (error || !d) return <ErrorNote message={error ?? "Could not load the dashboard"} />;
  const maxFunnel = Math.max(1, ...d.funnel.map((f) => f.count));
  const next = d.focus[0];

  return (
    <div className="page-in space-y-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">{greeting()}, {name}.</h1>
        <p className="mt-1 text-muted">{next ? `Next best step: ${next.text}.` : "You are all caught up. Add leads or research a new niche."}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-accent/50" aria-labelledby="best">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Your best opportunity today</p>
          {d.best ? (
            <div className="mt-2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="best" className="text-xl font-semibold">{d.best.name}</h2>
                <div className="flex gap-2"><Badge tone="primary">Score <span className="num">{d.best.score}</span></Badge><Badge>Confidence <span className="num">{d.best.confidence}</span></Badge></div>
              </div>
              {d.best.service && <p className="text-sm"><span className="text-muted">Recommended: </span>{d.best.service}{d.best.estimated_value ? <> · <span className="num">{inr(d.best.estimated_value)}</span> (your deal estimate)</> : null}</p>}
              {d.best.evidence.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{d.best.evidence.map((e, i) => <li key={i}>{e.statement}</li>)}</ul>}
              {d.best.opener && <p className="rounded-lg bg-surface2 p-3 text-sm">{d.best.opener}</p>}
              <Button variant="primary" onClick={() => openLead(d.best!.lead_id)}>See why this lead matters</Button>
            </div>
          ) : (
            <div className="mt-2"><h2 id="best" className="sr-only">Best opportunity</h2>
              <Empty title="No analyzed opportunities yet">Add a lead, then run “Analyze opportunity” to see your best prospect here.
                <div className="mt-3"><Button variant="primary" onClick={() => go("leads")}>Explore opportunities</Button></div></Empty></div>
          )}
        </Card>

        <Card aria-labelledby="focus">
          <h2 id="focus" className="font-display text-lg font-semibold">Today’s focus</h2>
          <ul className="mt-3 space-y-2">
            {d.focus.length === 0 && <li className="text-sm text-muted">Nothing urgent. Nice.</li>}
            {d.focus.map((f, i) => (
              <li key={i}>
                <button className="t w-full rounded-lg border border-line p-3 text-left text-sm hover:bg-surface2" onClick={() => f.lead_id ? openLead(f.lead_id) : go("leads")}>{f.text}</button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section aria-labelledby="kpi">
        <h2 id="kpi" className="sr-only">Key metrics</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {KPIS.map((k) => {
            const v = d.metrics[k.key];
            const text = v === null || v === undefined ? "–" : k.money ? inr(v) : k.pct ? `${v}%` : String(v);
            const overdue = k.key === "pending_followups" ? d.metrics.overdue_followups : 0;
            return (
              <Card key={k.key} className={cls("lift t !p-4", k.key === "confirmed_revenue" && "border-accent/50")}>
                <p className="text-xs text-muted">{k.label}</p>
                <p className="num mt-1 font-display text-2xl font-semibold">{text}</p>
                <p className="mt-1 text-xs text-muted">{d.definitions[k.key]}{overdue ? ` ${overdue} overdue.` : ""}</p>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card aria-labelledby="funnel">
          <h2 id="funnel" className="font-display text-lg font-semibold">Pipeline by stage</h2>
          <ul className="mt-3 space-y-2">
            {d.funnel.map((f) => (
              <li key={f.stage} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="truncate">{f.stage}</span>
                <div className="h-3 rounded-full bg-surface2"><div className="t h-3 rounded-full" style={{ width: `${(f.count / maxFunnel) * 100}%`, background: f.stage === "Lost" ? "var(--muted)" : "var(--accent)" }} /></div>
                <span className="num text-right">{f.count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="agents">
          <h2 id="agents" className="font-display text-lg font-semibold">AI sales team</h2>
          <p className="text-xs text-muted">Status reflects real runs only. Nothing runs in the background.</p>
          <ul className="mt-3 space-y-3">
            {d.agents.map((a) => (
              <li key={a.name} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex items-center justify-between"><span className="font-medium">{a.name}</span><Badge tone={a.status === "running" ? "info" : "neutral"}>{a.status}</Badge></div>
                <p className="mt-1 text-muted">{a.last_task ? `Last run: ${a.last_task}` : "No runs yet"}</p>
                <p className="num text-xs text-muted">{a.runs} runs · {a.failed} failed · {a.input_tokens.toLocaleString()} in / {a.output_tokens.toLocaleString()} out tokens</p>
                {a.last_error && <p className="mt-1 text-xs text-danger">Last error: {a.last_error.slice(0, 160)}</p>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card aria-labelledby="src">
        <h2 id="src" className="font-display text-lg font-semibold">Lead sources</h2>
        {d.lead_sources.length === 0 ? <p className="mt-2 text-sm text-muted">Sources appear once you add leads with a source.</p> : (
          <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted"><th className="pb-2 font-medium">Source</th><th className="pb-2 font-medium">Leads</th><th className="pb-2 font-medium">Won</th></tr></thead>
            <tbody>{d.lead_sources.map((s) => <tr key={s.source} className="border-t border-line"><td className="py-2">{s.source}</td><td className="num">{s.leads}</td><td className="num">{s.won}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
