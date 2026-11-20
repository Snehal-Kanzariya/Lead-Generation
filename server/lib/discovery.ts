import { geminiGenerate } from "../ai/gemini.ts";

export interface Discovered {
  name: string; website: string | null; phone: string | null; address: string | null; city: string | null;
  rating: number | null; review_count: number | null; maps_url: string | null;
  source: "places" | "osm" | "gemini_search"; verified_listing: boolean; source_urls: string[]; signals: string[];
}

/** FR-103 / AC-102: hedged, rule-based indicators. Never asserts that a business is "growing". */
export function growthSignals(d: Pick<Discovered, "website" | "rating" | "review_count">): string[] {
  const s: string[] = [];
  if (!d.website) s.push("No website listed on its Google profile (possible gap)");
  if (d.review_count != null && d.review_count >= 100 && (d.rating ?? 0) >= 4.3) s.push(`Well reviewed (${d.review_count} reviews, ${d.rating}★), so demand may be strong`);
  else if (d.review_count != null && d.review_count >= 30 && (d.rating ?? 0) >= 4.0) s.push(`Steady review activity (${d.review_count} reviews, ${d.rating}★)`);
  if (d.review_count != null && d.review_count < 15 && d.review_count > 0) s.push("Few reviews so far, so it may be new or still building visibility");
  if (!d.website && (d.review_count ?? 0) >= 50) s.push("Customers are finding it without a website, so an online presence could capture more");
  return s;
}

const cityOf = (address: string | null, fallback: string) => {
  if (!address) return fallback;
  const parts = address.split(",").map((x) => x.trim());
  return parts.length >= 3 ? parts[parts.length - 3].replace(/\d+/g, "").trim() || fallback : fallback;
};

/** FR-102: explicit DISCOVERY_SOURCE wins; else Places if keyed; else free OpenStreetMap. */
export function discoverySource(env: Record<string, string | undefined> = process.env): "places" | "osm" | "gemini_search" | null {
  const pref = env.DISCOVERY_SOURCE?.trim().toLowerCase();
  if (pref === "osm") return "osm";
  if (pref === "gemini_search" && env.GEMINI_API_KEY?.trim()) return "gemini_search";
  if (pref === "places" && env.GOOGLE_PLACES_API_KEY?.trim()) return "places";
  if (env.GOOGLE_PLACES_API_KEY?.trim()) return "places";
  return pref === "none" ? null : "osm";
}

