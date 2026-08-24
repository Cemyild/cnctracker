// Gümrük rejim kodundan ithalat/ihracat ayrımı.
//
// NEDEN GEREKLİ: bir beyanname dosya numarası İKİ firma taşıyabilir — aynı
// numara altında hem ithalat hem ihracat satırı bulunur. Canlıda ölçüldü:
//   26-11658 -> HSF PROJE (ithalat) + MATAY OTOMOTİV (ihracat)
//   26-11599 -> DE-KA KİMYA (ithalat) + ORAU ORHAN (ihracat)
// Navlun faturası ithalat konteynerinin taşınmasıdır; ihracat satırının
// firması/VKN'si o faturaya karışırsa fatura YANLIŞ FİRMAYA kesilir
// (canlıda iki taslak böyle kesildi).
//
// İKİ TABLO AYNI ALFABEYİ KULLANMAZ:
//   gumruk_verileri.rejim -> 4 haneli gümrük rejim kodu ("1000", "4000", "7100")
//   beyannameler.rejim    -> harfli etiket ("IM" | "EX" | "TR")
// Bu yüzden ortak bir yorumlayıcı gerekir; her iki biçim de kabul edilir.
//
// KODUN İLK HANESİ rejim ailesini verir:
//   1x, 2x, 3x       -> ihracat (kesin ihracat, hariçte işleme, yeniden ihracat)
//   4x, 5x, 6x, 7x   -> ithalat (serbest dolaşıma giriş, dahilde işleme,
//                                geri gelen eşya, antrepo)
//
// ÖLÇÜM (canlı veri, 2026-08-24): gumruk_verileri.rejim ile beyannameler.rejim
// çaprazlandığında 25.385 kayıttan 3'ü uyumsuz — %99,99.
//   1x/2x/3x -> EX: 14.121 / 14.122
//   4x/5x/6x/7x -> IM: 11.260 / 11.262
// Ölçüm, (dosya_no, firma) çifti TEK rejim harfi taşıyan kayıtlar üzerinde
// yapıldı. Bu daraltma olmadan, aynı firmanın hem IM hem EX satırı bulunan
// dosyaları JOIN'de çapraz eşleşip sahte %6 uyumsuzluk üretiyor.

/**
 * Rejim ihracat mı? Yalnızca EMİN OLUNAN ihracat için true döner.
 *
 * Boş/bilinmeyen değerde false döner — bu bilinçli: fonksiyon eleme amaçlı
 * kullanılır ve "bilmiyorum" durumunda bir kaydı elemek, doğru kaydı
 * kaybettirir. Canlıda transit (TR) ve rejimi boş satırlar var; bunlar
 * elenmemeli (örn. 26-00317 -> NOBEL satırlarının rejimi TR ve NULL).
 */
export function ihracatRejimiMi(rejim: string | null | undefined): boolean {
  const t = String(rejim ?? "").trim().toUpperCase();
  if (!t) return false;
  if (t === "EX") return true;
  if (t === "IM" || t === "TR") return false;
  return /^[123]/.test(t);
}
