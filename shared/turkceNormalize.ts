// Türkçe firma unvanlarını karşılaştırılabilir hale getirir.
// "CNC NAKLİYE HİZMETLERİ A.Ş." ve "cnc nakliye hizmetleri aş" aynı sonucu verir.

const SIRKET_EKLERI = [
  "ANONIM SIRKETI", "LIMITED SIRKETI", "KOLLEKTIF SIRKETI",
  "A S", "AS", "LTD STI", "LTD", "STI", "SAN", "TIC", "SANAYI", "TICARET", "VE",
];

/**
 * Türkçe karakterleri ASCII karşılığına çevirir, noktalama ve şirket eklerini
 * atar, çoklu boşlukları teke indirir.
 *
 * NOT: İ/ı dönüşümü JavaScript'in toUpperCase()'inde doğru çalışmaz
 * ("i".toUpperCase() === "I" ama Türkçe'de "İ" olmalı). Bu yüzden harf
 * eşlemesi elle yapılır, sonra toUpperCase() çağrılır.
 */
export function normalizeFirmaAdi(s: string): string {
  if (!s) return "";
  const harfler: Record<string, string> = {
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i",
    "İ": "i", "i": "i", "ö": "o", "Ö": "o", "ş": "s", "Ş": "s",
    "ü": "u", "Ü": "u",
  };
  let t = s.replace(/[çÇğĞıIİiöÖşŞüÜ]/g, (m) => harfler[m] ?? m).toUpperCase();
  t = t.replace(/[^A-Z0-9 ]/g, " ");          // noktalama → boşluk
  t = t.replace(/\s+/g, " ").trim();
  const kelimeler = t.split(" ").filter((k) => k.length > 0);
  // Şirket eklerini at — çok kelimeli ekler önce denenir
  let sonuc = kelimeler.join(" ");
  for (const ek of SIRKET_EKLERI) {
    sonuc = sonuc.replace(new RegExp(`(^| )${ek}( |$)`, "g"), " ");
  }
  return sonuc.replace(/\s+/g, " ").trim();
}

/**
 * İki firma adı arasındaki benzerliği 0-100 arası döndürür.
 * Ortak kelime oranına dayanır (Jaccard). Tam eşleşme 100.
 */
export function firmaAdiBenzerligi(a: string, b: string): number {
  const na = normalizeFirmaAdi(a);
  const nb = normalizeFirmaAdi(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  const sa = new Set(na.split(" "));
  const sb = new Set(nb.split(" "));
  let kesisim = 0;
  sa.forEach((k) => { if (sb.has(k)) kesisim++; });
  const birlesim = new Set([...Array.from(sa), ...Array.from(sb)]).size;
  return Math.round((kesisim / birlesim) * 100);
}
