import { useState } from "react";
import { api } from "../api";
import type { Portfolio, Service } from "../types";
import { Badge, Button, Card, ErrorNote, Spinner, inputCls, useApp, useAsync } from "../ui";

type Row = Record<string, string | number>;
function Catalogue<T extends Row>({ title, help, path, fields, blank }: { title: string; help: string; path: string; fields: { key: keyof T & string; label: string }[]; blank: Omit<T, "id"> }) {
  const { refresh, toast } = useApp();
  const { data, error, loading } = useAsync(() => api<T[]>(`/${path}`), [path]);
  const [draft, setDraft] = useState<Omit<T, "id">>(blank);
  const save = (r: T, key: string, v: string) => api(`/${path}/${r.id}`, "PATCH", { [key]: v }).catch((e) => toast(e.message, "err"));
  return (
    <Card aria-label={title}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-muted">{help}</p>
      {loading && !data && <Spinner />}
      {error && <ErrorNote message={error} />}
      <ul className="space-y-3">
        {(data ?? []).map((r) => (
          <li key={r.id} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
            {fields.map((f) => <label key={f.key} className="text-xs font-medium text-muted">{f.label}<input className={`${inputCls} mt-1`} defaultValue={String(r[f.key] ?? "")} onBlur={(e) => e.target.value !== r[f.key] && save(r, f.key, e.target.value)} /></label>)}
            <div className="sm:col-span-2"><Button variant="danger" size="sm" onClick={() => api(`/${path}/${r.id}`, "DELETE").then(refresh)}>Remove</Button></div>
          </li>
        ))}
      </ul>
      <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); try { await api(`/${path}`, "POST", draft); setDraft(blank); toast("Added"); refresh(); } catch (x) { toast((x as Error).message, "err"); } }}>
        {fields.map((f) => <label key={f.key} className="text-xs font-medium text-muted">{f.label}<input className={`${inputCls} mt-1`} value={String(draft[f.key as keyof typeof draft] ?? "")} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} /></label>)}
        <div className="sm:col-span-2"><Button type="submit" variant="primary" size="sm">Add</Button></div>
      </form>
    </Card>
  );
}

export function Settings() {
  const health = useAsync(() => fetch("/api/health").then((r) => r.json() as Promise<{ ai_configured: boolean; provider: string | null; model: string; discovery: string | null }>), []);
  return (
    <div className="page-in space-y-6">
      <header><h1 className="text-2xl font-bold">Settings</h1><p className="text-sm text-muted">What the AI is allowed to recommend and cite. It can only use what is listed here.</p></header>
      <Card>
        <h2 className="font-display text-lg font-semibold">AI connection</h2>
        {health.data && <p className="mt-2 text-sm">AI key: {health.data.ai_configured ? <Badge tone="success">configured</Badge> : <Badge tone="danger">missing</Badge>} · Provider <span className="num">{health.data.provider ?? "none"}</span> · Model <span className="num">{health.data.model}</span> · Discovery <span className="num">{health.data.discovery ?? "off"}</span></p>}
        <p className="mt-1 text-xs text-muted">Keys live only in the server .env file and never reach the browser.</p>
      </Card>
      <Catalogue<Service & Row> title="Services" help="Outcome statements and prices are hypotheses until validated with prospects." path="services"
        fields={[{ key: "name", label: "Service" }, { key: "outcome", label: "Customer outcome" }, { key: "price_range", label: "Indicative price" }]} blank={{ name: "", outcome: "", price_range: "" }} />
      <Catalogue<Portfolio & Row> title="Portfolio proof" help="Only these items can be cited as proof in outreach. Add your real projects." path="portfolio"
        fields={[{ key: "title", label: "Project" }, { key: "url", label: "URL" }, { key: "industries", label: "Relevant industries" }, { key: "summary", label: "What you delivered" }]} blank={{ title: "", url: "", industries: "", summary: "" }} />
    </div>
  );
}
