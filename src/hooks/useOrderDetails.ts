import { useCallback, useRef, useState } from "react";
import { getOrder } from "../services/zfService";
import { ZfCredentials, ZfOrder, ZfOrderSummary } from "../types";

export interface OrderDetailEntry {
  order?: ZfOrder;
  correlationId?: string;
  loading: boolean;
  error?: string;
}

export interface BulkProgress {
  done: number;
  total: number;
  failed: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cache dos detalhes de pedido.
 *
 * A listagem (GET /orders) não traz `items`, `billingAddress` nem
 * `settlementDate` — só o detalhe traz. Como cada detalhe é uma chamada, o
 * resultado fica em cache: reabrir um pedido já visto não gera tráfego novo, e
 * a exportação com itens reaproveita o que já foi carregado.
 */
export function useOrderDetails(credentials: ZfCredentials) {
  const [details, setDetails] = useState<Map<string, OrderDetailEntry>>(new Map());
  const [bulk, setBulk] = useState<BulkProgress | null>(null);
  const inFlight = useRef<Set<string>>(new Set());
  const cancelBulk = useRef(false);

  /**
   * Espelho síncrono do cache.
   *
   * Ler o estado de dentro de um updater de `setState` não funciona: o React
   * só executa o updater na renderização seguinte, então a leitura devolveria
   * `undefined` e todo reabrir de pedido geraria uma chamada nova à API. O ref
   * é atualizado junto com o estado e pode ser lido na hora.
   */
  const cacheRef = useRef<Map<string, OrderDetailEntry>>(new Map());

  const update = useCallback((reference: string, entry: OrderDetailEntry) => {
    const next = new Map(cacheRef.current);
    next.set(reference, entry);
    cacheRef.current = next;
    setDetails(next);
  }, []);

  const load = useCallback(
    async (reference: string, { force = false }: { force?: boolean } = {}) => {
      if (!reference) return;
      if (inFlight.current.has(reference)) return;

      const cached = cacheRef.current.get(reference);
      if (!force && cached?.order) return;

      inFlight.current.add(reference);
      update(reference, { loading: true });
      try {
        const { order, correlationId } = await getOrder(credentials, reference);
        update(reference, { order, correlationId, loading: false });
      } catch (error) {
        update(reference, { loading: false, error: (error as Error).message });
      } finally {
        inFlight.current.delete(reference);
      }
    },
    [credentials, update],
  );

  /**
   * Carrega o detalhe de vários pedidos em sequência, com pausa entre eles.
   * Serializado de propósito: um lote em paralelo derruba o rate limit da ZF,
   * e aqui o ganho de tempo não compensaria o risco de tomar 429 no meio.
   */
  const loadMany = useCallback(
    async (orders: ZfOrderSummary[], delayMs = 150) => {
      cancelBulk.current = false;
      const pending = orders.map((order) => order.merchantOrderReference).filter(Boolean);
      let done = 0;
      let failed = 0;
      setBulk({ done: 0, total: pending.length, failed: 0 });

      for (const reference of pending) {
        if (cancelBulk.current) break;
        await load(reference);
        done += 1;
        // O cache é a fonte da verdade sobre sucesso/erro, e o ref pode ser
        // consultado imediatamente após o await.
        if (cacheRef.current.get(reference)?.error) failed += 1;
        setBulk({ done, total: pending.length, failed });
        if (delayMs > 0) await sleep(delayMs);
      }

      setBulk(null);
    },
    [load],
  );

  const stopBulk = useCallback(() => { cancelBulk.current = true; }, []);

  const reset = useCallback(() => {
    cancelBulk.current = true;
    inFlight.current.clear();
    cacheRef.current = new Map();
    setDetails(new Map());
    setBulk(null);
  }, []);

  /** Só os detalhes carregados com sucesso, no formato que a exportação espera. */
  const loadedOrders = useCallback((): Map<string, ZfOrder> => {
    const map = new Map<string, ZfOrder>();
    details.forEach((entry, reference) => {
      if (entry.order) map.set(reference, entry.order);
    });
    return map;
  }, [details]);

  return { details, bulk, load, loadMany, stopBulk, reset, loadedOrders };
}
