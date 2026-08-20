import { ZfAddress, ZfOrder, ZfOrderItem } from "../types";
import { formatDateUtc, formatPrice, formatQuantity } from "../lib/utils";

/** Estados de item conhecidos ganham cor; os demais caem no cinza neutro. */
function stateTone(state?: string): string {
  const value = (state ?? "").toLowerCase();
  if (value === "new") return "blue";
  if (value === "canceled" || value === "cancelled") return "rose";
  if (value.includes("waiting")) return "amber";
  if (value.includes("shipped") || value.includes("delivered") || value.includes("paid")) return "green";
  return "gray";
}

function formatAddress(address?: ZfAddress): string[] {
  if (!address) return [];
  const name = [address.salutation, address.firstName, address.lastName].filter(Boolean).join(" ");
  const street = [address.address1, address.address2, address.address3].filter(Boolean).join(", ");
  const city = [address.zipCode, address.city, address.country].filter(Boolean).join(" · ");
  return [name, address.company, street, city, address.phone].filter((line): line is string => Boolean(line));
}

interface OrderDetailProps {
  order: ZfOrder;
  /** O detalhe é carregado sob demanda: a listagem não traz os itens. */
  loading?: boolean;
  error?: string;
  correlationId?: string;
  onCopy: (value: string, label: string) => void;
  onOpenJson: () => void;
  onRetry?: () => void;
}

