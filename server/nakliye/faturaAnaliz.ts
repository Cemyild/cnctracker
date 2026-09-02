import Anthropic from "@anthropic-ai/sdk";
import type { FaturaAlanlari } from "./dogrulama";
import { normalizeKonteyner, konteynerGecerliMi } from "./dogrulama";

// pdf-parse 2.x'te DEFAULT EXPORT YOKTUR. v1'deki `pdfParse(buffer)` fonksiyonu
// kaldırılmış, yerine PDFParse sınıfı gelmiştir. Doğrulandı (2.4.5):
//   new PDFParse({ data: buf }) → await p.getText() → r.text → await p.destroy()
import { PDFParse } from "pdf-parse";

export function analizAktifMi(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * PDF'in ham metnini çıkarır. Doğrulamanın referans kaynağıdır.
 * Çıktıya sayfa ayracı eklenir ("-- 1 of 1 --") — doğrulamayı etkilemez.
 */
export async function pdfMetniCikar(buf: Buffer): Promise<string> {
  let p: PDFParse | null = null;
  try {
    p = new PDFParse({ data: new Uint8Array(buf) });
    const sonuc = await p.getText();
    return sonuc.text || "";
  } catch (e) {
    console.error("pdf-parse hatası:", e);
    return "";
  } finally {
    if (p) {
      try { await p.destroy(); } catch { /* yoksay */ }
    }
  }
}

// Elle yazılmış JSON Schema.
//
// BİRLEŞİK TİP SINIRI: Claude API'si şemada en fazla 16 adet union/nullable
// alan kabul ediyor; 17'de "Schemas contains too many parameters with union
// types" ile 400 döner (canlıda görüldü 2026-09-02, mail analizi tamamen
// durmuştu). Bu yüzden kalem şemasında yalnız GEREKLİ alanlar var:
// Kalem şemasındaki miktar ve birim_fiyat bilerek NULLABLE DEĞİL — böylece
// sayıma girmiyorlar. Yeni NULLABLE alan eklemeden önce sayıyı kontrol et.
// zodOutputFormat KULLANILMAZ: SDK 0.110.0'ın helpers/zod'u zod v4 API'si
// bekler, repoda zod 3.25.76 kurulu ve çağrı TypeError ile patlar.
const FATURA_SEMASI = {
  type: "object",
  properties: {
    fatura_no: { type: ["string", "null"], description: "Fatura numarası, örn. GIB2026000000075" },
    fatura_tarihi: { type: ["string", "null"], description: "YYYY-MM-DD biçiminde düzenleme tarihi" },
    tedarikci_unvan: { type: ["string", "null"], description: "Faturayı kesen firmanın tam unvanı" },
    tedarikci_vkn: { type: ["string", "null"], description: "Faturayı kesenin vergi kimlik numarası" },
    musteri_firma_adi: {
      type: ["string", "null"],
      description:
        "Mal/hizmet açıklamasının ortasında geçen MÜŞTERİ KISA ADI. " +
        "Açıklama kalıbı: <güzergah> <MÜŞTERİ> <hizmet> <konteyner no>. " +
        "Faturayı kesen firma DEĞİL, 'SAYIN' bölümündeki firma DEĞİL. " +
        "Açıklama yalnızca konteyner numaralarından ibaretse null.",
    },
    konteynerler: {
      type: "array",
      items: { type: "string" },
      description: "Metinde geçen konteyner numaraları, örn. MSBU4529335. Yoksa boş dizi.",
    },
    para_birimi: { type: ["string", "null"], description: "TRY, USD, EUR veya GBP" },
    matrah: { type: ["number", "null"], description: "KDV hariç mal/hizmet toplam tutarı" },
    kdv_orani: { type: ["number", "null"], description: "KDV yüzdesi, örn. 20 veya 0" },
    kdv_tutari: { type: ["number", "null"], description: "Hesaplanan KDV tutarı" },
    tevkifat_tutari: { type: ["number", "null"], description: "KDV tevkifat tutarı. Yoksa 0." },
    odenecek_tutar: { type: ["number", "null"], description: "Ödenecek toplam tutar" },
    aciklama: { type: ["string", "null"], description: "Mal/hizmet açıklaması, tek satır" },
    kalemler: {
      type: "array",
      description:
        "Mal/hizmet tablosundaki HER SATIR ayrı bir öğe. Tek satırlık faturada " +
        "tek öğe döner. Satır tutarları toplamı matrah'a eşit olmalıdır.",
      items: {
        type: "object",
        properties: {
          aciklama: { type: ["string", "null"], description: "Satırın mal/hizmet tanımı, HARFİ HARFİNE" },
          // NULLABLE DEĞİL: union sınırına (16) girmesinler diye. Model her
          // zaman doldurur; tek konteynerli satırda miktar 1'dir.
          miktar: { type: "number", description: "Satır miktarı. Örn. '2 Adet' yazıyorsa 2." },
          birim_fiyat: { type: "number", description: "Satır birim fiyatı, KDV hariç" },
          konteynerler: { type: "array", items: { type: "string" }, description: "Bu satırda geçen konteyner numaraları" },
          kdv_orani: { type: ["number", "null"], description: "Satırın KDV yüzdesi" },
          matrah: { type: ["number", "null"], description: "Satır tutarı, KDV hariç (miktar x birim fiyat)" },
        },
        required: ["aciklama", "konteynerler", "miktar", "birim_fiyat", "kdv_orani", "matrah"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "fatura_no", "fatura_tarihi", "tedarikci_unvan", "tedarikci_vkn",
    "musteri_firma_adi", "konteynerler", "para_birimi", "matrah",
    "kdv_orani", "kdv_tutari", "tevkifat_tutari", "odenecek_tutar", "aciklama", "kalemler",
  ],
  additionalProperties: false,
} as const;

const SISTEM_TALIMATI = `Sen bir Türk e-Arşiv/e-Fatura belgesini okuyan bir çıkarım motorusun.
Yalnızca belgede AÇIKÇA yazan bilgiyi döndür.

KURALLAR:
- Emin olmadığın alan için null döndür. ASLA tahmin etme, ASLA hesaplama uydurma.
- Tutarlar sayı olarak döner (1.234,56 → 1234.56). Para birimi sembolü ekleme.
- tevkifat_tutari belgede yoksa 0 döndür.
- konteynerler: 4 harf + 7 rakam biçimindeki numaralar (örn. MSBU4529335).
  Belgede yoksa boş dizi döndür.

KALEM DÖKÜMÜ (kalemler):
Mal/hizmet tablosundaki HER SATIRI ayrı bir öğe olarak döndür. Bir navlun
faturasında genellikle her konteyner AYRI SATIRDIR:
  "40 CNTR GEMLİK-BURSA/HASANAĞA NAKLİYE BEDELİ(HAMU 463076-4)  1  13.000,00"
  "40 CNTR GEMLİK-BURSA/HASANAĞA NAKLİYE BEDELİ(HLBU 321238-0)  1  13.000,00"
→ iki ayrı öğe, her biri matrah 13000.
Satırların aciklama alanını HARFİ HARFİNE kopyala; satırları BİRLEŞTİRME.
Miktar sütununu olduğu gibi al: "2 Adet" yazan bir satırda miktar 2, birim
fiyat 13000, matrah 26000 olur (satırı İKİYE BÖLME).
Satır tutarlarının toplamı matrah alanına eşit olmalıdır. Tek satırlık
faturada dizide tek öğe döner.

MÜŞTERİ ADI ÇIKARIMI (musteri_firma_adi):
Mal/hizmet açıklaması şu kalıptadır:
  <güzergah> <MÜŞTERİ KISA ADI> <hizmet ifadesi> <konteyner no>
Güzergah "Gemlik" ile başlar ve bir varış noktası içerir (Bursa, Serbest
Bölge, Demirtaş DOSAB, Hasanağa, Liman, Gökçe köy, Işıksoy Antrepo...).
Hizmet ifadesi "konteyner taşıma" ya da benzeridir. Aradaki kısım müşteridir.

Örnekler:
  "Gemlik Bursa Hasanağa Deka kimya Konteyner Taşıma MRKU0850707"
      → musteri_firma_adi: "Deka kimya"
  "Gemlik Serbest Bölge Nobel Otomotiv Konteyner Taşıma MSBU4030346"
      → musteri_firma_adi: "Nobel Otomotiv"
  "Gemlik Demirtaş DOSAB Antrepo Eny Tekstil Konteyner Taşıma CAAU4972376"
      → musteri_firma_adi: "Eny Tekstil"
  "Gemlik Bursa BTS bant konteyner taşıma MRKU7242360"
      → musteri_firma_adi: "BTS bant"
  "MSMU4556503 MSNU7596587 UETU7713936"
      → musteri_firma_adi: null   (yalnızca konteyner listesi)

Faturayı kesen firmayı ya da "SAYIN" bölümündeki alıcı firmayı ASLA müşteri
olarak döndürme. Kalıba oturmuyorsa null döndür.`;

/**
 * PDF'i Claude ile ayrıştırır. Doğrulama YAPMAZ — çağıran taraf
 * faturaDogrula() ile kontrol etmelidir.
 */
export async function faturaAnalizEt(buf: Buffer): Promise<FaturaAlanlari> {
  if (!analizAktifMi()) {
    throw new Error("ANTHROPIC_API_KEY tanımlı değil");
  }

  const client = new Anthropic({ maxRetries: 2, timeout: 120_000 });

  const mesaj = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: SISTEM_TALIMATI,
    output_config: { format: { type: "json_schema", schema: FATURA_SEMASI } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: buf.toString("base64"),
            },
          },
          { type: "text", text: "Bu nakliye faturasındaki alanları çıkar." },
        ],
      },
    ],
  } as any); // output_config SDK 0.110.0 tiplerinde henüz dar tanımlı

  const metinBlok = (mesaj as any).content.find(
    (b: any) => b.type === "text",
  );
  if (!metinBlok) throw new Error("Claude cevabında metin bloğu yok");

  const ham = JSON.parse(metinBlok.text) as FaturaAlanlari;

  // Konteynerleri normalize et ve geçersizleri at
  ham.konteynerler = (ham.konteynerler || [])
    .map(normalizeKonteyner)
    .filter(konteynerGecerliMi)
    .filter((k, i, arr) => arr.indexOf(k) === i);

  // Kalem konteynerleri de aynı normalizasyondan geçer
  ham.kalemler = (ham.kalemler || []).map((k) => ({
    ...k,
    konteynerler: (k.konteynerler || [])
      .map(normalizeKonteyner)
      .filter(konteynerGecerliMi)
      .filter((x, i, arr) => arr.indexOf(x) === i),
  }));

  return ham;
}
