const KEY = "kiln_token";

export function getToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function raw(path: string, method: string, body?: unknown): Promise<Response> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error ?? msg; } catch { /* non-json */ }
    if (res.status === 401 && token) { setToken(null); window.dispatchEvent(new Event("kiln-logout")); }
    throw new ApiError(res.status, msg);
  }
  return res;
}

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await raw(path, method, body);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export async function downloadLeadsCsv() {
  const res = await raw("/leads/export.csv", "GET");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = "leads.csv"; a.click();
  URL.revokeObjectURL(url);
}
