import { PDFParse } from "pdf-parse";
import { PARAMETRELER_2025, PARAMETRELER_2026 } from "@shared/salaryCalculations";

// Mevcut subeler dizisindeki kanonik isimler (shared/schema.ts ile uyumlu)
const SUBE_BURSA = "Bursa";
const SUBE_ISTANBUL_ERENKOY = "İstanbul - Erenköy";
const SUBE_GEMLIK = "Gemlik";
const SUBE_YONETIM = "Yönetim";

export type CalisanStatuLite = "NORMAL" | "EMEKLİ" | "YÖNETİCİ";

// SGK İşyeri No son 9 hanesi → şube eşlemesi.
// Yıllar arasında numaranın ön eki değişebiliyor (2025: 25229..., 2026: 25226...)
// ama işyeri kimliğini taşıyan son kısım sabit kalıyor.
const SGK_SUFFIX_SUBE: Record<string, string> = {
  "161331000": SUBE_BURSA,
  "344163000": SUBE_ISTANBUL_ERENKOY,
  "160212000": SUBE_GEMLIK,
};

// ============================================================================
// ÜCRET PUSULASI PARSER
// "ÜCRET BORDROSU, PUANTAJ CETVELİ ve ÜCRET PUSULASI" formatı:
// her sayfa 1 çalışan; tüm değerler belgede yazılı.
// ============================================================================

export interface PusulaSatiri {
  sayfaNo: number;
  tcNo: string;
  adSoyad: string;
  isGirisTarihi: string; // GG.AA.YYYY (belgeden, calisanlar tablosundaki mevcut formatla uyumlu)
  isCikisTarihi?: string;
  statu: CalisanStatuLite; // "Meslek Grubu :" alanından
  sube: string; // SGK İşyeri No son 9 haneden; bilinmiyorsa adres fallback
  kanunNo: string; // "05510" (normal) | "00000" (emekli SGDP / yönetici)
  sgkIsyeriNo: string | null;

  // Belgeden okunan değerler (tek satır veri bloğu, pozisyonel)
  brutUcret: number;
  brutToplam: number;
  fazlaMesai: number;
  sairOdeme: number;
  vergiMatrahi: number; // bu ayın GV matrahı
  devredenVergiMatrahi: number; // önceki ayların kümülatif GV matrahı (Dev.Ver.Mat.)
  sigortaMatrahi: number;
  gelirVergisi: number;
  damgaVergisi: number;
  sgkIsciPrimi: number;
  issizlikIsciPrimi: number;
  digerIstisna: number;
  isvSgkIstisna: number; // işveren SGK teşvik tutarı (belgede yazılı)
  sairKesinti: number;
  ekKesinti: number; // "Ek Kesinti Toplamı" (avans/icra vb., belgede yazılı)
  netUcret: number;
  odenecek: number;

  // Türetilen işveren yükleri (sigorta matrahı × yasal oran − belgedeki teşvik)
  isverenSgkPayi: number;
  isverenIssizlikPayi: number;
  toplamIsverenMaliyeti: number;

  uyarilar: string[];
}

export interface PusulaSonuc {
  ay: number;
  yil: number;
  satirlar: PusulaSatiri[];
  toplamKisi: number;
  toplamNet: number;
  toplamBrut: number;
  toplamIsverenMaliyeti: number;
  atlananSayfalar: { sayfaNo: number; sebep: string }[];
}

