import { getOffers, ZfApiError } from "../services/zfService";
import { OfferFilters, ZfCredentials, ZfOffer } from "../types";

export type CrawlStopReason =
  | "completo"           // a API devolveu uma página vazia: acabou o catálogo
  | "cancelado"          // o usuário mandou parar
  | "limite-paginas"     // bateu o teto de páginas
  | "limite-requisicoes" // gastou requisições demais se recuperando de erros
  | "sem-novidade"       // a API devolveu só referências já vistas (offset ignorado?)
  | "erro";              // falha não recuperável (credencial, permissão)

/** Um trecho do catálogo que a ZF não consegue entregar. */
export interface SkippedRecord {
  offset: number;
  error: string;
  correlationId?: string;
}

export interface CrawlProgress {
  pagesRead: number;
  offersLoaded: number;
  offset: number;
  requestCount: number;
  /** Tamanho de página em uso — cai quando o crawler está isolando um registro ruim. */
  currentPageSize: number;
  skipped: SkippedRecord[];
  retrying?: { attempt: number; waitMs: number; reason: string };
  recovering?: { kind: "reduzindo" | "pulando"; offset: number; pageSize: number };
}

export interface CrawlOptions {
  credentials: ZfCredentials;
  /** Filtros de conteúdo. offset/limit daqui são ignorados. */
  filters: Partial<OfferFilters>;
  pageSize: number;
  delayMs: number;
  maxPages: number;
  startOffset?: number;
  onPage: (newOffers: ZfOffer[], progress: CrawlProgress) => void;
  isCancelled: () => boolean;
  waitWhilePaused: () => Promise<void>;
}

