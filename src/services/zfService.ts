import { OfferFilters, ZfCredentials, ZfOffer } from "../types";

const PROXY_URL = "/zf-proxy";

/** Erro de API com o status HTTP preservado, para o crawler decidir se tenta de novo. */
export class ZfApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly correlationId?: string;

  constructor(message: string, status: number, retryAfterSeconds?: number, correlationId?: string) {
    super(message);
    this.name = "ZfApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.correlationId = correlationId;
  }

  /** 429 e 5xx são transitórios: vale esperar e tentar de novo. */
  get isRetryable(): boolean {
    return this.status === 429 || this.status === 408 || this.status >= 500;
  }
}

/**
 * Hex-encoda o payload antes de enviar ao proxy. Não é segurança — é para o
 * corpo não parecer "credencial em texto puro" para WAFs no caminho, que
 * respondem HTML e quebram o parse do cliente.
 */
function encodePayload(request: unknown): string {
  const jsonStr = encodeURIComponent(JSON.stringify(request));
  let payload = "";
  for (let i = 0; i < jsonStr.length; i++) {
    payload += jsonStr.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return payload;
}

/** Mensagens específicas para os status documentados pela ZF. */
function describeError(status: number, detail: string, context: string): string {
  switch (status) {
    case 400:
      return `400 Bad Request — parâmetros inválidos. ${detail}`;
    case 429:
      return `429 Too Many Requests — a ZF está limitando o ritmo das chamadas. ${detail}`;
    case 401:
      return `401 Unauthorized — CLIENT_ID ou CLIENT_SECRET inválidos. ${detail}`;
    case 403:
      return `403 Forbidden — as credenciais são válidas, mas a aplicação não tem permissão para esta operação. ${detail}`;
    case 404:
      return `404 Not Found — ${context} não encontrado(a). ${detail}`;
    case 405:
      return `405 Method Not Allowed — método não aceito neste endpoint. ${detail}`;
    case 406:
      return `406 Not Acceptable — a API não consegue responder no formato pedido. ${detail}`;
    case 412:
      return `412 Precondition Failed — alguma pré-condição da requisição falhou. ${detail}`;
    case 415:
      return `415 Unsupported Media Type — content-type não suportado. ${detail}`;
    case 500:
      return `500 Internal Server Error — falha no lado da ZF. Tente novamente em instantes. ${detail}`;
    case 502:
      return `502 Bad Gateway — o gateway da ZF está instável. ${detail}`;
    case 504:
      return `504 Gateway Timeout — a ZF demorou demais para responder. ${detail}`;
    default:
      return `Erro ${status}. ${detail}`;
  }
}

async function callProxy(request: unknown, context: string): Promise<any> {
  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: encodePayload(request) }),
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(
      `O servidor retornou uma resposta inesperada (não-JSON). Normalmente isso significa que a requisição foi bloqueada por um firewall ou que a função do proxy falhou. Resposta: ${text.slice(0, 200)}`,
    );
  }

  const data = await response.json();

  if (!response.ok) {
    const detail =
      data?.error ||
      data?.message ||
      data?.raw ||
      (data?.errors ? JSON.stringify(data.errors) : JSON.stringify(data));
    throw new ZfApiError(
      describeError(response.status, String(detail ?? ""), context),
      response.status,
      typeof data?.retryAfterSeconds === "number" ? data.retryAfterSeconds : undefined,
      data?.correlationId,
    );
  }

  return data;
}

/** GET /offers/:productOfferReference */
export async function getOffer(
  credentials: ZfCredentials,
  productOfferReference: string,
): Promise<{ offer: ZfOffer; correlationId?: string }> {
  const data = await callProxy(
    { operation: "getOffer", credentials, params: { productOfferReference } },
    `a oferta '${productOfferReference}'`,
  );

  const { correlationId, ...offer } = data ?? {};
  return { offer: offer as ZfOffer, correlationId };
}

/** GET /offers com filtros e paginação. */
export async function getOffers(
  credentials: ZfCredentials,
  filters: OfferFilters | (Partial<OfferFilters> & { offset: number; limit: number }),
): Promise<{ offers: ZfOffer[]; correlationId?: string }> {
  const data = await callProxy(
    { operation: "getOffers", credentials, params: { filters } },
    "a lista de ofertas",
  );

  // O proxy embrulha a resposta em { data: [...] } porque a ZF devolve um array
  // puro e precisamos de espaço para o correlationId.
  const raw = Array.isArray(data) ? data : data?.data;
  const offers = Array.isArray(raw) ? (raw as ZfOffer[]) : [];
  return { offers, correlationId: data?.correlationId };
}
