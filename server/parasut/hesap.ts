/**
 * Paraşüt'ün purchase_bills.net_total alanı KDV DAHİL ve tevkifat DÜŞÜLMÜŞ
 * tutardır (yani "ödenecek"). Marj tabanı olan matrah türetilmelidir.
 *
 * Canlıda doğrulandı (2026-07-29):
 *   11.600 − 2.000 + 400 = 10.000  (GIB2026000000075)
 *   23.200 − 4.000 + 800 = 20.000  (GIB2026000000074)
 *   34.800 − 6.000 + 1.200 = 30.000 (GIB2026000000076)
 *
 * net_total'ı matrah sanmak HER faturayı yanlış hesaplatır.
 */
export function parasutMatrahTuret(netTotal: number, totalVat: number, tevkifat: number): number {
  return Math.round((netTotal - totalVat + tevkifat) * 100) / 100;
}

/** CNC'de TRY, Paraşüt'te TRL. Diğerleri aynı. */
export function paraBirimiParasut(tr: string): "TRL" | "USD" | "EUR" | "GBP" {
  const u = (tr || "TRY").toUpperCase();
  if (u === "TRY" || u === "TL" || u === "TRL") return "TRL";
  if (u === "USD" || u === "EUR" || u === "GBP") return u;
  return "TRL";
}

/** Paraşüt'ten gelen TRL'yi CNC tarafında TRY olarak saklarız. */
export function paraBirimiCnc(parasut: string): string {
  return (parasut || "TRL").toUpperCase() === "TRL" ? "TRY" : parasut.toUpperCase();
}
