import * as XLSX from "xlsx";
import { type InsertBeyanname } from "@shared/schema";
import { konteynerMetni } from "@shared/konteyner";

// Her iki ayristirici da bunu doner. `uyarilar` YUKLEMEYI BLOKLAMAZ — cagiran uc
// bunlari otomatik_yukleme_log mesajina ekler. Amac: sessizce eksik yazilan bir
// alanin haftalarca fark edilmemesini onlemek.
export type AyristirmaSonucu = { rows: InsertBeyanname[]; uyarilar: string[] };

// ---------------------------------------------------------------- ITHALAT

// Beklenen başlıklar → sütun harfleri ("İthalat Raporu" sayfası)
const BEKLENEN_BASLIKLAR: Record<string, string> = {
  A: "DOSYA NO",
  B: "ALICI",
  D: "GONDEREN",
  F: "KOLİ",
  I: "GUM.",
  K: "BEYAN TARİHİ",
  L: "BEYAN NO",
  M: "FAT.BEDELİ",
  N: "DÖVİZ",
  AV: "KULLANICI",
};

// Ham gümrük rejim kodu sütunu (4000, 7100, 5171 ...). KATI DOĞRULAMAYA DAHİL DEĞİL:
// tamamlayıcı bir alan, eksikliği çalışan içe aktarmayı durdurmamalı. Başlık tam
// eşleşmiyorsa hiç okunmaz (yanlış sütundan değer yazmaktansa null bırakılır) —
// ama artık SESSİZ değil, uyarı olarak dönülür.
const REJIM_KODU_SUTUNU = "AU";
const REJIM_KODU_BASLIGI = "REJİM";

// Konteyner numarası taşıyan sütunlar. İKİSİ DE okunur: ölçümde aynı satırlarda
// aynı değeri taşıyorlar, ama operatör hangisine yazarsa yazsın yakalanması için
// yedekli okunuyor. (CS "KONTEYNER" sütunu ölçülen dosyalarda tamamen boştu.)
// REJİM KODU ile aynı gerekçe: katı doğrulamaya dahil DEĞİL — tamamlayıcı alan,
// eksikliği çalışan bir içe aktarmayı durdurmamalı; ama sessiz de kalmaz.
const KONTEYNER_SUTUNLARI: Record<string, string> = {
  R: "HOUSE NO",
  BV: "KONŞİMENTO NO",
};

// ---------------------------------------------------------------- IHRACAT

// "İhracat Raporu" sayfası. Q (FOB) ve T (NAKLİYECİ) SAKLANMAZ — yalnız başlıksız
// S sütununu konumlandıran ÇAPA olarak doğrulanır: düzen kayarsa önce bunlar patlar.
const EX_BASLIKLAR: Record<string, string> = {
  A: "DOSYA NO",
  B: "GONDEREN",
  C: "ALICI",
  F: "GÇB NO",
  G: "GÇB TAR.",
  I: "KOLİ",
  M: "GÜMRÜK",
  Q: "FOB",
  R: "CIF",
  T: "NAKLİYECİ",
  Z: "GİREN",
  AM: "REJİM",
};

// S sutununun BASLIGI YOKTUR ve kaynak rapor degistirilemiyor (kullanici teyit etti).
// Bu yuzden konumdan okunur ama ICERIKTEN dogrulanir: doviz kodu deseni.
// Olcum: 13942/13942 uyuyor (CHF EUR GBP NOK RUB TL USD).
const EX_DOVIZ_SUTUNU = "S";
const DOVIZ_DESENI = /^[A-Z]{2,3}$/;
const DOVIZ_ASGARI_UYUM = 0.95;

// ---------------------------------------------------------------- YARDIMCILAR

