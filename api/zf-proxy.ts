/**
 * Proxy da API ZF / Pro-Parts — função serverless da Vercel (POST /zf-proxy).
 *
 * Por que existe um proxy: a API exige `client_id` e `client_secret` como
 * *headers* de cada requisição. Chamar direto do navegador (1) esbarra em CORS,
 * já que api.pro-parts.com não libera a origem da aplicação, e (2) exporia o
 * client_secret em qualquer aba de DevTools. Então o browser fala com
 * `/zf-proxy` (mesma origem) e o servidor fala com a ZF.
 *
 * A lógica (decodePayload / callZfApi) é exportada e reaproveitada pelo
 * servidor Express de desenvolvimento (server.ts), para que o comportamento
 * local e o de produção não divirjam.
 *
 * IMPORTANTE: este arquivo é deliberadamente autocontido. O package.json usa
 * "type": "module", então a Vercel executa a função como ESM — e em ESM todo
 * import relativo precisa de extensão explícita. Um `import ... from "./_core"`
 * daqui derruba a função inteira no carregamento, com
 * FUNCTION_INVOCATION_FAILED antes mesmo do handler rodar. Sem imports
 * relativos, esse problema não existe.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const DEFAULT_BASE_URL = "https://api.pro-parts.com/retailer/v1";

export type ZfOperation = "getOffer" | "getOffers" | "getOrder" | "getOrders";

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

export interface ZfOrderFilters {
  /** Data de criação em UTC, "YYYY-MM-DD HH:MM:SS". */
  createdFrom?: string;
  createdTo?: string;
  /** Estados do pedido. Vira uma chave repetida na querystring. */
  state?: string[];
  offset?: number;
  limit?: number;
}

export interface ZfProxyRequest {
  operation: ZfOperation;
  credentials: ZfCredentials;
  params?: {
    productOfferReference?: string;
    merchantOrderReference?: string;
    filters?: ZfOfferFilters;
    orderFilters?: ZfOrderFilters;
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

  return finishQuery(qs);
}

/**
 * Querystring de GET /orders.
 *
 * `filter[proPartsOrders.state]` é o único filtro multivalorado da API: a
 * documentação diz que vários estados se especificam "simply repeating this
 * filter key". Por isso `append` em vez de `set` — um `set` sobrescreveria e
 * só o último estado seria enviado, filtrando errado sem dar nenhum erro.
 */
function buildOrdersQuery(filters: ZfOrderFilters = {}): string {
  const qs = new URLSearchParams();

  if (filters.createdFrom?.trim()) {
    qs.set("filter[proPartsOrders.createdFrom]", filters.createdFrom.trim());
  }
  if (filters.createdTo?.trim()) {
    qs.set("filter[proPartsOrders.createdTo]", filters.createdTo.trim());
  }
  for (const state of filters.state ?? []) {
    if (String(state).trim()) {
      qs.append("filter[proPartsOrders.state]", String(state).trim());
    }
  }

  if (typeof filters.offset === "number" && Number.isFinite(filters.offset)) {
    qs.set("page[offset]", String(Math.max(0, Math.trunc(filters.offset))));
  }
  if (typeof filters.limit === "number" && Number.isFinite(filters.limit)) {
    qs.set("page[limit]", String(Math.max(1, Math.trunc(filters.limit))));
  }

  return finishQuery(qs);
}

/**
 * URLSearchParams codifica espaço como "+". Part numbers têm espaços
 * ("0 280 156 096") e datas também ("2024-04-01 23:59:59"); nem todo gateway
 * decodifica "+" como espaço, então usamos %20, aceito em qualquer
 * implementação.
 */
function finishQuery(qs: URLSearchParams): string {
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
  } else if (operation === "getOrder") {
    const reference = (params?.merchantOrderReference || "").trim();
    if (!reference) {
      return { status: 400, body: { error: "merchantOrderReference é obrigatório." } };
    }
    url = `${baseUrl}/orders/${encodeURIComponent(reference)}`;
  } else if (operation === "getOrders") {
    url = `${baseUrl}/orders${buildOrdersQuery(params?.orderFilters)}`;
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

  // Em 429/503 a ZF pode indicar quanto esperar. Repassamos para o cliente
  // conseguir respeitar o ritmo dela em vez de chutar um backoff.
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  const meta: Record<string, unknown> = { correlationId };
  if (retryAfter !== undefined && Number.isFinite(retryAfter)) {
    meta.retryAfterSeconds = retryAfter;
  }

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
        ...meta,
      },
    };
  }

  if (Array.isArray(parsed)) {
    return { status: response.status, body: { data: parsed, ...meta } };
  }

  return {
    status: response.status,
    body: { ...(parsed as Record<string, unknown> | null ?? {}), ...meta },
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

/**
 * Fluxo completo do proxy a partir do corpo cru da requisição. Compartilhado
 * pelo handler da Vercel e pelo server.ts, para que os dois tratem os mesmos
 * erros do mesmo jeito.
 */
export async function handleProxyRequest(rawBody: unknown, logPrefix: string): Promise<ZfProxyResult> {
  let request: ZfProxyRequest;

  try {
    // Normalmente o body já chega como objeto, mas se o content-type vier
    // diferente de application/json a Vercel entrega a string crua.
    const body = typeof rawBody === "string" ? JSON.parse(rawBody || "{}") : (rawBody ?? {});
    const payload = (body as { payload?: unknown }).payload;

    if (!payload || typeof payload !== "string") {
      return { status: 400, body: { error: "Missing payload" } };
    }

    request = decodePayload(payload);
  } catch (error: any) {
    // Payload malformado é erro do cliente, não falha de rede — daí 400 e não 502.
    console.error(`${logPrefix} payload inválido:`, error?.message);
    return { status: 400, body: { error: `Payload inválido: ${error?.message}` } };
  }

  try {
    const result = await callZfApi(request);
    console.log(`${logPrefix} ${request.operation} -> HTTP ${result.status}`);
    return result;
  } catch (error: any) {
    console.error(`${logPrefix} falha de rede:`, error?.message);
    return {
      status: 502,
      body: { error: `Proxy não conseguiu falar com a API da ZF: ${error?.message}` },
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { status, body } = await handleProxyRequest(req.body, "[ZF VERCEL]");
  return res.status(status).json(body);
}
