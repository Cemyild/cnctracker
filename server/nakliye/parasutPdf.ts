import fs from "fs";
import path from "path";
import { parasutIstek } from "../parasut/client";

const ARSIV = path.join("uploads", "nakliye");

/**
 * Paraşüt'teki bir e-belgenin PDF'ini indirip arşive yazar.
 *
 * Akış (Paraşüt kılavuzuna göre):
 *   GET /e_invoices/{id}/pdf  →  { data: { attributes: { url, expires_at } } }
 *   PDF henüz üretilmemişse 204 (boş gövde) döner; hazır olana dek aralıklı
 *   tekrar sorulmalı. Dönen URL YALNIZCA 1 SAAT geçerlidir ve doküman
 *   "müşteriyle paylaşmayın, indirip kendiniz gönderin" diyor — bu yüzden
 *   URL saklanmaz, PDF hemen indirilip yerel arşive yazılır.
 *
 * Tip belirsizse iki uç sırayla denenir: alış faturasındaki active_e_document
 * hem e_invoices hem e_archives olabiliyor ve ilişki tipini her zaman
 * güvenilir biçimde vermiyor.
 */
export async function eBelgePdfIndir(
  eBelgeId: string,
  faturaNo: string,
  tip: "e_invoices" | "e_archives" | "bilinmiyor" = "bilinmiyor",
): Promise<string | null> {
  const guvenliAd = faturaNo.replace(/[^A-Za-z0-9._-]/g, "_");
  const hedef = path.join(ARSIV, `${guvenliAd}.pdf`);

  // Zaten arşivdeyse tekrar indirilmez (e-Arşiv kanalından gelmiş olabilir)
  if (fs.existsSync(hedef)) return `uploads/nakliye/${guvenliAd}.pdf`;

  const yollar = tip === "bilinmiyor"
    ? [`/e_invoices/${eBelgeId}/pdf`, `/e_archives/${eBelgeId}/pdf`]
    : [`/${tip}/${eBelgeId}/pdf`];

  for (const yol of yollar) {
    // PDF üretimi asenkron: 204 gelirse bekleyip tekrar denenir
    for (let deneme = 1; deneme <= 4; deneme++) {
      let cevap: any;
      try {
        cevap = await parasutIstek<any>(yol);
      } catch {
        break; // bu uç yanlış tip — diğerini dene
      }

      const url = cevap?.data?.attributes?.url;
      if (url) {
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length === 0) return null;
          fs.mkdirSync(ARSIV, { recursive: true });
          fs.writeFileSync(hedef, buf);
          return `uploads/nakliye/${guvenliAd}.pdf`;
        } catch (e) {
          console.error(`PDF indirilemedi (${faturaNo}):`, e instanceof Error ? e.message : e);
          return null;
        }
      }

      // 204 / url yok → henüz hazır değil
      if (deneme < 4) await new Promise((s) => setTimeout(s, deneme * 2000));
    }
  }
  return null;
}