// Türkçe locale rakamı parse: "1.234,56" -> 1234.56 ("355.000,0" gibi kesik ondalıkları da tolere eder)
function parseTryNumber(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Türkçe ay adından ay numarasına çevir (aksanlı/aksansız tolere eder)
function ayAdiToNumara(ad: string): number | null {
  const aylar: Record<string, number> = {
    OCAK: 1, SUBAT: 2, ŞUBAT: 2, MART: 3, NISAN: 4, NİSAN: 4,
    MAYIS: 5, HAZIRAN: 6, HAZİRAN: 6, TEMMUZ: 7, AGUSTOS: 8, AĞUSTOS: 8,
    EYLUL: 9, EYLÜL: 9, EKIM: 10, EKİM: 10, KASIM: 11, ARALIK: 12,
  };
  return aylar[ad.toLocaleUpperCase("tr")] ?? null;
}

// Belge genelinde "OCAK/ 2025" kalıplarını toplayıp çoğunluk oyuyla ay/yıl belirler.
function parseAyYilPusula(text: string): { ay: number; yil: number } {
  const re = /(OCAK|ŞUBAT|SUBAT|MART|NİSAN|NISAN|MAYIS|HAZİRAN|HAZIRAN|TEMMUZ|AĞUSTOS|AGUSTOS|EYLÜL|EYLUL|EKİM|EKIM|KASIM|ARALIK)\s*\/\s*(\d{4})/gi;
  const sayim = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const ay = ayAdiToNumara(m[1]);
    const yil = parseInt(m[2], 10);
    if (ay && yil >= 2020 && yil <= 2100) {
      const key = `${ay}/${yil}`;
      sayim.set(key, (sayim.get(key) || 0) + 1);
    }
  }
  if (sayim.size === 0) {
    throw new Error("PDF içinde ay/yıl bilgisi bulunamadı (beklenen: 'OCAK/ 2026' gibi).");
  }
  let enCok = "";
  let enCokSayi = 0;
  sayim.forEach((n, key) => {
    if (n > enCokSayi) { enCok = key; enCokSayi = n; }
  });
  const [ay, yil] = enCok.split("/").map((x) => parseInt(x, 10));
  return { ay, yil };
}

// SGK İşyeri No + sayfa metninden şube tespiti
function tespitSube(sgkIsyeriNo: string | null, statu: CalisanStatuLite, sayfaText: string, uyarilar: string[]): string {
  if (statu === "YÖNETİCİ") return SUBE_YONETIM;
  if (sgkIsyeriNo && /^\d{15,}$/.test(sgkIsyeriNo)) {
    const suffix = sgkIsyeriNo.slice(-9);
    const sube = SGK_SUFFIX_SUBE[suffix];
    if (sube) return sube;
    uyarilar.push(`Bilinmeyen SGK işyeri no (${sgkIsyeriNo}) — şube adresten tahmin edildi.`);
  }
  const hay = sayfaText.toLocaleUpperCase("tr");
  if (hay.includes("GEMLİK") || hay.includes("GEMLIK")) return SUBE_GEMLIK;
  if (hay.includes("ATAŞEHİR") || hay.includes("ATASEHIR") || hay.includes("İSTANBUL") || hay.includes("ISTANBUL")) {
    return SUBE_ISTANBUL_ERENKOY;
  }
  return SUBE_BURSA;
}

// İşveren SGK + işsizlik paylarını türetir.
// Oran yıla ve statüye göre yasal sabit; teşvik tutarı belgeden ("İşv.SGK İst.") düşülür.
function turetIsverenYukleri(
  yil: number,
  statu: CalisanStatuLite,
  sigortaMatrahi: number,
  isvSgkIstisna: number,
  brutToplam: number,
): { isverenSgkPayi: number; isverenIssizlikPayi: number; toplamIsverenMaliyeti: number } {
  if (statu === "YÖNETİCİ" || sigortaMatrahi <= 0) {
    return { isverenSgkPayi: 0, isverenIssizlikPayi: 0, toplamIsverenMaliyeti: round2(brutToplam) };
  }
  const p = yil >= 2026 ? PARAMETRELER_2026 : PARAMETRELER_2025;
  const oran = statu === "EMEKLİ" ? p.ISVEREN_SGK_ORANI_EMEKLI : p.ISVEREN_SGK_ORANI;
  const issizlikOran = statu === "EMEKLİ" ? 0 : p.ISVEREN_ISSIZLIK_ORANI;
  const isverenSgkPayi = round2(Math.max(0, sigortaMatrahi * oran - isvSgkIstisna));
  const isverenIssizlikPayi = round2(sigortaMatrahi * issizlikOran);
  return {
    isverenSgkPayi,
    isverenIssizlikPayi,
    toplamIsverenMaliyeti: round2(brutToplam + isverenSgkPayi + isverenIssizlikPayi),
  };
}

