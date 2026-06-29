import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

// Mevcut /api/chat ile aynı Anthropic istemcisi (ANTHROPIC_API_KEY .env'den)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "dummy",
});

export interface ExtractedPolicy {
  sirket: string | null;
  policeNo: string | null;
  bitisTarihi: string | null; // YYYY-MM-DD
  fiyat: string | null; // sayısal string (binlik ayraç yok, ondalık nokta)
}

// Desteklenen dosya tipleri → Claude media_type (PDF document bloğu, görseller image bloğu)
const MEDIA_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Yüklenen trafik/kasko poliçe dosyasını (PDF veya görsel) Claude Haiku 4.5 ile
 * okuyup şirket / poliçe no / bitiş tarihi / fiyat alanlarını çıkarır.
 * Hata veya eksik anahtar durumunda null döner — çağıran taraf yükleme akışını
 * bu yüzden ASLA durdurmamalı (extraction best-effort'tur).
 */
export async function extractPolicyFields(
  filePath: string,
  kind: "trafik" | "kasko",
): Promise<ExtractedPolicy | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Poliçe OCR atlandı: ANTHROPIC_API_KEY tanımlı değil.");
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mediaType = MEDIA_TYPES[ext];
  if (!mediaType) return null; // desteklenmeyen tip (ör. .docx)

  let b64: string;
  try {
    b64 = fs.readFileSync(filePath).toString("base64");
  } catch (e) {
    console.error("Poliçe OCR: dosya okunamadı:", e);
    return null;
  }

  const isPdf = mediaType === "application/pdf";
  // SDK sürümünden bağımsız olmak için content bloklarını any[] olarak kuruyoruz
  const fileBlock: any = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };

  const tur = kind === "trafik" ? "trafik sigortası (zorunlu trafik)" : "kasko";
  const prompt = `Bu bir ${tur} poliçesi belgesidir. Aşağıdaki alanları belgeden çıkar ve SADECE şu JSON nesnesiyle yanıtla. Markdown, kod bloğu veya açıklama YAZMA, sadece ham JSON döndür:
{"sirket": null, "policeNo": null, "bitisTarihi": null, "fiyat": null}

Alan kuralları:
- "sirket": Poliçeyi düzenleyen sigorta şirketinin adı (ör. "Allianz Sigorta", "Mapfre Sigorta", "Ray Sigorta", "Anadolu Sigorta", "HDI Sigorta", "Axa Sigorta").
- "policeNo": Poliçe numarası (yalnızca numara/kod, etiket olmadan).
- "bitisTarihi": Poliçenin BİTİŞ / vade sonu tarihi. KESİNLİKLE "YYYY-MM-DD" formatında ver. Başlangıç (tanzim) tarihiyle KARIŞTIRMA — bitiş/vade sonu olanı seç.
- "fiyat": Toplam prim / ödenecek tutar. SADECE sayı ver; para birimi, "TL", "₺", boşluk ve binlik ayraç olmadan. Ondalık ayraç olarak nokta kullan (ör. 18.450,75 → "18450.75").
- Bir alanı belgede bulamazsan değerini null bırak.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [
        { role: "user", content: [fileBlock, { type: "text", text: prompt }] as any },
      ],
    });

    const textBlock = (message.content as any[]).find((b) => b.type === "text");
    const raw = textBlock?.text || "";
    return parseExtraction(raw);
  } catch (err) {
    console.error("Poliçe OCR (Anthropic) hatası:", err);
    return null;
  }
}

function parseExtraction(text: string): ExtractedPolicy | null {
  // Olası markdown fence'lerini temizle, ilk { ile son } arasını al
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;

  let obj: any;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }

  const norm = (v: any): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === "" || s.toLowerCase() === "null" ? null : s;
  };

  return {
    sirket: norm(obj.sirket),
    policeNo: norm(obj.policeNo),
    bitisTarihi: normalizeDate(norm(obj.bitisTarihi)),
    fiyat: normalizeAmount(norm(obj.fiyat)),
  };
}

// dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy → yyyy-mm-dd; zaten yyyy-mm-dd ise dokunma
function normalizeDate(s: string | null): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s; // tanınmayan formatı olduğu gibi bırak (kullanıcı düzeltebilir)
}

// "18.450,75 TL" → "18450.75"; "₺ 19 800" → "19800"
function normalizeAmount(s: string | null): string | null {
  if (!s) return null;
  let v = s.replace(/[^\d.,]/g, "");
  if (v === "") return null;
  if (v.includes(".") && v.includes(",")) {
    // TR biçimi: nokta binlik, virgül ondalık
    v = v.replace(/\./g, "").replace(",", ".");
  } else if (v.includes(",")) {
    v = v.replace(",", ".");
  }
  return v;
}
