import Anthropic from "@anthropic-ai/sdk";

// Konşimento PDF'inden yapılandırılmış çıkarım — tek sorumluluk.
// Ödeme hedefi asla tahmin edilmez: model belgeden okur, bulamazsa null döner;
// sonuç her zaman kullanıcı onayından geçer.

export type KonsimentoAnalizSonucu = {
  konsimentoNo: string | null;
  tasiyici: string | null;
  turkiyeAcentesi: { ad: string; adres: string | null } | null;
  acenteKaynagi: string | null;
};

export function analizYapilandirildiMi(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SISTEM_ISTEMI = `Sen bir gümrük operasyon uzmanısın. Sana bir konşimento (Bill of Lading / Sea Waybill) PDF'i verilecek. Belge taranmış veya düşük kaliteli olabilir — görüntüden dikkatle oku. Üç bilgi çıkaracaksın:

1. konsimentoNo — Konşimento numarası:
- YALNIZ şu etiketli kutudan oku: "B/L No", "B/L NO.", "B/L Number", "Bill of Lading No", "Sea Waybill No", "SWB-No".
- ŞUNLARI ASLA KONŞİMENTO NUMARASI OLARAK ALMA: "Booking Number", "Booking Ref", "Carrier's Reference", "Export References", "Shipper's Ref", "OTI/NVOCC Number", fatura/kontrat numaraları ve konteyner numaraları (konteyner numarası 4 harf + 7 rakam biçimindedir).
- Numarayı KARAKTER KARAKTER aynen aktar; O ile 0, I ile 1, B ile 8 karışmalarına dikkat et. Doğru etiketi bulamıyorsan veya net okuyamıyorsan null döndür.

2. tasiyici — Taşıyıcı hat (carrier): belge başlığında/logosunda veya "Carrier:" etiketinde yazan denizcilik firması.

3. turkiyeAcentesi ve acenteKaynagi — Türkiye'deki ödeme/teslim acentesi:
- Acenteyi YALNIZ şu etiketli bloklardan al: "Port Agent", "Carrier's Agent(s)", "Carrier's Agents Endorsements", "Port of Discharge Agent", "Destination Agent", "Delivery Agent", "For delivery of (this) goods please apply to", veya belgenin alt/kenar bölgesindeki acente iletişim bloğu (vergi numarası / TAX ID / MERSIS ve telefon bilgisi içeren Türkiye adresli firma).
- ŞU BLOKLARDAN ASLA ACENTE ALMA: "Shipper" / "Exporter", "Consignee" / "Importer", "Notify Party" / "Notify Address". Bu bloklardaki firmalar müşteridir; Türkiye adresli ve A.Ş./LTD uzantılı olsalar BİLE ödeme acentesi DEĞİLDİR.
- Acente Türkiye adresli olmalıdır. Adında A.Ş. / LTD. / ŞTİ. uzantısı olması güveni artırır ama şart değildir (yabancı kökenli isimli firmaların İstanbul/Türkiye ofisleri de geçerli acentedir).
- acenteKaynagi alanına acenteyi aldığın blok etiketini aynen yaz (örn. "Destination Agent", "Port Agent", "For delivery of this goods please apply to"). İzinli blokların hiçbirinde Türkiye adresli firma yoksa turkiyeAcentesi ve acenteKaynagi null olmalı.

GENEL KURAL: Yalnız belgede YAZAN bilgiyi aktar. ASLA tahmin etme, tamamlama veya uydurma. Emin olmadığın her alanı null bırak.`;

// Yapılandırılmış çıktı şeması — her nesnede additionalProperties:false + required zorunlu.
const CIKTI_SEMASI = {
  type: "object",
  properties: {
    konsimentoNo: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Konşimento (B/L) numarası; bulunamazsa null",
    },
    tasiyici: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Taşıyıcı firma adı; bulunamazsa null",
    },
    turkiyeAcentesi: {
      anyOf: [
        {
          type: "object",
          properties: {
            ad: { type: "string", description: "Türkiye adresli acente firmanın adı" },
            adres: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description: "Acentenin adresi; belgede yoksa null",
            },
          },
          required: ["ad", "adres"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
      description: "Belgede yazılı Türkiye adresli acente; yoksa null",
    },
    acenteKaynagi: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Acentenin alındığı blok etiketi (izinli listeden); acente yoksa null",
    },
  },
  required: ["konsimentoNo", "tasiyici", "turkiyeAcentesi", "acenteKaynagi"],
  additionalProperties: false,
} as const;

export async function konsimentoAnalizEt(pdfBuffer: Buffer): Promise<KonsimentoAnalizSonucu> {
  const client = new Anthropic({ maxRetries: 1, timeout: 30_000 }); // ms — 30 sn bütçe
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: SISTEM_ISTEMI,
    output_config: { format: { type: "json_schema", schema: CIKTI_SEMASI } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          },
          { type: "text", text: "Bu konşimentodan istenen üç alanı çıkar." },
        ],
      },
    ],
  });

  if (response.stop_reason !== "end_turn") {
    throw new Error(`Analiz tamamlanamadı (stop_reason: ${response.stop_reason})`);
  }
  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) throw new Error("Analiz yanıtı boş");
  return JSON.parse(textBlock.text) as KonsimentoAnalizSonucu;
}
