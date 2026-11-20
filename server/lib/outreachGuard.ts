const BLOCKLIST = [
  "act now", "last chance", "limited time", "hurry", "guaranteed", "guarantee", "100%",
  "you're losing money", "before it's too late", "don't miss out", "risk-free",
];
/** FR-041: phrases that violate constitution C3/C4. */
export function findManipulation(text: string): string[] {
  const t = text.toLowerCase().replace(/[’]/g, "'");
  return BLOCKLIST.filter((p) => t.includes(p));
}

/** Customer-facing text must not contain internal evidence markers such as "[4, 5]" or "(Evidence 1, 2)". */
export function stripCitations(text: string): string {
  return text
    .replace(/\s*\((?:see\s+)?evidences?\s*#?[\d,\s&and]*\)/gi, "")
    .replace(/\s*\[(?:evidence\s*)?\d+(?:\s*[,&-]\s*\d+)*\]/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
