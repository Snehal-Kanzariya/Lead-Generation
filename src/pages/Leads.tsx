import { useState } from "react";
import { api, downloadLeadsCsv } from "../api";
import { STAGES, inr, type Lead } from "../types";
import { Badge, Button, Card, Dialog, Empty, ErrorNote, Field, Spinner, inputCls, useApp, useAsync } from "../ui";

function AddLead({ onClose }: { onClose: () => void }) {
  const { refresh, toast, openLead } = useApp();
  const [f, setF] = useState({ name: "", industry: "", website: "", city: "", country: "India", phone: "", email: "", source: "" });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim() !== ""));
    try { const l = await api<Lead>("/leads", "POST", body); toast("Lead added"); refresh(); onClose(); openLead(l.id); } catch (x) { setErr((x as Error).message); }
  };
  return (
    <Dialog title="Add a lead" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {err && <ErrorNote message={err} />}
        <Field label="Business name *">{(id) => <input id={id} required className={inputCls} value={f.name} onChange={set("name")} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Industry">{(id) => <input id={id} className={inputCls} value={f.industry} onChange={set("industry")} placeholder="salon, clinic, café…" />}</Field>
          <Field label="Website" hint="Public page is checked for evidence.">{(id) => <input id={id} className={inputCls} value={f.website} onChange={set("website")} placeholder="example.com" />}</Field>
          <Field label="City">{(id) => <input id={id} className={inputCls} value={f.city} onChange={set("city")} />}</Field>
          <Field label="Country">{(id) => <input id={id} className={inputCls} value={f.country} onChange={set("country")} />}</Field>
          <Field label="Public phone">{(id) => <input id={id} className={inputCls} value={f.phone} onChange={set("phone")} />}</Field>
          <Field label="Public email">{(id) => <input id={id} type="email" className={inputCls} value={f.email} onChange={set("email")} />}</Field>
        </div>
        <Field label="Where did you find them?">{(id) => <input id={id} className={inputCls} value={f.source} onChange={set("source")} placeholder="Google Maps, referral, LinkedIn…" />}</Field>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Add lead</Button></div>
      </form>
    </Dialog>
  );
}

function ImportCsv({ onClose }: { onClose: () => void }) {
  const { refresh, toast } = useApp();
  const [csv, setCsv] = useState("");
  const [res, setRes] = useState<{ created: number; skipped: string[]; errors: string[] } | null>(null);
  const [err, setErr] = useState("");
  const go = async () => {
    setErr("");
    try { const r = await api<{ created: number; skipped: string[]; errors: string[] }>("/leads/import", "POST", { csv }); setRes(r); toast(`${r.created} leads imported`); refresh(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Dialog title="Import leads from CSV" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Columns recognised: name (or business/company), industry, website, city, country, phone, email, source, value, notes, tags. Duplicates are skipped.</p>
        <input type="file" accept=".csv,text/csv" aria-label="Choose CSV file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
        <textarea aria-label="CSV text" className={`${inputCls} min-h-40 font-mono`} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"name,website,city\nGreen Leaf Salon,greenleaf.in,Pune"} />
        {err && <ErrorNote message={err} />}
        {res && <div className="rounded-lg bg-surface2 p-3 text-sm"><p>Imported {res.created}. Skipped {res.skipped.length} duplicates. {res.errors.length} invalid rows.</p>
          {[...res.skipped, ...res.errors].slice(0, 8).map((m, i) => <p key={i} className="text-muted">{m}</p>)}</div>}
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" disabled={!csv.trim()} onClick={go}>Import</Button></div>
      </div>
    </Dialog>
  );
}

export const stageTone = (s: string) => (s === "Won" ? "success" : s === "Lost" ? "danger" : s === "Discovered" ? "neutral" : "primary") as "success" | "danger" | "neutral" | "primary";

export function Leads() {
  const { openLead, query } = useApp();
  const { data, error, loading } = useAsync(() => api<Lead[]>("/leads"), []);
  const [stage, setStage] = useState("");
  const [modal, setModal] = useState<"add" | "import" | null>(null);
  const q = query.trim().toLowerCase();
  const rows = (data ?? []).filter((l) => (!stage || l.stage === stage) && (!q || [l.name, l.city, l.industry, l.website].some((x) => x?.toLowerCase().includes(q))));

  return (
    <div className="page-in space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Leads &amp; opportunities</h1><p className="text-sm text-muted">Add businesses, then analyze them to see evidence-backed opportunities.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => downloadLeadsCsv().catch(() => 0)}>Export CSV</Button>
          <Button onClick={() => setModal("import")}>Import CSV</Button>
          <Button variant="primary" onClick={() => setModal("add")}>Add lead</Button>
        </div>
      </header>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="stagef">Filter by stage</label>
        <select id="stagef" className={`${inputCls} w-52`} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option>{STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        {q && <span className="self-center text-sm text-muted">Searching “{query}”</span>}
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorNote message={error} />}
      {data && data.length === 0 && <Empty title="No leads yet">Add your first lead or import a CSV to start finding opportunities.<div className="mt-3 flex justify-center gap-2"><Button variant="primary" onClick={() => setModal("add")}>Add lead</Button><Button onClick={() => setModal("import")}>Import CSV</Button></div></Empty>}
      {data && data.length > 0 && (
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Business</th><th className="p-3 font-medium">Stage</th><th className="p-3 font-medium">Opportunity</th><th className="p-3 font-medium">Confidence</th><th className="p-3 font-medium">Recommended</th><th className="p-3 font-medium">Value</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="t border-t border-line hover:bg-surface2">
                  <td className="p-3"><button className="text-left font-medium text-primary hover:underline" onClick={() => openLead(l.id)}>{l.name}</button><div className="text-xs text-muted">{[l.industry, l.city].filter(Boolean).join(" · ")}</div></td>
                  <td className="p-3"><Badge tone={stageTone(l.stage)}>{l.stage}</Badge>{l.do_not_contact && <> <Badge tone="danger">DNC</Badge></>}</td>
                  <td className="num p-3">{l.score ?? "–"}</td><td className="num p-3">{l.confidence ?? "–"}</td>
                  <td className="max-w-48 truncate p-3">{l.recommended_service ?? <span className="text-muted">Not analyzed</span>}</td>
                  <td className="num p-3">{l.deal_value ? inr(l.deal_value) : "–"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted">No leads match.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
      {modal === "add" && <AddLead onClose={() => setModal(null)} />}
      {modal === "import" && <ImportCsv onClose={() => setModal(null)} />}
    </div>
  );
}
