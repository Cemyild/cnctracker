import { storage } from "../storage";
import { parasutIstek, jsonApiCoz, iliskiId } from "../parasut/client";
import { paraBirimiParasut } from "../parasut/hesap";
import { normalizeKonteyner, konteynerGecerliMi } from "./dogrulama";
import { firmaAdiBenzerligi } from "@shared/turkceNormalize";
import { konteynerAnahtarlari } from "@shared/konteyner";
import { tarihGoster, sistemOncesiMi } from "./tarih";
import type { NakliyeFaturasi, GumrukVerisi, NakliyeVerisi } from "@shared/schema";

/** Gelen matrahın üzerine eklenen marj. 10.000 → 12.000 (+ KDV). */
const MARJ = 1.20;

export type FaturaKalemi = {
  faturaId: string;
  faturaNo: string;
  tedarikci: string | null;
  konteynerler: string;
  /**
   * Tedarikçi faturasındaki mal/hizmet tanımı — HARFİ HARFİNE.
   * Müşteriye kesilen faturanın kalem adı bu olur; büyük/küçük harf düzeni
   * dahil hiçbir şey değiştirilmez.
   */
  aciklama: string | null;
  gelenMatrah: number;
  kesilecekMatrah: number;
  kdvOrani: number;
};

export type DosyaOnizleme = {
  dosyaNo: string;
  firmaUnvan: string | null;
  vkn: string | null;
  beklenenKonteyner: number;
  eslesenKonteyner: number;
  hazir: boolean;
  engel: string | null;
  /**
   * Engel, kullanıcı onayıyla aşılabilir mi? Yalnızca "beklemek bir iş kararı"
   * olan engeller için true (eksik konteyner, boş konteyner sayısı).
   * Mükerrer fatura ve müşterisiz fatura engelleri ASLA aşılamaz.
   */
  zorlanabilir: boolean;
  paraBirimi: string;
  kalemler: FaturaKalemi[];
  netToplam: number;
  kdvToplam: number;
  genelToplam: number;
  /** Paraşüt "Fatura Notu" alanına yazılacak beyanname bilgi satırı. */
  faturaNotu: string;
};

/**
 * Paraşüt "Fatura Notu" alanına yazılacak beyanname bilgi satırını üretir.
 *
 * Kaynak, EKRANDAKİ eşleşme kutusunun ta kendisidir (nakliye_verileri'nin
 * gumruk* alanları). Böylece Paraşüt'teki not ile kullanıcının ekranda gördüğü
 * mor satır birebir aynı olur — ayrı bir türetme yolu olsaydı ikisi zamanla
 * ayrışırdı.
 *
 * Biçim:
 *   dosya no - firma unvanı - gümrük - kıymet - döviz - tescil no - tescil tarihi - konteyner(ler)
 */
function faturaNotuUret(v: NakliyeVerisi, konteynerler: string[]): string {
  const parcalar = [
    v.ilgiliDosyaNo,
    v.gumrukFirmaUnvan,
    v.gumrukAdi,
    v.gumrukDovizKiymeti,
    v.gumrukDovizCinsi,
    v.gumrukTescilNo,
    tarihGoster(v.gumrukTescilTarihi),
    konteynerler.join(", "),
  ].map((p) => String(p ?? "").trim());

  return parcalar.filter((p) => p.length > 0).join(" - ");
}

/**
 * Paraşüt'teki MEVCUT satış faturalarında geçen konteyner numaralarını toplar.
 *
 * Neden gerekli: bu sistem devreye girmeden önce müşteri faturaları elle
 * kesilmişti ve muhasebeci konteyner numarasını satış faturasının ürün adına
 * yazıyor ("20 CNTR GEMLİK-BURSA/KAYAPA NAKLİYE BEDELİ HLBU8087850").
 * Bu tarama olmadan sistem, elle kesilmiş faturaları ikinci kez keserdi —
 * ölçüldü: hazır görünen 14 dosyadan 13'ü zaten faturalanmıştı.
 *
 * parasut_satis_faturalari tablosu yalnızca BU sistemin kestiklerini bilir;
 * geçmişi bilmez. Bu yüzden kaynak olarak Paraşüt'ün kendisi taranır.
 */
let kesilmisOnbellek: { zaman: number; konteynerler: Map<string, string> } | null = null;
const ONBELLEK_MS = 10 * 60 * 1000;

