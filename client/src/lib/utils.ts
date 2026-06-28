import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: string | number | null): string {
  if (value === null || value === undefined) return "₺0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// Tam rakam, ondalıksız — KPI ve liste tutarları için (₺78.420.000)
export function formatCurrencyFull(value: string | number | null): string {
  if (value === null || value === undefined) return "₺0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "₺0";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatCurrencyShort(value: number): string {
  // Türkçe ondalık ayracı virgül (₺48,2M) — referans ve TrendChart ile tutarlı
  if (value >= 1000000) {
    return `₺${(value / 1000000).toFixed(1).replace(".", ",")}M`;
  }
  if (value >= 1000) {
    return `₺${(value / 1000).toFixed(0)}K`;
  }
  return `₺${value.toFixed(0)}`;
}
