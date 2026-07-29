import { storage } from "../storage";
import { parasutIstek, jsonApiCoz, iliskiId } from "../parasut/client";
import { parasutMatrahTuret, paraBirimiCnc } from "../parasut/hesap";
import { normalizeKonteyner, konteynerGecerliMi } from "./dogrulama";
import { eBelgePdfIndir } from "./parasutPdf";

/** Serbest metinden konteyner numaralarını çıkarır (4 harf + 7 rakam). */
function konteynerCikar(metin: string): string[] {
  const bulunanlar = new Set<string>();
  const t = (metin || "").toUpperCase();
  const re = /([A-Z]{4})\s*(\d{7})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const k = normalizeKonteyner(m[1] + m[2]);
    if (konteynerGecerliMi(k)) bulunanlar.add(k);
  }
  return Array.from(bulunanlar);
}

/**
 * Paraşüt'teki alış faturalarını çeker ve nakliye olanları
 * nakliye_faturalari tablosuna yazar.
 *
 * "Nakliye faturası" tanımı: açıklamasında, kalem açıklamalarında veya
 * ÜRÜN ADINDA en az bir konteyner numarası geçen fatura. Ürün adı özellikle
 * önemli — hem muhasebecinin elle girdiği kayıtlarda hem bizim yazdıklarımızda
 * açıklama ürün adında durur (bkz. parasutYazma.ts).
 *
 * Konteyner içermeyen faturalar atlanır: kira, elektrik, ofis gideri vb.
 */
