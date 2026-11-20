import { useState } from "react";
import { api } from "../api";
import { STAGES, inr, type Lead } from "../types";
import { Button, Dialog, ErrorNote, Spinner, cls, inputCls, useApp, useAsync } from "../ui";

export function Pipeline() {
  const { openLead, refresh, toast, query } = useApp();
  const { data, error, loading } = useAsync(() => api<Lead[]>("/leads"), []);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [lost, setLost] = useState<{ lead: Lead; reason: string } | null>(null);
  const q = query.trim().toLowerCase();

  const move = async (lead: Lead, stage: string, reason?: string) => {
    if (lead.stage === stage) return;
    if (stage === "Lost" && !reason) { setLost({ lead, reason: "" }); return; }
    try { await api(`/leads/${lead.id}`, "PATCH", { stage, lost_reason: reason }); toast(`${lead.name} → ${stage}`); refresh(); } catch (e) { toast((e as Error).message, "err"); }
  };

  return (
    <div className="page-in space-y-4">
      <header><h1 className="text-2xl font-bold">CRM pipeline</h1><p className="text-sm text-muted">Drag cards between stages, or use the stage menu on each card.</p></header>
      {loading && !data && <Spinner />}
      {error && <ErrorNote message={error} />}
      {data && (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="flex gap-3" style={{ minWidth: STAGES.length * 252 }}>
            {STAGES.map((s) => {
              const items = data.filter((l) => l.stage === s && (!q || l.name.toLowerCase().includes(q)));
              return (
                <section key={s} aria-label={`${s} column`} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
                  onDrop={() => { setOver(null); const l = data.find((x) => x.id === drag); if (l) void move(l, s); setDrag(null); }}
                  className={cls("t w-60 shrink-0 rounded-2xl border bg-surface2 p-2", over === s ? "border-accent" : "border-line")}>
                  <h2 className="flex items-center justify-between px-2 py-1 text-sm font-semibold">{s}<span className="num text-xs text-muted">{items.length}</span></h2>
                  <ul className="space-y-2">
                    {items.map((l) => (
                      <li key={l.id} draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)}
                        className="lift t cursor-grab rounded-xl border border-line bg-surface p-3 text-sm">
                        <button className="text-left font-medium hover:text-primary" onClick={() => openLead(l.id)}>{l.name}</button>
                        <div className="num mt-1 flex justify-between text-xs text-muted"><span>{l.score !== null ? `Score ${l.score}` : "Not analyzed"}</span><span>{l.deal_value ? inr(l.deal_value) : ""}</span></div>
                        <select aria-label={`Move ${l.name} to stage`} className={`${inputCls} mt-2 !min-h-8 !py-1 text-xs`} value={l.stage} onChange={(e) => void move(l, e.target.value)}>
                          {STAGES.map((x) => <option key={x}>{x}</option>)}
                        </select>
                      </li>
                    ))}
                    {items.length === 0 && <li className="px-2 py-4 text-center text-xs text-muted">Empty</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
      {lost && (
        <Dialog title={`Why was ${lost.lead.name} lost?`} onClose={() => setLost(null)}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (lost.reason.trim()) { void move(lost.lead, "Lost", lost.reason); setLost(null); } }}>
            <label className="block text-sm font-medium">Reason (helps you learn what works)
              <input autoFocus required className={`${inputCls} mt-1`} value={lost.reason} onChange={(e) => setLost({ ...lost, reason: e.target.value })} placeholder="Budget, chose another agency, no response…" /></label>
            <div className="flex justify-end gap-2"><Button type="button" onClick={() => setLost(null)}>Cancel</Button><Button type="submit" variant="primary">Mark lost</Button></div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
