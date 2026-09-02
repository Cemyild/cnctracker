export type FaturaAlanlari = {
  fatura_no: string | null;
  fatura_tarihi: string | null;      // YYYY-MM-DD
  tedarikci_unvan: string | null;
  tedarikci_vkn: string | null;
  musteri_firma_adi: string | null;
  konteynerler: string[];
  para_birimi: string | null;        // TRY | USD | EUR | GBP
  matrah: number | null;
  kdv_orani: number | null;
  kdv_tutari: number | null;
  tevkifat_tutari: number | null;
  odenecek_tutar: number | null;
  aciklama: string | null;
  /**
   * Mal/hizmet tablosunun HER SATIRI ayrı bir kalem.
   * Çok konteynerli faturalarda her konteyner kendi satırında gelir; müşteri
   * faturası da bu kırılımla kesilir (bkz. satisFaturasi.ts).
   */
  kalemler?: Array<{
    aciklama: string | null;
    konteynerler: string[];
    kdv_orani: number | null;
    matrah: number | null;
  }>;
};

/**
 * Belge tipi — KANAL DEĞİL, BELGENİN KENDİSİ.
 *
 * Bu ayrım paraya dokunuyor: e-Fatura'lar Paraşüt'ün gelen kutusuna
 * DÜŞÜYOR ve kullanıcı orada "İçeri Al" ile carilere kaydediyor. Sistem
 * aynı faturayı bir de alış faturası olarak yazarsa Paraşüt'te MÜKERRER
 * kayıt oluşuyor. e-Arşiv'ler ise Paraşüt'e hiç düşmüyor; onları yalnızca
 * sistem yazabilir.
 */
export type BelgeTipi = "earsiv" | "efatura" | "bilinmiyor";

/** Türkçe harfleri ve aksanları sadeleştirir (İ/ı/ş/ç... → i/i/s/c). */
function sadelestir(metin: string): string {
  return metin
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // birleşen aksan işaretleri
    .toLowerCase();
}

/**
 * Belgenin e-Arşiv mi e-Fatura mı olduğunu HAM PDF METNİNDEN belirler.
 *
 * Neden ham metin: `kaynak` alanı KANALI söylüyor (mailden mi geldi, Paraşüt'ten
 * mi çekildi) — belge tipini değil. Tedarikçiler e-Fatura'larını da mail ile
 * gönderiyor; kanala bakan eski kural onları e-Arşiv sanıp Paraşüt'e yazdı ve
 * 9 mükerrer kayıt oluştu (2026-07-31'de ölçüldü, kullanıcı sildi).
 *
 * Ayrım canlı veride 17/17 temiz ölçüldü: e-Arşiv belgelerinde "e-Arşiv Fatura"
 * geçiyor ve "e-Fatura" HİÇ geçmiyor; e-Fatura belgelerinde tam tersi.
 *
 * İKİSİ BİRDEN ya da HİÇBİRİ geçiyorsa "bilinmiyor" döner ve belge Paraşüt'e
 * YAZILMAZ. Gerekçe: yanlış "e-Arşiv" kararı mükerrer fatura demek (düzeltmesi
 * elle silme gerektirir); yanlış "bilinmiyor" kararı ise yalnızca rozetin sarı
 * kalması demek (kullanıcı görür, elle aktarır). Ucuz hatayı seçiyoruz.
 */
export function belgeTipiBelirle(hamMetin: string | null | undefined): BelgeTipi {
  const metin = sadelestir(String(hamMetin ?? ""));
  if (!metin.trim()) return "bilinmiyor";

  const earsiv = /e\s*-?\s*arsiv/.test(metin);
  const efatura = /e\s*-?\s*fatura/.test(metin);

  if (earsiv && !efatura) return "earsiv";
  if (efatura && !earsiv) return "efatura";
  return "bilinmiyor";
}

/**
 * Bir sayının PDF ham metninde geçip geçmediğini kontrol eder.
 * Türkçe biçim (1.234,56) ve İngilizce biçim (1234.56) birlikte denenir;
 * binlik ayracı olmayan hâli de aranır.
 */
function tutarMetindeVar(tutar: number, hamMetin: string): boolean {
  const temiz = hamMetin.replace(/\s/g, "");
  const adaylar = new Set<string>();
  const trBicim = tutar.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  adaylar.add(trBicim);                              // 1.234,56
  adaylar.add(trBicim.replace(/\./g, ""));           // 1234,56
  adaylar.add(tutar.toFixed(2));                     // 1234.56
  adaylar.add(tutar.toFixed(2).replace(".", ","));   // 1234,56
  adaylar.add(String(Math.round(tutar)));            // 1234
  for (const a of Array.from(adaylar)) {
    if (temiz.includes(a.replace(/\s/g, ""))) return true;
  }
  return false;
}

/**
 * İki katmanlı doğrulama:
 *  1) Metin kontrolü — LLM'in döndürdüğü her tutar ve fatura no ham metinde
 *     birebir geçmeli. Halüsinasyon böyle yakalanır.
 *  2) Aritmetik kontrolü — matrah + KDV − tevkifat == ödenecek (±0,01).
 */
export function faturaDogrula(
  a: FaturaAlanlari,
  hamMetin: string,
): { gecerli: boolean; hatalar: string[] } {
  const hatalar: string[] = [];

  if (!a.fatura_no) {
    hatalar.push("fatura_no boş");
  } else if (!hamMetin.replace(/\s/g, "").includes(a.fatura_no.replace(/\s/g, ""))) {
    hatalar.push(`fatura_no "${a.fatura_no}" PDF metninde bulunamadı`);
  }

  if (!a.fatura_tarihi || !/^\d{4}-\d{2}-\d{2}$/.test(a.fatura_tarihi)) {
    hatalar.push(`fatura_tarihi geçersiz: ${a.fatura_tarihi}`);
  }

  const tutarAlanlari: Array<[string, number | null]> = [
    ["matrah", a.matrah],
    ["kdv_tutari", a.kdv_tutari],
    ["tevkifat_tutari", a.tevkifat_tutari],
    ["odenecek_tutar", a.odenecek_tutar],
  ];
  for (const [ad, deger] of tutarAlanlari) {
    // 0 ve null doğal olarak metinde geçmeyebilir — kontrol edilmez
    if (deger === null || deger === 0) continue;
    if (!tutarMetindeVar(deger, hamMetin)) {
      hatalar.push(`${ad}=${deger} PDF metninde bulunamadı`);
    }
  }

  if (a.matrah === null || a.odenecek_tutar === null) {
    hatalar.push("matrah veya odenecek_tutar boş");
  } else {
    const kdv = a.kdv_tutari ?? 0;
    const tevkifat = a.tevkifat_tutari ?? 0;
    const beklenen = a.matrah + kdv - tevkifat;
    if (Math.abs(beklenen - a.odenecek_tutar) > 0.01) {
      hatalar.push(
        `aritmetik tutmuyor: ${a.matrah} + ${kdv} - ${tevkifat} = ${beklenen.toFixed(2)}, ` +
        `ödenecek ${a.odenecek_tutar}`,
      );
    }
  }

  return { gecerli: hatalar.length === 0, hatalar };
}

/** Konteyner numarasını karşılaştırılabilir hale getirir: 4 harf + 7 rakam. */
export function normalizeKonteyner(s: string): string {
  return (s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Geçerli konteyner formatı mı? (ISO 6346 kontrol hanesi doğrulanmaz) */
export function konteynerGecerliMi(s: string): boolean {
  return /^[A-Z]{4}\d{7}$/.test(normalizeKonteyner(s));
}
