import { useCallback, useRef, useState } from "react";
import { CrawlProgress, CrawlStopReason, SkippedRecord, crawlAllOffers } from "../lib/crawlOffers";
import { OfferFilters, ZfCredentials, ZfOffer } from "../types";

export type SyncStatus = "idle" | "running" | "paused" | "done" | "error";

export interface SyncState {
  status: SyncStatus;
  offers: ZfOffer[];
  pagesRead: number;
  requestCount: number;
  /** Cai abaixo do configurado quando o crawler está isolando um registro ruim. */
  currentPageSize: number;
  /** Trechos que a ZF não conseguiu entregar (registro corrompido no servidor). */
  skipped: SkippedRecord[];
  startedAt: number | null;
  elapsedMs: number;
  stopReason?: CrawlStopReason;
  error?: string;
  retrying?: CrawlProgress["retrying"];
  recovering?: CrawlProgress["recovering"];
}

const INITIAL: SyncState = {
  status: "idle",
  offers: [],
  pagesRead: 0,
  requestCount: 0,
  currentPageSize: 0,
  skipped: [],
  startedAt: null,
  elapsedMs: 0,
};

export interface StartOptions {
  credentials: ZfCredentials;
  filters: Partial<OfferFilters>;
  pageSize: number;
  delayMs: number;
  maxPages: number;
}

/**
 * Orquestra a varredura do catálogo mantendo a interface responsiva.
 *
 * As ofertas acumuladas ficam num ref e só são copiadas para o estado a cada
 * página. Com 6 mil registros, re-renderizar a cada oferta travaria a aba; a
 * cada página o React tem folga de sobra.
 */
export function useCatalogSync() {
  const [state, setState] = useState<SyncState>(INITIAL);

  const bufferRef = useRef<ZfOffer[]>([]);
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const runningRef = useRef(false);

  const waitWhilePaused = useCallback(async () => {
    while (pauseRef.current && !cancelRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }, []);

  const start = useCallback(
    async ({ credentials, filters, pageSize, delayMs, maxPages }: StartOptions) => {
      if (runningRef.current) return;
      runningRef.current = true;
      cancelRef.current = false;
      pauseRef.current = false;
      bufferRef.current = [];

      const startedAt = Date.now();
      setState({ ...INITIAL, status: "running", startedAt, currentPageSize: pageSize });

      const result = await crawlAllOffers({
        credentials,
        filters,
        pageSize,
        delayMs,
        maxPages,
        isCancelled: () => cancelRef.current,
        waitWhilePaused,
        onPage: (newOffers, progress) => {
          if (newOffers.length > 0) bufferRef.current = bufferRef.current.concat(newOffers);
          setState((prev) => ({
            ...prev,
            status: pauseRef.current ? "paused" : "running",
            offers: bufferRef.current,
            pagesRead: progress.pagesRead,
            requestCount: progress.requestCount,
            currentPageSize: progress.currentPageSize,
            skipped: progress.skipped.slice(),
            elapsedMs: Date.now() - startedAt,
            retrying: progress.retrying,
            recovering: progress.recovering,
          }));
        },
      });

      runningRef.current = false;
      setState((prev) => ({
        ...prev,
        status: result.stopReason === "erro" ? "error" : "done",
        offers: result.offers,
        pagesRead: result.pagesRead,
        requestCount: result.requestCount,
        skipped: result.skipped,
        elapsedMs: Date.now() - startedAt,
        stopReason: result.stopReason,
        error: result.error,
        retrying: undefined,
        recovering: undefined,
      }));
    },
    [waitWhilePaused],
  );

  const pause = useCallback(() => {
    pauseRef.current = true;
    setState((prev) => (prev.status === "running" ? { ...prev, status: "paused" } : prev));
  }, []);

  const resume = useCallback(() => {
    pauseRef.current = false;
    setState((prev) => (prev.status === "paused" ? { ...prev, status: "running" } : prev));
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    pauseRef.current = false;
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = true;
    pauseRef.current = false;
    bufferRef.current = [];
    setState(INITIAL);
  }, []);

  return { state, start, pause, resume, cancel, reset };
}