export async function placesSearch(query: string, location: string, limit: number): Promise<Discovered[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY!.trim();
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json", "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri,places.businessStatus",
    },
    body: JSON.stringify({ textQuery: `${query} in ${location}`, pageSize: Math.min(limit, 10) }),
    signal: AbortSignal.timeout(20_000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Places error ${res.status}: ${j.error?.message ?? "request failed"}`.slice(0, 250));
  return (j.places ?? []).filter((p: any) => p.businessStatus !== "CLOSED_PERMANENTLY").map((p: any) => {
    const base = {
      name: p.displayName?.text ?? "Unknown", website: p.websiteUri ?? null, phone: p.nationalPhoneNumber ?? null, address: p.formattedAddress ?? null,
      city: cityOf(p.formattedAddress ?? null, location), rating: p.rating ?? null, review_count: p.userRatingCount ?? null, maps_url: p.googleMapsUri ?? null,
      source: "places" as const, verified_listing: true, source_urls: p.googleMapsUri ? [p.googleMapsUri] : [],
    };
    return { ...base, signals: growthSignals(base) };
  });
}

/* ── OpenStreetMap (free, no key). Public data under ODbL; polite single requests with a descriptive User-Agent. ── */
const OSM_TAGS: [RegExp, string][] = [
  [/salon|beauty|parlou?r|hair|barber/i, '["shop"~"hairdresser|beauty"]'],
  [/spa|massage/i, '["leisure"="spa"]@@["shop"="massage"]'],
  [/restaurant|dhaba|eatery/i, '["amenity"="restaurant"]'],
  [/caf[eé]|coffee|tea/i, '["amenity"="cafe"]'],
  [/gym|fitness|yoga/i, '["leisure"~"fitness_centre|sports_centre"]'],
  [/dent/i, '["amenity"="dentist"]'],
  [/clinic|doctor|physio|hospital/i, '["amenity"~"clinic|doctors"]'],
  [/hotel|stay|guest ?house/i, '["tourism"~"hotel|guest_house"]'],
  [/bakery/i, '["shop"="bakery"]'],
  [/boutique|clothes|fashion|store|shop/i, '["shop"~"clothes|boutique|general"]'],
  [/real estate|property|broker/i, '["office"="estate_agent"]'],
  [/lawyer|advocate|law firm/i, '["office"="lawyer"]'],
  [/plumb/i, '["craft"="plumber"]'],
  [/electric/i, '["craft"="electrician"]'],
  [/school|coaching|tuition|academy/i, '["amenity"~"school|college|language_school"]'],
  [/mover|packers|logistic|transport/i, '["office"~"logistics|moving_company"]'],
];

export async function osmSearch(query: string, location: string, limit: number): Promise<Discovered[]> {
  const ua = { "User-Agent": "Kiln-LeadResearch/1.0 (small business discovery)" };
  const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`, { headers: ua, signal: AbortSignal.timeout(15_000) });
  const g: any = await geo.json().catch(() => []);
  const bb = g?.[0]?.boundingbox as string[] | undefined;
  if (!bb) throw new Error(`Could not find "${location}" on the map. Try a city name like "Pune, India".`);
  const [s, n, w, e] = bb; // south, north, west, east
  const tags = OSM_TAGS.find(([re]) => re.test(query))?.[1];
  const safe = query.replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 40);
  const filters = tags ? tags.split("@@") : [`["name"~"${safe}",i]`];
  const body = `[out:json][timeout:25];(${filters.map((f) => `nwr${f}["name"](${s},${w},${n},${e});`).join("")});out center ${limit * 4};`;
  let j: any = null;
  for (const ep of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
    try {
      const res = await fetch(ep, { method: "POST", headers: { ...ua, accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(body)}`, signal: AbortSignal.timeout(15_000) });
      if (res.ok) { j = await res.json().catch(() => null); if (j) break; }
    } catch { /* try next mirror */ }
  }
  if (!j) throw new Error("The free OpenStreetMap servers are busy right now. Try again in a minute, or set GOOGLE_PLACES_API_KEY for reliable discovery.");
  const seen = new Set<string>();
  const out: Discovered[] = [];
  for (const el of j.elements ?? []) {
    const t = el.tags ?? {};
    const name = String(t.name ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const website = t.website ?? t["contact:website"] ?? null;
    const address = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"], t["addr:city"]].filter(Boolean).join(", ") || null;
    const osmUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;
    const base = { website, rating: null, review_count: null };
    const signals = website ? [] : ["No website listed in OpenStreetMap (the data may simply be incomplete, so check before assuming)"];
    out.push({ name, website, phone: t.phone ?? t["contact:phone"] ?? null, address, city: t["addr:city"] ?? location.split(",")[0].trim(), rating: base.rating, review_count: null, maps_url: osmUrl, source: "osm", verified_listing: true, source_urls: [osmUrl], signals });
  }
  // Prefer businesses with no listed website, since they are the clearest opportunity.
  return out.sort((a, b) => Number(!!a.website) - Number(!!b.website)).slice(0, limit);
}

const SEARCH_SYSTEM =`You help a small web agency find real local businesses that could benefit from a better website or CRM.
Use Google Search. Return ONLY real, currently operating businesses you actually found in search results. Never invent businesses, websites, phone numbers or ratings; use null when unknown.
Reply with ONLY one JSON object: {"businesses":[{"name":string,"website":string|null,"phone":string|null,"address":string|null,"rating":number|null,"review_count":number|null,"why_relevant":string}]}`;

export async function geminiSearch(query: string, location: string, limit: number): Promise<{ items: Discovered[]; usage: { input: number; output: number } }> {
  const r = await geminiGenerate(SEARCH_SYSTEM, `Find up to ${limit} ${query} in ${location}. Prefer independent small businesses with few or weak web presence.`, 4096, { search: true, json: false });
  let parsed: any;
  try { parsed = JSON.parse(r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1)); } catch { throw new Error("Search returned an unreadable answer. Try again or narrow the query."); }
  const urls = [...new Set(r.sources.map((s) => s.uri))].slice(0, 5);
  // Drop results when the search returned no sources at all (cannot be checked).
  if (urls.length === 0) return { items: [], usage: r.usage };
  const items: Discovered[] = (Array.isArray(parsed.businesses) ? parsed.businesses : []).slice(0, limit).filter((b: any) => typeof b?.name === "string" && b.name.trim()).map((b: any) => {
    const base = { website: typeof b.website === "string" && b.website ? b.website : null, rating: typeof b.rating === "number" ? b.rating : null, review_count: typeof b.review_count === "number" ? b.review_count : null };
    const signals = growthSignals(base);
    if (typeof b.why_relevant === "string" && b.why_relevant.trim()) signals.push(`AI note (unverified): ${b.why_relevant.trim().slice(0, 160)}`);
    return {
      name: b.name.trim(), ...base, phone: typeof b.phone === "string" ? b.phone : null, address: typeof b.address === "string" ? b.address : null,
      city: cityOf(typeof b.address === "string" ? b.address : null, location), maps_url: null, source: "gemini_search" as const,
      verified_listing: false, source_urls: urls, signals,
    };
  });
  return { items, usage: r.usage };
}
