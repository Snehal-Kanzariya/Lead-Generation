import { assertPublicUrl } from "./ssrf.ts";
import { normalizeUrl } from "./hosts.ts";

export interface EvidenceItem { kind: string; statement: string; source_url: string | null }

async function readCapped(res: Response, cap = 1_000_000): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < cap) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value); size += value.length;
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  return Buffer.concat(chunks).toString("utf8");
}

/** Pure HTML -> observations, exported for testing. */
export function observeHtml(html: string, url: string): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  const add = (kind: string, statement: string) => out.push({ kind, statement, source_url: url });
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
  add("title", title ? `Page title is "${title.slice(0, 120)}"` : "Homepage has no <title> tag");
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1];
  add("meta_description", desc?.trim() ? "Homepage has a meta description" : "Homepage has no meta description (affects how it appears in search results)");
  add("mobile", /<meta[^>]+name=["']viewport["']/i.test(html) ? "Homepage declares a mobile viewport" : "Homepage does not declare a mobile viewport tag (may not be mobile-friendly)");
  const has = (re: RegExp) => re.test(html);
  add("contact_form", has(/<form[\s>]/i) ? "Homepage contains a form" : "No form found on the homepage");
  add("booking", has(/book(ing)?|appointment|reserve|schedule/i) ? "Homepage text mentions booking/appointments" : "No booking or appointment wording found on the homepage");
  add("whatsapp", has(/wa\.me|api\.whatsapp\.com|whatsapp/i) ? "WhatsApp contact is present" : "No WhatsApp contact link found");
  add("phone_link", has(/href=["']tel:/i) ? "Click-to-call phone link is present" : "No click-to-call phone link found");
  return out;
}

/** FR-020: fetch public homepage and record factual observations. Never throws; failures become evidence. */
export async function collectEvidence(website: string | null): Promise<EvidenceItem[]> {
  if (!website) return [{ kind: "no_website", statement: "No website recorded for this business (from your lead data)", source_url: null }];
  const url = normalizeUrl(website);
  try {
    await assertPublicUrl(url);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": "ShivGrowthOS-Research/1.0 (public page check)" } });
    } finally { clearTimeout(timer); }
    const out: EvidenceItem[] = [];
    out.push({ kind: "reachability", statement: `Homepage responded with HTTP ${res.status}`, source_url: url });
    const finalUrl = res.url || url;
    out.push({ kind: "https", statement: finalUrl.startsWith("https:") ? "Site is served over HTTPS" : "Site is served over plain HTTP (browsers may show a 'not secure' warning)", source_url: finalUrl });
    const lm = res.headers.get("last-modified");
    if (lm) out.push({ kind: "last_modified", statement: `Server reports last-modified: ${lm}`, source_url: finalUrl });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("html")) out.push(...observeHtml(await readCapped(res), finalUrl));
    return out;
  } catch (e) {
    return [{ kind: "unreachable", statement: `Could not load the website during this check (${(e as Error).message.slice(0, 120)})`, source_url: url }];
  }
}
