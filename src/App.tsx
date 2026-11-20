import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "./api";
import { BRAND } from "./brand";
import { LeadDrawer } from "./LeadDrawer";
import { Auth, type Session } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { Discover } from "./pages/Discover";
import { FollowUps } from "./pages/FollowUps";
import { Leads } from "./pages/Leads";
import { Outreach } from "./pages/Outreach";
import { Pipeline } from "./pages/Pipeline";
import { Settings } from "./pages/Settings";
import type { Dashboard as D } from "./types";
import { AppCtx, cls, inputCls, useAsync, useToasts } from "./ui";

const NAV = [
  ["dashboard", "Command Center", "◈"], ["discover", "Discover", "✦"], ["leads", "Leads", "◎"], ["pipeline", "Pipeline", "▦"],
  ["outreach", "Outreach", "✉"], ["followups", "Follow-ups", "◷"], ["settings", "Settings", "⚙"],
] as const;
type Page = (typeof NAV)[number][0];

const readSession = (): Session | null => { try { const s = localStorage.getItem("kiln_session"); return s && getToken() ? JSON.parse(s) : null; } catch { return null; } };
const pageFromHash = (): Page => (NAV.find(([k]) => `#/${k}` === location.hash)?.[0] ?? "dashboard");

function Shell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [version, setVersion] = useState(0);
  const [openLeadId, setOpenLeadId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? "dark");
  const { toast, view } = useToasts();
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => { const h = () => setPage(pageFromHash()); addEventListener("hashchange", h); return () => removeEventListener("hashchange", h); }, []);
  const go = (p: string) => { location.hash = `#/${p}`; setMobileNav(false); };
  const toggleTheme = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t); document.documentElement.dataset.theme = t;
    try { localStorage.setItem("kiln_theme", t); } catch { /* ignore */ }
  };

  const ctx = useMemo(() => ({ version, refresh, openLead: setOpenLeadId, openLeadId, closeLead: () => setOpenLeadId(null), toast, query }), [version, refresh, openLeadId, toast, query]);
  const firstName = session.workspace.name.replace(/'s workspace$/i, "").replace(/^My workspace$/i, "there");

  return (
    <AppCtx.Provider value={ctx}>
      <div className="flex h-full">
        {mobileNav && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileNav(false)} />}
        <nav aria-label="Primary" className={cls("t fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface lg:static", collapsed ? "lg:w-16" : "lg:w-60", "w-60", mobileNav ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
          <div className="flex h-16 items-center gap-2 px-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary font-display font-bold text-on-primary">{BRAND.initial}</span>
            {!collapsed && <span className="font-display font-semibold leading-tight">{BRAND.name}</span>}</div>
          <ul className="flex-1 space-y-1 px-2 py-2">
            {NAV.map(([k, label, icon]) => (
              <li key={k}><a href={`#/${k}`} onClick={() => setMobileNav(false)} aria-current={page === k ? "page" : undefined} title={label}
                className={cls("t flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium", page === k ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface2 hover:text-ink")}>
                <span aria-hidden className="w-5 text-center">{icon}</span>{!collapsed && <span>{label}</span>}{collapsed && <span className="sr-only">{label}</span>}</a></li>
            ))}
          </ul>
          <button className="t m-2 hidden min-h-10 rounded-lg text-sm text-muted hover:bg-surface2 lg:block" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? "»" : "« Collapse"}</button>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
            <button className="t rounded-lg p-2 hover:bg-surface2 lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>☰</button>
            <span className="hidden truncate text-sm font-medium sm:block">{session.workspace.name}</span>
            <div className="ml-auto flex min-w-0 items-center gap-3">
              <label className="sr-only" htmlFor="gs">Search leads</label>
              <input id="gs" type="search" className={`${inputCls} w-40 sm:w-64`} placeholder="Search leads…" value={query} onChange={(e) => { setQuery(e.target.value); if (page !== "leads" && page !== "pipeline" && e.target.value) go("leads"); }} />
              <AiStatus />
              <button className="t rounded-lg border border-line p-2 text-sm hover:bg-surface2" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀" : "☾"}</button>
              <button className="t hidden rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface2 sm:block" onClick={onLogout} title={session.email}>Sign out</button>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-7xl">
            {page === "dashboard" && <Dashboard name={firstName} go={go} />}
            {page === "discover" && <Discover go={go} />}
            {page === "leads" && <Leads />}
            {page === "pipeline" && <Pipeline />}
            {page === "outreach" && <Outreach />}
            {page === "followups" && <FollowUps />}
            {page === "settings" && <Settings />}
          </div></main>
        </div>
      </div>
      {openLeadId !== null && <LeadDrawer id={openLeadId} onClose={() => setOpenLeadId(null)} />}
      {view}
    </AppCtx.Provider>
  );
}

/** Reflects real agent runs only (spec 005 FR-084). */
function AiStatus() {
  const { data } = useAsync(() => api<D>("/dashboard"), []);
  const running = data?.agents.some((a) => a.status === "running");
  return (
    <span className="hidden items-center gap-2 text-xs text-muted md:flex" role="status">
      <span aria-hidden className={cls("h-2 w-2 rounded-full", running ? "animate-pulse bg-info" : "bg-muted")} />{running ? "AI working" : "AI idle"}
    </span>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(readSession);
  useEffect(() => { const h = () => setSession(null); addEventListener("kiln-logout", h); return () => removeEventListener("kiln-logout", h); }, []);
  const authed = (s: Session) => { try { localStorage.setItem("kiln_session", JSON.stringify(s)); } catch { /* ignore */ } setSession(s); };
  const logout = () => { setToken(null); setSession(null); };
  if (!session) return <Auth onAuth={authed} />;
  return <Shell session={session} onLogout={logout} />;
}
