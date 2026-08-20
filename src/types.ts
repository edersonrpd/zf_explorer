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

/* ------------------------------------------------------------------ */
/* Pedidos                                                             */
/* ------------------------------------------------------------------ */

export interface ZfAddress {
  salutation?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  zipCode?: string;
  city?: string;
  country?: string;
  phone?: string;
}

export interface ZfCustomer {
  customerReference?: string;
  fullName?: string;
  email?: string;
  cnpj?: string;
  ie?: string;
  companyName?: string;
}

/** Todos os valores monetários chegam como string ("1775.84"). */
export interface ZfOrderTotals {
  subtotal?: string;
  orderExpense?: string;
  grand?: string;
  canceled?: string;
  refundable?: string;
  commission?: string;
  discount?: string;
}

export interface ZfOrderItemTotals {
  unitPrice?: string;
  sumPrice?: string;
  sumPriceToPay?: string;
  discountTotal?: string;
}

export interface ZfOrderItemProduct {
  sku?: string;
  name?: string;
  brand?: string;
  partNumber?: string;
}

export interface ZfOrderItem {
  merchantOrderItemReference?: string;
  state?: string;
  product?: ZfOrderItemProduct;
  quantity?: number;
  totals?: ZfOrderItemTotals;
  notaFiscal?: string;
  trackingLink?: string;
  [key: string]: unknown;
}

export interface ZfShipment {
  shipmentReference?: string;
  name?: string;
  carrierName?: string;
  merchantOrderItemReferences?: string[];
  /** Só vem no detalhe (GET /orders/:ref); a listagem traz o shipment sem endereço. */
  address?: ZfAddress;
  [key: string]: unknown;
}

/**
 * Pedido como vem de GET /orders (listagem).
 *
 * A listagem é mais enxuta que o detalhe: **não traz `items`, `billingAddress`
 * nem `settlementDate`**, e os `shipments` vêm sem `address`. Ver os itens de um
 * pedido exige a chamada a GET /orders/:merchantOrderReference.
 */
export interface ZfOrderSummary {
  merchantOrderReference: string;
  paymentMethod?: string;
  customer?: ZfCustomer;
  totals?: ZfOrderTotals;
  /** Estados agregados dos itens, ex.: ["new","canceled"]. */
  itemStates?: string[];
  itemCount?: number;
  shipments?: ZfShipment[];
  /** Data/hora em UTC, formato "2024-04-01 23:59:59". */
  updatedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

/** Pedido completo de GET /orders/:merchantOrderReference. */
export interface ZfOrder extends ZfOrderSummary {
  settlementDate?: string;
  creditCardInstallmentsCount?: number;
  billingAddress?: ZfAddress;
  items?: ZfOrderItem[];
}

export interface OrderFilters {
  /** "YYYY-MM-DD" vindo do <input type="date">; convertido para UTC no envio. */
  createdFrom: string;
  createdTo: string;
  state: string[];
  offset: number;
  limit: number;
}
