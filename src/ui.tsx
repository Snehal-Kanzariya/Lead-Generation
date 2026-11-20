import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/* ── App-wide context: refresh signal, lead drawer, toasts ── */
interface Ctx {
  version: number;
  refresh: () => void;
  openLead: (id: number) => void;
  openLeadId: number | null;
  closeLead: () => void;
  toast: (msg: string, kind?: "ok" | "err") => void;
  query: string;
}
export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { version } = useApp();
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return { data, error, loading };
}

/* ── Primitives ── */
export const cls = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "soft"; size?: "sm" | "md" };
export function Button({ variant = "ghost", size = "md", className, ...p }: BtnProps) {
  const v = {
    primary: "bg-primary text-on-primary hover:bg-primary-hover",
    ghost: "border border-line bg-surface hover:bg-surface2 text-ink",
    soft: "bg-primary-soft text-primary hover:opacity-90",
    danger: "border border-line text-danger hover:bg-surface2",
  }[variant];
  return (
    <button
      {...p}
      className={cls("t inline-flex items-center justify-center gap-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-9",
        size === "sm" ? "px-3 text-sm py-1" : "px-4 py-2 text-sm", v, className)}
    />
  );
}

export function Card({ children, className, ...p }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return <section {...p} className={cls("rounded-2xl border border-line bg-surface p-5", className)}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" | "primary" }) {
  const t = {
    neutral: "bg-surface2 text-muted", success: "bg-surface2 text-success", warning: "bg-surface2 text-warning",
    danger: "bg-surface2 text-danger", info: "bg-surface2 text-info", primary: "bg-primary-soft text-primary",
  }[tone];
  return <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", t)}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
export const inputCls = "t w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted min-h-10";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span role="status" aria-label={label} className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary" />;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="font-display text-lg">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}
export function ErrorNote({ message }: { message: string }) {
  return <p role="alert" className="rounded-lg border border-line bg-surface2 p-3 text-sm text-danger">{message}</p>;
}

/* ── Accessible dialog / drawer: focus trap, Esc, focus restore ── */
export function Dialog({ title, onClose, children, side = false, wide = false }: { title: string; onClose: () => void; children: ReactNode; side?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'));
    (focusables()[0] ?? el).focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => { el.removeEventListener("keydown", key); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={cls("bg-surface border-line shadow-2xl overflow-y-auto",
          side ? "drawer-in ml-auto h-full w-full max-w-2xl border-l" : cls("page-in m-auto w-[calc(100%-2rem)] rounded-2xl border max-h-[90vh]", wide ? "max-w-3xl" : "max-w-lg"))}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-surface px-5 py-3">
          <h2 id={titleId} className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="t rounded-lg p-2 hover:bg-surface2">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ── Toasts ── */
export function useToasts() {
  const [items, setItems] = useState<{ id: number; msg: string; kind: "ok" | "err" }[]>([]);
  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 5000);
  }, []);
  const view = (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2">
      {items.map((i) => (
        <div key={i.id} role={i.kind === "err" ? "alert" : "status"} className={cls("page-in rounded-xl border bg-surface px-4 py-3 text-sm shadow-lg", i.kind === "err" ? "border-danger text-danger" : "border-line")}>{i.msg}</div>
      ))}
    </div>
  );
  return { toast, view };
}

export function ScoreRing({ value, label, size = 64 }: { value: number | null; label: string; size?: number }) {
  const v = value ?? 0, r = size / 2 - 5, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${label}: ${value === null ? "not available" : Math.round(v)} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        {value !== null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: "stroke-dashoffset 400ms ease" }} />}
      </svg>
      <span className="num -mt-[calc(50%+10px)] mb-3 text-sm font-semibold" style={{ marginTop: -size / 2 - 9 }}>{value === null ? "–" : Math.round(v)}</span>
      <span className="mt-2 text-xs text-muted">{label}</span>
    </div>
  );
}
