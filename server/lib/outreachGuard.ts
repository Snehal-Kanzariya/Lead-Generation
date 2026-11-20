const BLOCKLIST = [
  "act now", "last chance", "limited time", "hurry", "guaranteed", "guarantee", "100%",
  "you're losing money", "before it's too late", "don't miss out", "risk-free",
];
/** FR-041: phrases that violate constitution C3/C4. */
export function findManipulation(text: string): string[] {
  const t = text.toLowerCase().replace(/[’]/g, "'");
  return BLOCKLIST.filter((p) => t.includes(p));
}
