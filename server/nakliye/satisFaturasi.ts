import { storage } from "../storage";
import { parasutIstek, jsonApiCoz, iliskiId } from "../parasut/client";
import { paraBirimiParasut } from "../parasut/hesap";
import { normalizeKonteyner, konteynerGecerliMi } from "./dogrulama";
import { firmaAdiBenzerligi, firmaAdiSimetrikBenzerlik } from "@shared/turkceNormalize";
import { konteynerAnahtarlari } from "@shared/konteyner";
import { ihracatRejimiMi } from "@shared/rejim";
import { tarihGoster, sistemOncesiMi } from "./tarih";
import type { NakliyeFaturasi, GumrukVerisi, NakliyeVerisi, NakliyeFaturaKalemi } from "@shared/schema";

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
  /** Tedarikçi faturasındaki miktar. Müşteri faturasına aynen yansır. */
  miktar: number;
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
   * Faturayı ENGELLEMEYEN durum bildirimi (eksik/bilinmeyen konteyner sayısı).
   * `hazir` bayrağını düşürmez; yalnız kullanıcıya gösterilir.
   */
  uyari: string | null;
  /**
   * Engel, kullanıcı onayıyla aşılabilir mi?
   *
   * Bugün HER ZAMAN false: aşılabilir sınıftaki iki engel (eksik konteyner,
   * boş konteyner sayısı) `uyari`ya taşındı, geriye yalnız para hatası
   * üreten aşılamaz engeller kaldı. Alan, uç sözleşmesini ve UI'daki onay
   * akışını bozmamak için duruyor — ileride yeni bir aşılabilir engel
   * çıkarsa yeri hazır.
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

/**
 * Kestiğimiz satış faturaları Paraşüt'te DURUYOR MU? Duranları doğrular,
 * silinmiş olanları işaretler.
 *
 * NEDEN GEREKLİ: SATIŞ rozeti `parasut_satis_faturalari` kaydımızdan türüyor,
 * yani "sistem kesti mi?" sorusunu cevaplıyor — "Paraşüt'te duruyor mu?"
 * sorusunu değil. Kullanıcı Paraşüt'te bir taslağı silince kaydımız yerinde
 * kalıyor ve rozet yeşil kalmaya devam ediyor. Canlıda oldu (2026-08-24):
 * 21 kayıt "kesildi" görünürken 5'i Paraşüt'te yoktu; fark ancak elle
 * karşılaştırmayla bulundu.
 *
 * Silinen kayıt SİLİNMEZ, `durum: "silinmis"` olarak işaretlenir — denetim izi
 * korunur. Rozet bunu kendiliğinden "bekliyor"a çevirir ve satırda "Fatura Kes"
 * düğmesi yeniden görünür (bkz. routes.ts rozet türetmesi).
 *
 * TEK TEK GET YAPILMAZ: 24 kayıt için 24 istek yerine sayfalı liste ile ~2
 * istek. Paraşüt limiti 10 istek/10 saniye olduğu için bu fark önemli.
 */
