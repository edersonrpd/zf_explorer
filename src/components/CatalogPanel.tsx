import { useMemo, useState } from "react";
import { CATALOG_VIEW_PAGE_SIZE, SYNC_DELAYS, SYNC_PAGE_SIZES } from "../constants";
import { SyncState } from "../hooks/useCatalogSync";
import { DEFAULT_SORT, SortState, filterOffersLocally, sortOffers } from "../lib/sortOffers";
import { ReactNode } from "react";
import { OfferFilters, ZfOffer } from "../types";
import { OfferFiltersFields } from "./OfferFiltersFields";
import { OffersTable } from "./OffersTable";

export interface SyncSettings {
  pageSize: number;
  delayMs: number;
  maxPages: number;
}

interface CatalogPanelProps {
  state: SyncState<ZfOffer>;
  settings: SyncSettings;
  onSettingsChange: (settings: SyncSettings) => void;
  filters: OfferFilters;
  onFilterChange: <K extends keyof OfferFilters>(key: K, value: OfferFilters[K]) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onReset: () => void;
  onExportXlsx: (offers: ZfOffer[]) => void;
  onExportCsv: (offers: ZfOffer[]) => void;
  onCopy: (value: string, label: string) => void;
  onSelectOffer: (offer: ZfOffer) => void;
  selectedReference?: string;
  /** Detalhe mostrado logo abaixo da linha clicada. */
  renderOfferDetail: (offer: ZfOffer) => ReactNode;
}

const STOP_REASON_LABEL: Record<string, string> = {
  completo: "Catálogo percorrido até o fim.",
  cancelado: "Interrompido por você — o que já veio continua disponível para exportar.",
  "limite-paginas": "Parou no teto de páginas configurado. Aumente o limite se o catálogo for maior.",
  "limite-requisicoes": "Gastou requisições demais se recuperando de erros. Aumente o teto de páginas para continuar, ou revise os registros com falha.",
  "sem-novidade": "A API repetiu ofertas já recebidas, então a varredura parou para não entrar em laço. Pode ser que o catálogo tenha acabado ou que o offset esteja sendo ignorado.",
  erro: "A varredura parou por causa de um erro.",
};

/**
 * A mensagem de erro carrega o corpo JSON da ZF inteiro. Para a lista de falhas
 * interessa só o motivo real — "Property \"brand\" ... is null" diz exatamente
 * qual campo do registro está quebrado no banco deles, que é o que o suporte
 * precisa. O texto genérico ("tente novamente em instantes") é enganoso aqui:
 * este erro é permanente, nunca vai passar sozinho.
 */
