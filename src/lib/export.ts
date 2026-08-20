// xlsx é pesado (~400 kB) e só é necessário quando o usuário exporta.
// O import dinâmico mantém isso fora do bundle inicial.
import { OfferLookupResult, ZfOffer } from "../types";

const HEADER = [
  "productOfferReference",
  "merchantSku",
  "brand",
  "partNumber",
  "quantity",
  "netPrice",
  "isActive",
  "isNeverOutOfStock",
  "validFrom",
  "validTo",
];

function offerToRow(offer: ZfOffer): Record<string, unknown> {
  return {
    productOfferReference: offer.productOfferReference ?? "",
    merchantSku: offer.merchantSku ?? "",
    brand: offer.brand ?? "",
    partNumber: offer.partNumber ?? "",
    // Mantidos como número quando possível para que o Excel permita somar/filtrar.
    quantity: offer.quantity !== undefined && offer.quantity !== null && offer.quantity !== ""
      ? Number(offer.quantity)
      : "",
    netPrice: offer.netPrice !== undefined && offer.netPrice !== null && offer.netPrice !== ""
      ? Number(String(offer.netPrice).replace(",", "."))
      : "",
    isActive: offer.isActive === undefined ? "" : offer.isActive ? "SIM" : "NÃO",
    isNeverOutOfStock: offer.isNeverOutOfStock === undefined ? "" : offer.isNeverOutOfStock ? "SIM" : "NÃO",
    validFrom: offer.validFrom ?? "",
    validTo: offer.validTo ?? "",
  };
}

const today = () => new Date().toISOString().slice(0, 10);

/** Exporta a lista de ofertas da aba de busca. */
export async function exportOffersToExcel(offers: ZfOffer[], filenamePrefix = "ZF_Ofertas") {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(offers.map(offerToRow), { header: HEADER });
  XLSX.utils.book_append_sheet(wb, sheet, "Ofertas");
  XLSX.writeFile(wb, `${filenamePrefix}_${today()}.xlsx`);
}

/** Exporta o resultado da consulta em lote, incluindo as referências que falharam. */
export async function exportLookupResultsToExcel(results: OfferLookupResult[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const statusLabel: Record<OfferLookupResult["status"], string> = {
    pending: "Pendente",
    loading: "Consultando",
    success: "Encontrada",
    not_found: "Não encontrada",
    error: "Erro",
  };

  const rows = results.map((result) => ({
    "Referência consultada": result.reference,
    "Resultado": statusLabel[result.status],
    ...offerToRow(result.data ?? ({ productOfferReference: "" } as ZfOffer)),
    "Detalhe do erro": result.status === "error" || result.status === "not_found" ? result.errorMsg ?? "" : "",
    "x-correlation-id": result.correlationId ?? "",
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet, "Consulta");
  XLSX.writeFile(wb, `ZF_Consulta_Ofertas_${today()}.xlsx`);
}
