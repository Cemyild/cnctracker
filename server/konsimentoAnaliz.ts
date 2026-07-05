import Anthropic from "@anthropic-ai/sdk";

// Konşimento PDF'inden yapılandırılmış çıkarım — tek sorumluluk.
// Ödeme hedefi asla tahmin edilmez: model belgeden okur, bulamazsa null döner;
// sonuç her zaman kullanıcı onayından geçer.

export type KonsimentoAnalizSonucu = {
  konsimentoNo: string | null;
  tasiyici: string | null;
  turkiyeAcentesi: { ad: string; adres: string | null } | null;
};

export function analizYapilandirildiMi(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SISTEM_ISTEMI = `Sen bir gümrük operasyon asistanısın. Sana bir konşimento (Bill of Lading) PDF'i verilecek. Görevin belgeden ŞU üç bilgiyi çıkarmak:

1. konsimentoNo: Konşimento numarası. Belgede "B/L No", "Bill of Lading No", "BL Number", "Konşimento No" gibi etiketlerle geçer. Belge numarasını birebir, boşluksuz aktar.
2. tasiyici: Taşıyıcı firma (carrier/line). Genelde belge başlığında veya logo bölgesinde yazar (örn. MSC, MAERSK, ONE, YANG MING, ARKAS).
3. turkiyeAcentesi: Belgede TÜRKİYE ADRESLİ bir firma varsa (delivery agent, destination agent, notify address bölümlerinde Türkiye/Turkey/TR adresli acente) o firmanın adı ve adresi. Türk limanı adı tek başına acente DEĞİLDİR; adresli bir FİRMA olmalı.

KURALLAR:
- Yalnız belgede YAZAN bilgiyi aktar. ASLA tahmin etme, tamamlama veya uydurma.
- Bir alandan emin değilsen o alanı null döndür.
- Belge taranmış/fotoğraf olabilir — görüntüden oku.
- Firma adlarını belgede yazıldığı gibi aktar (kısaltma açma).`;

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
  },
  required: ["konsimentoNo", "tasiyici", "turkiyeAcentesi"],
  additionalProperties: false,
} as const;

export async function konsimentoAnalizEt(pdfBuffer: Buffer): Promise<KonsimentoAnalizSonucu> {
  const client = new Anthropic({ maxRetries: 1, timeout: 20_000 }); // ms — 20 sn bütçe
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
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
