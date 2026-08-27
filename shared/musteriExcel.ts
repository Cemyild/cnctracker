// Müşteri Listesi Excel'inden gelen ham alanların temizlenmesi.
// Hem sunucu içe aktarımı hem de olası testler bunu kullanır.

// ── Telefon ─────────────────────────────────────────────────────────────────
//
// Kaynak sistemdeki telefon hücreleri serbest metin: numaranın yanında kişi adı,
// dahili, "TEL:" öneki olabiliyor; bir hücrede birden fazla numara bulunabiliyor.
// Yazım biçimi de değişken — 0533 225 58 62 / 533 225 58 62 / 05332255862 /
// 252 77 84 (alan kodsuz yerel).

// Numaraları kesin ayıran işaretler. "-" burada YOK; onun üç ayrı anlamı var
// ve uzunluğa bakılarak çözülür (bkz. tireCoz).
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
// Bir rakam dizisinden ardışık numaraları soyar.
function hepsiniSoy(d: string, hedef: string[]): void {
  let kalan = d;
  for (let i = 0; i < 3 && kalan.length >= 7; i++) {
    const r = soy(kalan);
    if (!r) break;
    hedef.push(r.no);
    kalan = r.kalan;
  }
}

/**
 * "-" işaretinin ÜÇ anlamı var, ayrımı uzunluk belirler:
 *   1. Numaranın içinde ayraç   — "258-286 51 30"      → toplam 10, birleştir
 *   2. Son hane varyantı        — "443 35 70-71"       → kısa kuyruk, at
 *   3. İki ayrı numara          — "413 34 00-522 83 20" → her parça ≥7, ayır
 * Bu ayrım yapılmazsa 2. durumda numara ikiye bölünür, 3. durumda ise iki
 * numaranın başları birleşip var olmayan bir alan kodu uydurulur.
 */
function tireCoz(parca: string, hedef: string[]): void {
  const altlar = parca.split("-").map((x) => x.replace(/\D+/g, "")).filter(Boolean);
  if (altlar.length === 0) return;

  const toplam = altlar.reduce((a, b) => a + b.length, 0);
  // Tire numaranın içinde: parçalar birleşince tam bir numara ediyor.
  if (altlar.length > 1 && (toplam === 7 || toplam === 10 || toplam === 11)) {
    hepsiniSoy(altlar.join(""), hedef);
    return;
  }

  let oncekiTamamdi = false;
  for (let i = 0; i < altlar.length; i++) {
    const p = altlar[i];
    // Tam bir numaranın ardındaki kısa kuyruk: son hane varyantı, atlanır.
    if (p.length < 7 && oncekiTamamdi) continue;
    // Kısa parça + sonraki tam bir numara ediyorsa önek (alan kodu) sayılır.
    if (p.length < 7 && i + 1 < altlar.length) {
      const birlesik = p + altlar[i + 1];
      if (birlesik.length === 10 || birlesik.length === 11) {
        hepsiniSoy(birlesik, hedef);
        i++;
        oncekiTamamdi = true;
        continue;
      }
    }
    hepsiniSoy(p, hedef);
    oncekiTamamdi = p.length >= 7;
  }
}

export function telefonTemizle(ham: unknown, il?: string | null): string[] {
  if (ham === null || ham === undefined) return [];
  const harfsiz = String(ham).replace(SILINECEK, "").replace(/[^\d*\/,;:\-\s]+/g, " ");

  const bulunan: string[] = [];
  for (const p of harfsiz.split(AYIRICI)) tireCoz(p, bulunan);

  const alanKodu = IL_ALAN_KODU[ilAnahtari(il)];
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const n of bulunan) {
    if (n.length !== 7 && n.length !== 10) continue;
    // 444'lü numaralar ülke geneli servis hattıdır, alan kodu almaz.
    const yerelTamamlanir = n.length === 7 && alanKodu && !n.startsWith("444");
    const tam = yerelTamamlanir ? alanKodu + n : n;
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
