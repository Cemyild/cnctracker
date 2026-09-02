import { storage } from "../storage";
import { parasutIstek, jsonApiCoz, iliskiId } from "../parasut/client";
import { parasutMatrahTuret, paraBirimiCnc } from "../parasut/hesap";
import { konteynerGecerliMi } from "./dogrulama";
import { konteynerAnahtarlari } from "@shared/konteyner";
import { eBelgePdfIndir } from "./parasutPdf";

/**
 * Serbest metinden konteyner numaralarını çıkarır.
 *
 * TEK DOĞRULUK KAYNAĞI @shared/konteyner'dır. Burada eskiden ayrı bir regex
 * vardı (`[A-Z]{4}\s*\d{7}`) ve YALNIZ bitişik 7 rakamı tanıyordu; kontrol
 * hanesi ayrılmış yazılan numaraları kaçırıyordu. Tedarikçi faturalarında bu
 * biçim yaygın:
 *   "40 CNTR GEMLİK-BURSA/DEMİRTAŞ NAKLİYE BEDELİ(TIIU 685049-6)"
 * Sonuç: fatura "konteyner içermiyor" sayılıp NAKLİYE FATURASI OLARAK
 * TANINMIYOR ve Paraşüt'ten hiç çekilmiyordu — kullanıcı "İçeri Al" yapıp
 * düğmeye bastığı halde fatura uygulamaya düşmüyordu (canlıda 2026-08-25:
 * GAF2026000002211 ve GAF2026000002212).
 *
 * `konteynerGecerliMi` filtresi korunur: 4 harf + 7 rakama indirgenemeyen
 * parçalar (kontrol hanesiz 6 rakamlı yazımlar) eskisi gibi elenir.
 */
function konteynerCikar(metin: string): string[] {
  return konteynerAnahtarlari(metin).filter(konteynerGecerliMi);
}

/**
 * Alış faturasının KALEM DÖKÜMÜNÜ çıkarır.
 *
 * Bir navlun faturası birden çok konteyner taşıyabiliyor ve her konteyner ayrı
 * kalem olarak geliyor (GAF2026000002285 → 5 kalem × 13.000 TL). Eskiden
 * yalnız İLK kalemin adı saklanıyor, tutar olarak faturanın toplamı
 * kullanılıyordu; müşteri faturasında 5 satır yerine tek satır çıkıyordu.
 *
 * Kalem adı olarak ÜRÜN ADI tercih edilir, yoksa kalem açıklaması: müşteri
 * faturasına harfi harfine bu ad geçiyor ve ürün adı tedarikçinin yazdığı
 * metni taşıyor (bkz. parasutYazma.ts / satisFaturasi.ts).
 */
function kalemleriCikar(
  detayIdler: string[],
  iliskili: Map<string, any>,
): Array<{
  sira: number; aciklama: string | null; konteynerler: string | null;
  miktar: string; birimFiyat: string; kdvOrani: number; matrah: string;
}> {
  const kalemler = [];
  let sira = 0;
  for (const id of detayIdler) {
    const det = iliskili.get(`purchase_bill_details:${id}`);
    if (!det) continue;
    const at = det.attributes || {};
    const urunId = iliskiId(det, "product");
    const urunAdi = urunId ? iliskili.get(`products:${urunId}`)?.attributes?.name : null;
    const ad = urunAdi || at.description || null;

    const miktar = Number(at.quantity ?? 1) || 1;
    const birimFiyat = Number(at.unit_price ?? 0);
    // İskonto alanları burada UYGULANMAZ: canlıda bu tedarikçilerde iskonto
    // yok ve toplam doğrulaması (kalem toplamı == fatura matrahı) sapmayı
    // zaten yakalar; sapan faturada kalem dökümü kullanılmaz.
    const satirMatrah = Math.round(miktar * birimFiyat * 100) / 100;

    sira += 1;
    kalemler.push({
      sira,
      aciklama: ad ? String(ad).slice(0, 500) : null,
      konteynerler: konteynerCikar(`${urunAdi || ""} ${at.description || ""}`).join(", ") || null,
      miktar: String(miktar),
      birimFiyat: String(birimFiyat),
      kdvOrani: at.vat_rate != null ? Math.round(Number(at.vat_rate)) : 0,
      matrah: String(satirMatrah),
    });
  }
  return kalemler;
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
        // Kalem dökümü sonradan eklendi; eski kayıtlarda yok. Paraşüt'ten
        // okuduğumuz kalemleri geriye tamamla — aksi halde çok kalemli eski
        // faturalar müşteriye hâlâ tek satır olarak kesilir.
        const mevcutKalemler = await storage.getNakliyeKalemleriByFaturaIds([mevcut.id]);
        if (mevcutKalemler.length === 0) {
          const kalemler = kalemleriCikar(detayIdler, iliskili);
          if (kalemler.length > 0) await storage.setNakliyeKalemleri(mevcut.id, kalemler);
        }
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

      const yeniKayit = await storage.insertNakliyeFaturasi({
        kaynak: "efatura",
        // Paraşüt'ten çekilen kayıt zaten Paraşüt'te var; sistemin oraya
        // yazacağı bir şey yok. Tipi "efatura" işaretlemek yazma kapısını
        // kapalı tutar (bkz. senkron.ts adım 2).
        belgeTipi: "efatura",
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

      await storage.setNakliyeKalemleri(yeniKayit.id, kalemleriCikar(detayIdler, iliskili));

      // Nakliye ekranının (Navlun Faturaları) kullandığı tabloya da yaz —
      // aksi halde Paraşüt'ten çekilen e-faturalar ekranda görünmez.
      const ekranKaydi = (await storage.getNakliyeVerileri())
        .find((v) => v.faturaNo === faturaNo);
      if (ekranKaydi) {
        // Eski poller döneminden kalan kayıtlarda PDF ve tedarikçi bilgisi yok.
        // Paraşüt'ten indirdiğimiz PDF'i ve cari bilgisini geriye tamamla.
        const eksikler: Record<string, unknown> = {};
        if (!ekranKaydi.pdfYolu && pdfYolu) eksikler.pdfYolu = pdfYolu;
        if (!ekranKaydi.tedarikciUnvan && supplier?.attributes?.name) {
          eksikler.tedarikciUnvan = supplier.attributes.name;
        }
        if (!ekranKaydi.tedarikciVkn && supplier?.attributes?.tax_number) {
          eksikler.tedarikciVkn = supplier.attributes.tax_number;
        }
        if (Object.keys(eksikler).length > 0) {
          await storage.updateNakliyeVerisi(ekranKaydi.id, eksikler as any);
        }
      } else {
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
