import { ReactNode } from "react";
import { KNOWN_ORDER_STATES, PAGE_SIZES } from "../constants";
import { BulkProgress } from "../hooks/useOrderDetails";
import { SyncState } from "../hooks/useCatalogSync";
import { OrderFilters, ZfOrderSummary } from "../types";
import { formatPrice } from "../lib/utils";
import { OrdersTable } from "./OrdersTable";

interface OrdersPanelProps {
  filters: OrderFilters;
  onFilterChange: <K extends keyof OrderFilters>(key: K, value: OrderFilters[K]) => void;
  orders: ZfOrderSummary[];
  loaded: boolean;
  loading: boolean;
  error?: string | null;
  /** Estado da varredura completa do período (reaproveita o crawler das ofertas). */
  sync: SyncState<ZfOrderSummary>;
  bulk: BulkProgress | null;
  detailsLoadedCount: number;
  onSearch: () => void;
  onDownloadAll: () => void;
  onCancelDownload: () => void;
  onClear: () => void;
  onPage: (direction: -1 | 1) => void;
  onLoadAllDetails: () => void;
  onStopBulk: () => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
  onExportItemsCsv: () => void;
  onSelectOrder: (order: ZfOrderSummary) => void;
  selectedReference?: string;
  renderExpanded: (order: ZfOrderSummary) => ReactNode;
}