export function OrderDetail({ order, loading, error, correlationId, onCopy, onOpenJson, onRetry }: OrderDetailProps) {
  const items = order.items ?? [];
  const totals = order.totals ?? {};

  if (loading) {
    return (
      <div className="order-loading">
        <span className="pulse"></span>
        Carregando itens do pedido…
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert error" style={{ marginTop: 0 }}>
        <strong>Não foi possível carregar o detalhe deste pedido</strong>
        {error}
        {onRetry && (
          <div style={{ marginTop: "10px" }}>
            <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={onRetry}>
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid-layout">
      <div className="stack">
        {/* Itens — o motivo de existir a chamada de detalhe */}
        <section className="card">
          <div className="card-head">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            </span>
            <h2>Itens do pedido</h2>
            <span className="count">{items.length}</span>
          </div>

          {items.length === 0 ? (
            <div className="empty-note" style={{ padding: "18px 20px" }}>
              A ZF não retornou itens para este pedido.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>SKU / Part Number</th>
                    <th className="num">Qtd.</th>
                    <th className="num">Unitário</th>
                    <th className="num">Total</th>
                    <th className="num">A pagar</th>
                    <th>Estado</th>
                    <th>NF / Rastreio</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: ZfOrderItem, index) => (
                    <tr key={item.merchantOrderItemReference ?? index}>
                      <td style={{ maxWidth: "300px" }}>
                        <div style={{ fontWeight: 600 }}>{item.product?.name || "—"}</div>
                        {item.product?.brand && (
                          <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>{item.product.brand}</div>
                        )}
                      </td>
                      <td className="mono" style={{ maxWidth: "220px", wordBreak: "break-all" }}>
                        <div>{item.product?.sku || "—"}</div>
                        <div style={{ color: "var(--muted)" }}>{item.product?.partNumber || ""}</div>
                      </td>
                      <td className="num">{formatQuantity(item.quantity)}</td>
                      <td className="num">{formatPrice(item.totals?.unitPrice)}</td>
                      <td className="num">{formatPrice(item.totals?.sumPrice)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{formatPrice(item.totals?.sumPriceToPay)}</td>
                      <td><span className={`badge ${stateTone(item.state)}`}>{(item.state || "—").toUpperCase()}</span></td>
                      <td style={{ fontSize: "11.5px" }}>
                        {item.notaFiscal ? <div className="mono">{item.notaFiscal}</div> : <span className="empty-note">sem NF</span>}
                        {item.trackingLink && (
                          <a href={item.trackingLink} target="_blank" rel="noreferrer" className="media-link">rastrear</a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Entregas */}
        {(order.shipments?.length ?? 0) > 0 && (
          <section className="card">
            <div className="card-head">
              <span className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
              </span>
              <h2>Entregas</h2>
              <span className="count">{order.shipments?.length}</span>
            </div>
            <div className="side-block">
              {order.shipments?.map((shipment, index) => (
                <div key={shipment.shipmentReference ?? index} className="ship-block">
                  <div className="ship-head">
                    <span className="badge blue">{shipment.name || "ENTREGA"}</span>
                    <span className="ship-carrier">{shipment.carrierName || "transportadora não informada"}</span>
                    <span className="ship-ref mono">#{shipment.shipmentReference || "—"}</span>
                  </div>
                  {formatAddress(shipment.address).length > 0 && (
                    <div className="addr">
                      {formatAddress(shipment.address).map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                  )}
                  {(shipment.merchantOrderItemReferences?.length ?? 0) > 0 && (
                    <div className="ship-items">
                      {shipment.merchantOrderItemReferences?.length} item(ns) nesta entrega
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="stack">
        {/* Totais */}
        <section className="price-card">
          <div className="price-head">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </span>
            <h2>Totais</h2>
            <span className="cur">BRL</span>
          </div>
          <div className="price-body">
            <div className="price-main">
              <div className="pk">Total do pedido</div>
              <div className="pv">{formatPrice(totals.grand)}</div>
            </div>
          </div>
          <div className="totals-rows">
            {([
              ["Subtotal", totals.subtotal],
              ["Desconto", totals.discount],
              ["Despesas", totals.orderExpense],
              ["Comissão", totals.commission],
              ["Cancelado", totals.canceled],
              ["Reembolsável", totals.refundable],
            ] as Array<[string, string | undefined]>).map(([label, value]) => (
              <div key={label} className="totals-row">
                <span className="tk">{label}</span>
                <span className="tv">{formatPrice(value)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Cliente */}
        <section className="card">
          <div className="card-head">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </span>
            <h2>Cliente</h2>
          </div>
          <div className="side-block">
            <div className="kv"><span className="kk">Nome</span><span className="kvv">{order.customer?.fullName || "—"}</span></div>
            <div className="kv"><span className="kk">Empresa</span><span className="kvv">{order.customer?.companyName || "—"}</span></div>
            <div className="kv"><span className="kk">CNPJ</span><span className="kvv mono">{order.customer?.cnpj || "—"}</span></div>
            <div className="kv"><span className="kk">IE</span><span className="kvv mono">{order.customer?.ie || "—"}</span></div>
            <div className="kv"><span className="kk">E-mail</span><span className="kvv">{order.customer?.email || "—"}</span></div>
            <div className="kv"><span className="kk">Referência</span><span className="kvv mono">{order.customer?.customerReference || "—"}</span></div>
          </div>
          {formatAddress(order.billingAddress).length > 0 && (
            <div className="side-block">
              <div className="side-label">Endereço de cobrança</div>
              <div className="addr">
                {formatAddress(order.billingAddress).map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </div>
          )}
        </section>

        {/* Pagamento e datas */}
        <section className="card">
          <div className="card-head">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            </span>
            <h2>Pagamento</h2>
          </div>
          <div className="side-block">
            <div className="kv"><span className="kk">Método</span><span className="kvv">{order.paymentMethod || "—"}</span></div>
            {order.creditCardInstallmentsCount !== undefined && (
              <div className="kv"><span className="kk">Parcelas</span><span className="kvv">{order.creditCardInstallmentsCount}x</span></div>
            )}
            <div className="kv"><span className="kk">Repasse</span><span className="kvv mono">{formatDateUtc(order.settlementDate)}</span></div>
            <div className="kv"><span className="kk">Criado</span><span className="kvv mono">{formatDateUtc(order.createdAt)}</span></div>
            <div className="kv"><span className="kk">Atualizado</span><span className="kvv mono">{formatDateUtc(order.updatedAt)}</span></div>
          </div>
          <div className="side-block">
            <button className="btn btn-dark" style={{ width: "100%", justifyContent: "center" }} onClick={onOpenJson}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Ver JSON completo
            </button>
            <button
              className="btn btn-ghost"
              style={{ width: "100%", justifyContent: "center", marginTop: "8px" }}
              onClick={() => onCopy(order.merchantOrderReference, "Referência do pedido copiada!")}
            >
              Copiar referência
            </button>
            {correlationId && (
              <div style={{ marginTop: "10px", fontSize: "10.5px", color: "var(--muted-2)", fontFamily: "var(--font-mono)", textAlign: "center" }}>
                {correlationId}
              </div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

export { stateTone };
