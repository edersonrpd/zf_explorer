/** Credenciais da aplicação ZF (Pro-Parts). Ficam apenas no localStorage. */
export interface ZfCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Oferta retornada por GET /offers e GET /offers/:productOfferReference.
 * Segundo a documentação, quantity e netPrice vêm como string; validFrom e
 * validTo são opcionais e só aparecem em ofertas com vigência definida.
 */
export interface ZfOffer {
  productOfferReference: string;
  merchantSku?: string;
  brand?: string;
  partNumber?: string;
  quantity?: string;
  isNeverOutOfStock?: boolean;
  isActive?: boolean;
  netPrice?: string;
  validFrom?: string | null;
  validTo?: string | null;
  /** Campos extras que a ZF venha a incluir sem quebrar a interface. */
  [key: string]: unknown;
}

/** Filtros aceitos por GET /offers. */
export interface OfferFilters {
  productOfferReference: string;
  merchantSku: string;
  brand: string;
  partNumber: string;
  /** "" = todos | "true" = só ativas | "false" = só inativas */
  isActive: string;
  offset: number;
  limit: number;
}

export type LookupStatus = "pending" | "loading" | "success" | "not_found" | "error";

/** Uma linha da consulta em lote da aba "Oferta Única". */
export interface OfferLookupResult {
  reference: string;
  status: LookupStatus;
  data?: ZfOffer;
  errorMsg?: string;
  correlationId?: string;
}