export async function parasuttanCek(
  gunSayisi = 60,
): Promise<{ yeni: number; atlanan: number }> {
  const bugun = new Date();
  const bas = new Date(bugun.getTime() - gunSayisi * 86400_000).toISOString().slice(0, 10);
  const bit = bugun.toISOString().slice(0, 10);

  let yeni = 0;
  let atlanan = 0;

  for (let sayfa = 1; sayfa <= 40; sayfa++) {
    const cevap = await parasutIstek<any>("/purchase_bills", {
      query: {
        // Ransack sözdizimi — virgüllü aralık 400 döner
        "filter[issue_date][gteq]": bas,
        "filter[issue_date][lteq]": bit,
        "page[size]": "25",
        "page[number]": String(sayfa),
        include: "details,details.product,supplier,active_e_document",
        sort: "-issue_date",
      },
    });
    const { veri, iliskili } = jsonApiCoz(cevap);
    if (veri.length === 0) break;

    for (const d of veri) {
      const a = d.attributes || {};
      const faturaNo = String(a.invoice_no || "").trim();
      if (!faturaNo) { atlanan++; continue; }

      // Kalem açıklamaları + ürün adları
      const detayIdler: string[] = (d.relationships?.details?.data || []).map((x: any) => x.id);
      const parcalar: string[] = [a.description || ""];
      for (const id of detayIdler) {
        const det = iliskili.get(`purchase_bill_details:${id}`);
        if (!det) continue;
        parcalar.push(det.attributes?.description || "");
        const urunId = iliskiId(det, "product");
        if (urunId) parcalar.push(iliskili.get(`products:${urunId}`)?.attributes?.name || "");
      }
      const tumMetin = parcalar.join(" ");

      const konteynerler = konteynerCikar(tumMetin);
      if (konteynerler.length === 0) { atlanan++; continue; } // nakliye değil

      const mevcut = await storage.getNakliyeFaturasiByNo(faturaNo);
      if (mevcut) {
        // Paraşüt id'si henüz bağlanmadıysa bağla (e-Arşiv kanalından gelmiş olabilir)
        if (!mevcut.parasutPurchaseBillId) {
          await storage.updateNakliyeFaturasi(mevcut.id, {
            parasutPurchaseBillId: String(d.id),
            durum: mevcut.durum === "ayristirildi" ? "parasutta" : mevcut.durum,
          });
        }
        atlanan++;
        continue;
      }

      const netTotal = Number(a.net_total ?? 0);
      const totalVat = Number(a.total_vat ?? 0);
      const tevkifat = Number(a.total_vat_withholding ?? 0);
      const matrah = parasutMatrahTuret(netTotal, totalVat, tevkifat);

      const supplierId = iliskiId(d, "supplier");
      const supplier = supplierId ? iliskili.get(`contacts:${supplierId}`) : undefined;

      const eBelgeId = iliskiId(d, "active_e_document");
      const eBelge = eBelgeId
        ? (iliskili.get(`e_invoices:${eBelgeId}`) || iliskili.get(`e_archives:${eBelgeId}`))
        : undefined;

      // KDV oranı ilk kalemden; yoksa matrahtan türet
      const ilkKalem = detayIdler[0]
        ? iliskili.get(`purchase_bill_details:${detayIdler[0]}`)
        : undefined;
      const kdvOrani = ilkKalem?.attributes?.vat_rate != null
        ? Math.round(Number(ilkKalem.attributes.vat_rate))
        : (matrah > 0 ? Math.round((totalVat / matrah) * 100) : 0);

      // Açıklama: ürün adı varsa o, yoksa fatura açıklaması
      const ilkUrunId = ilkKalem ? iliskiId(ilkKalem, "product") : undefined;
      const aciklama = (ilkUrunId ? iliskili.get(`products:${ilkUrunId}`)?.attributes?.name : null)
        || a.description || null;

      // e-Belge PDF'ini Paraşüt'ten indirip arşive al. Kullanıcının istediği
      // "Paraşüt'ten de PDF olarak alınsın" adımı budur.
      let pdfYolu: string | null = null;
      if (eBelgeId) {
        pdfYolu = await eBelgePdfIndir(eBelgeId, faturaNo);
      }

      await storage.insertNakliyeFaturasi({
        kaynak: "efatura",
        faturaNo,
        faturaTarihi: a.issue_date || null,
        tedarikciUnvan: supplier?.attributes?.name || null,
        tedarikciVkn: supplier?.attributes?.tax_number || null,
        musteriFirmaAdi: null,
        paraBirimi: paraBirimiCnc(a.currency || "TRL"),
        kur: String(a.exchange_rate ?? 1),
        matrah: String(matrah),
        kdvOrani,
        kdvTutari: String(totalVat),
        tevkifatTutari: String(tevkifat),
        odenecekTutar: String(netTotal),
        konteynerler: konteynerler.join(", "),
        aciklama: aciklama ? String(aciklama).slice(0, 500) : null,
        pdfYolu,
        parasutPurchaseBillId: String(d.id),
        parasutEttn: eBelge?.attributes?.uuid || null,
        hamMetin: null,
        llmJson: null,
        durum: "parasutta",
        hataMesaji: null,
      });

      // Nakliye ekranının (Navlun Faturaları) kullandığı tabloya da yaz —
      // aksi halde Paraşüt'ten çekilen e-faturalar ekranda görünmez.
      const ekranKaydi = (await storage.getNakliyeVerileri())
        .find((v) => v.faturaNo === faturaNo);
      if (!ekranKaydi) {
        await storage.insertNakliyeVerileri([{
          faturaNo,
          faturaTarihi: a.issue_date || null,
          malHizmet: aciklama ? String(aciklama).slice(0, 500) : null,
          miktar: "1",
          birimFiyat: String(matrah),
          kdvOranı: kdvOrani,
          kdvTutarı: String(totalVat),
          malHizmetToplamTutarı: String(matrah),
          hesaplananKdv20: String(totalVat),
          hesaplananKdvTevkifat20: String(tevkifat),
          vergilerDahilToplamTutar: String(Math.round((matrah + totalVat) * 100) / 100),
          odenecekTutar: String(netTotal),
          konteynerler: konteynerler.join(", "),
          tedarikciUnvan: supplier?.attributes?.name || null,
          tedarikciVkn: supplier?.attributes?.tax_number || null,
          pdfYolu,
          rawJson: JSON.stringify({ kaynak: "parasut", purchaseBillId: d.id, attributes: a }),
        }]);
      }
      yeni++;
    }

    if (veri.length < 25) break;
  }

  return { yeni, atlanan };
}