// "DD.MM.YYYY" → "YYYY-MM-DD"; "." veya boş → null.
// new Date() ile AYRIŞTIRMA yapılmaz — timezone off-by-one tuzağı (commit c897dff).
export function parseBeyanTarihi(deger: unknown): string | null {
  if (typeof deger !== "string") return null;
  const m = deger.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Excel seri numarası → "YYYY-MM-DD". İhracat raporunda tarihler sayı olarak gelir (46205).
// Date BURADA yalnız EPOCH ARİTMETİĞİ için kullanılır: girdi bir milisaniye sayısıdır,
// çıktı getUTC* ile okunur. Metin AYRIŞTIRMA veya yerel saat YOKTUR, dolayısıyla
// timezone kaymasi imkansizdir. Epoch 1899-12-30 (Excel'in 1900 artık yıl hatası dahil).
// Doğrulanmış: 46205 → 2026-07-02, 46212 → 2026-07-09.
export function excelSeriTarih(deger: unknown): string | null {
  if (typeof deger !== "number" || !Number.isFinite(deger) || deger <= 0) return null;
  const gun = Math.floor(deger);
  const d = new Date(Date.UTC(1899, 11, 30) + gun * 86400000);
  const yil = d.getUTCFullYear();
  // Number.isFinite ONEMLI: asiri buyuk gun sayisi JS Date araligini tasirir
  // (Invalid Date -> getUTCFullYear() NaN). NaN < 1990 ve NaN > 2100 ikisi de
  // false doner, yani salt karsilastirma bu durumu YAKALAMAZ.
  if (!Number.isFinite(yil) || yil < 1990 || yil > 2100) return null; // sacma seri -> null, sessizce yanlis tarih yazma
  const ay = String(d.getUTCMonth() + 1).padStart(2, "0");
  const gunStr = String(d.getUTCDate()).padStart(2, "0");
  return `${yil}-${ay}-${gunStr}`;
}

const metin = (v: unknown) => (v == null ? null : String(v).trim() || null);
const sayi = (v: unknown) => (typeof v === "number" ? v : null);
const paraMetni = (v: unknown) => (typeof v === "number" ? String(v) : null);

// Başlık satırını DİNAMİK bul — bazı export'larda 1. satır bir bilgi satırıdır ve
// gerçek başlıklar aşağı kayar. İlk 15 satırda A sütunu "DOSYA NO" olanı ara.
function baslikSatiriniBul(grid: unknown[][], sheetName: string): number {
  const aCol = XLSX.utils.decode_col("A");
  const sinir = Math.min(grid.length, 15);
  for (let r = 0; r < sinir; r++) {
    if (String(grid[r]?.[aCol] ?? "").trim() === "DOSYA NO") return r;
  }
  throw new Error(`"${sheetName}" sayfasında başlık satırı (A="DOSYA NO") ilk 15 satırda bulunamadı`);
}

// Başlık doğrulaması — uyuşmazlıkta yükleme REDDEDİLİR.
// Sessiz sıfır-satır ithalatı yasak (gümrük fatura_tarihi dersinden).
function basliklariDogrula(baslikSatiri: unknown[], beklenen: Record<string, string>): void {
  const sorunlar: string[] = [];
  for (const [harf, bek] of Object.entries(beklenen)) {
    const bulunan = String(baslikSatiri[XLSX.utils.decode_col(harf)] ?? "").trim();
    if (bulunan !== bek) sorunlar.push(`${harf} sütunu "${bek}" olmalı, "${bulunan}" bulundu`);
  }
  if (sorunlar.length) throw new Error(`Excel başlıkları uyuşmuyor: ${sorunlar.join("; ")}`);
}

function sayfaVeGrid(buffer: Buffer, tercihEdilen: string) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.includes(tercihEdilen) ? tercihEdilen : wb.SheetNames[0];
  const grid: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
  if (!grid.length) throw new Error(`"${sheetName}" sayfası boş`);
  return { sheetName, grid };
}

// Gerçek dosya no "YY-NNNNN" biçimindedir (ör. 26-10694).
// "TOPLAM KAYIT : 1982" gibi footer/özet satırları bu desene uymaz.
const DOSYA_NO_DESENI = /^\d+-\d/;

// ---------------------------------------------------------------- ITHALAT AYRISTIRICI

