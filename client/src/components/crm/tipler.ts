// Müşteri CRM — paylaşılan tipler ve yardımcılar.
// Sunucu tarafındaki karşılıkları server/storage.ts içindedir.

export type CrmMusteriListe = {
  id: string;
  hesapKodu: string;
  ad: string;
  sektor: string | null;
  firmaGrubu: string | null;
  problemli: boolean;
  kisiSayisi: number;
  kartVar: boolean;
  sonGorusmeTarihi: string | null;
  telefon: string | null;
  il: string | null;
};

export type CrmDepartman = {
  id: string;
  ad: string;
  sira: number;
  aktif: boolean;
};

export type CrmMusteriBilgi = {
  id: string;
  musteriId: string;
  vergiDairesi: string | null;
  vergiNo: string | null;
  adres: string | null;
  ilce: string | null;
  il: string | null;
  postaKodu: string | null;
  telefon: string | null;
  faks: string | null;
  genelEmail: string | null;
  web: string | null;
  notlar: string | null;
};

export type CrmKisi = {
  id: string;
  musteriId: string;
  departmanId: string | null;
  departmanAd: string | null;
  adSoyad: string;
  unvan: string | null;
  telefon: string | null;
  cepTelefon: string | null;
  email: string | null;
  birincil: boolean;
  aktif: boolean;
  notlar: string | null;
};

export type CrmGorusme = {
  id: string;
  musteriId: string;
  kisiId: string | null;
  kisiAd: string | null;
  tarih: string;
  tip: string;
  konu: string;
  notlar: string | null;
  personel: string | null;
  takipTarihi: string | null;
  takipTamamlandi: boolean;
};

export type CrmMusteriDetay = {
  musteri: { id: string; hesapKodu: string; ad: string; sektor: string | null; firmaGrubu: string | null };
  bilgi: CrmMusteriBilgi | null;
  kisiler: CrmKisi[];
  gorusmeler: CrmGorusme[];
};

export type CrmRehberSatiri = CrmKisi & { musteriAd: string; hesapKodu: string };

export type CrmStats = {
  musteriSayisi: number;
  kartliMusteriSayisi: number;
  kisiSayisi: number;
  gorusmeSayisi: number;
  bekleyenTakip: number;
};

export const GORUSME_TIPLERI = [
  { kod: "telefon", etiket: "Telefon" },
  { kod: "email", etiket: "E-posta" },
  { kod: "ziyaret", etiket: "Ziyaret" },
  { kod: "toplanti", etiket: "Toplantı" },
  { kod: "diger", etiket: "Diğer" },
] as const;

export const gorusmeTipEtiket = (kod: string) =>
  GORUSME_TIPLERI.find((t) => t.kod === kod)?.etiket ?? kod;

// YYYY-MM-DD → dd.mm.yyyy. new Date() KULLANILMAZ: tarihler text olarak
// saklanıyor, Date üzerinden geçirmek timezone kaynaklı bir gün kaymasına
// yol açıyor (proje genelinde yaşanmış bir hata).
export const fmtTarih = (d?: string | null) => {
  if (!d) return "—";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
};

// Bugünün tarihi YYYY-MM-DD — yerel saate göre, toISOString() DEĞİL
// (toISOString UTC'ye çevirir, akşam saatlerinde ertesi/önceki güne kayar).
export const bugun = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Türkçe duyarsız arama. toLowerCase() "İ" ve "I" harflerini bozar; bu yüzden
// her yerde toLocaleLowerCase("tr") kullanılır.
export const trKucuk = (s: string) => s.toLocaleLowerCase("tr");

export const aramaEslesir = (terim: string, ...alanlar: (string | null | undefined)[]) => {
  const q = trKucuk(terim.trim());
  if (!q) return true;
  return alanlar.some((a) => a && trKucuk(a).includes(q));
};

export const DEPARTMANSIZ = "Departmansız";
