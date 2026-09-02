/**
 * Kalem dökümünden EKRAN SATIRI özeti üretir.
 *
 * Navlun Faturaları listesi fatura başına TEK satır gösterir; miktar ve birim
 * fiyat orada tek sayı olmak zorunda. Eskiden iki kanal da buraya sabit
 * "miktar 1, birim fiyat = fatura toplamı" yazıyordu; 5 kalemli fatura
 * ekranda "1 × 65.000" görünüyordu (kullanıcı 2026-09-02'de fark etti).
 *
 * Kural:
 *   miktar      = kalem miktarlarının toplamı            (5 × 1 adet → 5)
 *   birim fiyat = fatura matrahı / miktar                 (65.000 / 5 → 13.000)
 *   mal/hizmet  = kalem adları, satır satır               (modal kutusu pre-wrap)
 *
 * Birim fiyat kalemler arasında farklıysa bu bir ORTALAMADIR — liste tek sayı
 * gösterebildiği için kaçınılmaz; gerçek kırılım modaldaki kalem tablosunda.
 * Döküm yoksa ya da toplamı fatura matrahını tutmuyorsa eski davranış korunur
 * (1 × matrah) — yanlış dökümle ekranı yanıltmaktansa özet göstermek yeğ.
 */
export type KalemGirdisi = {
  miktar: string | number | null;
  matrah: string | number | null;
  aciklama: string | null;
};

export function ekranOzeti(
  kalemler: KalemGirdisi[],
  faturaMatrah: number,
  yedekAciklama: string | null,
): { miktar: string; birimFiyat: string; malHizmet: string | null } {
  const toplamMatrah = Math.round(
    kalemler.reduce((t, k) => t + Number(k.matrah ?? 0), 0) * 100,
  ) / 100;
  const toplamMiktar = kalemler.reduce((t, k) => t + (Number(k.miktar ?? 0) || 0), 0);

  const kullanilabilir =
    kalemler.length > 0 && toplamMiktar > 0 && Math.abs(toplamMatrah - faturaMatrah) < 0.05;

  if (!kullanilabilir) {
    return {
      miktar: "1",
      birimFiyat: String(faturaMatrah),
      malHizmet: yedekAciklama ? String(yedekAciklama).slice(0, 500) : null,
    };
  }

  const adlar = kalemler
    .map((k) => String(k.aciklama ?? "").trim())
    .filter(Boolean);

  return {
    miktar: String(toplamMiktar),
    birimFiyat: String(Math.round((faturaMatrah / toplamMiktar) * 100) / 100),
    malHizmet: adlar.length > 0 ? adlar.join("\n").slice(0, 2000) : (yedekAciklama ?? null),
  };
}
