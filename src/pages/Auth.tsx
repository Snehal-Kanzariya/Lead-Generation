import { useState } from "react";
import { api, setToken } from "../api";
import { Button, ErrorNote, Field, inputCls } from "../ui";

export interface Session { email: string; workspace: { id: number; name: string } }

export function Auth({ onAuth }: { onAuth: (s: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await api<{ token: string } & Session>(`/auth/${mode}`, "POST", mode === "register" ? f : { email: f.email, password: f.password });
      setToken(r.token); onAuth({ email: r.email, workspace: r.workspace });
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <main className="grid min-h-full place-items-center p-4">
      <div className="page-in w-full max-w-md rounded-2xl border border-line bg-surface p-8">
        <p className="font-display text-sm font-semibold tracking-wide text-primary">SHIV GROWTH OS</p>
        <h1 className="mt-2 text-2xl font-bold">{mode === "login" ? "Welcome back" : "Create your workspace"}</h1>
        <p className="mt-1 text-sm text-muted">Less uncertainty. More clarity. Better conversations.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {err && <ErrorNote message={err} />}
          {mode === "register" && <Field label="Your first name">{(id) => <input id={id} className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="given-name" />}</Field>}
          <Field label="Email">{(id) => <input id={id} type="email" required className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />}</Field>
          <Field label="Password" hint={mode === "register" ? "At least 8 characters." : undefined}>{(id) => <input id={id} type="password" required minLength={8} className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === "login" ? "current-password" : "new-password"} />}</Field>
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>{mode === "login" ? "Sign in" : "Create workspace"}</Button>
        </form>
        <button className="mt-4 text-sm text-primary hover:underline" onClick={() => { setErr(""); setMode(mode === "login" ? "register" : "login"); }}>
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