async function kesilmisKonteynerler(): Promise<Map<string, string>> {
  if (kesilmisOnbellek && Date.now() - kesilmisOnbellek.zaman < ONBELLEK_MS) {
    return kesilmisOnbellek.konteynerler;
  }

  const bulunan = new Map<string, string>(); // konteyner → "tarih / tutar"
  const yil = new Date().getFullYear();

  for (let sayfa = 1; sayfa <= 40; sayfa++) {
    const cevap = await parasutIstek<any>("/sales_invoices", {
      query: {
        "filter[issue_date][gteq]": `${yil - 1}-01-01`,
        "filter[issue_date][lteq]": `${yil}-12-31`,
        "page[size]": "25",
        "page[number]": String(sayfa),
        include: "details,details.product",
      },
    });
    const { veri, iliskili } = jsonApiCoz(cevap);
    if (veri.length === 0) break;

    for (const d of veri) {
      const parcalar: string[] = [d.attributes?.description || "", d.attributes?.invoice_note || ""];
      for (const det of d.relationships?.details?.data || []) {
        const dd = iliskili.get(`sales_invoice_details:${det.id}`);
        if (!dd) continue;
        parcalar.push(dd.attributes?.description || "");
        const pid = iliskiId(dd, "product");
        if (pid) parcalar.push(iliskili.get(`products:${pid}`)?.attributes?.name || "");
      }
      const metin = parcalar.join(" ").toUpperCase();
      const re = /([A-Z]{4})\s*(\d{7})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(metin)) !== null) {
        const k = normalizeKonteyner(m[1] + m[2]);
        if (konteynerGecerliMi(k)) {
          bulunan.set(k, `${d.attributes?.issue_date} / ${d.attributes?.net_total}`);
        }
      }
    }
    if (veri.length < 25) break;
  }

  kesilmisOnbellek = { zaman: Date.now(), konteynerler: bulunan };
  return bulunan;
}

/** Mükerrer taramasının önbelleğini boşaltır (yeni fatura kesildikten sonra). */
export function kesilmisOnbellegiTemizle(): void {
  kesilmisOnbellek = null;
}

/** Fatura kesilemeyecek durumdaki (doğrulaması düşmüş) kayıtlar. */
const KESILEMEZ_DURUMLAR = new Set(["dogrulama_hatasi", "hata", "revizyon_gerekli"]);

/**
 * Beyanname bazında gruplanmış faturaların önizlemesini üretir.
 * Paraşüt'e HİÇBİR ŞEY YAZMAZ — hem UI hem kuru çalıştırma için.
 *
 * EŞLEŞMENİN TEK DOĞRULUK KAYNAĞI EKRANDIR (nakliye_verileri.ilgiliDosyaNo).
 *
 * Neden: iki ayrı eşleştirici vardı ve sessizce ayrıştılar (canlıda ölçüldü:
 * ekranda eşleşmiş 11 fatura boru hattında eşleşmemiş görünüyordu). İki neden:
 *   1) Kullanıcı ekranda konteyner numarasını düzeltince nakliye_faturalari
 *      tablosundaki eski numara olduğu gibi kalıyordu.
 *   2) Beyannamede tek hücrede birden fazla numara olabiliyor
 *      ("SEGU5603686,HAMU49"); ekran eşleştiricisi hücreyi desenle parçalıyor,
 *      boru hattındaki parçalamıyordu.
 * Ekran, kullanıcının GÖRDÜĞÜ ve DÜZELTEBİLDİĞİ yer olduğu için doğruluk
 * kaynağı olmaya tek adaydır. Böylece bir düzeltme anında faturaya yansır.
 *
 * İŞ BÖLÜMÜ: eşleşme ekrandan, PARA ise doğrulanmış fatura kaydından
 * (nakliye_faturalari) gelir — tutarlar aritmetik doğrulamadan geçmiş tek yer
 * orasıdır. Ekran satırının kendi tutar alanları faturalamada KULLANILMAZ.
 */
