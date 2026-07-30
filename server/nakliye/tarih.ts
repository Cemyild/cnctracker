/**
 * Nakliye modülünün tarih görüntüleme biçimlendiricisi.
 *
 * Ayrı dosyada olmasının sebebi: aynı işi yapan ikinci bir kopya, eşleştirmede
 * yaşanan sapmanın aynısını tarihlerde yaratır. Tek tanım, tek davranış.
 */

/**
 * Tarihi gg.aa.yyyy biçimine çevirir. Üç girdi biçimi tanınır:
 *   YYYY-MM-DD, DD.MM.YYYY ve EXCEL SERİ NUMARASI (örn. 46223 —
 *   gumruk_verileri.tescil_tarihi Excel import'undan böyle gelebiliyor).
 *
 * Tanınmayan değer olduğu gibi geri döner (veri kaybetmemek için).
 *
 * new Date() ile PARSE EDİLMEZ — timezone kayması off-by-one hatası
 * (commit c897dff). Excel serisinde new Date yalnızca UTC aritmetiği için
 * kullanılır, yerel saate hiç dokunulmaz.
 */
export function tarihGoster(t: string | null | undefined): string {
  const s = String(t ?? "").trim();
  if (!s) return "";
  if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, a, g] = s.slice(0, 10).split("-");
    return `${g}.${a}.${y}`;
  }
  if (/^\d{4,6}$/.test(s)) {
    const seri = Number(s);
    if (seri >= 20000 && seri <= 60000) {
      const d = new Date((seri - 25569) * 86400_000);
      const g = String(d.getUTCDate()).padStart(2, "0");
      const a = String(d.getUTCMonth() + 1).padStart(2, "0");
      return `${g}.${a}.${d.getUTCFullYear()}`;
    }
  }
  return s;
}
