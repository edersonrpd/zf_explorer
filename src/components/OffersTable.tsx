import { Fragment, ReactNode, useMemo, useState } from "react";
import { DEFAULT_SORT, SortKey, SortState, sortOffers, toggleSort } from "../lib/sortOffers";
import { formatDate, formatPrice, formatQuantity } from "../lib/utils";
import { ZfOffer } from "../types";

interface OffersTableProps {
  offers: ZfOffer[];
  selectedReference?: string;
  onSelect: (offer: ZfOffer) => void;
  /**
   * Ordenação controlada. O catálogo completo precisa ordenar as 6 mil ofertas
   * antes de fatiar a página visível — se a tabela ordenasse sozinha, ordenaria
   * só as linhas da página atual, o que dá um resultado errado e confuso.
   * Sem estas props a tabela ordena por conta própria (usado nas listas curtas).
   */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  /** Quando true, as linhas já vêm ordenadas de fora. */
  preSorted?: boolean;
  /**
   * Detalhe expandido da oferta selecionada. Renderizado como uma linha extra
   * logo abaixo da linha clicada — com listas longas, jogar o detalhe no rodapé
   * da página obriga a rolar para achar o que acabou de ser clicado.
   */
  renderExpanded?: (offer: ZfOffer) => ReactNode;
}

export function OffersTable({
  offers,
  selectedReference,
  onSelect,
  sort,
  onSortChange,
  preSorted,
  renderExpanded,
}: OffersTableProps) {
  const [internalSort, setInternalSort] = useState<SortState>(DEFAULT_SORT);
  const activeSort = sort ?? internalSort;

  const rows = useMemo(
    () => (preSorted ? offers : sortOffers(offers, activeSort)),
    [offers, activeSort, preSorted],
  );

  const handleSort = (key: SortKey) => {
    const next = toggleSort(activeSort, key);
    if (onSortChange) onSortChange(next);
    else setInternalSort(next);
  };

  const arrow = (key: SortKey) => (activeSort.key === key ? (activeSort.dir === "asc" ? " ↑" : " ↓") : "");

  const columns: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
    { key: "productOfferReference", label: "Referência" },
    { key: "merchantSku", label: "Merchant SKU" },
    { key: "brand", label: "Marca" },
    { key: "partNumber", label: "Part Number" },
    { key: "quantity", label: "Qtd.", numeric: true },
    { key: "netPrice", label: "Net Price", numeric: true },
  ];

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`sortable ${column.numeric ? "num" : ""}`}
                onClick={() => handleSort(column.key)}
              >
                {column.label}{arrow(column.key)}
              </th>
            ))}
            <th>Status</th>
            <th>Vigência</th>
            {renderExpanded && <th style={{ width: "38px" }}></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((offer) => {
            const isExpanded = selectedReference === offer.productOfferReference;
            return (
              <Fragment key={offer.productOfferReference}>
                <tr className={`row ${isExpanded ? "selected" : ""}`} onClick={() => onSelect(offer)}>
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
                  {renderExpanded && (
                    <td className="chev-cell">
                      <span className={`chev ${isExpanded ? "open" : ""}`} aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </span>
                    </td>
                  )}
                </tr>
                {renderExpanded && isExpanded && (
                  <tr className="detail-row">
                    <td className="detail-cell" colSpan={columns.length + 3}>
                      <div className="detail-inner">{renderExpanded(offer)}</div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
