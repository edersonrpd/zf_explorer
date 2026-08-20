export const ZF_API_BASE_URL = "https://api.pro-parts.com/retailer/v1";

/** Chaves do localStorage. O client_secret nunca sai do navegador do usuário. */
export const STORAGE_KEYS = {
  credentials: "zf-explorer:credentials",
  lastReferences: "zf-explorer:last-references",
  lastFilters: "zf-explorer:last-filters",
} as const;

export const PAGE_SIZES = [10, 25, 50, 100, 200];

export const DEFAULT_FILTERS = {
  productOfferReference: "",
  merchantSku: "",
  brand: "",
  partNumber: "",
  isActive: "",
  offset: 0,
  limit: 25,
};

/** Consultas em lote são serializadas com esta pausa para não estourar rate limit. */
export const BATCH_DELAY_MS = 150;