export async function faturaOnizleme(): Promise<DosyaOnizleme[]> {
  const ekranKayitlari = (await storage.getNakliyeVerileri()).filter(
    // SİSTEM ÖNCESİ DÖNEM DIŞLANIR: Temmuz 2026'dan önceki faturaların tamamı
    // elle kesildi. Aday listesine girselerdi mükerrer fatura riski yalnızca
    // Paraşüt taramasına kalırdı — tarama bir kez başarısız olsa 269 kayıt
    // yeniden faturalanabilir hale gelirdi. Tarih eşiği bunu yapısal olarak
    // imkânsız kılar. elleIslendi ise tarihsiz eski kayıtlar için istisna yolu.
    (v) => v.ilgiliDosyaNo && v.faturaNo && !v.elleIslendi && !sistemOncesiMi(v.faturaTarihi),
  );
  if (ekranKayitlari.length === 0) return [];

  const faturalar = await storage.getNakliyeFaturalari();
  const faturaMap = new Map<string, NakliyeFaturasi>(faturalar.map((f) => [f.faturaNo, f]));

  // (dosya no | konteyner) → gümrük kaydı. VKN ve beklenen konteyner sayısı
  // buradan okunur. Aynı dosyada birden çok firma satırı olabildiği için
  // (canlıda görüldü: 26-10359 → ENYTEKS + FEKA) anahtar dosya no ile
  // YETİNMEZ, eşleşmeyi kuran konteyneri de içerir.
  const gumrukIndeks = new Map<string, GumrukVerisi>();
  for (const g of (await storage.getGumrukHouseNoVerileri()) as GumrukVerisi[]) {
    if (!g.dosyaNo) continue;
    for (const k of konteynerAnahtarlari(g.houseNo)) {
      const anahtar = `${g.dosyaNo}|${k}`;
      if (!gumrukIndeks.has(anahtar)) gumrukIndeks.set(anahtar, g);
    }
  }

  const gruplar = new Map<string, {
    dosyaNo: string;
    ekran: NakliyeVerisi;           // fatura notunun kaynağı (ilk satır)
    gumruk: GumrukVerisi | null;    // VKN + beklenen konteyner sayısı
    faturaNolar: Set<string>;
    konteynerler: Set<string>;
    faturaKaydiOlmayan: string[];
  }>();

  for (const v of ekranKayitlari) {
    const dosyaNo = v.ilgiliDosyaNo!;
    const kendiKonteynerleri = konteynerAnahtarlari(v.konteynerler);

    if (!gruplar.has(dosyaNo)) {
      gruplar.set(dosyaNo, {
        dosyaNo, ekran: v, gumruk: null,
        faturaNolar: new Set(), konteynerler: new Set(), faturaKaydiOlmayan: [],
      });
    }
    const grup = gruplar.get(dosyaNo)!;

    // Gümrük kaydı: önce eşleşmeyi kuran house_no, olmazsa satırın konteynerleri
    if (!grup.gumruk) {
      const adaylar = [
        ...(v.eslesenHouseNo ? konteynerAnahtarlari(v.eslesenHouseNo) : []),
        ...kendiKonteynerleri,
      ];
      for (const k of adaylar) {
        const g = gumrukIndeks.get(`${dosyaNo}|${k}`);
        if (g) { grup.gumruk = g; break; }
      }
    }

    for (const k of kendiKonteynerleri) grup.konteynerler.add(k);

    const f = faturaMap.get(v.faturaNo!);
    if (!f) {
      // Ekranda var ama doğrulanmış fatura kaydı yok (PDF akışından önceki
      // tarihsel kayıtlar). Tutarına güvenilemez — faturalanmaz.
      grup.faturaKaydiOlmayan.push(v.faturaNo!);
    } else if (!KESILEMEZ_DURUMLAR.has(f.durum)) {
      grup.faturaNolar.add(f.faturaNo);
    }
  }

  // YEDEK ARAMA — konteyner üzerinden gümrük kaydı bulunamayan gruplar için.
  //
  // Elle dosya no ile eşleştirilen faturalarda (konteyner numarası hiç
  // olmayanlar) yukarıdaki konteyner anahtarlı indeks tutmaz. VKN ve beklenen
  // konteyner sayısı yalnız gümrük kaydında olduğu için dosya numarasıyla
  // tekrar aranır. N+1 değil: eksik dosyaların TAMAMI tek inArray sorgusunda.
  const eksikDosyalar = Array.from(gruplar.values())
    .filter((g) => !g.gumruk)
    .map((g) => g.dosyaNo);

  if (eksikDosyalar.length > 0) {
    const ekstra = await storage.getGumrukVerileriByDosyaNolar(eksikDosyalar);
    const dosyaBazli = new Map<string, GumrukVerisi[]>();
    for (const g of ekstra) {
      if (!g.dosyaNo) continue;
      if (!dosyaBazli.has(g.dosyaNo)) dosyaBazli.set(g.dosyaNo, []);
      dosyaBazli.get(g.dosyaNo)!.push(g);
    }

    for (const grup of Array.from(gruplar.values())) {
      if (grup.gumruk) continue;
      const adaylar = dosyaBazli.get(grup.dosyaNo);
      if (!adaylar || adaylar.length === 0) continue;

      // Aynı dosyada birden çok firma olabildiği için ekrandaki unvanla kırılır.
      // Kıramazsak seçim YAPMAYIZ — yanlış firmanın VKN'si yanlış müşteriye
      // fatura kesilmesine yol açar; VKN'siz kalıp unvan yedeğine düşmek daha güvenli.
      if (adaylar.length === 1) { grup.gumruk = adaylar[0]; continue; }
      const ekranUnvan = grup.ekran.gumrukFirmaUnvan || grup.ekran.musteri || "";
      if (!ekranUnvan) continue;
      const puanli = adaylar
        .map((g) => ({ g, p: firmaAdiBenzerligi(ekranUnvan, g.firmaUnvan || "") }))
        .sort((a, b) => b.p - a.p);
      if (puanli[0].p >= 70 && (!puanli[1] || puanli[0].p > puanli[1].p)) {
        grup.gumruk = puanli[0].g;
      }
    }
  }

  const sonuc: DosyaOnizleme[] = [];

  // Paraşüt'te daha önce (elle) kesilmiş faturaların konteynerleri
  let kesilmis: Map<string, string>;
  try {
    kesilmis = await kesilmisKonteynerler();
  } catch (e) {
    // Tarama yapılamazsa GÜVENLİ TARAFTA kal: hiçbir dosyayı hazır saymayız.
    // Aksi halde mükerrer fatura kesme riski doğar.
    console.error("Mükerrer taraması yapılamadı:", e instanceof Error ? e.message : e);
    kesilmis = new Map([["__TARAMA_BASARISIZ__", "bilinmiyor"]]);
  }
  const taramaBasarisiz = kesilmis.has("__TARAMA_BASARISIZ__");

  for (const [dosyaNo, grup] of Array.from(gruplar.entries())) {
    const beklenen = parseInt(String(grup.gumruk?.konteynerSayisi || "0"), 10) || 0;
    const eslesen = grup.konteynerler.size;
    const vkn = String(grup.gumruk?.vn || "").replace(/\D/g, "") || null;
    const firmaUnvan = grup.ekran.gumrukFirmaUnvan || grup.gumruk?.firmaUnvan || null;

    // Bu dosyanın konteynerlerinden biri Paraşüt'teki bir satış faturasında
    // geçiyorsa fatura zaten kesilmiş demektir.
    const zatenKesilmis = Array.from(grup.konteynerler).find((k) => kesilmis.has(k));

    // ENGELLER İKİ SINIFA AYRILIR:
    //   aşılamaz → mükerrer fatura / müşterisiz fatura riski taşır, `zorla` bunu ASLA geçmez
    //   aşılabilir → beklemek bir iş kararıdır; kullanıcı ekranda görüp butonla geçebilir
    let engel: string | null = null;
    let zorlanabilir = false;

    if (taramaBasarisiz) engel = "Mükerrer taraması yapılamadı — güvenlik gereği bekletiliyor";
    else if (await storage.getSatisFaturasiByDosyaNo(dosyaNo)) engel = "Bu dosya için taslak zaten var";
    else if (zatenKesilmis) {
      engel = `Paraşüt'te zaten faturalanmış (${zatenKesilmis} → ${kesilmis.get(zatenKesilmis)})`;
    }
    else if (!vkn && !firmaUnvan) engel = "Beyannamede ne VKN ne firma unvanı var";
    else if (grup.faturaNolar.size === 0) {
      engel = grup.faturaKaydiOlmayan.length
        ? `Doğrulanmış fatura kaydı yok (${grup.faturaKaydiOlmayan.join(", ")}) — tutara güvenilemez`
        : "Faturalanabilir kalem yok";
    }
    else if (!beklenen) {
      engel = "Beyannamede konteyner sayısı boş — otomatik tetiklenemez";
      zorlanabilir = true;
    }
    else if (eslesen < beklenen) {
      engel = `${beklenen} konteynerin ${eslesen}'i eşleşti — bekliyor`;
      zorlanabilir = true;
    }

    const grupFaturalari = Array.from(grup.faturaNolar)
      .map((no) => faturaMap.get(no))
      .filter((f): f is NakliyeFaturasi => Boolean(f));

    const kalemler: FaturaKalemi[] = grupFaturalari.map((f) => {
      const gelen = Number(f.matrah ?? 0);
      return {
        faturaId: f.id,
        faturaNo: f.faturaNo,
        tedarikci: f.tedarikciUnvan,
        konteynerler: f.konteynerler || "",
        aciklama: f.aciklama,
        gelenMatrah: gelen,
        kesilecekMatrah: Math.round(gelen * MARJ * 100) / 100,
        kdvOrani: f.kdvOrani ?? 0,
      };
    });

    const netToplam = Math.round(kalemler.reduce((t, k) => t + k.kesilecekMatrah, 0) * 100) / 100;
    const kdvToplam = Math.round(
      kalemler.reduce((t, k) => t + k.kesilecekMatrah * (k.kdvOrani / 100), 0) * 100,
    ) / 100;

    sonuc.push({
      dosyaNo,
      firmaUnvan,
      vkn,
      beklenenKonteyner: beklenen,
      eslesenKonteyner: eslesen,
      hazir: engel === null,
      engel,
      zorlanabilir,
      paraBirimi: grupFaturalari[0]?.paraBirimi || "TRY",
      kalemler,
      netToplam,
      kdvToplam,
      genelToplam: Math.round((netToplam + kdvToplam) * 100) / 100,
      faturaNotu: faturaNotuUret(grup.ekran, Array.from(grup.konteynerler)),
    });
  }

  return sonuc.sort((a, b) => a.dosyaNo.localeCompare(b.dosyaNo));
}

