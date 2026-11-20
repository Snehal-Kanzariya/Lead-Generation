import { useState } from "react";
import { api } from "../api";
import { DraftCard } from "../DraftCard";
import type { Draft } from "../types";
import { Empty, ErrorNote, Spinner, cls, useAsync } from "../ui";

const TABS = [["draft", "Awaiting review"], ["approved", "Approved, ready to send"], ["sent", "Sent"], ["rejected", "Rejected"]] as const;

export function Outreach() {
  const { data, error, loading } = useAsync(() => api<Draft[]>("/drafts"), []);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("draft");
  const rows = (data ?? []).filter((d) => d.status === tab);
  return (
    <div className="page-in space-y-4">
      <header><h1 className="text-2xl font-bold">Outreach review</h1><p className="text-sm text-muted">Every message is yours to approve and send. Nothing leaves this app automatically.</p></header>
      <div role="tablist" aria-label="Draft status" className="flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cls("t rounded-full border px-4 py-1.5 text-sm", tab === k ? "border-primary bg-primary-soft text-primary" : "border-line hover:bg-surface2")}>
            {label} <span className="num">({(data ?? []).filter((d) => d.status === k).length})</span>
          </button>
        ))}
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorNote message={error} />}
      {data && rows.length === 0 && <Empty title="Nothing here">Open a lead, run “Analyze opportunity”, then “Draft outreach”.</Empty>}
      <div className="grid gap-4 xl:grid-cols-2">{rows.map((d) => <DraftCard key={`${d.id}-${d.status}`} draft={d} showLead />)}</div>
    </div>
  );
}