export function parseBeyannameWorkbook(buffer: Buffer): AyristirmaSonucu {
  const { sheetName, grid } = sayfaVeGrid(buffer, "İthalat Raporu");
  const baslikIdx = baslikSatiriniBul(grid, sheetName);
  const baslikSatiri = grid[baslikIdx];
  basliklariDogrula(baslikSatiri, BEKLENEN_BASLIKLAR);

  const uyarilar: string[] = [];
  const rejimKoduIdx = XLSX.utils.decode_col(REJIM_KODU_SUTUNU);
  const rejimKoduVar = String(baslikSatiri[rejimKoduIdx] ?? "").trim() === REJIM_KODU_BASLIGI;
  if (!rejimKoduVar) {
    uyarilar.push(
      `rejim kodu sütunu okunamadı (${REJIM_KODU_SUTUNU} başlığı "${REJIM_KODU_BASLIGI}" değil) — rejim kodları boş bırakıldı`,
    );
  }

  // Konteyner sütunları: başlığı tutanları oku, tutmayanı hiç okuma (yanlış
  // sütundan konteyner "uydurmak" yanlış dosya eşleşmesi demektir) ve uyar.
  const konteynerIdxler: number[] = [];
  for (const [harf, baslik] of Object.entries(KONTEYNER_SUTUNLARI)) {
    const idx = XLSX.utils.decode_col(harf);
    if (String(baslikSatiri[idx] ?? "").trim() === baslik) {
      konteynerIdxler.push(idx);
    } else {
      uyarilar.push(
        `konteyner sütunu okunamadı (${harf} başlığı "${baslik}" değil) — bu sütun atlandı`,
      );
    }
  }
  if (konteynerIdxler.length === 0) {
    uyarilar.push("hiçbir konteyner sütunu okunamadı — nakliye eşleştirmesi bu yüklemeden beslenemez");
  }

  const col = (harf: string) => XLSX.utils.decode_col(harf);
  const rows: InsertBeyanname[] = [];
  for (let r = baslikIdx + 1; r < grid.length; r++) {
    const satir = grid[r];
    if (!satir) continue;
    const dosyaNo = String(satir[col("A")] ?? "").trim();
    if (!dosyaNo || !DOSYA_NO_DESENI.test(dosyaNo)) continue;
    rows.push({
      dosyaNo,
      alici: metin(satir[col("B")]),
      gonderen: metin(satir[col("D")]),
      koli: sayi(satir[col("F")]),
      gumrukIdaresi: metin(satir[col("I")]),
      beyanTarihi: parseBeyanTarihi(satir[col("K")]),
      beyanNo: metin(satir[col("L")]),
      fatBedeli: paraMetni(satir[col("M")]),
      doviz: metin(satir[col("N")]),
      kullanici: metin(satir[col("AV")]),
      konteynerler: konteynerMetni(...konteynerIdxler.map((i) => metin(satir[i]))),
      rejim: "IM",
      rejimKodu: rejimKoduVar ? metin(satir[rejimKoduIdx]) : null,
      kaynak: "excel",
    });
  }
  return { rows, uyarilar };
}

// ---------------------------------------------------------------- IHRACAT AYRISTIRICI

export function parseIhracatWorkbook(buffer: Buffer): AyristirmaSonucu {
  const { sheetName, grid } = sayfaVeGrid(buffer, "İhracat Raporu");
  const baslikIdx = baslikSatiriniBul(grid, sheetName);
  basliklariDogrula(grid[baslikIdx], EX_BASLIKLAR);

  const col = (harf: string) => XLSX.utils.decode_col(harf);
  const dovizIdx = col(EX_DOVIZ_SUTUNU);
  const uyarilar: string[] = [];
  const rows: InsertBeyanname[] = [];
  let dovizDolu = 0;
  let dovizUyan = 0;

  for (let r = baslikIdx + 1; r < grid.length; r++) {
    const satir = grid[r];
    if (!satir) continue;
    const dosyaNo = String(satir[col("A")] ?? "").trim();
    if (!dosyaNo || !DOSYA_NO_DESENI.test(dosyaNo)) continue;

    const dovizHam = metin(satir[dovizIdx]);
    if (dovizHam) {
      dovizDolu++;
      if (DOVIZ_DESENI.test(dovizHam)) dovizUyan++;
    }

    rows.push({
      dosyaNo,
      // ROLLER TERS: ihracatta BIZIM MUSTERIMIZ gonderendir. Ekranlarda her rejimde
      // "bizim musteri" gorunsun diye B -> alici, C -> gonderen (kullanici karari).
      alici: metin(satir[col("B")]),
      gonderen: metin(satir[col("C")]),
      koli: sayi(satir[col("I")]),
      gumrukIdaresi: metin(satir[col("M")]),
      beyanTarihi: excelSeriTarih(satir[col("G")]) ?? parseBeyanTarihi(satir[col("G")]),
      beyanNo: metin(satir[col("F")]),
      fatBedeli: paraMetni(satir[col("R")]), // CIF — kullanici karari, FOB DEGIL
      doviz: dovizHam,
      kullanici: metin(satir[col("Z")]), // GİREN — E "MÜŞTERİ TEMSİLCİSİ" degil (246 satiri bos)
      rejim: "EX",
      rejimKodu: metin(satir[col("AM")]),
      kaynak: "excel",
    });
  }

  // S sutunu basliksiz oldugu icin ICERIKTEN dogrulanir. Sutun duzeni kaydiysa
  // burada sayi/metin karisimi gelir ve oran coker -> yukleme REDDEDILIR.
  if (dovizDolu > 0) {
    const oran = dovizUyan / dovizDolu;
    if (oran < DOVIZ_ASGARI_UYUM) {
      throw new Error(
        `${EX_DOVIZ_SUTUNU} sütunu döviz kodu içermiyor (${dovizUyan}/${dovizDolu} uyumlu, ` +
          `beklenen en az %${Math.round(DOVIZ_ASGARI_UYUM * 100)}). Sütun düzeni değişmiş olabilir.`,
      );
    }
  } else if (rows.length > 0) {
    uyarilar.push(`${EX_DOVIZ_SUTUNU} sütunu tamamen boş — döviz bilgisi yazılamadı`);
  }

  return { rows, uyarilar };
}