/**
 * Cari (müşteri) listesi önbelleği — unvan yedeği için.
 *
 * Neden liste çekiliyor, filter[name] kullanılmıyor: Paraşüt'ün isim filtresi
 * bu hesapta sonuç döndürmüyor (BTS/ENYTEKS/DE-KA aramaları 0 sonuç verdi,
 * oysa müşteriler kayıtlı). Bunun yerine tüm cari listesi bir kez çekilip
 * normalize edilmiş unvana göre karşılaştırılıyor.
 */
let cariOnbellek: Array<{ id: string; ad: string }> | null = null;

async function cariListesiYukle(): Promise<Array<{ id: string; ad: string }>> {
  if (cariOnbellek) return cariOnbellek;
  const hepsi: Array<{ id: string; ad: string }> = [];
  for (let sayfa = 1; sayfa <= 40; sayfa++) {
    const cevap = await parasutIstek<any>("/contacts", {
      query: { "filter[account_type]": "customer", "page[size]": "25", "page[number]": String(sayfa) },
    });
    const { veri } = jsonApiCoz(cevap);
    if (veri.length === 0) break;
    for (const c of veri) hepsi.push({ id: String(c.id), ad: String(c.attributes?.name || "") });
    if (veri.length < 25) break;
  }
  cariOnbellek = hepsi;
  return hepsi;
}