/** Soma dos totais da página atual — conferência rápida sem sair da tela. */
function sumGrand(orders: ZfOrderSummary[]): number {
  return orders.reduce((total, order) => {
    const value = Number(order.totals?.grand ?? 0);
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

export function OrdersPanel(props: OrdersPanelProps) {
  const {
    filters, onFilterChange, orders, loaded, loading, error, sync, bulk, detailsLoadedCount,
    onSearch, onDownloadAll, onCancelDownload, onClear, onPage, onLoadAllDetails, onStopBulk,
    onExportXlsx, onExportCsv, onExportItemsCsv, onSelectOrder, selectedReference, renderExpanded,
  } = props;

  const downloading = sync.status === "running" || sync.status === "paused";
  const busy = loading || downloading || bulk !== null;

  // Chips de estado: os documentados mais os que aparecerem nos pedidos
  // carregados, já que a API não publica a lista fechada de estados.
  const seenStates = Array.from(new Set(orders.flatMap((order) => order.itemStates ?? [])));
  const stateOptions = Array.from(new Set([...KNOWN_ORDER_STATES, ...seenStates]));

  const toggleState = (state: string) => {
    const next = filters.state.includes(state)
      ? filters.state.filter((item) => item !== state)
      : [...filters.state, state];
    onFilterChange("state", next);
  };

  const itemsTotal = orders.reduce((total, order) => total + (order.itemCount ?? 0), 0);

  return (
    <>
      <section className="conn" style={{ marginTop: "16px" }}>
        <div className="filters-grid">
          <div className="field">
            <label htmlFor="ordFrom">Criado de</label>
            <input
              id="ordFrom"
              className="input"
              type="date"
              value={filters.createdFrom}
              disabled={busy}
              onChange={(e) => onFilterChange("createdFrom", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ordTo">Criado até</label>
            <input
              id="ordTo"
              className="input"
              type="date"
              value={filters.createdTo}
              disabled={busy}
              onChange={(e) => onFilterChange("createdTo", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ordLimit">Pedidos por página</label>
            <select
              id="ordLimit"
              className="input"
              value={filters.limit}
              disabled={busy}
              onChange={(e) => onFilterChange("limit", Number(e.target.value))}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size} por página</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ordOffset">page[offset]</label>
            <input
              id="ordOffset"
              className="input mono"
              type="number"
              min={0}
              value={filters.offset}
              disabled={busy}
              onChange={(e) => onFilterChange("offset", Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        <div style={{ padding: "0 18px 4px" }}>
          <div className="side-label">Estado dos itens</div>
          <div className="status-pills">
            {stateOptions.map((state) => (
              <button
                key={state}
                type="button"
                className={`spill ${filters.state.includes(state) ? "on" : ""}`}
                disabled={busy}
                onClick={() => toggleState(state)}
              >
                {state}
              </button>
            ))}
            {filters.state.length > 0 && (
              <button type="button" className="link-btn" disabled={busy} onClick={() => onFilterChange("state", [])}>
                limpar estados
              </button>
            )}
          </div>
          <p style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "8px" }}>
            A ZF não publica a lista fechada de estados — além dos documentados, aparecem aqui os
            estados encontrados nos pedidos já carregados. Nenhum estado marcado significa "todos".
          </p>
        </div>

        <div className="filters-foot">
          <button className="btn btn-primary" disabled={busy} onClick={onSearch}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            {loading ? "Buscando..." : "Buscar pedidos"}
          </button>
          {downloading ? (
            <button className="btn btn-ghost" onClick={onCancelDownload}>Parar download</button>
          ) : (
            <button className="btn btn-dark" disabled={busy} onClick={onDownloadAll}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Baixar todos do período
            </button>
          )}
          <button className="btn btn-ghost" disabled={busy} onClick={onClear}>Limpar</button>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            As datas são convertidas do seu fuso para UTC, que é o que a API espera.
          </span>
        </div>
      </section>

      {error && (
        <div className="alert error">
          <strong>Erro de consulta</strong>
          {error}
        </div>
      )}

      {downloading && (
        <div className="alert info">
          <span className="pulse"></span>
          Baixando pedidos… {sync.items.length.toLocaleString("pt-BR")} carregados em {sync.pagesRead} página(s).
        </div>
      )}

      {sync.skipped.length > 0 && (
        <div className="alert error">
          <strong>{sync.skipped.length} trecho(s) que a ZF não conseguiu entregar</strong>
          Os pedidos restantes foram baixados normalmente. Posições:{" "}
          {sync.skipped.map((item) => item.offset).join(", ")}
        </div>
      )}

      {bulk && (
        <div className="alert info">
          <span className="pulse"></span>
          Carregando itens: {bulk.done} de {bulk.total}
          {bulk.failed > 0 && ` · ${bulk.failed} com erro`}
          <button className="link-btn" style={{ marginLeft: "auto" }} onClick={onStopBulk}>parar</button>
        </div>
      )}

      {loaded && !error && (
        <section className="card" style={{ marginTop: "22px" }}>
          <div className="card-head">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </span>
            <h2>Pedidos</h2>
            <span className="count">{orders.length.toLocaleString("pt-BR")}</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                className="btn btn-ghost"
                style={{ padding: "6px 12px", fontSize: "12px" }}
                disabled={orders.length === 0 || busy}
                onClick={onLoadAllDetails}
              >
                Carregar itens de todos ({detailsLoadedCount}/{orders.length})
              </button>
              <button
                className="btn btn-ghost"
                style={{ padding: "6px 12px", fontSize: "12px" }}
                disabled={orders.length === 0}
                onClick={onExportXlsx}
              >
                XLSX
              </button>
              <button
                className="btn btn-ghost"
                style={{ padding: "6px 12px", fontSize: "12px" }}
                disabled={orders.length === 0}
                onClick={onExportCsv}
              >
                CSV pedidos
              </button>
              <button
                className="btn btn-ghost"
                style={{ padding: "6px 12px", fontSize: "12px" }}
                disabled={detailsLoadedCount === 0}
                title={detailsLoadedCount === 0 ? "Carregue os itens primeiro" : undefined}
                onClick={onExportItemsCsv}
              >
                CSV itens
              </button>
            </div>
          </div>

          {orders.length > 0 && (
            <div className="orders-summary">
              <div className="sync-stat">
                <div className="sk">Pedidos</div>
                <div className="sv">{orders.length.toLocaleString("pt-BR")}</div>
              </div>
              <div className="sync-stat">
                <div className="sk">Itens</div>
                <div className="sv">{itemsTotal.toLocaleString("pt-BR")}</div>
              </div>
              <div className="sync-stat">
                <div className="sk">Soma dos totais</div>
                <div className="sv">{formatPrice(sumGrand(orders))}</div>
              </div>
              <div className="sync-stat">
                <div className="sk">Detalhes carregados</div>
                <div className="sv">{detailsLoadedCount}</div>
              </div>
            </div>
          )}

          {orders.length === 0 ? (
            <div className="empty-state">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              </div>
              <h3>Nenhum pedido neste período</h3>
              <p>Ajuste as datas ou os estados. Se o offset for maior que o total de pedidos, a API devolve uma lista vazia.</p>
            </div>
          ) : (
            <OrdersTable
              orders={orders}
              selectedReference={selectedReference}
              onSelect={onSelectOrder}
              renderExpanded={renderExpanded}
            />
          )}

          {/* A paginação manual não faz sentido depois de baixar tudo. */}
          {sync.status === "idle" && (
            <div className="pager">
              <span className="info">offset {filters.offset} · limit {filters.limit}</span>
              <span className="grow"></span>
              <button className="btn btn-ghost" disabled={busy || filters.offset === 0} onClick={() => onPage(-1)}>
                ← Página anterior
              </button>
              <button className="btn btn-ghost" disabled={busy || orders.length < filters.limit} onClick={() => onPage(1)}>
                Próxima página →
              </button>
            </div>
          )}
        </section>
      )}

      {!loaded && !loading && !downloading && (
        <div className="card" style={{ marginTop: "22px" }}>
          <div className="empty-state">
            <div className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </div>
            <h3>Consulte os pedidos</h3>
            <p>
              Filtre por período e estado para listar via <code>GET /orders</code>. Clique em um pedido
              para abrir os itens logo abaixo — a listagem não traz itens, então eles vêm de uma
              chamada a <code>GET /orders/:merchantOrderReference</code>.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
