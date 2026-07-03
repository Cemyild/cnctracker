// Yakıt tedarikçisi (Halis Petrol) faturaları tek faturada tüm araçların
// yakıtını içerir; şube/araç kırılımı yapılamadığı için Gümrük gider akışında
// işlenmez. Kayıtlar giderler tablosunda kalır (şirket gider/kâr toplamları
// bozulmasın), araç kırılımı Araçlar sayfasındaki yakıt Excel yüklemesiyle yapılır.
export const YAKIT_FIRMA_ANAHTAR = "HALIS PETROL";

// Firma adındaki İ/I ve büyük-küçük harf varyasyonlarına dayanıklı eşleşme.
export function isYakitFaturasi(firma: string | null | undefined): boolean {
  if (!firma) return false;
  const normalized = firma.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
  return normalized.includes(YAKIT_FIRMA_ANAHTAR);
}