/** Önbelleği boşaltır (yeni cari eklendiğinde tazelemek için). */
export function cariOnbellegiTemizle(): void {
  cariOnbellek = null;
}

/**
 * Müşteri cari kartını bulur: önce VKN, olmazsa unvan.
 *
 * VKN birincil anahtardır çünkü kesindir. Unvan yedeği, VKN'si eksik kalan
 * ~%1,4 kayıt için. Unvanda TAM eşleşme (100) aranır ve tek sonuç şartı
 * vardır — yanlış müşteriye fatura kesmektense kuyrukta insan onayı beklenir.
 */
async function musteriBul(vkn: string | null, firmaUnvan: string): Promise<string | undefined> {
  if (vkn) {
    try {
      const cevap = await parasutIstek<any>("/contacts", {
        query: { "filter[tax_number]": vkn, "page[size]": "5" },
      });
      const bulunan = jsonApiCoz(cevap).veri[0]?.id;
      if (bulunan) return String(bulunan);
    } catch (e) {
      console.error(`VKN ile cari arama hatası (${vkn}):`, e instanceof Error ? e.message : e);
    }
  }
  if (!firmaUnvan) return undefined;
  const liste = await cariListesiYukle();
  const tam = liste.filter((c) => firmaAdiBenzerligi(firmaUnvan, c.ad) === 100);
  return tam.length === 1 ? tam[0].id : undefined;
}

