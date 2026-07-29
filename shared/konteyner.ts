// Konteyner numarası normalizasyonu — nakliye faturası ile gümrük/beyanname
// kayıtlarını eşleştiren tek doğruluk kaynağı.
//
// Neden ham hücre karşılaştırması YETMEZ:
//   - Beyanname Excel'inde kontrol hanesi AYRILMIŞ yazılıyor: "WHSU801807-0",
//     "WHSU826274/4"; navlun faturasında ise bitişik geçiyor: "WHSU8018070"
//   - Tek hücrede birden fazla numara olabiliyor: "MRKU7242360, MSKU1234567"
//   - Dolgu değerler var: "-", "."
// Bu yüzden hücre metni DESENLE taranır, bulunan her numara ayrı anahtar olur.
//
// Ölçülen biçim dağılımı (BEYANNAME LİSTESİ.xlsx, HOUSE NO sütunu):
//   AAAA999999-9  x24    AAAA9999999  x7    AAAA999999/9  x3
//
// ISO 6346: 4 harf (sahip kodu + kategori) + 6 rakam seri + 1 rakam kontrol hanesi.
// Alternatifler SIRAYLA denenir; sıra önemlidir:
//   1) 7 bitişik rakam            -> "SEGU2230341"
//   2) 6 rakam + ayırıcı + 1 rakam -> "WHSU801807-0", "WHSU826274/4"
//   3) 6 rakam (kontrol hanesiz)   -> "WHLU576074"
// (2)'deki (?!\d) şart: ayırıcıdan sonra TEK rakam gelmeli. Olmazsa "ABCD123456/2026"
// gibi bir değerden "ABCD1234562" uydurulurdu.
// `g` bayrağı yalnız match() ile kullanılır — test() ile PAYLAŞILMAZ (lastIndex durumu).
const KONTEYNER_DESENI = /[A-Z]{4}\s*(?:\d{7}|\d{6}\s*[-\/]\s*\d(?!\d)|\d{6})/gi;

// Bütün ayraçlar atıldığında tek bir geçerli konteyner numarası kalan hücreler için.
const TAM_KONTEYNER = /^[A-Z]{4}\d{6,7}$/;

// Bir metindeki tüm konteyner numaralarını normalize edilmiş biçimde döndürür.
// "WHSU801807-0" ve "WHSU8018070" aynı anahtara indirgenir.
export function konteynerAnahtarlari(ham: string | null | undefined): string[] {
  if (!ham) return [];
  const metin = String(ham);

  const temiz = (metin.match(KONTEYNER_DESENI) ?? [])
    .map((x) => x.replace(/[^A-Z0-9]/gi, "").toUpperCase())
    // 4 harf + en az 6 rakam = en az 10 karakter. Kısa olan desene uymaz zaten,
    // ama savunma amaçlı: "-" / "." gibi dolgu değerler buraya hiç gelemesin.
    .filter((x) => x.length >= 10);

  // Tam-hücre yedeği: rakamların ARASINA boşluk kaçmış kayıtlar ("AKKU40 70039",
  // "CIPU5  278671") desenle yakalanamaz, ama ayraçlar atılınca geçerli numara olur.
  // Ölçümde gümrük listesinde 2 kayıt bu durumdaydı; desene güvenip bunları
  // düşürmek eskiden kurulan eşleşmeleri kaybettirirdi.
  // Yalnız TAMAMI geçerli numaraya indirgenen hücreler kabul edilir; birden çok
  // numara içeren hücre ("HLXU8381625,FCIU87") bu testi geçemez, zaten desen onu
  // doğru şekilde parçalıyor.
  const tumu = metin.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (TAM_KONTEYNER.test(tumu)) temiz.push(tumu);

  return Array.from(new Set(temiz));
}

// Depolama biçimi: virgülle ayrılmış, benzersiz. Hiç yoksa null (kolon boş kalsın,
// boş string DEĞİL — isNotNull sorguları boş string'i "dolu" sayardı).
export function konteynerMetni(...hamDegerler: (string | null | undefined)[]): string | null {
  const hepsi = new Set<string>();
  for (const ham of hamDegerler) {
    for (const k of konteynerAnahtarlari(ham)) hepsi.add(k);
  }
  return hepsi.size ? Array.from(hepsi).join(", ") : null;
}
