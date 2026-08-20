import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** netPrice chega como string ("1000.00"); formata em BRL sem perder o original. */
export function formatPrice(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** A API devolve datas como "2020-03-15 00:00:00" (sem timezone). */
export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatQuantity(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("pt-BR") : String(value);
}

/** Separa referências coladas de uma planilha: vírgula, ponto-e-vírgula ou quebra de linha. */
export function splitReferences(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function maskSecret(value: string): string {
  if (!value) return "—";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(6)}${value.slice(-4)}`;
}

/**
 * Datas de pedido vêm em UTC ("2024-04-01 23:59:59", sem indicador de fuso).
 *
 * `new Date("2024-04-01T23:59:59")` interpreta a string como horário **local**,
 * não UTC — é o comportamento que a especificação manda para data-hora sem
 * offset. No Brasil (UTC-3) isso mostraria todo pedido 3 horas adiantado, e um
 * pedido do fim do dia apareceria no dia seguinte. Daí o "Z" explícito.
 */
export function parseUtcDate(value?: string | null): Date | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  // Se já vier com fuso (Z ou ±HH:MM), respeita o que veio.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  const date = new Date(hasZone ? text.replace(" ", "T") : `${text.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Data/hora de pedido, convertida de UTC para o fuso do navegador. */
export function formatDateUtc(value?: string | null): string {
  if (!value) return "—";
  const date = parseUtcDate(value);
  if (!date) return String(value);
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Só a data, para colunas de tabela onde a hora é ruído. */
export function formatDayUtc(value?: string | null): string {
  if (!value) return "—";
  const date = parseUtcDate(value);
  if (!date) return String(value);
  return date.toLocaleDateString("pt-BR", { dateStyle: "short" });
}

/**
 * Converte a data escolhida no <input type="date"> (calendário local) para o
 * "YYYY-MM-DD HH:MM:SS" em UTC que a API espera.
 *
 * Sem essa conversão, filtrar "01/04 a 30/04" no Brasil perderia os pedidos
 * feitos depois das 21h do dia 30 — eles já estão no dia 1º em UTC.
 */
export function localDateToUtcParam(date: string, edge: "start" | "end"): string {
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "";

  const local = edge === "start"
    ? new Date(year, month - 1, day, 0, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59);

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`
  );
}
