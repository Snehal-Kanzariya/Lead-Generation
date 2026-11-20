import { PROPOSAL_TITLES } from "../ai/prompts.ts";

export interface Section { title: string; body: string }

/** AC-106: fixed section order; Investment text comes only from the catalogue, never from the model. */
export function finalizeProposal(modelSections: Section[], priceRange: string | null | undefined): Section[] {
  const byTitle = new Map(modelSections.map((s) => [s.title.trim().toLowerCase(), s.body.trim()]));
  const price = priceRange?.trim();
  const investment =
    price && !/quote after discovery/i.test(price)
      ? `Indicative starting point: ${price}. Final scope and price to be confirmed after a short discovery call. This is an estimate, not a fixed quote.`
      : "To be confirmed after a short discovery call, once we agree the scope together.";
  return PROPOSAL_TITLES.map((title) => ({
    title,
    body: title === "Investment" ? investment : (byTitle.get(title.toLowerCase()) ?? "To be discussed on our call."),
  }));
}