/**
 * Fatura kalemi için ürün oluşturur (alış tarafıyla aynı kalıp).
 * inventory_tracking: false — hizmet kalemi.
 */
async function urunOlustur(ad: string, kdvOrani: number): Promise<string> {
  const cevap = await parasutIstek<any>("/products", {
    method: "POST",
    body: {
      data: {
        type: "products",
        attributes: {
          name: ad.slice(0, 200), vat_rate: kdvOrani, unit: "Adet",
          inventory_tracking: false, currency: "TRL",
        },
      },
    },
  });
  const id = cevap?.data?.id;
  if (!id) throw new Error("Paraşüt cevabında product id yok");
  return String(id);
}

/**
 * Beyanname dosya numarasını Paraşüt etiketi olarak bulur; yoksa oluşturur.
 * tags GET'te ada göre filtre yok — sayfalanarak taranır.
 * Hata durumunda undefined; etiket faturanın kesilmesini ENGELLEMEZ.
 */
async function etiketBulVeyaOlustur(dosyaNo: string): Promise<string | undefined> {
  try {
    for (let sayfa = 1; sayfa <= 20; sayfa++) {
      const cevap = await parasutIstek<any>("/tags", {
        query: { "page[size]": "25", "page[number]": String(sayfa) },
      });
      const { veri } = jsonApiCoz(cevap);
      const bulunan = veri.find((t: any) => String(t.attributes?.name || "") === dosyaNo);
      if (bulunan) return String(bulunan.id);
      if (veri.length < 25) break;
    }
    const yeni = await parasutIstek<any>("/tags", {
      method: "POST",
      body: { data: { type: "tags", attributes: { name: dosyaNo } } },
    });
    return yeni?.data?.id ? String(yeni.data.id) : undefined;
  } catch (e) {
    console.error(`Etiket oluşturulamadı (${dosyaNo}):`, e instanceof Error ? e.message : e);
    return undefined;
  }
}

/**
 * Hazır dosyalar için Paraşüt'e satış faturası TASLAĞI yazar.
 *
 * Resmileştirme YAPILMAZ — e_invoices/e_archives çağrılmaz. Taslak Paraşüt'te
 * kayıtlı durur; oradan elle resmileştirilir. Gerekçe: sales_invoices kaydı
 * geri alınabilir (DELETE/cancel), resmileştirme geri alınamaz.
 *
 * TEVKİFAT GİDEN FATURADA ASLA YOKTUR — withholding_rate ve
 * vat_withholding_rate kodda sabit 0'dır, gelen faturadan TÜRETİLMEZ.
 *
 * `zorla` YALNIZCA elle tetiklemede ve YALNIZCA tek dosya için anlamlıdır:
 * "aşılabilir" engelleri (eksik konteyner) geçer. Mükerrer fatura ve
 * müşterisiz fatura engellerini GEÇMEZ — o engeller para hatasıdır, iş kararı
 * değil. Otomatik turda (sadeceDosyaNo yok) zorla kullanılmaz.
 */
