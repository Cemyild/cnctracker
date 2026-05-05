// shared/izinHesaplari.ts
// TR İş Kanunu uyumlu izin hesap mantığı.
// Tarih hesapları YYYY-MM-DD string parse'ı ile yapılır;
// Date objeleri sadece UTC midnight için kullanılır (DST etkisi yok).

// YYYY-MM-DD → { yil, ay (1-12), gun }
function parseDate(s: string): { yil: number; ay: number; gun: number } {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`Geçersiz tarih: ${s}`);
  return { yil: +m[1], ay: +m[2], gun: +m[3] };
}

// İki tarih arası gün farkı (bitis dahil DEĞİL)
function daysBetween(bas: string, bit: string): number {
  const b = parseDate(bas);
  const e = parseDate(bit);
  const ms = Date.UTC(e.yil, e.ay - 1, e.gun) - Date.UTC(b.yil, b.ay - 1, b.gun);
  return Math.round(ms / 86400000);
}

// "YYYY-MM-DD" karşılaştırma: a<b ise <0, a>b ise >0, eşitse 0
function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Tam yıl farkı (TR İş Kanunu kıdem hesabı)
// Örn: 2018-03-15 → 2026-05-05 = 8 yıl (mart 15'i geçtikten sonra)
//       2018-03-15 → 2026-03-14 = 7 yıl (mart 15 dolmadı)
export function kidemYili(iseGiris: string, refTarih: string): number {
  const g = parseDate(iseGiris);
  const r = parseDate(refTarih);
  let fark = r.yil - g.yil;
  if (r.ay < g.ay || (r.ay === g.ay && r.gun < g.gun)) {
    fark -= 1;
  }
  return Math.max(0, fark);
}

// TR İş Kanunu m.53 — yıllık izin gün sayısı
export function yillikIzinHakki(kidem: number): number {
  if (kidem >= 15) return 26;
  if (kidem >= 5) return 20;
  if (kidem >= 1) return 14;
  return 0;
}

// İş günü sayısı (hafta sonu + resmi tatil hariç)
// resmiTatiller: Set<"YYYY-MM-DD">
export function isGunuSayisi(bas: string, bit: string, resmiTatiller: Set<string>): number {
  const farkGun = daysBetween(bas, bit) + 1; // bitis dahil
  if (farkGun <= 0) return 0;

  const b = parseDate(bas);
  let count = 0;
  for (let i = 0; i < farkGun; i++) {
    const dMs = Date.UTC(b.yil, b.ay - 1, b.gun) + i * 86400000;
    const d = new Date(dMs);
    const dow = d.getUTCDay(); // 0=Paz, 6=Cmt
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const iso = `${yyyy}-${mm}-${dd}`;
    if (dow !== 0 && dow !== 6 && !resmiTatiller.has(iso)) {
      count++;
    }
  }
  return count;
}

// Açılış tarihinden ref tarihine kadar yıllık eklemeli hak hesabı
// Her tam çalışma yılı dolduğunda o yılki kıdem aralığına göre ekleme yapılır.
// Açılıştan ÖNCE dolan yıllar acilisBakiyesi'ne dahil sayılır, burada eklenmez.
export function sistemHakEdileniHesapla(
  iseGiris: string,
  acilisTarihi: string,
  refTarih: string,
): number {
  const ig = parseDate(iseGiris);
  let toplam = 0;
  let yilCounter = 1;
  while (true) {
    const kidemDolmaYil = ig.yil + yilCounter;
    const kidemDolmaIsoDate = `${kidemDolmaYil}-${String(ig.ay).padStart(2, "0")}-${String(ig.gun).padStart(2, "0")}`;
    if (compareDate(kidemDolmaIsoDate, refTarih) > 0) break;
    if (compareDate(kidemDolmaIsoDate, acilisTarihi) > 0) {
      toplam += yillikIzinHakki(yilCounter);
    }
    yilCounter++;
    if (yilCounter > 100) break; // güvenlik
  }
  return toplam;
}

// Paraya çevirme tutarı (sadece NET — günlük net = aylık net / 30)
export function parayaCevirmeHesabi(aylikNet: number, gunSayisi: number): number {
  if (!aylikNet || aylikNet <= 0 || gunSayisi <= 0) return 0;
  return Math.round((aylikNet / 30) * gunSayisi * 100) / 100;
}

// Bakiye sonucu tipi
export interface BakiyeSonuc {
  tcNo: string;
  iseGirisTarihi: string | null;
  kidemYili: number;
  yillikHakkiPerYil: number;
  acilisBakiyesi: number;
  sistemHakEdileni: number;
  toplamHakEdilen: number;
  kullanilan: number;
  guncelBakiye: number;
}

// Bakiye hesaplama
export function bakiyeHesapla(params: {
  tcNo: string;
  iseGirisTarihi: string | null;
  acilisTarihi: string;
  acilisBakiyesi: number;
  kullanilanYillikGun: number;
  refTarih: string;
}): BakiyeSonuc {
  if (!params.iseGirisTarihi) {
    return {
      tcNo: params.tcNo,
      iseGirisTarihi: null,
      kidemYili: 0,
      yillikHakkiPerYil: 0,
      acilisBakiyesi: params.acilisBakiyesi,
      sistemHakEdileni: 0,
      toplamHakEdilen: params.acilisBakiyesi,
      kullanilan: params.kullanilanYillikGun,
      guncelBakiye: params.acilisBakiyesi - params.kullanilanYillikGun,
    };
  }
  const kidem = kidemYili(params.iseGirisTarihi, params.refTarih);
  const yillikPerYil = yillikIzinHakki(kidem);
  const sistemHak = sistemHakEdileniHesapla(params.iseGirisTarihi, params.acilisTarihi, params.refTarih);
  const toplam = params.acilisBakiyesi + sistemHak;
  return {
    tcNo: params.tcNo,
    iseGirisTarihi: params.iseGirisTarihi,
    kidemYili: kidem,
    yillikHakkiPerYil: yillikPerYil,
    acilisBakiyesi: params.acilisBakiyesi,
    sistemHakEdileni: sistemHak,
    toplamHakEdilen: toplam,
    kullanilan: params.kullanilanYillikGun,
    guncelBakiye: toplam - params.kullanilanYillikGun,
  };
}
