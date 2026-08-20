import { useMemo, useState } from "react";
import { ZfOffer } from "../types";
import { formatDate, formatPrice, formatQuantity } from "../lib/utils";

type SortKey = "productOfferReference" | "merchantSku" | "brand" | "partNumber" | "quantity" | "netPrice";

interface OffersTableProps {
  offers: ZfOffer[];
  selectedReference?: string;
  onSelect: (offer: ZfOffer) => void;
}

export function OffersTable({ offers, selectedReference, onSelect }: OffersTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("productOfferReference");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    const copy = [...offers];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // quantity e netPrice chegam como string, mas devem ordenar como número.
      if (sortKey === "quantity" || sortKey === "netPrice") {
        const an = Number(av ?? Number.NEGATIVE_INFINITY);
        const bn = Number(bv ?? Number.NEGATIVE_INFINITY);
        if (Number.isFinite(an) && Number.isFinite(bn)) return sortDir === "asc" ? an - bn : bn - an;
      }
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return sortDir === "asc" ? as.localeCompare(bs, "pt-BR") : bs.localeCompare(as, "pt-BR");
    });
    return copy;
  }, [offers, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th className="sortable" onClick={() => toggleSort("productOfferReference")}>Referência{arrow("productOfferReference")}</th>
            <th className="sortable" onClick={() => toggleSort("merchantSku")}>Merchant SKU{arrow("merchantSku")}</th>
            <th className="sortable" onClick={() => toggleSort("brand")}>Marca{arrow("brand")}</th>
            <th className="sortable" onClick={() => toggleSort("partNumber")}>Part Number{arrow("partNumber")}</th>
            <th className="sortable num" onClick={() => toggleSort("quantity")}>Qtd.{arrow("quantity")}</th>
            <th className="sortable num" onClick={() => toggleSort("netPrice")}>Net Price{arrow("netPrice")}</th>
            <th>Status</th>
            <th>Vigência</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((offer) => (
            <tr
              key={offer.productOfferReference}
              className={`row ${selectedReference === offer.productOfferReference ? "selected" : ""}`}
              onClick={() => onSelect(offer)}
            >
              <td className="mono" style={{ maxWidth: "300px", wordBreak: "break-all" }}>{offer.productOfferReference}</td>
              <td className="mono">{offer.merchantSku || "—"}</td>
              <td>{offer.brand || "—"}</td>
              <td className="mono">{offer.partNumber || "—"}</td>
              <td className="num">{formatQuantity(offer.quantity)}</td>
              <td className="num">{formatPrice(offer.netPrice)}</td>
              <td>
                <span className={`badge ${offer.isActive ? "green" : "gray"}`}>
                  {offer.isActive ? "ATIVA" : "INATIVA"}
                </span>
              </td>
              <td style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                {offer.validFrom || offer.validTo
                  ? `${formatDate(offer.validFrom)} → ${formatDate(offer.validTo)}`
                  : "Sem vigência"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
