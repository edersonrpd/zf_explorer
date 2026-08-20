import { useCallback, useRef, useState } from "react";
import { CrawlProgress, CrawlStopReason, SkippedRecord, crawlAll } from "../lib/crawl";

export type SyncStatus = "idle" | "running" | "paused" | "done" | "error";

export interface SyncState<T> {
  status: SyncStatus;
  items: T[];
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

const INITIAL: SyncState<never> = {
  status: "idle",
  items: [],
  pagesRead: 0,
  requestCount: 0,
  currentPageSize: 0,
  skipped: [],
  startedAt: null,
  elapsedMs: 0,
};

export interface StartOptions<T> {
  fetchPage: (offset: number, limit: number) => Promise<T[]>;
  keyOf: (item: T) => string | undefined;
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
export function useCatalogSync<T>() {
  const [state, setState] = useState<SyncState<T>>(INITIAL);

  const bufferRef = useRef<T[]>([]);
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const runningRef = useRef(false);

  const waitWhilePaused = useCallback(async () => {
    while (pauseRef.current && !cancelRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }, []);

  const start = useCallback(
    async ({ fetchPage, keyOf, pageSize, delayMs, maxPages }: StartOptions<T>) => {
      if (runningRef.current) return;
      runningRef.current = true;
      cancelRef.current = false;
      pauseRef.current = false;
      bufferRef.current = [];

      const startedAt = Date.now();
      setState({ ...INITIAL, status: "running", startedAt, currentPageSize: pageSize });

      const result = await crawlAll<T>({
        fetchPage,
        keyOf,
        pageSize,
        delayMs,
        maxPages,
        isCancelled: () => cancelRef.current,
        waitWhilePaused,
        onPage: (newItems, progress) => {
          if (newItems.length > 0) bufferRef.current = bufferRef.current.concat(newItems);
          setState((prev) => ({
            ...prev,
            status: pauseRef.current ? "paused" : "running",
            items: bufferRef.current,
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
        items: result.items,
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