export async function satisFaturalariniDogrula(): Promise<{
  kontrol: number; resmilesen: number; silinmis: number;
}> {
  const kayitlar = (await storage.getSatisFaturalari()).filter(
    (s) => (s.durum === "taslak" || s.durum === "resmilesti") && s.parasutSalesInvoiceId,
  );
  if (kayitlar.length === 0) return { kontrol: 0, resmilesen: 0, silinmis: 0 };

  // id → invoice_no. Boş string = Paraşüt'te hâlâ TASLAK.
  //
  // RESMİLEŞMENİN GÖSTERGESİ `invoice_no`: Paraşüt taslakta bu alanı boş
  // bırakır, resmileştirilince ("CN12026000000016" gibi) numara verir.
  // Canlıda ölçüldü (2026-08-25): 24 kaydın 16'sı numaralı, 8'i boştu ve
  // bu, kullanıcının Paraşüt ekranında gördüğü TASLAK/GÖNDERİLDİ ayrımıyla
  // birebir örtüştü. `active_e_document` ilişkisi liste yanıtında gelmediği
  // için (ayrıca include gerekiyor) tek istekle okunabilen gösterge budur.
  const mevcut = new Map<string, string>();
  const yil = new Date().getFullYear();
  for (let sayfa = 1; sayfa <= 40; sayfa++) {
    const cevap = await parasutIstek<any>("/sales_invoices", {
      query: {
        // Sistem Temmuz 2026'da devreye girdi ve kestiği her faturanın
        // issue_date'i kesim günüdür — hepsi bu pencerede.
        "filter[issue_date][gteq]": `${yil - 1}-01-01`,
        "filter[issue_date][lteq]": `${yil}-12-31`,
        "page[size]": "25",
        "page[number]": String(sayfa),
      },
    });
    const { veri } = jsonApiCoz(cevap);
    if (veri.length === 0) break;
    for (const d of veri) {
      mevcut.set(String(d.id), String(d.attributes?.invoice_no || "").trim());
    }
    if (veri.length < 25) break;
  }

  // GÜVENLİK EŞİĞİ: tarama hiç sonuç vermediyse "Paraşüt'te gerçekten fatura
  // yok" ile "sorgu/yetki bozuldu"yu ayırt edemeyiz. İkincisinde her kaydı
  // silinmiş işaretlemek bütün rozetleri yalancı kırmızıya çevirirdi.
  // Şüphede hiçbir şey değiştirmeyiz.
  if (mevcut.size === 0) {
    console.error("Satış faturası doğrulaması: Paraşüt taraması boş döndü — hiçbir kayıt işaretlenmedi");
    return { kontrol: kayitlar.length, resmilesen: 0, silinmis: 0 };
  }

  let resmilesen = 0;
  let silinmis = 0;

  for (const s of kayitlar) {
    const id = String(s.parasutSalesInvoiceId);

    if (!mevcut.has(id)) {
      if (s.durum === "silinmis") continue;
      await storage.updateSatisFaturasi(s.id, {
        durum: "silinmis",
        hataMesaji: `Paraşüt'te bulunamadı (fatura ${id}) — taslak silinmiş olabilir`,
      });
      silinmis++;
      continue;
    }

    const faturaNo = mevcut.get(id) || "";

    if (faturaNo && s.durum !== "resmilesti") {
      await storage.updateSatisFaturasi(s.id, {
        durum: "resmilesti",
        parasutFaturaNo: faturaNo,
        hataMesaji: null,
      });
      resmilesen++;
    } else if (!faturaNo && s.durum === "resmilesti") {
      // Resmileşme geri alınmış (fatura iptal edilip taslağa döndürülmüş).
      // Nadir ama mümkün; rozet gerçeği göstermeli.
      await storage.updateSatisFaturasi(s.id, { durum: "taslak", parasutFaturaNo: null });
    }
  }

  return { kontrol: kayitlar.length, resmilesen, silinmis };
}

/** Fatura kesilemeyecek durumdaki (doğrulaması düşmüş) kayıtlar. */
const KESILEMEZ_DURUMLAR = new Set(["dogrulama_hatasi", "hata", "revizyon_gerekli"]);

