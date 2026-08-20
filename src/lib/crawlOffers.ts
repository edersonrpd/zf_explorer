import { getOffers, ZfApiError } from "../services/zfService";
import { OfferFilters, ZfCredentials, ZfOffer } from "../types";

export type CrawlStopReason =
  | "completo"        // a API devolveu uma página vazia: acabou o catálogo
  | "cancelado"       // o usuário mandou parar
  | "limite-paginas"  // bateu o teto de segurança
  | "sem-novidade"    // a API devolveu só referências já vistas (offset ignorado?)
  | "erro";           // falha não recuperável

export interface CrawlProgress {
  pagesRead: number;
  offersLoaded: number;
  lastPageSize: number;
  offset: number;
  retrying?: { attempt: number; waitMs: number; reason: string };
}

export interface CrawlOptions {
  credentials: ZfCredentials;
  /** Filtros de conteúdo. offset/limit daqui são ignorados — quem manda são pageSize/startOffset. */
  filters: Partial<OfferFilters>;
  pageSize: number;
  /** Pausa entre páginas, para não martelar a API. */
  delayMs: number;
  maxPages: number;
  startOffset?: number;
  /** Chamado a cada página com as ofertas novas daquela página. */
  onPage: (newOffers: ZfOffer[], progress: CrawlProgress) => void;
  /** Consultado entre páginas: true interrompe a varredura. */
  isCancelled: () => boolean;
  /** Resolve quando não estiver pausado. Permite pausar sem perder o progresso. */
  waitWhilePaused: () => Promise<void>;
}

export interface CrawlResult {
  offers: ZfOffer[];
  pagesRead: number;
  stopReason: CrawlStopReason;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_RETRIES = 4;
const MAX_BACKOFF_MS = 30_000;

/**
 * Percorre GET /offers página a página até esgotar o catálogo.
 *
 * A paginação da ZF é por offset/limit e a resposta é um array puro, sem total
 * de registros nem cursor. Isso obriga a três cuidados que não são óbvios:
 *
 * 1. **O offset avança pelo número de itens realmente recebidos**, não pelo
 *    `pageSize` pedido. Se a API tiver um teto próprio de página (pedimos 200 e
 *    ela devolve 50), avançar pelo valor pedido pularia 150 ofertas em cada
 *    volta — o download sairia com buracos e ninguém perceberia.
 *
 * 2. **A parada é na página vazia**, não em "página menor que o limite". Pelo
 *    mesmo motivo: uma API que limita a página devolveria sempre menos que o
 *    pedido e a varredura terminaria na primeira página.
 *
 * 3. **Deduplicação por productOfferReference.** Se a API ignorar o offset (ou
 *    o catálogo for reordenado no meio da varredura), as mesmas ofertas voltam;
 *    sem dedupe o arquivo sairia com repetições e o loop não terminaria nunca.
 *    Uma página inteira sem nenhuma referência nova encerra com "sem-novidade".
 */
export async function crawlAllOffers(options: CrawlOptions): Promise<CrawlResult> {
  const { credentials, filters, pageSize, delayMs, maxPages, onPage, isCancelled, waitWhilePaused } = options;

  const collected: ZfOffer[] = [];
  const seen = new Set<string>();
  let offset = options.startOffset ?? 0;
  let pagesRead = 0;

  while (pagesRead < maxPages) {
    if (isCancelled()) {
      return { offers: collected, pagesRead, stopReason: "cancelado" };
    }
    await waitWhilePaused();
    if (isCancelled()) {
      return { offers: collected, pagesRead, stopReason: "cancelado" };
    }

    let page: ZfOffer[];
    try {
      page = await fetchPageWithRetry(
        credentials,
        { ...filters, offset, limit: pageSize },
        (attempt, waitMs, reason) =>
          onPage([], { pagesRead, offersLoaded: collected.length, lastPageSize: 0, offset, retrying: { attempt, waitMs, reason } }),
        isCancelled,
      );
    } catch (error) {
      return {
        offers: collected,
        pagesRead,
        stopReason: "erro",
        error: (error as Error).message,
      };
    }

    pagesRead += 1;

    if (page.length === 0) {
      return { offers: collected, pagesRead, stopReason: "completo" };
    }

    const fresh = page.filter((offer) => {
      const key = offer?.productOfferReference;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    collected.push(...fresh);
    offset += page.length;

    onPage(fresh, { pagesRead, offersLoaded: collected.length, lastPageSize: page.length, offset });

    if (fresh.length === 0) {
      return { offers: collected, pagesRead, stopReason: "sem-novidade" };
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return { offers: collected, pagesRead, stopReason: "limite-paginas" };
}

/** Uma página, com backoff exponencial em 429/5xx. Erros definitivos sobem na hora. */
async function fetchPageWithRetry(
  credentials: ZfCredentials,
  filters: Partial<OfferFilters> & { offset: number; limit: number },
  onRetry: (attempt: number, waitMs: number, reason: string) => void,
  isCancelled: () => boolean,
): Promise<ZfOffer[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { offers } = await getOffers(credentials, filters);
      return offers;
    } catch (error) {
      lastError = error;
      const apiError = error instanceof ZfApiError ? error : null;

      // 401/403/400 não melhoram com espera — insistir só gera carga inútil.
      if (apiError && !apiError.isRetryable) throw error;
      if (attempt === MAX_RETRIES || isCancelled()) throw error;

      // Se a ZF disse quanto esperar, obedecemos; senão, backoff exponencial.
      const waitMs = apiError?.retryAfterSeconds
        ? Math.min(apiError.retryAfterSeconds * 1000, MAX_BACKOFF_MS)
        : Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS);

      onRetry(attempt, waitMs, apiError ? `HTTP ${apiError.status}` : "falha de rede");
      await sleep(waitMs);
    }
  }

  throw lastError;
}
