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

/**
 * Tarihi epoch gününe çevirir (karşılaştırma için). Üç biçim tanınır:
 *   YYYY-MM-DD, DD.MM.YYYY ve EXCEL SERİ NUMARASI.
 *
 * Excel serisi kritik: gumruk_verileri.tescil_tarihi Excel import'undan
 * "46223" gibi ham seri numarası tutabiliyor (canlıda doğrulandı). Bu biçim
 * tanınmazsa tarih kırıcısı sessizce devre dışı kalır.
 *
 * new Date(...) ile parse EDİLMEZ — timezone kayması hatası (commit c897dff).
 */
export function gunSayisi(tarih: string | null | undefined): number | null {
  if (!tarih) return null;
  const t = String(tarih).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const [y, a, g] = t.slice(0, 10).split("-").map(Number);
    if (!y || !a || !g) return null;
    return Math.floor(Date.UTC(y, a - 1, g) / 86400_000);
  }
  if (/^\d{2}\.\d{2}\.\d{4}/.test(t)) {
    const [g, a, y] = t.slice(0, 10).split(".").map(Number);
    if (!y || !a || !g) return null;
    return Math.floor(Date.UTC(y, a - 1, g) / 86400_000);
  }
  // Excel seri numarası: 1899-12-30 tabanlı. Epoch (1970-01-01) = 25569.
  if (/^\d{4,6}$/.test(t)) {
    const seri = Number(t);
    if (seri >= 20000 && seri <= 60000) return seri - 25569;
  }
  return null;
}

/**
 * Paraşüt otomasyonunun devreye girdiği tarih.
 *
 * Bu tarihten ÖNCEKİ navlun faturalarının tamamı elle işlendi: alış faturaları
 * muhasebeye elle girildi, müşteri faturaları Paraşüt'te elle kesildi
 * (kullanıcı 2026-07-30'da doğruladı). Sistem onları "bekliyor" göstermemeli
 * ve faturalamaya aday saymamalı — 269 kayıt bu durumda.
 */
export const SISTEM_BASLANGIC = "2026-07-01";
const SISTEM_BASLANGIC_GUN = gunSayisi(SISTEM_BASLANGIC)!;

/**
 * Fatura, sistem devreye girmeden önceki döneme mi ait?
 * Tarihi çözülemeyen kayıt için false döner — bilinmeyeni "elle işlendi"
 * saymak, gerçekten bekleyen bir faturayı gizlerdi.
 */
export function sistemOncesiMi(faturaTarihi: string | null | undefined): boolean {
  const gun = gunSayisi(faturaTarihi);
  return gun !== null && gun < SISTEM_BASLANGIC_GUN;
}
