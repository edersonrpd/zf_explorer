import { Fragment, ReactNode, useMemo, useState } from "react";
import { formatDayUtc, formatPrice } from "../lib/utils";
import { ZfOrderSummary } from "../types";
import { stateTone } from "./OrderDetail";

type OrderSortKey = "merchantOrderReference" | "createdAt" | "customer" | "itemCount" | "grand";

interface OrdersTableProps {
  orders: ZfOrderSummary[];
  selectedReference?: string;
  onSelect: (order: ZfOrderSummary) => void;
  renderExpanded?: (order: ZfOrderSummary) => ReactNode;
}

const COLUMNS: Array<{ key: OrderSortKey; label: string; numeric?: boolean }> = [
  { key: "merchantOrderReference", label: "Pedido" },
  { key: "createdAt", label: "Criado em" },
  { key: "customer", label: "Cliente" },
  { key: "itemCount", label: "Itens", numeric: true },
  { key: "grand", label: "Total", numeric: true },
];

/** Valor usado para ordenar cada coluna — totais e datas não ordenam como texto. */
function sortValue(order: ZfOrderSummary, key: OrderSortKey): string | number {
  switch (key) {
    case "createdAt":
      // Formato "YYYY-MM-DD HH:MM:SS" ordena corretamente como texto.
      return order.createdAt ?? "";
    case "customer":
      return order.customer?.companyName || order.customer?.fullName || "";
    case "itemCount":
      return Number(order.itemCount ?? 0);
    case "grand":
      return Number(order.totals?.grand ?? Number.NEGATIVE_INFINITY);
    default:
      return order.merchantOrderReference ?? "";
  }
}

export function OrdersTable({ orders, selectedReference, onSelect, renderExpanded }: OrdersTableProps) {
  const [sortKey, setSortKey] = useState<OrderSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const copy = [...orders];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv), "pt-BR")
        : String(bv).localeCompare(String(av), "pt-BR");
    });
    return copy;
  }, [orders, sortKey, sortDir]);

  const toggle = (key: OrderSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // Data começa da mais recente; texto e números, do menor.
      setSortDir(key === "createdAt" || key === "grand" ? "desc" : "asc");
    }
  };

  const arrow = (key: OrderSortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className={`sortable ${column.numeric ? "num" : ""}`}
                onClick={() => toggle(column.key)}
              >
                {column.label}{arrow(column.key)}
              </th>
            ))}
            <th>Pagamento</th>
            <th>Estados</th>
            <th>Entrega</th>
            {renderExpanded && <th style={{ width: "38px" }}></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((order) => {
            const isExpanded = selectedReference === order.merchantOrderReference;
            const customer = order.customer?.companyName || order.customer?.fullName;
            return (
              <Fragment key={order.merchantOrderReference}>
                <tr className={`row ${isExpanded ? "selected" : ""}`} onClick={() => onSelect(order)}>
                  <td className="mono" style={{ maxWidth: "230px", wordBreak: "break-all", fontWeight: 600 }}>
                    {order.merchantOrderReference}
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{formatDayUtc(order.createdAt)}</td>
                  <td style={{ maxWidth: "240px" }}>
                    <div style={{ fontWeight: 600 }}>{customer || "—"}</div>
                    {order.customer?.cnpj && (
                      <div className="mono" style={{ fontSize: "11px", color: "var(--muted)" }}>{order.customer.cnpj}</div>
                    )}
                  </td>
                  <td className="num">{order.itemCount ?? "—"}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{formatPrice(order.totals?.grand)}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: "12.5px" }}>{order.paymentMethod || "—"}</td>
                  <td>
                    <div className="state-badges">
                      {(order.itemStates ?? []).map((state) => (
                        <span key={state} className={`badge ${stateTone(state)}`}>{state.toUpperCase()}</span>
                      ))}
                      {(order.itemStates?.length ?? 0) === 0 && <span className="empty-note">—</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {order.shipments?.map((s) => s.carrierName || s.name).filter(Boolean).join(", ") || "—"}
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
                    <td className="detail-cell" colSpan={COLUMNS.length + 4}>
                      <div className="detail-inner">{renderExpanded(order)}</div>
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
