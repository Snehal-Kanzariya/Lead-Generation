import { useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, Empty, ErrorNote, Field, Spinner, inputCls, useApp } from "../ui";

interface Found {
  name: string; website: string | null; phone: string | null; address: string | null; city: string | null;
  rating: number | null; review_count: number | null; maps_url: string | null;
  source: "places" | "osm" | "gemini_search"; verified_listing: boolean; source_urls: string[]; signals: string[]; already_in_leads: boolean;
}
const SOURCE_LABEL = { places: "Google Places", osm: "OpenStreetMap", gemini_search: "AI search (unverified)" } as const;

export function Discover({ go }: { go: (p: string) => void }) {
  const { refresh, toast } = useApp();
  const [f, setF] = useState({ query: "", location: "", limit: 8 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [source, setSource] = useState<Found["source"] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const search = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true); setResults(null); setPicked(new Set());
    try {
      const r = await api<{ source: Found["source"]; results: Found[] }>("/discover", "POST", f);
      setResults(r.results); setSource(r.source); refresh();
      setPicked(new Set(r.results.map((x, i) => (x.already_in_leads ? -1 : i)).filter((i) => i >= 0)));
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  const add = async () => {
    const items = [...picked].map((i) => results![i]);
    try {
      const r = await api<{ created: number; skipped: string[] }>("/discover/add", "POST", { items });
      toast(`${r.created} lead${r.created === 1 ? "" : "s"} added${r.skipped.length ? `, ${r.skipped.length} already existed` : ""}`);
      setResults((rs) => rs!.map((x, i) => (picked.has(i) ? { ...x, already_in_leads: true } : x))); setPicked(new Set()); refresh();
    } catch (x) { toast((x as Error).message, "err"); }
  };

  return (
    <div className="page-in space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Discover businesses</h1>
        <p className="text-sm text-muted">Search public listings for businesses that could use a better online presence. Results are starting points: signals are hypotheses, and nothing is contacted.</p>
      </header>
      <Card>
        <form onSubmit={search} className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
          <Field label="What kind of business?">{(id) => <input id={id} required minLength={2} className={inputCls} placeholder="salons, dentists, cafés…" value={f.query} onChange={(e) => setF({ ...f, query: e.target.value })} />}</Field>
          <Field label="Where?">{(id) => <input id={id} required minLength={2} className={inputCls} placeholder="Pune, India" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />}</Field>
          <Field label="How many">{(id) => <select id={id} className={inputCls} value={f.limit} onChange={(e) => setF({ ...f, limit: Number(e.target.value) })}>{[5, 8, 10].map((n) => <option key={n}>{n}</option>)}</select>}</Field>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? <><Spinner /> Searching…</> : "Find businesses"}</Button>
        </form>
      </Card>
      {err && <ErrorNote message={err} />}
      {results && results.length === 0 && <Empty title="No businesses found">Try a broader type (for example “salon”) or a bigger area. You can also add leads by hand or import a CSV.</Empty>}
      {results && results.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">Source: <Badge tone={source === "gemini_search" ? "warning" : "info"}>{SOURCE_LABEL[source!]}</Badge> · {picked.size} selected</p>
            <div className="flex gap-2"><Button onClick={() => go("leads")}>View leads</Button><Button variant="primary" disabled={picked.size === 0} onClick={add}>Add {picked.size || ""} selected to leads</Button></div>
          </div>
          <ul className="grid gap-3 lg:grid-cols-2">
            {results.map((r, i) => (
              <li key={i} className="rounded-2xl border border-line bg-surface p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4" disabled={r.already_in_leads} checked={picked.has(i)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.name}</span>{r.already_in_leads && <Badge tone="success">In your leads</Badge>}{!r.website && <Badge tone="warning">No website listed</Badge>}</span>
                    <span className="mt-1 block text-sm text-muted">{[r.address ?? r.city, r.phone].filter(Boolean).join(" · ")}</span>
                    {r.rating != null && <span className="num mt-1 block text-sm">{r.rating}★ · {r.review_count ?? "?"} reviews</span>}
                    {r.website && <span className="mt-1 block truncate text-sm text-primary">{r.website}</span>}
                    {r.signals.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{r.signals.map((s, k) => <li key={k}>{s}</li>)}</ul>}
                    {r.source_urls[0] && <a className="mt-2 inline-block text-xs text-primary underline" href={r.source_urls[0]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Source</a>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
