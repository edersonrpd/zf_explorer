/**
 * Núcleo compartilhado do proxy da API ZF / Pro-Parts.
 *
 * Por que existe um proxy: a API exige `client_id` e `client_secret` como
 * *headers* de cada requisição. Chamar direto do navegador (1) esbarra em CORS,
 * já que api.pro-parts.com não libera a origem da aplicação, e (2) exporia o
 * client_secret em qualquer aba de DevTools. Então o browser fala com
 * `/zf-proxy` (mesma origem) e o servidor fala com a ZF.
 *
 * O mesmo módulo é usado pela função serverless da Vercel (api/zf-proxy.ts) e
 * pelo servidor Express de desenvolvimento (server.ts), para que o
 * comportamento local e o de produção não divirjam.
 */

export const DEFAULT_BASE_URL = "https://api.pro-parts.com/retailer/v1";

export type ZfOperation = "getOffer" | "getOffers";

export interface ZfCredentials {
  clientId: string;
  clientSecret: string;
}

export interface ZfOfferFilters {
  productOfferReference?: string;
  merchantSku?: string;
  brand?: string;
  partNumber?: string;
  /** `true` / `false` como string; vazio ou ausente = sem filtro. */
  isActive?: string;
  offset?: number;
  limit?: number;
}

export interface ZfProxyRequest {
  operation: ZfOperation;
  credentials: ZfCredentials;
  params?: {
    productOfferReference?: string;
    filters?: ZfOfferFilters;
    correlationId?: string;
  };
}

export interface ZfProxyResult {
  status: number;
  body: Record<string, unknown> | unknown[];
}

/**
 * O payload é enviado hex-encodado pelo cliente. Isso não é criptografia — o
 * objetivo é apenas evitar que WAFs no caminho (Vercel/Cloudflare) inspecionem
 * o corpo, encontrem algo com cara de credencial e bloqueiem a requisição com
 * uma página HTML. Mesma técnica usada no amz-api-explorer.
 */
export function decodePayload(payload: string): ZfProxyRequest {
  let decoded = "";
  for (let i = 0; i < payload.length; i += 2) {
    decoded += String.fromCharCode(parseInt(payload.substring(i, i + 2), 16));
  }
  return JSON.parse(decodeURIComponent(decoded));
}

/** Monta a querystring de /offers no formato JSON:API esperado pela ZF. */
function buildOffersQuery(filters: ZfOfferFilters = {}): string {
  const qs = new URLSearchParams();
  const map: Array<[keyof ZfOfferFilters, string]> = [
    ["productOfferReference", "filter[proPartsOffers.productOfferReference]"],
    ["merchantSku", "filter[proPartsOffers.merchantSku]"],
    ["brand", "filter[proPartsOffers.brand]"],
    ["partNumber", "filter[proPartsOffers.partNumber]"],
    ["isActive", "filter[proPartsOffers.isActive]"],
  ];

  for (const [key, param] of map) {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      qs.set(param, String(value).trim());
    }
  }

  if (typeof filters.offset === "number" && Number.isFinite(filters.offset)) {
    qs.set("page[offset]", String(Math.max(0, Math.trunc(filters.offset))));
  }
  if (typeof filters.limit === "number" && Number.isFinite(filters.limit)) {
    qs.set("page[limit]", String(Math.max(1, Math.trunc(filters.limit))));
  }

  // URLSearchParams codifica espaço como "+". Part numbers da ZF têm espaços
  // ("0 280 156 096") e nem todo gateway decodifica "+" como espaço, então
  // usamos %20, que é aceito em qualquer implementação.
  const query = qs.toString().replace(/\+/g, "%20");
  return query ? `?${query}` : "";
}

/**
 * Executa a operação contra a API ZF e devolve status + corpo já normalizados.
 * Nunca lança para erro de negócio: erros viram `{ status, body }` para que a
 * interface consiga mostrar o corpo original retornado pela ZF.
 */
export async function callZfApi(request: ZfProxyRequest): Promise<ZfProxyResult> {
  const { operation, params } = request;

  // Credenciais de ambiente (Vercel/.env.local) têm prioridade sobre o que vem
  // do navegador: assim dá para publicar a aplicação sem que ninguém precise
  // digitar — nem ver — o client_secret.
  const clientId = process.env.ZF_CLIENT_ID || request.credentials?.clientId || "";
  const clientSecret = process.env.ZF_CLIENT_SECRET || request.credentials?.clientSecret || "";
  const baseUrl = (process.env.ZF_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");

  if (!clientId || !clientSecret) {
    return {
      status: 401,
      body: { error: "Informe o CLIENT_ID e o CLIENT_SECRET da ZF antes de consultar." },
    };
  }

  let url: string;
  if (operation === "getOffer") {
    const reference = (params?.productOfferReference || "").trim();
    if (!reference) {
      return { status: 400, body: { error: "productOfferReference é obrigatório." } };
    }
    url = `${baseUrl}/offers/${encodeURIComponent(reference)}`;
  } else if (operation === "getOffers") {
    url = `${baseUrl}/offers${buildOffersQuery(params?.filters)}`;
  } else {
    return { status: 400, body: { error: `Operação não suportada: ${operation}` } };
  }

  const headers = new Headers();
  headers.set("client_id", clientId);
  headers.set("client_secret", clientSecret);
  headers.set("accept", "application/json");
  headers.set("user-agent", "ZF-API-Explorer/1.0 (Language=Node.js)");
  // x-correlation-id é opcional na API, mas a ZF devolve o mesmo valor na
  // resposta — é o que permite rastrear uma consulta ponta a ponta com o
  // suporte deles.
  const correlationId = params?.correlationId || cryptoRandomId();
  headers.set("x-correlation-id", correlationId);

  const response = await fetch(url, { method: "GET", headers, redirect: "follow" });
  const text = await response.text();

  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // A ZF devolve HTML em alguns erros de gateway (502/504) e quando a
    // requisição morre em um WAF antes de chegar na aplicação.
    return {
      status: response.status,
      body: {
        error: `A API retornou uma resposta não-JSON (HTTP ${response.status}).`,
        raw: text.slice(0, 800),
        correlationId,
      },
    };
  }

  if (Array.isArray(parsed)) {
    return { status: response.status, body: { data: parsed, correlationId } };
  }

  return {
    status: response.status,
    body: { ...(parsed as Record<string, unknown> | null ?? {}), correlationId },
  };
}

/** UUID v4 sem depender do módulo `crypto` (disponível em Node e no Edge). */
export function cryptoRandomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
