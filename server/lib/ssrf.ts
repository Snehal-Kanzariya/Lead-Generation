import { lookup } from "node:dns/promises";
import net from "node:net";

function privateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return privateIPv4(ip);
  const l = ip.toLowerCase();
  if (l.startsWith("::ffff:")) return privateIPv4(l.slice(7));
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
}

/** FR-021 sync check: scheme + literal host. Returns reason string if blocked. */
export function blockedReason(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "invalid url"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "scheme not allowed";
  const h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return "local host";
  if (net.isIP(h) && privateIp(h)) return "private address";
  return null;
}

/** Full check including DNS resolution. */
export async function assertPublicUrl(raw: string): Promise<void> {
  const r = blockedReason(raw);
  if (r) throw new Error(`Blocked URL: ${r}`);
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return;
  const addrs = await lookup(host, { all: true });
  if (addrs.some((a) => privateIp(a.address))) throw new Error("Blocked URL: resolves to private address");
}
