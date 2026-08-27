// Müşteri Listesi Excel'inden gelen ham alanların temizlenmesi.
// Hem sunucu içe aktarımı hem de olası testler bunu kullanır.

// ── Telefon ─────────────────────────────────────────────────────────────────
//
// Kaynak sistemdeki telefon hücreleri serbest metin: numaranın yanında kişi adı,
// dahili, "TEL:" öneki olabiliyor; bir hücrede birden fazla numara bulunabiliyor.
// Yazım biçimi de değişken — 0533 225 58 62 / 533 225 58 62 / 05332255862 /
// 252 77 84 (alan kodsuz yerel).

// Numaraları AYIRAN işaretler. "-" BİLEREK dışarıda: "443 35 70-71" iki numara
// değil, son iki hanenin varyantıdır; ayırıcı sayılsaydı numara ikiye bölünürdü.
const AYIRICI = /[*\/,;:]+|\s{2,}/;
// Parantez ayırıcı DEĞİL, silinir: "(531)734-9505" içinde parantez alan kodunu
// sarar; ayırıcı sayılsaydı 531 kopar ve numara alan kodsuz kalırdı.
const SILINECEK = /[()\[\]]/g;

// Tek alan kodu olan iller. İSTANBUL bilerek YOK: 212/216 ayrımı buradan
// bilinemez, alan kodsuz numarası 7 hane olarak bırakılır.
const IL_ALAN_KODU: Record<string, string> = {
  BURSA: "224", ANKARA: "312", IZMIR: "232", KOCAELI: "262", KONYA: "332",
  BALIKESIR: "266", DENIZLI: "258", ESKISEHIR: "222", SAKARYA: "264",
  MANISA: "236", TEKIRDAG: "282", ADANA: "322", ANTALYA: "242", GAZIANTEP: "342",
  KAYSERI: "352", MERSIN: "324", SAMSUN: "362", TRABZON: "462", YALOVA: "226",
  CANAKKALE: "286", KUTAHYA: "274", AFYONKARAHISAR: "272", BILECIK: "228",
};

const TR_HARF: Record<string, string> = {
  "İ": "I", "ı": "i", "Ş": "S", "ş": "s", "Ğ": "G", "ğ": "g",
  "Ü": "U", "ü": "u", "Ö": "O", "ö": "o", "Ç": "C", "ç": "c",
};

function ilAnahtari(il?: string | null): string {
  return String(il ?? "").replace(/[İıŞşĞğÜüÖöÇç]/g, (c) => TR_HARF[c]).toUpperCase().trim();
}

// Bir rakam dizisinden baştan bir numara soyup kalanı döndürür.
function soy(d: string): { no: string; kalan: string } | null {
  // Ülke kodu
  if (d.startsWith("90") && d.length >= 12) return { no: d.slice(2, 12), kalan: d.slice(12) };
  // Baştaki 0 ile tam numara
  if (d.startsWith("0") && d.length >= 11) return { no: d.slice(1, 11), kalan: d.slice(11) };
  // Baştaki 0 ama kısa: 0'ı at, yeniden değerlendir ("0 444 9 828")
  if (d.startsWith("0")) return soy(d.slice(1));
  // 0'sız tam numara: cep 5xx, sabit 2xx/3xx/4xx
  if (/^[2345]/.test(d) && d.length >= 10) return { no: d.slice(0, 10), kalan: d.slice(10) };
  // Alan kodsuz yerel numara
  if (d.length >= 7) return { no: d.slice(0, 7), kalan: d.slice(7) };
  return null;
}

function bicimle(no: string): string {
  if (no.length === 10) return `0${no.slice(0, 3)} ${no.slice(3, 6)} ${no.slice(6, 8)} ${no.slice(8)}`;
  if (no.length === 7) return `${no.slice(0, 3)} ${no.slice(3, 5)} ${no.slice(5)}`;
  return no;
}

/**
 * Serbest metin bir telefon hücresinden temiz numaraları çıkarır.
 * Harfler atılır, birden fazla numara ayrıştırılır, tekrarlar tekilleştirilir.
 * `il` verilirse ve o ilin tek alan kodu varsa, alan kodsuz yerel numaralar
 * tamamlanır (Bursa 224 gibi). İstanbul bilerek tamamlanmaz.
 */
export function telefonTemizle(ham: unknown, il?: string | null): string[] {
  if (ham === null || ham === undefined) return [];
  const harfsiz = String(ham).replace(SILINECEK, "").replace(/[^\d*\/,;:\-\s]+/g, " ");
  const parcalar = harfsiz.split(AYIRICI);

  const bulunan: string[] = [];
  for (const p of parcalar) {
    let d = p.replace(/\D+/g, "");
    // En fazla 3 numara soyulur; bozuk veri sonsuz parça üretmesin.
    for (let i = 0; i < 3 && d.length >= 7; i++) {
      const r = soy(d);
      if (!r) break;
      bulunan.push(r.no);
      d = r.kalan;
    }
  }

  const alanKodu = IL_ALAN_KODU[ilAnahtari(il)];
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const n of bulunan) {
    if (n.length !== 7 && n.length !== 10) continue;
    const tam = n.length === 7 && alanKodu ? alanKodu + n : n;
    if (gorulen.has(tam)) continue;
    gorulen.add(tam);
    sonuc.push(bicimle(tam));
  }
  return sonuc;
}

/** Birden fazla numarayı tek hücrede saklanacak biçime getirir. */
export function telefonBirlestir(numaralar: string[]): string | null {
  return numaralar.length ? numaralar.join(" / ") : null;
}

// ── Tarih ───────────────────────────────────────────────────────────────────

/**
 * Excel seri numarasını YYYY-MM-DD metnine çevirir.
 * new Date(...) yerel saate göre kayabildiği için UTC alanları kullanılır
 * (bu projede seri tarihler daha önce bir gün kaymalara yol açtı).
 */
export function excelSeriTarih(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  // 25569 = 1970-01-01'in Excel seri numarası (1900 tarih sistemi).
  const ms = Math.round((v - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const yil = d.getUTCFullYear();
  if (yil < 1990 || yil > 3000) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${yil}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// ── Firma adı eşleştirme ────────────────────────────────────────────────────

// Ayırt edici olan gövde; hukuki şekil ekleri kaynağa göre değişiyor
// ("LTD.ŞTİ." ↔ "LİMİTED ŞİRKETİ"), bu yüzden karşılaştırmada atılır.
const EKLER = /\b(LTD|STI|LIMITED|SIRKETI|ANONIM|AS|SAN|SANAYI|TIC|TICARET|VE|ITH|IHR|ITHALAT|IHRACAT|DIS|PAZARLAMA)\b/g;

export function adNormalize(s: unknown): string {
  return String(s ?? "").replace(/[İıŞşĞğÜüÖöÇç]/g, (c) => TR_HARF[c]).toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function adGovde(s: unknown): string {
  return adNormalize(s).replace(EKLER, " ").replace(/\s+/g, " ").trim();
}