export interface CrawlResult {
  offers: ZfOffer[];
  pagesRead: number;
  requestCount: number;
  skipped: SkippedRecord[];
  stopReason: CrawlStopReason;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 5xx no tamanho de página cheio: uma retentativa rápida. A rede de segurança
 * real contra um erro passageiro não é essa espera — é o caminho de degradação
 * inteiro, que só marca um registro como corrompido depois que ele falha
 * sozinho, duas vezes. Esperar mais aqui só atrasaria a busca pelo registro
 * ruim, que é o caso comum de um 500 nesta API.
 */
const FULL_SIZE_RETRIES = 1;
/** Antes de declarar um registro corrompido, uma última tentativa nele sozinho. */
const SINGLE_RECORD_RETRIES = 1;
/** 429 sempre respeita o ritmo pedido, independente de estarmos degradados. */
const RATE_LIMIT_RETRIES = 4;
const MAX_BACKOFF_MS = 30_000;
/**
 * Registros corrompidos são pontuais. Uma sequência longa de falhas em
 * registros isolados não é corrupção — é a API fora do ar. Continuar "pulando"
 * nesse caso produziria uma exportação incompleta apresentada como completa,
 * que é o pior resultado possível: silenciosamente errado.
 */
const MAX_CONSECUTIVE_SKIPS = 10;

/**
 * Percorre GET /offers página a página até esgotar o catálogo.
 *
 * ## Paginação
 *
 * A ZF pagina por offset/limit e devolve um array puro, sem total e sem cursor.
 * Isso obriga a três cuidados:
 *
 * 1. **O offset avança pelo número de itens realmente recebidos**, não pelo
 *    `pageSize` pedido. Se a API tiver teto próprio de página (pedimos 200 e ela
 *    devolve 50), avançar pelo pedido pularia 150 ofertas por volta.
 * 2. **A parada é na página vazia**, não em "página menor que o limite" — pelo
 *    mesmo motivo.
 * 3. **Dedupe por productOfferReference**, para o caso de o offset ser ignorado.
 *
 * ## Registros corrompidos
 *
 * O catálogo da ZF contém registros que o servidor dela não consegue serializar
 * (ex.: `Property "brand" ... is null`, HTTP 500). Esse 500 é permanente: pedir
 * de novo a mesma página devolve o mesmo erro para sempre, e abortar ali
 * perderia todo o catálogo depois do registro ruim.
 *
 * A saída é degradar e seguir, no espírito de um slow-start:
 *
 * - Página falhou de forma persistente → **corta o tamanho da página pela
 *   metade** e tenta de novo no mesmo offset. Repete até chegar a 1.
 * - Falhou com tamanho 1 → o registro naquele offset é o corrompido. Ele é
 *   **registrado e pulado** (`offset += 1`), e a varredura continua.
 * - A cada sucesso o tamanho **dobra de volta** até o valor original, então o
 *   crawler anda devagar só na vizinhança do registro ruim e volta à velocidade
 *   normal logo depois.
 *
 * Assim uma oferta corrompida custa algumas requisições extras em vez de
 * custar todo o resto do catálogo.
 */
export async function crawlAllOffers(options: CrawlOptions): Promise<CrawlResult> {
  const { credentials, filters, pageSize, delayMs, maxPages, onPage, isCancelled, waitWhilePaused } = options;

  const collected: ZfOffer[] = [];
  const skipped: SkippedRecord[] = [];
  const seen = new Set<string>();

  let offset = options.startOffset ?? 0;
  let pagesRead = 0;
  let requestCount = 0;
  let currentPageSize = pageSize;
  let consecutiveSkips = 0;
  /**
   * Verdadeiro enquanto o crawler está caçando um registro ruim. Sem isso, ao
   * voltar ao tamanho cheio ele bate de novo no mesmo registro e paga o backoff
   * de "pode ser passageiro" uma segunda vez — o que dobrava o custo de cada
   * registro corrompido.
   */
  let hunting = false;

  // Teto de requisições: sem ele, um catálogo cheio de registros ruins poderia
  // varrer de 1 em 1 indefinidamente.
  const maxRequests = Math.max(maxPages * 10, 100);

  const progress = (extra?: Partial<CrawlProgress>): CrawlProgress => ({
    pagesRead,
    offersLoaded: collected.length,
    offset,
    requestCount,
    currentPageSize,
    skipped,
    ...extra,
  });

  const finish = (stopReason: CrawlStopReason, error?: string): CrawlResult => ({
    offers: collected,
    pagesRead,
    requestCount,
    skipped,
    stopReason,
    error,
  });

  while (pagesRead < maxPages) {
    if (isCancelled()) return finish("cancelado");
    await waitWhilePaused();
    if (isCancelled()) return finish("cancelado");
    if (requestCount >= maxRequests) return finish("limite-requisicoes");

    let page: ZfOffer[];
    try {
      page = await fetchPage(
        credentials,
        { ...filters, offset, limit: currentPageSize },
        {
          // No tamanho cheio vale absorver um blip. Já degradados, o objetivo é
          // localizar o registro ruim, não esperar a API melhorar — exceto no
          // tamanho 1, onde uma última tentativa evita marcar como corrompido
          // um registro que só pegou um soluço da API.
          transientRetries:
            currentPageSize === 1
              ? SINGLE_RECORD_RETRIES
              : currentPageSize === pageSize && !hunting
                ? FULL_SIZE_RETRIES
                : 0,
          isCancelled,
          onRequest: () => { requestCount += 1; },
          onRetry: (attempt, waitMs, reason) =>
            onPage([], progress({ retrying: { attempt, waitMs, reason } })),
        },
      );
    } catch (error) {
      const apiError = error instanceof ZfApiError ? error : null;

      // Credencial/permissão/parâmetro inválido: degradar não resolve.
      if (apiError && !apiError.isRetryable) {
        return finish("erro", apiError.message);
      }

      hunting = true;

      if (currentPageSize > 1) {
        currentPageSize = Math.max(1, Math.floor(currentPageSize / 2));
        onPage([], progress({ recovering: { kind: "reduzindo", offset, pageSize: currentPageSize } }));
        continue;
      }

      // Falhou pedindo um único registro, duas vezes: é ele que está
      // corrompido na ZF.
      skipped.push({
        offset,
        error: (error as Error).message,
        correlationId: apiError?.correlationId,
      });
      consecutiveSkips += 1;

      if (consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
        return finish(
          "erro",
          `${consecutiveSkips} registros seguidos falharam. Isso não é corrupção pontual — a API da ZF parece indisponível. ` +
            `A varredura parou para não gerar uma exportação incompleta parecendo completa. ` +
            `Último erro: ${(error as Error).message}`,
        );
      }

      onPage([], progress({ recovering: { kind: "pulando", offset, pageSize: 1 } }));
      offset += 1;
      continue;
    }

    pagesRead += 1;

    if (page.length === 0) return finish("completo");

    const fresh = page.filter((offer) => {
      const key = offer?.productOfferReference;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    collected.push(...fresh);
    offset += page.length;
    consecutiveSkips = 0;

    // Deu certo: volta a acelerar até o tamanho de página original. A caçada só
    // termina quando uma página no tamanho cheio passa — antes disso ainda
    // podemos estar na vizinhança do registro ruim.
    if (currentPageSize === pageSize) {
      hunting = false;
    } else {
      currentPageSize = Math.min(pageSize, currentPageSize * 2);
    }

    onPage(fresh, progress());

    // Uma página inteira sem nada novo só é sinal de laço se estivermos no
    // ritmo normal; durante a recuperação a repetição é esperada.
    if (fresh.length === 0 && currentPageSize === pageSize) {
      return finish("sem-novidade");
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return finish("limite-paginas");
}

interface FetchPageOptions {
  transientRetries: number;
  isCancelled: () => boolean;
  onRequest: () => void;
  onRetry: (attempt: number, waitMs: number, reason: string) => void;
}

/**
 * Uma página. 429 sempre respeita o Retry-After da ZF; 5xx só é retentado
 * enquanto `transientRetries` permitir. Erros definitivos sobem na hora.
 */
async function fetchPage(
  credentials: ZfCredentials,
  filters: Partial<OfferFilters> & { offset: number; limit: number },
  { transientRetries, isCancelled, onRequest, onRetry }: FetchPageOptions,
): Promise<ZfOffer[]> {
  let transientAttempts = 0;
  let rateLimitAttempts = 0;

  for (;;) {
    try {
      onRequest();
      const { offers } = await getOffers(credentials, filters);
      return offers;
    } catch (error) {
      const apiError = error instanceof ZfApiError ? error : null;
      if (apiError && !apiError.isRetryable) throw error;
      if (isCancelled()) throw error;

      const isRateLimit = apiError?.status === 429;
      if (isRateLimit) {
        rateLimitAttempts += 1;
        if (rateLimitAttempts > RATE_LIMIT_RETRIES) throw error;
      } else {
        transientAttempts += 1;
        if (transientAttempts > transientRetries) throw error;
      }

      let waitMs: number;
      if (apiError?.retryAfterSeconds) {
        waitMs = Math.min(apiError.retryAfterSeconds * 1000, MAX_BACKOFF_MS);
      } else if (isRateLimit) {
        waitMs = Math.min(2 ** rateLimitAttempts * 1000, MAX_BACKOFF_MS);
      } else {
        // 5xx: espera curta. O caso comum aqui é corrupção, que não melhora.
        waitMs = transientAttempts === 1 ? 1500 : 3000;
      }

      const attempt = isRateLimit ? rateLimitAttempts : transientAttempts;

      onRetry(attempt, waitMs, apiError ? `HTTP ${apiError.status}` : "falha de rede");
      await sleep(waitMs);
    }
  }
}
