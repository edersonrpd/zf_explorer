export const ZF_API_BASE_URL = "https://api.pro-parts.com/retailer/v1";

/** Chaves do localStorage. O client_secret nunca sai do navegador do usuário. */
export const STORAGE_KEYS = {
  credentials: "zf-explorer:credentials",
  lastReferences: "zf-explorer:last-references",
  lastFilters: "zf-explorer:last-filters",
  orderFilters: "zf-explorer:order-filters",
  syncSettings: "zf-explorer:sync-settings",
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

/** Configuração da varredura do catálogo completo. */
export const SYNC_DEFAULTS = {
  /** Itens por chamada. Se a ZF tiver teto próprio, o crawler se adapta sozinho. */
  pageSize: 200,
  /** Pausa entre páginas — é o que mantém a API fora de rate limit. */
  delayMs: 400,
  /** Teto de segurança: 500 páginas × 200 = 100 mil ofertas. */
  maxPages: 500,
};

export const SYNC_PAGE_SIZES = [50, 100, 200, 500];
export const SYNC_DELAYS = [
  { value: 0, label: "Sem pausa (mais rápido)" },
  { value: 200, label: "200 ms" },
  { value: 400, label: "400 ms (recomendado)" },
  { value: 800, label: "800 ms" },
  { value: 1500, label: "1,5 s (mais leve para a API)" },
];

/** Quantas linhas a tabela do catálogo mostra por vez. */
export const CATALOG_VIEW_PAGE_SIZE = 50;

export const DEFAULT_ORDER_FILTERS = {
  createdFrom: "",
  createdTo: "",
  state: [] as string[],
  offset: 0,
  limit: 25,
};

/**
 * Estados citados na documentação. A API não publica a lista fechada, então
 * estes são apenas atalhos — a tela também oferece os estados que aparecerem
 * nos pedidos já carregados e um campo livre para qualquer outro.
 */
export const KNOWN_ORDER_STATES = ["new", "canceled", "waiting for documents"];

export const PAYMENT_METHODS = ["Credit Card", "Debit Card", "Pix", "Boleto"];
