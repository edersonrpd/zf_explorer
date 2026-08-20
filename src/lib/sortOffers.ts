import { ZfOffer } from "../types";

export type SortKey =
  | "productOfferReference"
  | "merchantSku"
  | "brand"
  | "partNumber"
  | "quantity"
  | "netPrice";

export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

export const DEFAULT_SORT: SortState = { key: "productOfferReference", dir: "asc" };

/** quantity e netPrice chegam como string, mas precisam ordenar como número. */
const NUMERIC_KEYS: SortKey[] = ["quantity", "netPrice"];

export function sortOffers(offers: ZfOffer[], { key, dir }: SortState): ZfOffer[] {
  const copy = [...offers];
  copy.sort((a, b) => {
    const av = a[key];
    const bv = b[key];

    if (NUMERIC_KEYS.includes(key)) {
      const an = Number(av ?? Number.NEGATIVE_INFINITY);
      const bn = Number(bv ?? Number.NEGATIVE_INFINITY);
      if (Number.isFinite(an) && Number.isFinite(bn)) return dir === "asc" ? an - bn : bn - an;
    }

    const as = String(av ?? "");
    const bs = String(bv ?? "");
    return dir === "asc" ? as.localeCompare(bs, "pt-BR") : bs.localeCompare(as, "pt-BR");
  });
  return copy;
}

export function toggleSort(current: SortState, key: SortKey): SortState {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: "asc" };
}

/** Busca local sobre o que já foi baixado — não gera chamada à API. */
export function filterOffersLocally(offers: ZfOffer[], term: string): ZfOffer[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return offers;
  return offers.filter((offer) =>
    [offer.productOfferReference, offer.merchantSku, offer.brand, offer.partNumber]
      .some((field) => String(field ?? "").toLowerCase().includes(needle)),
  );
}