// Tek satır veri bloğunun başlangıcı:
// "11.07.2017 	31 30 1.911,05	26 4 	0	0	0	1	ONUR KARADAĞ"
// (tarih + gün sayıları + günlük brüt + ... + BÜYÜK HARF AD SOYAD)
// Puantaj satırları ("11.07.2017 B N N T ...") tarihten sonra rakam gelmediği için elenır.
const ROW_BASLANGIC = /^(\d{2}\.\d{2}\.\d{4})[\s\t]+\d+[\s\t]+\d+[\s\t]+[\d.,]+[\s\t].*?([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ\s.\-']{2,})$/;

// TC satırı: 11 hane + opsiyonel işten çıkış tarihi ("47587283778 15.04.2026")
const TC_SATIRI = /^(\d{11})(?:[\s\t]+(\d{1,2}\.\d{1,2}\.\d{4}))?$/;

// Tam para tokeni: "1.234,56" (kesik ondalık "355.000,0" da kabul)
const PARA_TAM = /^\d{1,3}(?:\.\d{3})*,\d{1,2}$/;
// Satır sonunda bölünmüş para: "100.000,0" veya "100.000," (devamı sonraki token'da)
const PARA_YARIM = /^\d{1,3}(?:\.\d{3})*,\d?$/;

interface RowBlok {
  isGirisTarihi: string;
  adSoyad: string;
  tcNo: string;
  isCikisTarihi?: string;
  degerler: number[]; // 15 pozisyonel değer
  odenecek: number;
  kanunNo: string;
}

// Sayfa metnindeki tek satır veri bloğunu bulup pozisyonel değerleri çıkarır.
// Değerler token akışı olarak okunur çünkü bazı PDF'lerde geniş tutarlar
// satır sonunda bölünüyor: "100.000,00" → "100.000,0" + ayrı satırda "0",
// Kanun No da kendi satırına düşebiliyor.
function parseRowBlok(sayfaText: string): { blok: RowBlok | null; sebep?: string } {
  const lines = sayfaText.split("\n").map((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const rowMatch = lines[i].match(ROW_BASLANGIC);
    if (!rowMatch) continue;

    // Sonraki dolu satır TC olmalı
    let j = i + 1;
    while (j < lines.length && !lines[j]) j++;
    const tcMatch = j < lines.length ? lines[j].match(TC_SATIRI) : null;
    if (!tcMatch) continue; // bu satır veri bloğu değilmiş, aramaya devam

    // TC'den sonra token akışını Kanun No'ya kadar topla
    const tokens: string[] = [];
    let dolulSatir = 0;
    for (let k = j + 1; k < lines.length && dolulSatir < 40; k++) {
      const line = lines[k];
      if (!line) continue;
      dolulSatir++;
      tokens.push(...line.split(/[\s\t]+/));
      // Kanun No görüldüyse blok bitti (para formatında 5 ardışık rakam olamaz —
      // binlik ayraçlar araya girer, yanlış pozitif riski yok)
      if (/(^|[\s\t])0(5510|0000)($|[\s\t])/.test(line)) break;
    }

    const paralar: number[] = [];
    let kanunNo = "";

    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      if (tok === "05510" || tok === "00000") {
        kanunNo = tok;
        break;
      }
      if (PARA_TAM.test(tok) || PARA_YARIM.test(tok)) {
        // Bölünmüş ondalığı birleştir: "100.000,0" + "0" → "100.000,00"
        let deger = tok;
        const ondalik = (deger.split(",")[1] || "").length;
        const sonraki = tokens[t + 1];
        if (ondalik < 2 && sonraki && /^\d{1,2}$/.test(sonraki) && ondalik + sonraki.length <= 2) {
          deger = deger + sonraki;
          t++;
        }
        paralar.push(parseTryNumber(deger));
      }
      // Diğer token'lar (tek başına tam sayılar, kelimeler) blok verisi değildir
    }

    if (!kanunNo) {
      return { blok: null, sebep: "Veri bloğu sonu (Kanun No) bulunamadı." };
    }
    if (paralar.length !== 16) {
      return { blok: null, sebep: `Beklenen 16 değer (15 + ödenecek) yerine ${paralar.length} değer bulundu.` };
    }

    const odenecek = paralar.pop()!;

    return {
      blok: {
        isGirisTarihi: rowMatch[1],
        adSoyad: rowMatch[2].trim(),
        tcNo: tcMatch[1],
        isCikisTarihi: tcMatch[2] || undefined,
        degerler: paralar,
        odenecek,
        kanunNo,
      },
    };
  }

  return { blok: null, sebep: "Çalışan veri satırı bulunamadı." };
}

/**
 * "ÜCRET BORDROSU, PUANTAJ CETVELİ ve ÜCRET PUSULASI" PDF'ini parse eder.
 * Her sayfa 1 çalışandır; brüt/net/vergiler/kesintiler belgeden okunur,
 * hiçbir maaş değeri yeniden HESAPLANMAZ. Sadece işveren SGK/işsizlik payı
 * (belgede satır düzeyinde bulunmadığı için) sigorta matrahı × yasal oran −
 * belgedeki teşvik tutarı formülüyle türetilir.
 */
export async function parseUcretPusulasiPdf(buffer: Buffer): Promise<PusulaSonuc> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const fullText = result.text || "";

  if (!fullText.trim()) {
    throw new Error("PDF metni boş — taranmış (görsel) PDF olabilir, OCR gerekir.");
  }

  // Yanlış dosya tespiti: kullanıcıya doğru dosyayı tarif et
  if (/Personel\s+Maa[şs]\s+Listesi/i.test(fullText)) {
    throw new Error(
      "Bu PDF bir 'Personel Maaş Listesi' (sadece net ödemeler). " +
      "Lütfen 'ÜCRET BORDROSU, PUANTAJ CETVELİ ve ÜCRET PUSULASI' başlıklı, her sayfada 1 çalışan olan PDF'i yükleyin.",
    );
  }
  if (!/PUSULASI/i.test(fullText)) {
    throw new Error(
      "Bu PDF Ücret Pusulası formatında görünmüyor. " +
      "Lütfen 'ÜCRET BORDROSU, PUANTAJ CETVELİ ve ÜCRET PUSULASI' başlıklı PDF'i yükleyin " +
      "(liste halindeki 'Ücret Bordrosu' ve 'Maaş Listesi' dosyaları desteklenmez).",
    );
  }

  const { ay, yil } = parseAyYilPusula(fullText);

  const sayfalar = fullText
    .split(/--\s*\d+\s+of\s+\d+\s*--/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (sayfalar.length === 0) {
    throw new Error("PDF'de sayfa bulunamadı.");
  }

  const satirlar: PusulaSatiri[] = [];
  const atlananSayfalar: { sayfaNo: number; sebep: string }[] = [];
  const gorulenTc = new Map<string, number>(); // tcNo → sayfaNo

  for (let i = 0; i < sayfalar.length; i++) {
    const sayfaNo = i + 1;
    const sayfaText = sayfalar[i];
    const uyarilar: string[] = [];

    const { blok, sebep } = parseRowBlok(sayfaText);
    if (!blok) {
      atlananSayfalar.push({ sayfaNo, sebep: sebep || "Bilinmeyen sebep." });
      continue;
    }

    // Statü: "Meslek Grubu :" alanından (belgede açıkça yazılı)
    const meslekMatch = sayfaText.match(/Meslek\s+Grubu\s*:\s*(NORMAL|EMEKLİ|EMEKLI|YÖNETİM|YONETIM)/i);
    let statu: CalisanStatuLite;
    if (meslekMatch) {
      const m = meslekMatch[1].toLocaleUpperCase("tr");
      statu = m.startsWith("YÖNET") || m.startsWith("YONET") ? "YÖNETİCİ" : m.startsWith("EMEK") ? "EMEKLİ" : "NORMAL";
    } else {
      // Fallback: kanun no + sigorta matrahı
      const sigortaMat = blok.degerler[6];
      statu = blok.kanunNo === "05510" ? "NORMAL" : sigortaMat > 0 ? "EMEKLİ" : "YÖNETİCİ";
      uyarilar.push("'Meslek Grubu' alanı okunamadı — statü Kanun No'dan türetildi.");
    }

    // SGK İşyeri No
    const sgkMatch = sayfaText.match(/SGK\s+İ?[şs]yeri\s+No\s*:\s*(\S+)/i);
    const sgkIsyeriNoRaw = sgkMatch ? sgkMatch[1] : null;
    const sgkIsyeriNo = sgkIsyeriNoRaw && /^\d{15,}$/.test(sgkIsyeriNoRaw) ? sgkIsyeriNoRaw : null;

    const sube = tespitSube(sgkIsyeriNo, statu, sayfaText, uyarilar);

    // "Ek Kesinti Toplamı" (avans/icra vb.) — belgede etiketli alan
    const ekKesintiMatch = sayfaText.match(/Ek\s+Kesinti\s+Toplam[ıi]\s*:?\s*([\d.,]+)/i);
    const ekKesinti = ekKesintiMatch ? parseTryNumber(ekKesintiMatch[1]) : 0;
    if (ekKesinti > 0) {
      uyarilar.push(`Ek kesinti var: ${ekKesinti.toFixed(2)} TL (avans/icra vb.) — net bu tutar düşülmüş halidir.`);
    }

    const d = blok.degerler;
    const [
      brutUcret, brutToplam, fazlaMesai, sairOdeme,
      vergiMatrahi, devredenVergiMatrahi, sigortaMatrahi,
      gelirVergisi, damgaVergisi, sgkIsciPrimi, issizlikIsciPrimi,
      digerIstisna, isvSgkIstisna, sairKesinti, netUcret,
    ] = d;

    // Tutarlılık kontrolleri (belge kendi içinde doğrulanır)
    const netKontrol = brutToplam - gelirVergisi - damgaVergisi - sgkIsciPrimi - issizlikIsciPrimi - sairKesinti - ekKesinti;
    if (Math.abs(netKontrol - netUcret) > 0.11) {
      uyarilar.push(`Net doğrulaması tutmadı: brüt − kesintiler = ${netKontrol.toFixed(2)}, belgede net = ${netUcret.toFixed(2)}.`);
    }
    const beklenenKanun = statu === "NORMAL" ? "05510" : "00000";
    if (blok.kanunNo !== beklenenKanun) {
      uyarilar.push(`Kanun No (${blok.kanunNo}) ile statü (${statu}) uyuşmuyor.`);
    }
    if (statu === "YÖNETİCİ" && sigortaMatrahi > 0) {
      uyarilar.push("Yönetici statüsünde ama sigorta matrahı sıfır değil.");
    }

    // Tekrarlanan TC (revize sayfası vb.) — ilk görüleni koru
    if (gorulenTc.has(blok.tcNo)) {
      atlananSayfalar.push({
        sayfaNo,
        sebep: `${blok.adSoyad} (${blok.tcNo}) sayfa ${gorulenTc.get(blok.tcNo)}'de zaten var — tekrar atlandı.`,
      });
      continue;
    }
    gorulenTc.set(blok.tcNo, sayfaNo);

    const isveren = turetIsverenYukleri(yil, statu, sigortaMatrahi, isvSgkIstisna, brutToplam);

    satirlar.push({
      sayfaNo,
      tcNo: blok.tcNo,
      adSoyad: blok.adSoyad,
      isGirisTarihi: blok.isGirisTarihi,
      isCikisTarihi: blok.isCikisTarihi,
      statu,
      sube,
      kanunNo: blok.kanunNo,
      sgkIsyeriNo,
      brutUcret,
      brutToplam,
      fazlaMesai,
      sairOdeme,
      vergiMatrahi,
      devredenVergiMatrahi,
      sigortaMatrahi,
      gelirVergisi,
      damgaVergisi,
      sgkIsciPrimi,
      issizlikIsciPrimi,
      digerIstisna,
      isvSgkIstisna,
      sairKesinti,
      ekKesinti,
      netUcret,
      odenecek: blok.odenecek,
      ...isveren,
      uyarilar,
    });
  }

  if (satirlar.length === 0) {
    throw new Error(
      "PDF'den hiç çalışan satırı okunamadı. " +
      (atlananSayfalar.length > 0 ? `İlk hata: ${atlananSayfalar[0].sebep}` : ""),
    );
  }

  return {
    ay,
    yil,
    satirlar,
    toplamKisi: satirlar.length,
    toplamNet: round2(satirlar.reduce((a, s) => a + s.netUcret, 0)),
    toplamBrut: round2(satirlar.reduce((a, s) => a + s.brutToplam, 0)),
    toplamIsverenMaliyeti: round2(satirlar.reduce((a, s) => a + s.toplamIsverenMaliyeti, 0)),
    atlananSayfalar,
  };
}

// Ay numarasını mevcut sistemin Türkçe key'ine çevir
// (uploads/bordro/{yil}/{ayKey} klasör adları bu format'ta)
export function ayNumaraToKey(ay: number): string {
  const ayKeyleri = [
    "ocak",
    "subat",
    "mart",
    "nisan",
    "mayis",
    "haziran",
    "temmuz",
    "agustos",
    "eylul",
    "ekim",
    "kasim",
    "aralik",
  ];
  const idx = ay - 1;
  if (idx < 0 || idx >= ayKeyleri.length) {
    throw new Error(`Geçersiz ay: ${ay}`);
  }
  return ayKeyleri[idx];
}