export async function tamamlananDosyalariFaturala(
  sadeceDosyaNo?: string,
  zorla = false,
): Promise<{ olusturulan: number; kuyruk: number; hatalar: string[]; engel?: string | null }> {
  const onizleme = await faturaOnizleme();
  const kapsam = onizleme.filter((d) => !sadeceDosyaNo || d.dosyaNo === sadeceDosyaNo);
  const hedefler = kapsam.filter(
    (d) => d.hazir || (zorla && Boolean(sadeceDosyaNo) && d.zorlanabilir),
  );

  let olusturulan = 0;
  let kuyruk = onizleme.length - hedefler.length;
  const hatalar: string[] = [];

  // Tek dosya istendi ve hiç hedef yoksa engeli çağırana bildir; UI bunu
  // gösterip gerekiyorsa "yine de kes" seçeneği sunar.
  if (sadeceDosyaNo && hedefler.length === 0) {
    return {
      olusturulan: 0, kuyruk, hatalar,
      engel: kapsam[0]?.engel ?? "Bu dosya için faturalanabilir eşleşme bulunamadı",
    };
  }

  for (const d of hedefler) {
    let contactId: string | undefined;
    try {
      contactId = await musteriBul(d.vkn, d.firmaUnvan || "");
    } catch (e) {
      console.error(`Cari arama hatası (${d.dosyaNo}):`, e);
    }

    if (!contactId) {
      const mesaj = `Paraşüt'te müşteri bulunamadı (VKN ${d.vkn || "-"}, "${d.firmaUnvan}") — cari elle bağlanmalı`;
      await storage.insertSatisFaturasi({
        gumrukDosyaNo: d.dosyaNo, parasutSalesInvoiceId: null, contactId: null,
        netToplam: null, paraBirimi: d.paraBirimi, kalemSayisi: d.kalemler.length,
        durum: "hata", hataMesaji: mesaj,
      });
      hatalar.push(`${d.dosyaNo}: ${mesaj}`);
      kuyruk++;
      continue;
    }

    try {
      const kalemler = [];
      for (const k of d.kalemler) {
        // KALEM ADI = TEDARİKÇİ FATURASINDAKİ MAL/HİZMET TANIMI, HARFİ HARFİNE.
        // Büyük/küçük harfe dokunulmaz, tedarikçi adı / fatura no EKLENMEZ —
        // müşteri faturasında kendi tedarikçimizin bilgisi görünmemeli.
        // Yalnızca açıklama boşsa (nadiren) izlenebilirlik için yedek ad üretilir.
        const urunAdi = k.aciklama?.trim()
          || `${k.konteynerler || "Nakliye"} konteyner taşıma bedeli`.trim();
        const productId = await urunOlustur(urunAdi, k.kdvOrani);
        kalemler.push({
          type: "sales_invoice_details",
          attributes: {
            quantity: 1,
            unit_price: k.kesilecekMatrah,
            vat_rate: k.kdvOrani,
            vat_withholding_rate: 0, // SABİT — gidende tevkifat yok
            description: null,
          },
          relationships: { product: { data: { id: productId, type: "products" } } },
        });
      }

      const etiketId = await etiketBulVeyaOlustur(d.dosyaNo);
      const bugun = new Date().toISOString().slice(0, 10);

      const govde: any = {
        data: {
          type: "sales_invoices",
          attributes: {
            item_type: "invoice",
            description: null,
            issue_date: bugun,
            due_date: bugun,
            currency: paraBirimiParasut(d.paraBirimi),
            exchange_rate: 1,
            withholding_rate: 0, // SABİT — gidende tevkifat yok
            // Beyanname bilgi satırı; müşteri ve muhasebe mutabakatı için
            invoice_note: d.faturaNotu || null,
          },
          relationships: {
            contact: { data: { id: contactId, type: "contacts" } },
            details: { data: kalemler },
            ...(etiketId ? { tags: { data: [{ id: etiketId, type: "tags" }] } } : {}),
          },
        },
      };

      const cevap = await parasutIstek<any>("/sales_invoices", { method: "POST", body: govde });
      const salesId = cevap?.data?.id;
      if (!salesId) throw new Error("Paraşüt cevabında sales_invoice id yok");

      await storage.insertSatisFaturasi({
        gumrukDosyaNo: d.dosyaNo,
        parasutSalesInvoiceId: String(salesId),
        contactId,
        netToplam: String(d.netToplam),
        paraBirimi: d.paraBirimi,
        kalemSayisi: d.kalemler.length,
        durum: "taslak",
        hataMesaji: null,
      });

      for (const k of d.kalemler) {
        await storage.updateNakliyeFaturasi(k.faturaId, { durum: "faturalandi", hataMesaji: null });
      }
      olusturulan++;
      kesilmisOnbellegiTemizle();
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : "Bilinmeyen hata";
      await storage.insertSatisFaturasi({
        gumrukDosyaNo: d.dosyaNo, parasutSalesInvoiceId: null, contactId,
        netToplam: String(d.netToplam), paraBirimi: d.paraBirimi,
        kalemSayisi: d.kalemler.length, durum: "hata", hataMesaji: mesaj.slice(0, 500),
      });
      hatalar.push(`${d.dosyaNo}: ${mesaj}`);
      kuyruk++;
    }
  }

  return { olusturulan, kuyruk, hatalar };
}
