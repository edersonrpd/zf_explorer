import { Fragment, useCallback, useMemo, useState } from "react";
import { CatalogPanel, SyncSettings } from "./components/CatalogPanel";
import { JsonDrawer } from "./components/JsonDrawer";
import { OfferDetail } from "./components/OfferDetail";
import { OfferFiltersFields } from "./components/OfferFiltersFields";
import { OffersTable } from "./components/OffersTable";
import { BATCH_DELAY_MS, DEFAULT_FILTERS, PAGE_SIZES, STORAGE_KEYS, SYNC_DEFAULTS } from "./constants";
import { useCatalogSync } from "./hooks/useCatalogSync";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { exportLookupResultsToExcel, exportOffersToCsv, exportOffersToExcel } from "./lib/export";
import { maskSecret, splitReferences } from "./lib/utils";
import { getOffer, getOffers } from "./services/zfService";
import { OfferFilters, OfferLookupResult, ZfCredentials, ZfOffer } from "./types";

const TABS = ["Oferta Única", "Buscar Ofertas", "Catálogo Completo"] as const;
type Tab = (typeof TABS)[number];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const [credentials, setCredentials] = useLocalStorage<ZfCredentials>(STORAGE_KEYS.credentials, {
    clientId: "",
    clientSecret: "",
  });
  const [showCredentials, setShowCredentials] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Oferta Única");

  // --- Aba "Oferta Única" ---
  const [references, setReferences] = useLocalStorage<string>(STORAGE_KEYS.lastReferences, "");
  const [lookupResults, setLookupResults] = useState<OfferLookupResult[]>([]);
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupProgress, setLookupProgress] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // --- Aba "Buscar Ofertas" ---
  const [filters, setFilters] = useLocalStorage<OfferFilters>(STORAGE_KEYS.lastFilters, DEFAULT_FILTERS);
  const [offers, setOffers] = useState<ZfOffer[]>([]);
  const [offersLoaded, setOffersLoaded] = useState(false);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [offersCorrelationId, setOffersCorrelationId] = useState<string | undefined>();
  const [selectedOffer, setSelectedOffer] = useState<ZfOffer | null>(null);

  // --- Aba "Catálogo Completo" ---
  const sync = useCatalogSync();
  const [syncSettings, setSyncSettings] = useLocalStorage<SyncSettings>(STORAGE_KEYS.syncSettings, SYNC_DEFAULTS);

  // --- UI compartilhada ---
  const [toast, setToast] = useState<string | null>(null);
  const [jsonDrawer, setJsonDrawer] = useState<{ data: unknown; title: string; subtitle?: string } | null>(null);

  const hasCredentials = Boolean(credentials.clientId && credentials.clientSecret);

  const displayToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const copyToClipboard = useCallback(
    (value: string, label: string) => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(value);
        displayToast(label);
      }
    },
    [displayToast],
  );

  const selectedLookup = useMemo(
    () => lookupResults.find((result) => result.reference === selectedReference) ?? null,
    [lookupResults, selectedReference],
  );

  /* ------------------------------------------------------------------ */
  /* Consulta de ofertas por referência (uma ou várias)                  */
  /* ------------------------------------------------------------------ */
  const handleLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setLookupError(null);

    if (!hasCredentials) {
      setShowCredentials(true);
      setLookupError("Preencha o CLIENT_ID e o CLIENT_SECRET da ZF para consultar.");
      return;
    }

    const list = splitReferences(references);
    if (list.length === 0) {
      setLookupError("Informe ao menos uma referência de oferta (productOfferReference).");
      return;
    }

    setLookupLoading(true);
    setSelectedReference(null);
    setLookupResults(list.map((reference) => ({ reference, status: "pending" as const })));

    const finished: OfferLookupResult[] = [];

    // Serializado de propósito: a API é por referência e um lote grande em
    // paralelo derruba o rate limit da ZF.
    for (let index = 0; index < list.length; index++) {
      const reference = list[index];
      setLookupProgress(`Consultando ${index + 1} de ${list.length}: ${reference}`);
      setLookupResults((prev) =>
        prev.map((item) => (item.reference === reference ? { ...item, status: "loading" } : item)),
      );

      let result: OfferLookupResult;
      try {
        const { offer, correlationId } = await getOffer(credentials, reference);
        result = { reference, status: "success", data: offer, correlationId };
      } catch (error) {
        const err = error as Error & { status?: number };
        result = {
          reference,
          status: err.status === 404 ? "not_found" : "error",
          errorMsg: err.message,
        };
      }

      finished.push(result);
      setLookupResults((prev) => prev.map((item) => (item.reference === reference ? result : item)));

      if (index < list.length - 1) await sleep(BATCH_DELAY_MS);
    }

    setLookupProgress(null);
    setLookupLoading(false);

    const toSelect =
      finished.find((item) => item.status === "success") ??
      (finished.length === 1 ? finished[0] : undefined);
    if (toSelect) setSelectedReference(toSelect.reference);

    const failures = finished.filter((item) => item.status !== "success").length;
    displayToast(
      failures === 0
        ? `${finished.length} oferta(s) consultada(s) com sucesso.`
        : `${finished.length - failures} encontrada(s), ${failures} com problema.`,
    );
  };

  /* ------------------------------------------------------------------ */
  /* Busca de ofertas com filtros                                        */
  /* ------------------------------------------------------------------ */
  const runSearch = async (nextFilters: OfferFilters) => {
    setOffersError(null);

    if (!hasCredentials) {
      setShowCredentials(true);
      setOffersError("Preencha o CLIENT_ID e o CLIENT_SECRET da ZF para consultar.");
      return;
    }

    setOffersLoading(true);
    setSelectedOffer(null);
    try {
      const { offers: found, correlationId } = await getOffers(credentials, nextFilters);
      setOffers(found);
      setOffersCorrelationId(correlationId);
      setOffersLoaded(true);
      displayToast(`${found.length} oferta(s) retornada(s).`);
    } catch (error) {
      setOffers([]);
      setOffersLoaded(true);
      setOffersError((error as Error).message);
    } finally {
      setOffersLoading(false);
    }
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const reset = { ...filters, offset: 0 };
    setFilters(reset);
    void runSearch(reset);
  };

  const goToPage = (direction: -1 | 1) => {
    const nextOffset = Math.max(0, filters.offset + direction * filters.limit);
    const next = { ...filters, offset: nextOffset };
    setFilters(next);
    void runSearch(next);
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setOffers([]);
    setOffersLoaded(false);
    setOffersError(null);
  };

  const updateFilter = <K extends keyof OfferFilters>(key: K, value: OfferFilters[K]) =>
    setFilters({ ...filters, [key]: value });

  /** Só linhas com algo a mostrar (oferta ou erro) abrem; clicar de novo fecha. */
  const toggleSelectedReference = (result: OfferLookupResult) => {
    if (result.status !== "success" && !result.errorMsg) return;
    setSelectedReference((current) => (current === result.reference ? null : result.reference));
  };

  /** Clicar de novo na linha já aberta fecha o detalhe. */
  const toggleSelectedOffer = (offer: ZfOffer) =>
    setSelectedOffer((current) =>
      current?.productOfferReference === offer.productOfferReference ? null : offer,
    );

  const startCatalogSync = () => {
    if (!hasCredentials) {
      setShowCredentials(true);
      displayToast("Informe o CLIENT_ID e o CLIENT_SECRET antes de baixar o catálogo.");
      return;
    }
    // offset/limit da aba de busca não valem aqui — quem pagina é o crawler.
    const { offset: _offset, limit: _limit, ...contentFilters } = filters;
    void sync.start({
      credentials,
      filters: contentFilters,
      pageSize: syncSettings.pageSize,
      delayMs: syncSettings.delayMs,
      maxPages: syncSettings.maxPages,
    });
  };

  const successCount = lookupResults.filter((item) => item.status === "success").length;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
          </div>
          <span className="brand-name">ZF <b>API</b> Explorer</span>
        </div>
        <span className="topbar-right">PRO-PARTS RETAILER V1</span>
      </header>

      <div className="shell">
        <nav className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* Barra de credenciais — compartilhada pelas duas abas */}
        <section className="conn">
          {showCredentials && (
            <div className="conn-edit">
              <div className="conn-edit-grid">
                <div className="field">
                  <label htmlFor="clientId">CLIENT_ID</label>
                  <input
                    id="clientId"
                    className="input mono"
                    type="password"
                    autoComplete="off"
                    placeholder="Client-ID da aplicação ZF"
                    value={credentials.clientId}
                    onChange={(e) => setCredentials({ ...credentials, clientId: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="clientSecret">CLIENT_SECRET</label>
                  <input
                    id="clientSecret"
                    className="input mono"
                    type="password"
                    autoComplete="off"
                    placeholder="Client-Secret da aplicação ZF"
                    value={credentials.clientSecret}
                    onChange={(e) => setCredentials({ ...credentials, clientSecret: e.target.value })}
                  />
                </div>
              </div>
              <p style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "12px" }}>
                As credenciais ficam salvas apenas no localStorage deste navegador e são enviadas
                somente para o proxy da própria aplicação, que as repassa como headers para a ZF.
                Em produção você pode definir <code>ZF_CLIENT_ID</code> e <code>ZF_CLIENT_SECRET</code> como
                variáveis de ambiente na Vercel — nesse caso elas têm prioridade e ninguém precisa digitá-las aqui.
              </p>
            </div>
          )}

          <div className="conn-row">
            <div className="conn-status">
              <span className={`pulse ${hasCredentials ? "" : "off"}`}></span>
              <div>
                <div className="lbl">{hasCredentials ? "Credenciais configuradas" : "Sem credenciais"}</div>
                <div className="sub">
                  {hasCredentials ? "Prontas para consultar" : "Informe CLIENT_ID e CLIENT_SECRET"}
                </div>
              </div>
            </div>
            <div className="chips">
              <span className="chip">
                <span className="k">client_id</span>
                <span className="v">{maskSecret(credentials.clientId)}</span>
              </span>
              <span className="chip">
                <span className="k">client_secret</span>
                <span className="v">{maskSecret(credentials.clientSecret)}</span>
              </span>
              <span className="chip">
                <span className="k">base</span>
                <span className="v">api.pro-parts.com</span>
              </span>
            </div>
            <div className="conn-spacer"></div>
            <button className="link-btn" onClick={() => setShowCredentials((value) => !value)}>
              {showCredentials ? "Ocultar credenciais" : "Editar credenciais"}
            </button>
          </div>
        </section>

        {/* ---------------- Aba: Oferta Única ---------------- */}
        {activeTab === "Oferta Única" && (
          <>
            <form className="conn" onSubmit={handleLookup} style={{ marginTop: "16px" }}>
              <div className="conn-row" style={{ alignItems: "flex-end" }}>
                <div className="field" style={{ flex: 1, minWidth: "260px" }}>
                  <label htmlFor="references">
                    productOfferReference — uma ou várias, separadas por vírgula ou quebra de linha
                  </label>
                  <textarea
                    id="references"
                    className="input mono"
                    placeholder="offer_MER000002-bosch__0-280-156-096"
                    value={references}
                    onChange={(e) => setReferences(e.target.value)}
                    style={{ height: "42px", minHeight: "42px", maxHeight: "180px", resize: "vertical", padding: "9px 12px" }}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={lookupLoading} style={{ height: "42px" }}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                  {lookupLoading ? "Consultando..." : "Consultar oferta(s)"}
                </button>
              </div>
            </form>

            {lookupError && (
              <div className="alert error">
                <strong>Erro de consulta</strong>
                {lookupError}
              </div>
            )}

            {lookupProgress && (
              <div className="alert info">
                <span className="pulse"></span>
                {lookupProgress}
              </div>
            )}

            {lookupResults.length > 1 && (
              <section className="card" style={{ marginTop: "22px" }}>
                <div className="card-head">
                  <span className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                  </span>
                  <h2>Resumo da consulta</h2>
                  <span className="count">{successCount} de {lookupResults.length} encontrada(s)</span>
                  <button
                    className="btn btn-ghost"
                    style={{ marginLeft: "12px", padding: "6px 12px", fontSize: "12px" }}
                    onClick={() => {
                      void exportLookupResultsToExcel(lookupResults);
                      displayToast("Exportando planilha...");
                    }}
                  >
                    Exportar (XLSX)
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Referência</th>
                        <th>Marca</th>
                        <th>Part Number</th>
                        <th className="num">Qtd.</th>
                        <th className="num">Net Price</th>
                        <th>Resultado</th>
                        <th style={{ width: "38px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lookupResults.map((result) => {
                        const isOpen = selectedReference === result.reference;
                        return (
                          <Fragment key={result.reference}>
                            <tr
                              className={`row ${isOpen ? "selected" : ""}`}
                              onClick={() => toggleSelectedReference(result)}
                            >
                              <td className="mono" style={{ maxWidth: "320px", wordBreak: "break-all" }}>{result.reference}</td>
                              <td>{result.data?.brand || "—"}</td>
                              <td className="mono">{result.data?.partNumber || "—"}</td>
                              <td className="num">{result.data?.quantity ?? "—"}</td>
                              <td className="num">{result.data?.netPrice ?? "—"}</td>
                              <td>
                                {result.status === "success" && <span className="badge green">ENCONTRADA</span>}
                                {result.status === "not_found" && <span className="badge amber">NÃO ENCONTRADA</span>}
                                {result.status === "error" && <span className="badge rose">ERRO</span>}
                                {result.status === "loading" && <span className="badge blue">CONSULTANDO</span>}
                                {result.status === "pending" && <span className="badge gray">NA FILA</span>}
                              </td>
                              <td className="chev-cell">
                                {(result.status === "success" || result.errorMsg) && (
                                  <span className={`chev ${isOpen ? "open" : ""}`} aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                  </span>
                                )}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="detail-row">
                                <td className="detail-cell" colSpan={7}>
                                  <div className="detail-inner">
                                    {result.status === "success" && result.data ? (
                                      <OfferDetail
                                        offer={result.data}
                                        correlationId={result.correlationId}
                                        onCopy={copyToClipboard}
                                        onOpenJson={() =>
                                          setJsonDrawer({
                                            data: result.data,
                                            title: "GET /offers/:productOfferReference",
                                            subtitle: result.correlationId ? `x-correlation-id ${result.correlationId}` : undefined,
                                          })
                                        }
                                      />
                                    ) : (
                                      <div className="alert error" style={{ marginTop: 0 }}>
                                        <strong>{result.reference}</strong>
                                        {result.errorMsg}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {lookupResults.length === 1 && selectedLookup?.status === "success" && selectedLookup.data && (
              <>
                <div className="results-head">
                  <h1>
                    Oferta <span>{selectedLookup.reference}</span>
                  </h1>
                  <div className="results-actions">
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        void exportOffersToExcel([selectedLookup.data!], "ZF_Oferta");
                        displayToast("Exportando planilha...");
                      }}
                    >
                      Exportar (XLSX)
                    </button>
                    <button
                      className="btn btn-dark"
                      onClick={() =>
                        setJsonDrawer({
                          data: selectedLookup.data,
                          title: "GET /offers/:productOfferReference",
                          subtitle: selectedLookup.correlationId ? `x-correlation-id ${selectedLookup.correlationId}` : undefined,
                        })
                      }
                    >
                      Ver JSON
                    </button>
                  </div>
                </div>
                <OfferDetail
                  offer={selectedLookup.data}
                  correlationId={selectedLookup.correlationId}
                  onCopy={copyToClipboard}
                  onOpenJson={() =>
                    setJsonDrawer({
                      data: selectedLookup.data,
                      title: "GET /offers/:productOfferReference",
                      subtitle: selectedLookup.correlationId ? `x-correlation-id ${selectedLookup.correlationId}` : undefined,
                    })
                  }
                />
              </>
            )}

            {lookupResults.length === 1 && selectedLookup && selectedLookup.status !== "success" && (
              <div className="alert error" style={{ marginTop: "22px" }}>
                <strong>{selectedLookup.reference}</strong>
                {selectedLookup.errorMsg}
              </div>
            )}

            {lookupResults.length === 0 && !lookupLoading && (
              <div className="card" style={{ marginTop: "22px" }}>
                <div className="empty-state">
                  <div className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                  </div>
                  <h3>Consulte uma oferta pela referência</h3>
                  <p>
                    Cole uma ou mais <code>productOfferReference</code> no campo acima. Cada referência
                    vira uma chamada a <code>GET /offers/:productOfferReference</code>.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------------- Aba: Buscar Ofertas ---------------- */}
        {activeTab === "Buscar Ofertas" && (
          <>
            <form className="conn" onSubmit={handleSearch} style={{ marginTop: "16px" }}>
              <div className="filters-grid">
                <OfferFiltersFields filters={filters} onChange={updateFilter} idPrefix="f" />
                <div className="field">
                  <label htmlFor="fLimit">page[limit]</label>
                  <select
                    id="fLimit"
                    className="input"
                    value={filters.limit}
                    onChange={(e) => updateFilter("limit", Number(e.target.value))}
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>{size} por página</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="fOffset">page[offset]</label>
                  <input
                    id="fOffset"
                    className="input mono"
                    type="number"
                    min={0}
                    value={filters.offset}
                    onChange={(e) => updateFilter("offset", Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
              </div>
              <div className="filters-foot">
                <button type="submit" className="btn btn-primary" disabled={offersLoading}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                  {offersLoading ? "Buscando..." : "Buscar ofertas"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={clearFilters} disabled={offersLoading}>
                  Limpar filtros
                </button>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                  Sem nenhum filtro, a ZF devolve as ofertas da conta paginadas por offset/limit.
                </span>
              </div>
            </form>

            {offersError && (
              <div className="alert error">
                <strong>Erro de consulta</strong>
                {offersError}
              </div>
            )}

            {offersLoaded && !offersError && (
              <section className="card" style={{ marginTop: "22px" }}>
                <div className="card-head">
                  <span className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v4H3z"/><path d="M5 7v14h14V7"/><path d="M9 12h6"/></svg>
                  </span>
                  <h2>Ofertas</h2>
                  <span className="count">{offers.length} nesta página</span>
                  <button
                    className="btn btn-ghost"
                    style={{ marginLeft: "12px", padding: "6px 12px", fontSize: "12px" }}
                    disabled={offers.length === 0}
                    onClick={() => {
                      void exportOffersToExcel(offers);
                      displayToast("Exportando planilha...");
                    }}
                  >
                    Exportar (XLSX)
                  </button>
                  <button
                    className="btn btn-dark"
                    style={{ marginLeft: "8px", padding: "6px 12px", fontSize: "12px" }}
                    onClick={() =>
                      setJsonDrawer({
                        data: offers,
                        title: "GET /offers",
                        subtitle: offersCorrelationId ? `x-correlation-id ${offersCorrelationId}` : undefined,
                      })
                    }
                  >
                    Ver JSON
                  </button>
                </div>

                {offers.length === 0 ? (
                  <div className="empty-state">
                    <div className="ico">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 21H3V3"/><path d="m7 14 4-4 3 3 5-6"/></svg>
                    </div>
                    <h3>Nenhuma oferta nesta página</h3>
                    <p>
                      Nenhum resultado para os filtros informados. Se o offset for maior que o total
                      de ofertas da conta, a API devolve uma lista vazia — tente voltar uma página.
                    </p>
                  </div>
                ) : (
                  <OffersTable
                    offers={offers}
                    selectedReference={selectedOffer?.productOfferReference}
                    onSelect={toggleSelectedOffer}
                    renderExpanded={(offer) => (
                      <OfferDetail
                        offer={offer}
                        correlationId={offersCorrelationId}
                        onCopy={copyToClipboard}
                        onOpenJson={() =>
                          setJsonDrawer({
                            data: offer,
                            title: "Oferta (item da lista)",
                            subtitle: offer.productOfferReference,
                          })
                        }
                      />
                    )}
                  />
                )}

                <div className="pager">
                  <span className="info">
                    offset {filters.offset} · limit {filters.limit}
                  </span>
                  <span className="grow"></span>
                  <button
                    className="btn btn-ghost"
                    disabled={offersLoading || filters.offset === 0}
                    onClick={() => goToPage(-1)}
                  >
                    ← Página anterior
                  </button>
                  <button
                    className="btn btn-ghost"
                    // A API não devolve total de registros; uma página com menos
                    // itens que o limite significa que chegamos ao fim.
                    disabled={offersLoading || offers.length < filters.limit}
                    onClick={() => goToPage(1)}
                  >
                    Próxima página →
                  </button>
                </div>
              </section>
            )}

            {!offersLoaded && !offersLoading && (
              <div className="card" style={{ marginTop: "22px" }}>
                <div className="empty-state">
                  <div className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
                  </div>
                  <h3>Filtre as ofertas da conta</h3>
                  <p>
                    Combine marca, part number, merchant SKU e status para listar ofertas via
                    <code> GET /offers</code>. Os filtros ficam salvos para a próxima visita.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------------- Aba: Catálogo Completo ---------------- */}
        {activeTab === "Catálogo Completo" && (
          <>
            <CatalogPanel
              state={sync.state}
              settings={syncSettings}
              onSettingsChange={setSyncSettings}
              filters={filters}
              onFilterChange={updateFilter}
              onStart={startCatalogSync}
              onPause={sync.pause}
              onResume={sync.resume}
              onCancel={sync.cancel}
              onReset={sync.reset}
              renderOfferDetail={(offer) => (
                <OfferDetail
                  offer={offer}
                  onCopy={copyToClipboard}
                  onOpenJson={() =>
                    setJsonDrawer({
                      data: offer,
                      title: "Oferta (item do catálogo)",
                      subtitle: offer.productOfferReference,
                    })
                  }
                />
              )}
              onExportXlsx={(offers) => {
                displayToast(`Gerando XLSX com ${offers.length.toLocaleString("pt-BR")} ofertas...`);
                void exportOffersToExcel(offers, "ZF_Catalogo");
              }}
              onExportCsv={(offers) => {
                displayToast(`Gerando CSV com ${offers.length.toLocaleString("pt-BR")} ofertas...`);
                exportOffersToCsv(offers, "ZF_Catalogo");
              }}
              onSelectOffer={toggleSelectedOffer}
              selectedReference={selectedOffer?.productOfferReference}
            />

          </>
        )}
      </div>

      <JsonDrawer
        isOpen={jsonDrawer !== null}
        onClose={() => setJsonDrawer(null)}
        data={jsonDrawer?.data ?? null}
        title={jsonDrawer?.title}
        subtitle={jsonDrawer?.subtitle}
        onToast={displayToast}
      />

      <div className={`toast ${toast ? "show" : ""}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        {toast}
      </div>
    </>
  );
}
