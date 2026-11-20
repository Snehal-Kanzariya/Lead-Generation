import { useState } from "react";
import { api } from "../api";
import type { Lead, Task } from "../types";
import { Badge, Button, Card, Empty, ErrorNote, Spinner, inputCls, useApp, useAsync } from "../ui";

export function FollowUps() {
  const { refresh, toast, openLead } = useApp();
  const { data, error, loading } = useAsync(() => api<Task[]>("/tasks"), []);
  const leads = useAsync(() => api<Lead[]>("/leads"), []);
  const [f, setF] = useState({ title: "", due: "", lead: "" });
  const today = new Date().toISOString().slice(0, 10);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api("/tasks", "POST", { title: f.title, due_date: f.due || null, lead_id: f.lead ? Number(f.lead) : null }); setF({ title: "", due: "", lead: "" }); toast("Follow-up added"); refresh(); } catch (x) { toast((x as Error).message, "err"); }
  };
  const open = (data ?? []).filter((t) => !t.done), done = (data ?? []).filter((t) => t.done);
  const row = (t: Task) => {
    const overdue = !t.done && t.due_date && t.due_date < today;
    return (
      <li key={t.id} className="flex flex-wrap items-center gap-3 border-t border-line p-3 text-sm first:border-t-0">
        <input type="checkbox" className="h-4 w-4" aria-label={`Mark done: ${t.title}`} checked={Boolean(t.done)} onChange={(e) => api(`/tasks/${t.id}`, "PATCH", { done: e.target.checked }).then(refresh).catch((x) => toast(x.message, "err"))} />
        <span className={t.done ? "text-muted line-through" : ""}>{t.title}</span>
        {t.lead_id && <button className="text-primary hover:underline" onClick={() => openLead(t.lead_id!)}>{t.lead_name}</button>}
        <span className="ml-auto flex items-center gap-2">{overdue && <Badge tone="danger">Overdue</Badge>}<span className="num text-xs text-muted">{t.due_date ?? "No date"}</span>
          <button aria-label={`Delete ${t.title}`} className="text-muted hover:text-danger" onClick={() => api(`/tasks/${t.id}`, "DELETE").then(refresh)}>✕</button></span>
      </li>
    );
  };
  return (
    <div className="page-in space-y-4">
      <header><h1 className="text-2xl font-bold">Follow-ups</h1><p className="text-sm text-muted">Plan your next touch with every conversation.</p></header>
      <Card>
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <input aria-label="Follow-up title" required className={`${inputCls} min-w-48 flex-1`} placeholder="What needs to happen?" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input aria-label="Due date" type="date" className={`${inputCls} w-40`} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          <select aria-label="Lead" className={`${inputCls} w-48`} value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })}>
            <option value="">No lead</option>{(leads.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <Button type="submit" variant="primary">Plan next follow-up</Button>
        </form>
      </Card>
      {loading && !data && <Spinner />}
      {error && <ErrorNote message={error} />}
      {data && open.length === 0 && <Empty title="No open follow-ups">When you mark outreach as sent, a follow-up is scheduled for 5 days later.</Empty>}
      {open.length > 0 && <Card className="!p-0"><ul>{open.map(row)}</ul></Card>}
      {done.length > 0 && <details><summary className="cursor-pointer text-sm text-muted">Completed ({done.length})</summary><Card className="mt-2 !p-0"><ul>{done.map(row)}</ul></Card></details>}
    </div>
  );
}
