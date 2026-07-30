import { storage } from "../storage";
import { firmaAdiBenzerligi } from "@shared/turkceNormalize";
import { normalizeKonteyner } from "./dogrulama";
import { gunSayisi } from "./tarih";
import type { GumrukVerisi } from "@shared/schema";

/**
 * Firma adı kırıcısının devreye girmesi için gereken en düşük benzerlik.
 *
 * 70 seçildi çünkü kapsama metriğinde gerçek eşleşmeler 100 veriyor
 * ("BTS bant" ⊂ "BTS BANT İÇ VE DIŞ TİCARET LTD.ŞTİ."), buna karşılık
 * yanıltıcı çiftler 50 civarında kalıyor ("DEKA KIMYA" vs "DEKA OTOMOTIV").
 * Eşik 50 olsaydı iki farklı firma sınırda eşleşirdi.
 */
const FIRMA_ESIK = 70;

/** Fatura tarihine en yakın tescil tarihli gümrük kaydını seçer. */
function tarihEnYakin(adaylar: GumrukVerisi[], faturaTarihi: string | null): GumrukVerisi {
  const hedef = gunSayisi(faturaTarihi);
  if (hedef === null) return adaylar[0];

  let en = adaylar[0];
  let enFark = Number.MAX_SAFE_INTEGER;
  for (const g of adaylar) {
    const t = gunSayisi(g.tescilTarihi);
    if (t === null) continue;
    const fark = Math.abs(t - hedef);
    if (fark < enFark) { enFark = fark; en = g; }
  }
  return en;
}

/**
 * Konteyner numarasıyla beyanname eşleştirir.
 *
 * Sıra:
 *   1) Konteyner → gumruk_verileri.house_no (normalize)
 *   2) Tek aday      → skor 90, kaynak "konteyner"
 *   3) Çok aday      → müşteri firma adı benzerliği ≥70 ve tek başına önde
 *                      ise skor 95, kaynak "konteyner+firma"
 *   4) Firma kırmazsa → fatura tarihine en yakın tescil, skor 60
 *                       (kuyrukta onay bekler)
 *   5) Bir fatura >1 beyannameye düşerse otomatik bölüştürme YAPILMAZ;
 *      eşleşmeler kaydedilir ama fatura kuyruğa gider.
 */
export async function eslestirmeCalistir(): Promise<{
  taranan: number; eslesen: number; kuyruk: number;
}> {
  const faturalar = (await storage.getNakliyeFaturalari()).filter(
    (f) => f.durum === "ayristirildi" || f.durum === "parasutta",
  );
  if (faturalar.length === 0) return { taranan: 0, eslesen: 0, kuyruk: 0 };

  // house_no dolu gümrük kayıtları → Map<normalize konteyner, kayıtlar[]>
  const gumrukVerileri = await storage.getGumrukHouseNoVerileri();
  const gumrukMap = new Map<string, GumrukVerisi[]>();
  for (const g of gumrukVerileri as GumrukVerisi[]) {
    if (!g.houseNo) continue;
    const k = normalizeKonteyner(g.houseNo);
    if (k.length < 8) continue;
    if (!gumrukMap.has(k)) gumrukMap.set(k, []);
    gumrukMap.get(k)!.push(g);
  }

  let eslesen = 0;
  let kuyruk = 0;

  for (const f of faturalar) {
    const konteynerler = (f.konteynerler || "")
      .split(",")
      .map((k) => normalizeKonteyner(k.trim()))
      .filter((k) => k.length >= 8);

    if (konteynerler.length === 0) { kuyruk++; continue; }

    const bulunanDosyalar = new Set<string>();
    let herhangiEslesme = false;

    for (const kont of konteynerler) {
      const adaylar = gumrukMap.get(kont);
      if (!adaylar || adaylar.length === 0) continue;

      let secilen = adaylar[0];
      let skor = 90;
      let kaynak = "konteyner";

      if (adaylar.length > 1) {
        if (f.musteriFirmaAdi) {
          const puanli = adaylar
            .map((g) => ({ g, p: firmaAdiBenzerligi(f.musteriFirmaAdi!, g.firmaUnvan || "") }))
            .sort((a, b) => b.p - a.p);
          const kazanan = puanli[0];
          const ikinci = puanli[1];
          if (kazanan.p >= FIRMA_ESIK && (!ikinci || kazanan.p > ikinci.p)) {
            secilen = kazanan.g;
            skor = 95;
            kaynak = "konteyner+firma";
          } else {
            secilen = tarihEnYakin(adaylar, f.faturaTarihi);
            skor = 60;
          }
        } else {
          secilen = tarihEnYakin(adaylar, f.faturaTarihi);
          skor = 60;
        }
      }

      await storage.insertEslesme({
        faturaId: f.id,
        gumrukVerisiId: secilen.id,
        konteyner: kont,
        skor,
        kaynak,
        durum: "otomatik",
      });
      if (secilen.dosyaNo) bulunanDosyalar.add(secilen.dosyaNo);
      herhangiEslesme = true;
    }

    if (!herhangiEslesme) { kuyruk++; continue; }

    if (bulunanDosyalar.size > 1) {
      // Bir fatura birden fazla beyannameye düştü — tutarı otomatik bölüştürmüyoruz
      await storage.updateNakliyeFaturasi(f.id, {
        durum: "eslesti",
        hataMesaji: `${bulunanDosyalar.size} farklı beyannameye düştü — elle bölüştürme gerekli`,
      });
      kuyruk++;
    } else {
      await storage.updateNakliyeFaturasi(f.id, { durum: "eslesti", hataMesaji: null });
      eslesen++;
    }
  }

  return { taranan: faturalar.length, eslesen, kuyruk };
}
