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

/**
 * CSV para volumes grandes. Com 6 mil linhas o XLSX ainda funciona, mas o CSV
 * sai na hora, ocupa uma fração do tamanho e é o que o ERP costuma importar.
 * Ponto-e-vírgula como separador porque é o que o Excel em pt-BR espera.
 */
export function exportOffersToCsv(offers: ZfOffer[], filenamePrefix = "ZF_Ofertas") {
  const escape = (value: unknown) => {
    if (value === undefined || value === null) return "";
    // O separador é ";" porque é o que o Excel em pt-BR espera — e nesse mesmo
    // locale o separador decimal é a vírgula. Um netPrice "1000.00" com ponto
    // seria lido como texto (ou pior, como 100000), então números saem
    // formatados em pt-BR.
    const text = typeof value === "number" ? String(value).replace(".", ",") : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [HEADER.join(";")];
  for (const offer of offers) {
    const row = offerToRow(offer);
    lines.push(HEADER.map((key) => escape(row[key])).join(";"));
  }

  // BOM para o Excel abrir os acentos corretamente.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filenamePrefix}_${today()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
