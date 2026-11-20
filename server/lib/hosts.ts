export function hostOf(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}
export function normalizeUrl(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}
