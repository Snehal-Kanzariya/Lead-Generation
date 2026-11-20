import { useState } from "react";
import { api } from "./api";
import type { Draft } from "./types";
import { Badge, Button, inputCls, useApp } from "./ui";

const TONE = { draft: "warning", approved: "info", sent: "success", rejected: "neutral" } as const;

/** Review → approve → manually mark sent. The system never sends anything (constitution C5). */
export function DraftCard({ draft, showLead = false }: { draft: Draft; showLead?: boolean }) {
  const { refresh, toast, openLead } = useApp();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [short, setShort] = useState(draft.short_message);
  const [busy, setBusy] = useState(false);
  const editable = draft.status === "draft";
  const dirty = subject !== draft.subject || body !== draft.body || short !== draft.short_message;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok); refresh(); } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  const save = () => api(`/drafts/${draft.id}`, "PATCH", { subject, body, short_message: short });

  return (
    <div className="space-y-3 rounded-xl border border-line bg-bg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TONE[draft.status]}>{draft.status === "draft" ? "Awaiting your review" : draft.status}</Badge>
        {showLead && <button className="text-sm font-medium text-primary underline-offset-2 hover:underline" onClick={() => openLead(draft.lead_id)}>{draft.lead_name}</button>}
        <span className="num ml-auto text-xs text-muted">{draft.created_at.slice(0, 10)}</span>
      </div>
      {draft.flags.length > 0 && editable && (
        <p role="alert" className="rounded-lg bg-surface2 p-2 text-sm text-warning">Flagged phrases: {draft.flags.join(", ")}. Remove them before approving.</p>
      )}
      <label className="block text-xs font-medium text-muted">Subject
        <input className={`${inputCls} mt-1`} value={subject} disabled={!editable} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="block text-xs font-medium text-muted">Email
        <textarea className={`${inputCls} mt-1 min-h-40`} value={body} disabled={!editable} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label className="block text-xs font-medium text-muted">Short message (LinkedIn / WhatsApp)
        <textarea className={`${inputCls} mt-1 min-h-20`} value={short} disabled={!editable} onChange={(e) => setShort(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        {editable && <>
          <Button size="sm" disabled={busy || !dirty} onClick={() => act(save, "Draft saved")}>Save edits</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => act(async () => { if (dirty) await save(); await api(`/drafts/${draft.id}/approve`, "POST"); }, "Approved. Send it yourself, then mark it sent.")}>Approve</Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => act(() => api(`/drafts/${draft.id}/reject`, "POST"), "Draft rejected")}>Reject</Button>
        </>}
        {draft.status === "approved" && (
          <>
            <Button size="sm" onClick={() => navigator.clipboard?.writeText(`${subject}\n\n${body}`).then(() => toast("Email copied"))}>Copy email</Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => act(() => api(`/drafts/${draft.id}/sent`, "POST"), "Marked as sent. Follow-up scheduled in 5 days.")}>I sent this</Button>
          </>
        )}
      </div>
      {draft.status === "approved" && <p className="text-xs text-muted">Shiv Growth OS never sends messages. Send it from your own email or LinkedIn, then press “I sent this”.</p>}
    </div>
  );
}
