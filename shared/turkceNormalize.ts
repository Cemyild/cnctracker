// Türkçe firma unvanlarını karşılaştırılabilir hale getirir.
// "CNC NAKLİYE HİZMETLERİ A.Ş." ve "cnc nakliye hizmetleri aş" aynı sonucu verir.

// Sıra önemli: çok kelimeli ekler önce elenmeli.
const SIRKET_EKLERI = [
  "ANONIM SIRKETI", "LIMITED SIRKETI", "KOLLEKTIF SIRKETI",
  "IC VE DIS TICARET", "DIS TICARET", "ITHALAT IHRACAT",
  "A S", "AS", "LTD STI", "LTD", "STI",
  "SANAYI", "TICARET", "SAN", "TIC",
  "ITHALAT", "IHRACAT", "IC", "DIS", "VE",
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
 *
 * KAPSAMA (containment) metriği kullanılır, Jaccard değil: karşılaştırılan
 * taraflardan biri müşterinin KISA ADI ("BTS BANT"), diğeri gümrük
 * kaydındaki TAM UNVAN ("BTS BANT İÇ VE DIŞ TİCARET LTD.ŞTİ.") olur.
 * Jaccard uzun unvanı haksız cezalandırıp %50 verirken, kısa adın uzun
 * unvan içinde bulunma oranı doğru cevabı (%100) verir.
 *
 * Tek harfli parçalar gürültü olduğu için elenir.
 */
export function firmaAdiBenzerligi(a: string, b: string): number {
  const na = normalizeFirmaAdi(a);
  const nb = normalizeFirmaAdi(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;

  const sa = new Set(na.split(" ").filter((k) => k.length >= 2));
  const sb = new Set(nb.split(" ").filter((k) => k.length >= 2));
  if (sa.size === 0 || sb.size === 0) return 0;

  const [kisa, uzun] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  let kesisim = 0;
  kisa.forEach((k) => { if (uzun.has(k)) kesisim++; });
  return Math.round((kesisim / kisa.size) * 100);
}

/**
 * Simetrik (Jaccard) benzerlik — kapsama metriğinin 100 verdiği BİRDEN ÇOK
 * adayı kırmak için.
 *
 * Kapsama metriği kısa tarafın tek anlamlı kelimeye inmesine karşı korumasız:
 * "M.F.C. TEKSTİL SANAYİ VE TİCARET LTD." normalize edilince tek harfli
 * parçalar (M, F, C) elendiği için geriye {TEKSTIL} kalır ve
 * {ENYTEKS, TEKSTIL} içinde bulunduğu için %100 verir. Canlıda tam da bu
 * oldu: ENYTEKS'e 100 veren iki cari çıktı, "tek sonuç" şartı bozuldu ve üç
 * fatura "müşteri bulunamadı" diye Paraşüt'e hiç aktarılamadı.
 *
 * Jaccard birleşimi paydaya aldığı için bu kaymayı cezalandırır:
 *   ENYTEKS TEKSTIL vs ENYTEKS TEKSTIL -> 100
 *   ENYTEKS TEKSTIL vs M F C TEKSTIL   ->  50
 *
 * Kapsama metriğinin YERİNE geçmez, YANINDA kullanılır: kapsama "aday mı?"
 * sorusunu, bu ölçü "hangi aday?" sorusunu cevaplar.
 */
export function firmaAdiSimetrikBenzerlik(a: string, b: string): number {
  const na = normalizeFirmaAdi(a);
  const nb = normalizeFirmaAdi(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;

  const sa = new Set(na.split(" ").filter((k) => k.length >= 2));
  const sb = new Set(nb.split(" ").filter((k) => k.length >= 2));
  if (sa.size === 0 || sb.size === 0) return 0;

  let kesisim = 0;
  sa.forEach((k) => { if (sb.has(k)) kesisim++; });
  const birlesim = sa.size + sb.size - kesisim;
  return birlesim === 0 ? 0 : Math.round((kesisim / birlesim) * 100);
}