/**
 * Beyanname bazında gruplanmış faturaların önizlemesini üretir.
 * Paraşüt'e HİÇBİR ŞEY YAZMAZ — hem UI hem kuru çalıştırma için.
 *
 * BİR BEYANNAME DOSYASI = BİR SATIŞ FATURASI (iş kuralı).
 *
 * Aynı dosya numarasına düşen bütün navlun faturaları TEK müşteri faturasında
 * birleşir; her navlun faturası o faturanın bir KALEMİ olur (canlı örnek:
 * 26-10654 -> GAF...2031 + GIB...088 tek faturada, 26.000 + 13.000). Gruplama
 * anahtarı ekrandaki `ilgiliDosyaNo`'dur; aşağıdaki `gruplar` Map'i bunu
 * yapısal olarak garanti eder — aynı dosya için ikinci bir DosyaOnizleme
 * üretilemez. İkinci bir tur yeni kalemlerle geldiğinde ise
 * `getSatisFaturasiByDosyaNo` engeli devreye girer ve dosya bir daha
 * faturalanmaz; bu yüzden kesme anını kullanıcı seçer (otomatik tur satış
 * faturası kesmez, bkz. senkron.ts).
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

  // KALEM DÖKÜMÜ — müşteri faturasının satırları birebir buradan üretilir.
  // N+1 önleme: tüm faturaların kalemleri TEK sorguda, sonra Map ile join.
  const kalemMap = new Map<string, NakliyeFaturaKalemi[]>();
  for (const k of await storage.getNakliyeKalemleriByFaturaIds(faturalar.map((f) => f.id))) {
    if (!kalemMap.has(k.faturaId)) kalemMap.set(k.faturaId, []);
    kalemMap.get(k.faturaId)!.push(k);
  }

  // (dosya no | konteyner) → gümrük kaydı. VKN ve beklenen konteyner sayısı
  // buradan okunur. Aynı dosyada birden çok firma satırı olabildiği için
  // (canlıda görüldü: 26-10359 → ENYTEKS + FEKA) anahtar dosya no ile
  // YETİNMEZ, eşleşmeyi kuran konteyneri de içerir.
  const gumrukIndeks = new Map<string, GumrukVerisi>();
  for (const g of (await storage.getGumrukHouseNoVerileri()) as GumrukVerisi[]) {
    if (!g.dosyaNo) continue;
    // İHRACAT SATIRLARI ELENİR: navlun faturası ithalat konteynerinin
    // taşınmasıdır. Aynı dosya numarası altındaki ihracat satırı yalnızca
    // yanlış firma/VKN kaynağıdır. Bkz. @shared/rejim.
    if (ihracatRejimiMi(g.rejim)) continue;
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
      if (ihracatRejimiMi(g.rejim)) continue; // ihracat satırı aday değildir
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
      //
      // TEK ADAY DA DOĞRULANIR. Eskiden `adaylar.length === 1` durumu bu
      // korumanın dışındaydı ve canlıda para hatası üretti: gumruk_verileri'nde
      // o dosyanın YALNIZ ihracat satırı bulunduğunda (ithalat satırı henüz
      // yüklenmemiş ya da yalnız beyannameler tablosunda) tek aday odur ve
      // unvanı hiç sorgulanmadan kabul edilirdi. Tek aday olmasının sebebi
      // verinin eksikliğidir, doğruluğu değil.
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
    const firmaUnvan = grup.ekran.gumrukFirmaUnvan || grup.gumruk?.firmaUnvan || null;

    // VKN, YALNIZCA geldiği satırın unvanı ekrandaki müşteriyle örtüşüyorsa
    // kullanılır. Unvan ile VKN farklı satırlardan gelirse (aynı dosya
    // numarasının ithalat/ihracat çifti) fatura yanlış firmaya kesilir —
    // canlıda 26-11658 HSF yerine MATAY'a, 26-11599 DE-KA yerine ORAU'ya
    // kesildi. Çelişki halinde VKN'siz kalıp unvan yedeğine düşmek güvenlidir.
    const gumrukUnvan = grup.gumruk?.firmaUnvan || "";
    const ekranMusteri = grup.ekran.gumrukFirmaUnvan || grup.ekran.musteri || "";
    const unvanTutarli =
      !gumrukUnvan || !ekranMusteri
        ? true // karşılaştıracak bir şey yoksa engelleme
        : firmaAdiBenzerligi(ekranMusteri, gumrukUnvan) >= 70;
    if (!unvanTutarli) {
      console.error(
        `VKN/unvan çelişkisi (${dosyaNo}): beyanname satırı "${gumrukUnvan}" ` +
        `ama ekrandaki müşteri "${ekranMusteri}" — VKN yok sayıldı`,
      );
    }
    const vkn = unvanTutarli
      ? String(grup.gumruk?.vn || "").replace(/\D/g, "") || null
      : null;

    // Bu dosyanın konteynerlerinden biri Paraşüt'teki bir satış faturasında
    // geçiyorsa fatura zaten kesilmiş demektir.
    const zatenKesilmis = Array.from(grup.konteynerler).find((k) => kesilmis.has(k));

    // ENGELLER: yalnız PARA HATASI riski taşıyanlar. Hepsi aşılamaz sınıfta —
    // mükerrer fatura ya da müşterisiz/tutarsız fatura üretirler.
    let engel: string | null = null;
    const zorlanabilir = false;

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

    // KONTEYNER SAYISI ARTIK ENGEL DEĞİL — bilgi.
    //
    // Bu iki kontrol otomatik tur içindi: tur 06:45'te kendiliğinden çalışırken
    // eksik kalemle fatura kesmesin diye beklerdi. Otomatik faturalama kalktı
    // (bkz. senkron.ts); eşleştirmeyi kullanıcı ekranda kendisi kuruyor ve
    // "Bekleyenleri Faturala"ya kendisi basıyor, yani bekleme kararı zaten
    // insanda. Engel bırakılınca yalnız zarar veriyordu:
    //   - `!beklenen`: ithalat satırı yalnız `beyannameler` tablosunda olan
    //     dosyalarda (gumruk_verileri'nde karşılığı yok) konteyner sayısı hiç
    //     okunamıyor. Bilinmeyen bir sayı engel olamaz — canlıda ENYTEKS'in üç
    //     dosyası ekranda konteyneri eşleşmiş olmasına rağmen bu yüzden
    //     toplu turda atlanıyor, tek tek "yine de kes" gerektiriyordu.
    //   - `eslesen < beklenen`: kullanıcının zaten gördüğü bir durum.
    // İkisi de `uyari` alanına taşındı; `hazir` bayrağını düşürmüyorlar.
    let uyari: string | null = null;
    if (!beklenen) uyari = "Beyannamede konteyner sayısı yok — eşleşen konteynerlerle kesiliyor";
    else if (eslesen < beklenen) uyari = `${beklenen} konteynerin ${eslesen}'i eşleşti`;

    const grupFaturalari = Array.from(grup.faturaNolar)
      .map((no) => faturaMap.get(no))
      .filter((f): f is NakliyeFaturasi => Boolean(f));

    // MÜŞTERİ FATURASININ SATIRLARI.
    //
    // Bir tedarikçi faturası birden çok konteyner taşıyabiliyor ve her konteyner
    // AYRI KALEM olarak geliyor (GAF2026000002285 → 5 kalem × 13.000 TL).
    // Müşteriye de aynı kırılımla kesilir: her kalem kendi adı, kendi konteyneri
    // ve kendi tutarıyla (×1,20) faturaya geçer.
    //
    // Kalem dökümü YOKSA ya da TOPLAMI FATURANIN MATRAHINI TUTMUYORSA faturanın
    // kendi toplamı tek kalem olarak kullanılır. Toplam denetimi şart: eksik ya
    // da fazla okunmuş bir kalem listesi müşteriye yanlış tutarlı fatura
    // kestirirdi. Kırılımı kaybetmek görsel bir eksiklik, tutarı kaybetmek
    // para hatası.
    const kalemler: FaturaKalemi[] = grupFaturalari.flatMap((f) => {
      const faturaMatrah = Number(f.matrah ?? 0);
      const dokum = kalemMap.get(f.id) ?? [];
      const dokumToplam = Math.round(
        dokum.reduce((t, k) => t + Number(k.matrah ?? 0), 0) * 100,
      ) / 100;

      const dokumKullanilabilir =
        dokum.length > 0 && Math.abs(dokumToplam - faturaMatrah) < 0.05;

      if (!dokumKullanilabilir) {
        if (dokum.length > 0) {
          console.warn(
            `Kalem dökümü kullanılmadı (${f.faturaNo}): kalem toplamı ` +
            `${dokumToplam} ≠ fatura matrahı ${faturaMatrah}`,
          );
        }
        return [{
          faturaId: f.id,
          faturaNo: f.faturaNo,
          tedarikci: f.tedarikciUnvan,
          konteynerler: f.konteynerler || "",
          aciklama: f.aciklama,
          miktar: 1,
          gelenMatrah: faturaMatrah,
          kesilecekMatrah: Math.round(faturaMatrah * MARJ * 100) / 100,
          kdvOrani: f.kdvOrani ?? 0,
        }];
      }

      return dokum.map((k) => {
        const gelen = Number(k.matrah ?? 0);
        return {
          faturaId: f.id,
          faturaNo: f.faturaNo,
          tedarikci: f.tedarikciUnvan,
          konteynerler: k.konteynerler || f.konteynerler || "",
          aciklama: k.aciklama || f.aciklama,
          miktar: Number(k.miktar ?? 1) > 0 ? Number(k.miktar) : 1,
          gelenMatrah: gelen,
          kesilecekMatrah: Math.round(gelen * MARJ * 100) / 100,
          kdvOrani: k.kdvOrani ?? f.kdvOrani ?? 0,
        };
      });
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
      uyari,
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
 * VKN birincil anahtardır çünkü kesindir — AMA yalnız doğru satırdan geldiyse.
 * Bu yüzden VKN ile bulunan cari, unvanla çapraz doğrulanır; çelişirse VKN
 * yok sayılır. Unvan yedeğinde TAM eşleşme (100) aranır; birden çok aday
 * çıkarsa simetrik benzerlikle kırılır, kırılamazsa seçim YAPILMAZ —
 * yanlış müşteriye fatura kesmektense kuyrukta insan onayı beklenir.
 */