function extractZfDetail(message: string): string {
  const start = message.indexOf("{");
  if (start === -1) return message;
  try {
    const body = JSON.parse(message.slice(start));
    const detail = body?.details?.[0]?.message;
    if (typeof detail === "string" && detail) return detail;
    if (typeof body?.reason === "string" && body.reason) return body.reason;
  } catch {
    // Corpo não-JSON: mostra o texto como veio.
  }
  return message.slice(0, start).replace(/[\s—-]+$/, "").trim() || message;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

export function CatalogPanel({
  state,
  settings,
  onSettingsChange,
  filters,
  onFilterChange,
  onStart,
  onPause,
  onResume,
  onCancel,
  onReset,
  onExportXlsx,
  onExportCsv,
  onCopy,
  onSelectOffer,
  selectedReference,
  renderOfferDetail,
}: CatalogPanelProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [visiblePage, setVisiblePage] = useState(0);

  const isBusy = state.status === "running" || state.status === "paused";

  // Filtra e ordena o conjunto inteiro e só então fatia a página visível —
  // do contrário a ordenação valeria apenas para as linhas já na tela.
  const processed = useMemo(
    () => sortOffers(filterOffersLocally(state.items, search), sort),
    [state.items, search, sort],
  );

  const totalViewPages = Math.max(1, Math.ceil(processed.length / CATALOG_VIEW_PAGE_SIZE));
  const currentPage = Math.min(visiblePage, totalViewPages - 1);
  const visibleRows = useMemo(
    () => processed.slice(currentPage * CATALOG_VIEW_PAGE_SIZE, (currentPage + 1) * CATALOG_VIEW_PAGE_SIZE),
    [processed, currentPage],
  );

  const offersPerSecond =
    state.elapsedMs > 0 ? (state.items.length / (state.elapsedMs / 1000)).toFixed(1) : "0.0";

  return (
    <>
      {/* Configuração da varredura */}
      <section className="conn" style={{ marginTop: "16px" }}>
        <div className="filters-grid">
          <OfferFiltersFields filters={filters} onChange={onFilterChange} idPrefix="cat" disabled={isBusy} />
        </div>
        <div className="filters-grid" style={{ paddingTop: 0 }}>
          <div className="field">
            <label htmlFor="syncPageSize">Ofertas por chamada</label>
            <select
              id="syncPageSize"
              className="input"
              value={settings.pageSize}
              disabled={isBusy}
              onChange={(e) => onSettingsChange({ ...settings, pageSize: Number(e.target.value) })}
            >
              {SYNC_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size} por página</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="syncDelay">Pausa entre chamadas</label>
            <select
              id="syncDelay"
              className="input"
              value={settings.delayMs}
              disabled={isBusy}
              onChange={(e) => onSettingsChange({ ...settings, delayMs: Number(e.target.value) })}
            >
              {SYNC_DELAYS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="syncMaxPages">Teto de páginas</label>
            <input
              id="syncMaxPages"
              className="input mono"
              type="number"
              min={1}
              value={settings.maxPages}
              disabled={isBusy}
              onChange={(e) => onSettingsChange({ ...settings, maxPages: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
        </div>

        <div className="filters-foot">
          {state.status === "idle" || state.status === "done" || state.status === "error" ? (
            <button className="btn btn-primary" onClick={onStart}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              {state.status === "idle" ? "Baixar catálogo completo" : "Baixar novamente"}
            </button>
          ) : (
            <>
              {state.status === "running" ? (
                <button className="btn btn-ghost" onClick={onPause}>Pausar</button>
              ) : (
                <button className="btn btn-primary" onClick={onResume}>Retomar</button>
              )}
              <button className="btn btn-ghost" onClick={onCancel}>Parar</button>
            </>
          )}

          {state.items.length > 0 && !isBusy && (
            <>
              <button className="btn btn-dark" onClick={() => onExportCsv(state.items)}>
                Baixar CSV ({state.items.length.toLocaleString("pt-BR")})
              </button>
              <button className="btn btn-ghost" onClick={() => onExportXlsx(state.items)}>
                Baixar XLSX
              </button>
              <button className="btn btn-ghost" onClick={onReset}>Limpar</button>
            </>
          )}

          {state.status === "idle" && (
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              Percorre <code>GET /offers</code> página a página, respeitando a pausa configurada.
            </span>
          )}
        </div>
      </section>

      {/* Progresso ao vivo */}
      {(isBusy || state.status === "done" || state.status === "error") && (
        <section className="card sync-card">
          <div className="sync-stats">
            <div className="sync-stat">
              <div className="sk">Ofertas carregadas</div>
              <div className="sv">{state.items.length.toLocaleString("pt-BR")}</div>
            </div>
            <div className="sync-stat">
              <div className="sk">Páginas lidas</div>
              <div className="sv">{state.pagesRead}</div>
            </div>
            <div className="sync-stat">
              <div className="sk">Tempo</div>
              <div className="sv">{formatDuration(state.elapsedMs)}</div>
            </div>
            <div className="sync-stat">
              <div className="sk">Ritmo</div>
              <div className="sv">{offersPerSecond}<small> ofertas/s</small></div>
            </div>
            {state.skipped.length > 0 && (
              <div className="sync-stat">
                <div className="sk">Com falha na ZF</div>
                <div className="sv" style={{ color: "var(--rose)" }}>{state.skipped.length}</div>
              </div>
            )}
            <div className="sync-stat sync-state">
              {state.status === "running" && <span className="badge blue">BAIXANDO</span>}
              {state.status === "paused" && <span className="badge amber">PAUSADO</span>}
              {state.status === "done" && <span className="badge green">CONCLUÍDO</span>}
              {state.status === "error" && <span className="badge rose">ERRO</span>}
            </div>
          </div>

          {/* Sem total de registros na API, a barra é indeterminada de propósito. */}
          {state.status === "running" && <div className="sync-bar"><span /></div>}

          {state.retrying && (
            <div className="sync-note amber">
              {state.retrying.reason} — aguardando {Math.round(state.retrying.waitMs / 1000)}s antes da
              tentativa {state.retrying.attempt + 1}.
            </div>
          )}

          {state.recovering && (
            <div className="sync-note amber">
              {state.recovering.kind === "reduzindo"
                ? `A ZF falhou nesta página. Reduzindo para ${state.recovering.pageSize} ofertas por chamada para isolar o registro com problema…`
                : `O registro na posição ${state.recovering.offset} não pode ser lido pela ZF. Pulando e seguindo em frente…`}
            </div>
          )}

          {state.skipped.length > 0 && (
            <div className="sync-note rose">
              <strong>
                {state.skipped.length} registro(s) que a ZF não consegue entregar (HTTP 500 no servidor
                deles). O resto do catálogo foi baixado normalmente.
              </strong>
              <div className="skipped-list">
                {state.skipped.slice(0, 5).map((item) => (
                  <div key={item.offset} className="skipped-item">
                    <span className="so">posição {item.offset}</span>
                    <span className="se">{extractZfDetail(item.error).slice(0, 180)}</span>
                    {item.correlationId && <span className="sc">{item.correlationId}</span>}
                  </div>
                ))}
                {state.skipped.length > 5 && (
                  <div className="skipped-item"><span className="se">…e mais {state.skipped.length - 5}.</span></div>
                )}
              </div>
              <button
                className="btn btn-ghost"
                style={{ marginTop: "10px", padding: "6px 12px", fontSize: "12px" }}
                onClick={() =>
                  onCopy(
                    state.skipped
                      .map((item) => `offset ${item.offset} | correlationId ${item.correlationId ?? "-"} | ${item.error}`)
                      .join("\n"),
                    "Falhas copiadas — envie ao suporte da ZF",
                  )
                }
              >
                Copiar falhas para o suporte da ZF
              </button>
            </div>
          )}

          {state.status === "error" && (
            <div className="sync-note rose">
              {state.error}
              {state.items.length > 0 && " As ofertas já baixadas continuam disponíveis para exportar."}
            </div>
          )}

          {state.status === "done" && state.stopReason && (
            <div className="sync-note">{STOP_REASON_LABEL[state.stopReason]}</div>
          )}
        </section>
      )}

      {/* Tabela do que já foi baixado */}
      {state.items.length > 0 && (
        <section className="card" style={{ marginTop: "22px" }}>
          <div className="card-head">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v4H3z"/><path d="M5 7v14h14V7"/><path d="M9 12h6"/></svg>
            </span>
            <h2>Catálogo baixado</h2>
            <span className="count">
              {search
                ? `${processed.length.toLocaleString("pt-BR")} de ${state.items.length.toLocaleString("pt-BR")}`
                : `${state.items.length.toLocaleString("pt-BR")} ofertas`}
            </span>
            <div style={{ marginLeft: "auto", minWidth: "240px" }}>
              <input
                className="input"
                placeholder="Buscar no que já foi baixado…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setVisiblePage(0); }}
              />
            </div>
          </div>

          <OffersTable
            offers={visibleRows}
            selectedReference={selectedReference}
            onSelect={onSelectOffer}
            sort={sort}
            onSortChange={(next) => { setSort(next); setVisiblePage(0); }}
            preSorted
            renderExpanded={renderOfferDetail}
          />

          <div className="pager">
            <span className="info">
              {processed.length === 0
                ? "nenhuma linha"
                : `${(currentPage * CATALOG_VIEW_PAGE_SIZE + 1).toLocaleString("pt-BR")}–${Math.min((currentPage + 1) * CATALOG_VIEW_PAGE_SIZE, processed.length).toLocaleString("pt-BR")} de ${processed.length.toLocaleString("pt-BR")}`}
            </span>
            <span className="grow"></span>
            <button className="btn btn-ghost" disabled={currentPage === 0} onClick={() => setVisiblePage(currentPage - 1)}>
              ← Anterior
            </button>
            <span className="info">página {currentPage + 1} de {totalViewPages}</span>
            <button
              className="btn btn-ghost"
              disabled={currentPage >= totalViewPages - 1}
              onClick={() => setVisiblePage(currentPage + 1)}
            >
              Próxima →
            </button>
          </div>
        </section>
      )}
    </>
  );
}
