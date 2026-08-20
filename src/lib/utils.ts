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