async function musteriBul(vkn: string | null, firmaUnvan: string): Promise<string | undefined> {
  if (vkn) {
    try {
      const cevap = await parasutIstek<any>("/contacts", {
        query: { "filter[tax_number]": vkn, "page[size]": "5" },
      });
      const aday = jsonApiCoz(cevap).veri[0];
      if (aday) {
        // VKN İLE BULUNAN CARİ, UNVANLA DOĞRULANIR.
        //
        // Eskiden burada koşulsuz `return` vardı: VKN bulununca unvana hiç
        // bakılmıyordu. Doğru unvan elde olmasına ve fonksiyona parametre
        // olarak geçirilmesine rağmen karşılaştırma yapılmadığı için,
        // komşu beyanname satırından gelen VKN sessizce yanlış firmayı
        // seçiyordu — canlıda 26-11658 (HSF) MATAY'a, 26-11599 (DE-KA)
        // ORAU'ya kesildi. "VKN kesindir" varsayımı doğrudur; yanlış olan,
        // VKN'nin DOĞRU SATIRDAN geldiği varsayımıydı.
        const cariAd = String(aday.attributes?.name || "");
        if (!firmaUnvan || firmaAdiBenzerligi(firmaUnvan, cariAd) >= 70) {
          return String(aday.id);
        }
        console.error(
          `VKN/cari çelişkisi: VKN ${vkn} → "${cariAd}" ama beklenen müşteri ` +
          `"${firmaUnvan}" — VKN yok sayıldı, unvan yedeğine düşülüyor`,
        );
      }
    } catch (e) {
      console.error(`VKN ile cari arama hatası (${vkn}):`, e instanceof Error ? e.message : e);
    }
  }
  if (!firmaUnvan) return undefined;

  const liste = await cariListesiYukle();
  const tam = liste.filter((c) => firmaAdiBenzerligi(firmaUnvan, c.ad) === 100);
  if (tam.length === 1) return tam[0].id;

  // BİRDEN ÇOK TAM EŞLEŞME: kapsama metriği kısa taraf tek anlamlı kelimeye
  // indiğinde sahte 100 üretir ("M.F.C. TEKSTİL" → {TEKSTIL} ⊂ {ENYTEKS,
  // TEKSTIL}). Eskiden bu durumda hiç seçim yapılmaz, fatura "müşteri
  // bulunamadı" diye Paraşüt'e hiç aktarılamazdı — canlıda üç ENYTEKS
  // faturası tam bu yüzden düştü ve hata, araya yeni bir cari eklendiği gün
  // ortaya çıktı. Simetrik ölçü gerçek eşleşmeyi öne çıkarır (100 vs 50).
  if (tam.length > 1) {
    const puanli = tam
      .map((c) => ({ c, p: firmaAdiSimetrikBenzerlik(firmaUnvan, c.ad) }))
      .sort((a, b) => b.p - a.p);
    if (puanli[0].p > (puanli[1]?.p ?? -1)) return puanli[0].c.id;
    console.error(
      `Cari seçilemedi ("${firmaUnvan}"): ${tam.length} aday eşit puanlı ` +
      `(${tam.map((c) => c.ad).join(" | ")})`,
    );
  }
  return undefined;
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
 * `zorla` bugün İŞLEVSİZ: aşılabilir engeller (eksik/boş konteyner sayısı)
 * `uyari`ya taşındığı için geriye yalnız aşılamaz engeller kaldı ve `zorla`
 * onları ASLA geçmez — mükerrer fatura ve müşterisiz fatura para hatasıdır,
 * iş kararı değil. Parametre uç sözleşmesi için korunuyor.
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
        // MİKTAR TEDARİKÇİ FATURASINDAN AYNEN GELİR ("2 Adet × 13.000" ise
        // müşteriye de 2 × 15.600 kesilir). Bölme tam çıkmazsa (kuruş kayması)
        // tek kalem olarak yazılır — satır toplamı HER ZAMAN doğru kalmalı.
        const miktar = k.miktar > 0 ? k.miktar : 1;
        const birim = Math.round((k.kesilecekMatrah / miktar) * 100) / 100;
        const bolunebilir = Math.abs(birim * miktar - k.kesilecekMatrah) < 0.01;

        kalemler.push({
          type: "sales_invoice_details",
          attributes: {
            quantity: bolunebilir ? miktar : 1,
            unit_price: bolunebilir ? birim : k.kesilecekMatrah,
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
