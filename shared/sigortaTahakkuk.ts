// Trafik/kasko primi tek seferde ödenir ama 12 aylık bir dönemi karşılar.
// Primin tamamını poliçenin başladığı aya yazmak o ayı şişirir, kalan 11 ayı
// bedava gösterir ve poliçesi geçen yıl yenilenmiş bir aracı bu yılın
// raporunda tamamen bedava gösterirdi. Bu yüzden prim 12'ye bölünüp poliçe
// dönemindeki her aya tahakkuk ettirilir (peşin ödenen gider).
//
// araclar tablosunda poliçe BAŞLANGIÇ tarihi tutulmuyor, yalnızca bitiş var;
// dönem 12 ay kabul edilip bitişten bir yıl geri sayılır. Kodun geri kalanında
// da (getVehicleExpenses, Şube Kârlılığı) hep bu kural kullanılıyordu.
//
// Tarih metin olarak (YYYY-MM-DD) işlenir, new Date(...) kullanılmaz: UTC
// kayması ayın ilk/son gününde poliçeyi bir önceki aya yazardı.

export type SigortaTahakkukKalemi = {
  yil: number;
  ay: number;          // 1–12
  ayKey: string;       // "2026-03"
  tutar: number;
  taksitNo: number;    // 1–12, poliçe dönemi içindeki sıra
};

/**
 * Bir poliçe priminin 12 aylık tahakkuk dökümü.
 * Bitiş tarihi veya prim yoksa boş dizi döner (poliçesi girilmemiş araç).
 *
 * Ay kovası, poliçe ayının BAŞLADIĞI takvim ayıdır: 6 Kasım–5 Aralık dönemi
 * Kasım'a yazılır. Gün bazlı bölüştürme yapılmaz — her ay tam olarak prim/12
 * olsun ve 12 taksidin toplamı kuruşu kuruşuna prime eşit kalsın diye.
 */
export function sigortaTahakkukDokumu(
  bitisTarihi: string | null | undefined,
  prim: string | number | null | undefined,
): SigortaTahakkukKalemi[] {
  const tutar = typeof prim === "number" ? prim : parseFloat(prim ?? "0");
  if (!bitisTarihi || !Number.isFinite(tutar) || tutar <= 0) return [];

  const eslesme = /^(\d{4})-(\d{2})-(\d{2})/.exec(bitisTarihi);
  if (!eslesme) return [];

  const bitisYil = Number(eslesme[1]);
  const bitisAy = Number(eslesme[2]);
  // Ay aritmetiği 0 tabanlı mutlak ay indeksi üzerinden: yıl sınırında taşma
  // kendiliğinden doğru çalışır (Aralık + 1 ay = gelecek yılın Ocak'ı).
  const baslangicIndex = (bitisYil - 1) * 12 + (bitisAy - 1);

  const aylik = Math.round((tutar / 12) * 100) / 100;
  const kalemler: SigortaTahakkukKalemi[] = [];

  for (let k = 0; k < 12; k++) {
    const index = baslangicIndex + k;
    const yil = Math.floor(index / 12);
    const ay = (index % 12) + 1;
    // Son taksit yuvarlama artığını üstlenir; 12 taksidin toplamı = prim.
    const taksit = k === 11 ? Math.round((tutar - aylik * 11) * 100) / 100 : aylik;
    kalemler.push({
      yil,
      ay,
      ayKey: `${yil}-${String(ay).padStart(2, "0")}`,
      tutar: taksit,
      taksitNo: k + 1,
    });
  }

  return kalemler;
}

/**
 * Bir aracın trafik + kasko primlerinden verilen yıla (ve istenirse aya)
 * düşen tahakkuk toplamı. `ay` verilmezse yılın tamamı toplanır.
 */
export function aracSigortaTahakkuku(
  arac: {
    trafikBitisTarihi?: string | null;
    trafikSigortaFiyat?: string | number | null;
    kaskoBitisTarihi?: string | null;
    kaskoSigortaFiyat?: string | number | null;
  },
  yil: number,
  ay?: number | null,
): number {
  const kalemler = [
    ...sigortaTahakkukDokumu(arac.trafikBitisTarihi, arac.trafikSigortaFiyat),
    ...sigortaTahakkukDokumu(arac.kaskoBitisTarihi, arac.kaskoSigortaFiyat),
  ];
  return kalemler
    .filter((k) => k.yil === yil && (ay == null || k.ay === ay))
    .reduce((acc, k) => acc + k.tutar, 0);
}
