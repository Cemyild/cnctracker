import type { NakliyeFaturasi } from "@shared/schema";
import { parasutIstek, jsonApiCoz } from "../parasut/client";
import { paraBirimiParasut } from "../parasut/hesap";

/** VKN/TCKN ile Paraşüt cari kartını bulur. Bulamazsa undefined — cari YARATILMAZ. */
async function tedarikciBul(vkn: string): Promise<string | undefined> {
  const cevap = await parasutIstek<any>("/contacts", {
    query: { "filter[tax_number]": vkn, "page[size]": "5" },
  });
  const { veri } = jsonApiCoz(cevap);
  return veri[0]?.id;
}

/**
 * Fatura Paraşüt'te zaten var mı?
 *
 * purchase_bills GET'te filter[invoice_no] YOKTUR — mevcut filtreler yalnızca
 * issue_date, due_date, supplier_id, item_type, spender_id. Bu yüzden fatura
 * tarihinin ±7 günlük penceresi çekilip istemci tarafında elenir.
 *
 * TARİH ARALIĞI SÖZDİZİMİ: Paraşüt Ransack operatörleri kullanır —
 * filter[issue_date][gteq] / [lteq]. "2026-01-01,2026-01-31" gibi virgüllü
 * aralık 400 "'issue_date' is not a date" döndürür. Kabul edilen operatörler:
 * eq, lt, gt, gteq, lteq, not_eq (canlıda doğrulandı 2026-07-29).
 *
 * Bu, geçiş döneminin güvenlik ağı: muhasebeci aynı faturayı elle girmişse
 * yeni kayıt açılmaz, mevcut kaydın id'si döndürülür.
 */
async function parasuttaVarMi(faturaNo: string, faturaTarihi: string): Promise<string | undefined> {
  const t = Date.parse(`${faturaTarihi}T00:00:00Z`);
  if (Number.isNaN(t)) return undefined;
  const bas = new Date(t - 7 * 86400_000).toISOString().slice(0, 10);
  const bit = new Date(t + 7 * 86400_000).toISOString().slice(0, 10);

  for (let sayfa = 1; sayfa <= 10; sayfa++) {
    const cevap = await parasutIstek<any>("/purchase_bills", {
      query: {
        "filter[issue_date][gteq]": bas,
        "filter[issue_date][lteq]": bit,
        "page[size]": "25",
        "page[number]": String(sayfa),
      },
    });
    const { veri } = jsonApiCoz(cevap);
    const bulunan = veri.find(
      (d: any) => String(d.attributes?.invoice_no || "").trim() === faturaNo,
    );
    if (bulunan) return String(bulunan.id);
    if (veri.length < 25) break;
  }
  return undefined;
}

/**
 * e-Arşiv faturasını Paraşüt'e alış faturası olarak yazar.
 * Bugün elle yapılan girişin yerini alır.
 *
 * Gelen faturada tevkifat KORUNUR — giden (satış) faturadan farklı olarak.
 */
export async function parasutaYaz(
  fatura: NakliyeFaturasi,
): Promise<{ purchaseBillId: string; mevcuttu: boolean }> {
  if (!fatura.faturaTarihi) throw new Error("faturaTarihi boş — Paraşüt'e yazılamaz");
  if (!fatura.tedarikciVkn) throw new Error("tedarikciVkn boş — cari bulunamaz");

  const mevcutId = await parasuttaVarMi(fatura.faturaNo, fatura.faturaTarihi);
  if (mevcutId) return { purchaseBillId: mevcutId, mevcuttu: true };

  const supplierId = await tedarikciBul(fatura.tedarikciVkn);
  if (!supplierId) {
    throw new Error(
      `Paraşüt'te ${fatura.tedarikciVkn} numaralı cari bulunamadı. ` +
      `Cari otomatik yaratılmaz — Paraşüt'te elle açılmalı.`,
    );
  }

  const matrah = Number(fatura.matrah ?? 0);
  const kdvOrani = fatura.kdvOrani ?? 0;
  const kdv = Number(fatura.kdvTutari ?? 0);
  const tevkifat = Number(fatura.tevkifatTutari ?? 0);
  // Tevkifat oranı KDV tutarına göre hesaplanır (2/10 tevkifat → %20).
  const tevkifatOrani = kdv > 0 ? Math.round((tevkifat / kdv) * 100) : 0;

  const pdfLink = fatura.pdfYolu
    ? ` · PDF: ${(process.env.APP_BASE_URL || "http://localhost:5000").replace(/\/+$/, "")}/${fatura.pdfYolu}`
    : "";

  const govde = {
    data: {
      type: "purchase_bills",
      attributes: {
        item_type: "purchase_bill",
        description: `${fatura.aciklama || "Nakliye bedeli"}${pdfLink}`.slice(0, 500),
        issue_date: fatura.faturaTarihi,
        due_date: fatura.faturaTarihi,
        invoice_no: fatura.faturaNo,
        currency: paraBirimiParasut(fatura.paraBirimi || "TRY"),
        exchange_rate: Number(fatura.kur ?? 1),
        withholding_rate: 0,
      },
      relationships: {
        supplier: { data: { id: supplierId, type: "contacts" } },
        details: {
          data: [
            {
              type: "purchase_bill_details",
              attributes: {
                quantity: 1,
                unit_price: matrah,
                vat_rate: kdvOrani,
                vat_withholding_rate: tevkifatOrani,
                description: (fatura.aciklama || "Nakliye bedeli").slice(0, 200),
              },
              relationships: {
                product: {
                  data: { id: process.env.PARASUT_NAKLIYE_URUN_ID!, type: "products" },
                },
              },
            },
          ],
        },
      },
    },
  };

  const cevap = await parasutIstek<any>("/purchase_bills#detailed", {
    method: "POST",
    body: govde,
  });

  const id = cevap?.data?.id;
  if (!id) throw new Error("Paraşüt cevabında purchase_bill id yok");
  return { purchaseBillId: String(id), mevcuttu: false };
}
