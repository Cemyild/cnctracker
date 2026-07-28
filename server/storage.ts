import { users, gumrukVerileri, type User, type InsertUser, type GumrukVerisi, type InsertGumrukVerisi, araclar, type Arac, type InsertArac, aracGiderler, type AracGider, type InsertAracGider, nakliyeVerileri, type NakliyeVerisi, type InsertNakliyeVerisi, calisanlar, type Calisan, type InsertCalisan, giderler, type Gider, type InsertGiderler, sigortaPoliceleri, type SigortaPolice, type InsertSigortaPolice, sigortaMuhasebeKayitlari, type SigortaMuhasebe, type InsertSigortaMuhasebe, salaryPlans, type SalaryPlan, type InsertSalaryPlan, expenseCategories, type ExpenseCategory, type InsertExpenseCategory, gumrukDosyalar, type GumrukDosya, type InsertGumrukDosya, surveys, surveyResponses, type Survey, type InsertSurvey, type SurveyResponse, type InsertSurveyResponse, duf, type Duf, type InsertDuf, tetkikPlanlar, type TetkikPlan, type InsertTetkikPlan, tetkikBulgular, type TetkikBulgu, type InsertTetkikBulgu, belgeler, belgeVersiyonlar, type Belge, type BelgeVersiyon, type InsertBelge, kaliteHedefleri, kaliteOlcumler, type KaliteHedef, type KaliteOlcum, type InsertKaliteHedef, type InsertKaliteOlcum,
  isoPersoneller, type IsoPersonel, type InsertIsoPersonel,
  egitimler, type Egitim, type InsertEgitim,
  egitimKatilimcilar, type EgitimKatilimci,
  egitimDegerlendirmeSorulari, type EgitimDegerlendirmeSoru, type InsertEgitimDegerlendirmeSoru,
  egitimDegerlendirmeler, type EgitimDegerlendirme,
  egitimDegerlendirmeCevaplari, type EgitimDegerlendirmeCevap,
  tedarikcilar, type Tedarikci, type InsertTedarikci,
  tedarikciDegerlendirmeKriterleri, type TedarikciDegerlendirmeKriter, type InsertTedarikciDegerlendirmeKriter,
  tedarikciDegerlendirmeler, type TedarikciDegerlendirme, type InsertTedarikciDegerlendirme,
  tedarikciDegerlendirmeCevaplari, type TedarikciDegerlendirmeCevap,
  yonetimGozdenGecirmeler, type YonetimGozdenGecirme, type InsertYonetimGozdenGecirme,
  yonetimAksiyonlar, type YonetimAksiyon, type InsertYonetimAksiyon,
  bakimVarliklar, type BakimVarlik, type InsertBakimVarlik,
  bakimKayitlari, type BakimKayit, type InsertBakimKayit,
  bordroDosyalar, type BordroDosya, type InsertBordroDosya,
  calisanIzinler, type CalisanIzin, type InsertCalisanIzin,
  calisanIzinAcilisBakiyesi, type AcilisBakiye, type InsertAcilisBakiye,
  resmiTatiller, type ResmiTatil, type InsertResmiTatil,
  musteriler, type Musteri, type InsertMusteri,
  mizanYuklemeleri, type MizanYukleme, type InsertMizanYukleme,
  otomatikYuklemeLog, type OtomatikYuklemeLog, type InsertOtomatikYuklemeLog,
  mizanBakiye, type MizanBakiye, type InsertMizanBakiye,
  mizanEslestirmeLog, type EslestirmeLog, type InsertEslestirmeLog,
  mizanEslestirmeOnerileri, type EslestirmeOneri, type InsertEslestirmeOneri,
  tahsilatAyarlari, type TahsilatAyarlari, type InsertTahsilatAyarlari,
  portalKullanicilar, type PortalKullanici, type InsertPortalKullanici,
  beyannameler, type Beyanname, type InsertBeyanname,
  masrafTurleri, type MasrafTuru, type InsertMasrafTuru,
  odemeTalepleri, type OdemeTalep, type InsertOdemeTalep,
  odemeBelgeleri, type OdemeBelge, type InsertOdemeBelge,
  odemeSirketleri, type OdemeSirketi, type InsertOdemeSirketi,
  firmaIbanlari, type FirmaIban, type OdemeSirketiDetay,
  operasyonAvanslar, operasyonMasraflar, operasyonGunKapanis, type OperasyonAvans, type OperasyonMasraf, type OperasyonGunKapanis,
  type SubeGiderRaporu, type SubeGiderBloku,
} from "@shared/schema";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as XLSX from "xlsx";
import { db } from "./db";
import { eq, and, sql, inArray, desc, isNotNull, or, asc, ne, count, notInArray, gte, lte } from "drizzle-orm";
import { buildDedupKey } from "./dedup";

// Ödemeler Portalı: talep + ilişkili beyanname/kullanıcı/belgeler tek yanıtta
export type OdemeTalepDetay = OdemeTalep & {
  beyanname: Beyanname | null;
  talepEdenAd: string;
  belgeler: OdemeBelge[];
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Gümrük verileri
  getGumrukVerileri(ay: string, yil: number): Promise<GumrukVerisi[]>
  getAllGumrukVerileri(): Promise<GumrukVerisi[]>;
  // Hafif aggregate/projection helper'ları — getAllGumrukVerileri()
  // çağrılarını azaltmak için. Bunlar DB'den binlerce satır yerine
  // yalnızca ihtiyaç duyulan kolonları/aggregate'leri çeker.
  getDistinctGumrukUnvanlar(): Promise<string[]>;
  getGumrukFirmaFaturaAggregate(refDateStr: string, faturaPenceresiDays: number): Promise<Map<string, { son90: number; yillik: number; ytdCiro: number; ytdIslemSayisi: number }>>;
  getGumrukHouseNoVerileri(): Promise<GumrukVerisi[]>;
  getGumrukVerileriByFirma(firma: string): Promise<GumrukVerisi[]>;
  insertGumrukVerileri(veriler: InsertGumrukVerisi[]): Promise<GumrukVerisi[]>;
  updateGumrukDosyaRecordCount(id: string, count: number): Promise<void>;
  createGumrukDosya(dosya: InsertGumrukDosya): Promise<GumrukDosya>;
  findGumrukDosyaByMd5(hash: string, tip?: string): Promise<GumrukDosya | null>;
  deleteGumrukVerileri(ay: string, yil: number): Promise<void>;
  getGumrukAylari(): Promise<{ ay: string; yil: number; kayitSayisi: number }[]>;
  getExistingRowHashes(ay: string, yil: number): Promise<Set<string>>;
  getExistingKompozitKeysByAyYillar(pairs: { ay: string; yil: number }[]): Promise<Set<string>>;
  getAylikOzet(yil: number): Promise<{ ay: string; yil: number; toplamSatis: number; toplamKdv: number; dosyaSayisi: number }[]>;
  // Dashboard: firma bazında fatura tutarına göre ilk N (DB tarafında GROUP BY + LIMIT)
  getGumrukTopFirmalar(yil: number, limit?: number): Promise<{ firmaUnvan: string; tutar: number; dosyaSayisi: number }[]>;
  getFirmalar(yil: number): Promise<string[]>;
  getAllUniqueFirmalar(): Promise<string[]>;
  getFirmaAylikOzet(yil: number, firma: string): Promise<{ ay: string; toplamSatis: number; toplamKdv: number; dosyaSayisi: number }[]>;
  getGirisElemanlari(yil: number): Promise<string[]>;
  getGirisElemaniOzet(yil: number): Promise<{ eleman: string; toplamSatis: number; dosyaSayisi: number }[]>;
  getGumrukOzet(yil: number): Promise<{ gumruk: string; toplamSatis: number; dosyaSayisi: number }[]>;
  getGumrukler(yil: number): Promise<string[]>;
  getFaturaKesenler(yil: number): Promise<string[]>;
  getAdvancedChartData(yil: number, groupBy: string, names?: string[]): Promise<any[]>;
  getAdvancedChartTrend(yil: number, groupBy: string, names?: string[]): Promise<any[]>;
  getTips(yil: number): Promise<string[]>;
  getAraclar(): Promise<(Arac & { toplamGider: number; seneBasindanBeriGider: number; amortismanGiderYtd: number; toplamMaliyet: number })[]>;
  createArac(arac: InsertArac): Promise<Arac>;
  updateArac(id: string, arac: Partial<InsertArac>): Promise<Arac>;
  deleteArac(id: string): Promise<void>;
  
  // Araç Giderleri
  getAracGiderler(aracId: string): Promise<AracGider[]>;
  createAracGider(gider: InsertAracGider): Promise<AracGider>;
  insertAracGiderler(giderler: InsertAracGider[]): Promise<AracGider[]>;
  deleteAracGider(id: string): Promise<void>;
  removeDuplicateAracGiderler(): Promise<number>;

  // Nakliye verileri
  getNakliyeVerileri(): Promise<NakliyeVerisi[]>;
  insertNakliyeVerileri(veriler: InsertNakliyeVerisi[]): Promise<NakliyeVerisi[]>;
  deleteNakliyeVerisi(id: string): Promise<void>;
  updateNakliyeVerisi(id: string, veri: Partial<InsertNakliyeVerisi>): Promise<NakliyeVerisi>;

  // Çalışanlar
  getCalisanlar(ay?: string, yil?: number): Promise<Calisan[]>;
  // Hafif helper'lar — filtresiz getCalisanlar() çağrılarını azaltmak için.
  getAktifCalisanlarSonAy(): Promise<Calisan[]>;
  getCalisanSubeMap(): Promise<Map<string, string>>;
  insertCalisanlar(veriler: InsertCalisan[]): Promise<Calisan[]>;
  deleteCalisanlar(ay: string, yil: number): Promise<void>;
  updateCalisan(id: string, veri: Partial<InsertCalisan>): Promise<Calisan>;
  deleteCalisanlar(ay: string, yil: number): Promise<void>;
  updateCalisan(id: string, veri: Partial<InsertCalisan>): Promise<Calisan>;

  // Giderler
  getGiderler(ay?: string, yil?: number): Promise<Gider[]>;
  getGiderlerByPlaka(plaka: string): Promise<Gider[]>;
  insertGiderler(veriler: InsertGiderler[]): Promise<Gider[]>;
  deleteGiderler(ay: string, yil: number): Promise<void>;
  updateGider(id: string, veri: Partial<InsertGiderler>): Promise<Gider>;
  updateGiderlerBulk(ids: string[], veri: Partial<InsertGiderler>): Promise<number>;
  getYakitFaturalari(): Promise<(Gider & { dagitilanTutar: number })[]>;
  getGiderStats(yil?: number, ay?: string): Promise<{ toplamCount: number; toplamMalBedeli: number; toplamKdv: number; toplamTryTutar: number }>;
  getHistoricalMappings(): Promise<{ firma: string; sube: string; kategori: string }[]>;

  // Özet Summary
  getOzetSummary(yil: number): Promise<{
    ay: string;
    satisKdvHaric: number;
    satisKdv: number;
    satisToplam: number;
    giderKdvHaric: number;
    giderKdv: number;
    giderToplam: number;
    calisanBrut: number;
    calisanNet: number;
    calisanIsverenSgk: number;
    calisanMaliyet: number;
    yonetimNetUcret: number;
  }[]>;

  // Sigorta Poliçeleri
  getSigortaPoliceleri(sirket?: string, ay?: string, yil?: number): Promise<SigortaPolice[]>;
  insertSigortaPoliceleri(veriler: InsertSigortaPolice[]): Promise<SigortaPolice[]>;
  deleteSigortaPoliceleri(sirket: string, ay?: string, yil?: number): Promise<void>;
  getSigortaOzet(yil: number): Promise<{ ay: string; sirket: string; policeSayisi: number; toplamPrim: number; toplamKomisyon: number; toplamBedel: number; evetSayisi: number; tutarFarkiSayisi: number }[]>;
  getSigortaFirmaOzet(yil: number, ay?: string, sirket?: string): Promise<{ sigortali: string; brutPrim: number; komisyon: number; policeSayisi: number }[]>;
  updateSigortaPoliceDekontDurumu(id: string, durum: string): Promise<SigortaPolice | null>;
  updateSigortaPoliceleriDekontDurumuBulk(ids: string[], durum: string): Promise<number>;

  // Sigorta Muhasebe Kayıtları
  getSigortaMuhasebeKayitlari(sirket?: string, ay?: string, yil?: number): Promise<SigortaMuhasebe[]>;
  getSigortaMuhasebeByPoliceId(policeId: string): Promise<SigortaMuhasebe[]>;
  insertSigortaMuhasebeKayitlari(veriler: InsertSigortaMuhasebe[]): Promise<SigortaMuhasebe[]>;
  deleteSigortaMuhasebeKayitlari(sirket: string, ay?: string, yil?: number): Promise<void>;
  updateSigortaMuhasebeKaydi(id: string, veri: Partial<InsertSigortaMuhasebe>): Promise<SigortaMuhasebe | null>;
  deleteSigortaMuhasebeKaydi(id: string): Promise<void>;
  
  // RAW SQL EXECUTION
  executeRawSql(query: string): Promise<any[]>;

  // Raporlar ve Analizler
  getBranchProfitability(yil: number, ay?: string): Promise<any[]>;
  getVehicleExpenses(plaka: string): Promise<any[]>;
  getVehicleExpenses(plaka: string): Promise<any[]>;
  getUpcomingPolicies(deadlineDays: number): Promise<any[]>;

  // Maaş Planlama
  getSalaryPlans(year: number): Promise<SalaryPlan[]>;
  insertSalaryPlans(plans: InsertSalaryPlan[]): Promise<SalaryPlan[]>;

  // Expense Categories
  getExpenseCategories(): Promise<ExpenseCategory[]>;
  createExpenseCategory(category: InsertExpenseCategory): Promise<ExpenseCategory>;
  deleteExpenseCategory(id: string): Promise<void>;
  seedExpenseCategories(): Promise<void>;

  // Surveys
  getSurveys(): Promise<Survey[]>;
  getSurvey(id: string): Promise<Survey | undefined>;
  createSurvey(survey: InsertSurvey): Promise<Survey>;
  updateSurvey(id: string, survey: Partial<InsertSurvey>): Promise<Survey>;
  getSurveyResponses(surveyId: string): Promise<SurveyResponse[]>;
  createSurveyResponse(response: InsertSurveyResponse): Promise<SurveyResponse>;
  deleteSurveyResponse(id: string): Promise<void>;

  // ISO9001 Stats
  getIso9001Stats(): Promise<{
    belgeCount: number;
    hedefCount: number;
    hedefYesilCount: number;
    surveyCountMusteri: number;
    surveyCountCalisanlar: number;
    dufAcik: number;
    dufGecikmiş: number;
    dufKapali: number;
    tetkikSonTarih: string | null;
    tetkikPlanlanan: number;
    egitimCount: number;
    toplamKatilimciCount: number;
    tedarikciCount: number;
    buYilDegerlendirmeCount: number;
    sonToplantıTarihi: string | null;
    acikAksiyon: number;
    bakimVarlikCount: number;
  }>;

  // Tedarikçiler
  getTedarikcilar(): Promise<(Tedarikci & { degerlendirmeSayisi: number })[]>;
  createTedarikci(data: InsertTedarikci): Promise<Tedarikci>;
  updateTedarikci(id: string, data: Partial<InsertTedarikci>): Promise<Tedarikci>;
  deleteTedarikci(id: string): Promise<void>;

  // Tedarikçi Değerlendirme Kriterleri
  getTedarikciKriterleri(): Promise<TedarikciDegerlendirmeKriter[]>;
  createTedarikciKriter(data: InsertTedarikciDegerlendirmeKriter): Promise<TedarikciDegerlendirmeKriter>;
  updateTedarikciKriter(id: string, data: Partial<InsertTedarikciDegerlendirmeKriter>): Promise<TedarikciDegerlendirmeKriter>;
  deleteTedarikciKriter(id: string): Promise<void>;

  // Tedarikçi Değerlendirmeler
  getTedarikciDegerlendirmeleri(tedarikciId: string): Promise<(TedarikciDegerlendirme & { ortPuan: number | null })[]>;
  getTedarikciDegerlendirme(tedarikciId: string, degerlendirmeId: string): Promise<(TedarikciDegerlendirme & { cevaplar: TedarikciDegerlendirmeCevap[] }) | null>;
  createTedarikciDegerlendirme(data: { tedarikciId: string; tarih: string; degerlendiren?: string; notlar?: string; cevaplar: { kriterId: string; puan?: number; cevap?: string }[] }): Promise<void>;
  deleteTedarikciDegerlendirme(tedarikciId: string, degerlendirmeId: string): Promise<void>;

  // Yönetim Gözden Geçirme
  getToplantılar(): Promise<(YonetimGozdenGecirme & { aksiyon_sayisi: number })[]>;
  getToplantı(id: string): Promise<(YonetimGozdenGecirme & { aksiyonlar: YonetimAksiyon[] }) | null>;
  createToplantı(data: InsertYonetimGozdenGecirme): Promise<YonetimGozdenGecirme>;
  updateToplantı(id: string, data: Partial<InsertYonetimGozdenGecirme>): Promise<YonetimGozdenGecirme>;
  deleteToplantı(id: string): Promise<void>;
  getAksiyonlar(): Promise<(YonetimAksiyon & { toplantıTarihi: string })[]>;
  createAksiyon(data: InsertYonetimAksiyon): Promise<YonetimAksiyon>;
  updateAksiyon(id: string, data: Partial<InsertYonetimAksiyon>): Promise<YonetimAksiyon>;
  deleteAksiyon(id: string): Promise<void>;

  // DÜF
  getDufList(): Promise<Duf[]>;
  getDuf(id: string): Promise<Duf | undefined>;
  createDuf(data: InsertDuf): Promise<Duf>;
  updateDuf(id: string, data: Partial<InsertDuf>): Promise<Duf>;
  deleteDuf(id: string): Promise<void>;

  // Bakım & Onarım
  getBakimVarliklar(kategori?: string): Promise<(BakimVarlik & { sonBakimTarihi: string | null; kayitSayisi: number })[]>;
  getBakimVarlik(id: string): Promise<(BakimVarlik & { kayitlar: BakimKayit[] }) | undefined>;
  createBakimVarlik(data: InsertBakimVarlik): Promise<BakimVarlik>;
  updateBakimVarlik(id: string, data: Partial<InsertBakimVarlik>): Promise<BakimVarlik>;
  deleteBakimVarlik(id: string): Promise<void>;
  createBakimKayit(data: InsertBakimKayit): Promise<BakimKayit>;
  updateBakimKayit(id: string, data: Partial<InsertBakimKayit>): Promise<BakimKayit>;
  deleteBakimKayit(id: string): Promise<void>;

  // Tetkik Planlar
  getTetkikPlanlar(): Promise<TetkikPlan[]>;
  getTetkikPlan(id: string): Promise<TetkikPlan | undefined>;
  createTetkikPlan(data: InsertTetkikPlan): Promise<TetkikPlan>;
  updateTetkikPlan(id: string, data: Partial<InsertTetkikPlan>): Promise<TetkikPlan>;
  deleteTetkikPlan(id: string): Promise<void>;

  // Tetkik Bulgular
  getTetkikBulgular(tetkikPlanId?: string): Promise<TetkikBulgu[]>;
  createTetkikBulgu(data: InsertTetkikBulgu): Promise<TetkikBulgu>;
  updateTetkikBulgu(id: string, data: Partial<InsertTetkikBulgu>): Promise<TetkikBulgu>;
  deleteTetkikBulgu(id: string): Promise<void>;

  // Survey type filter
  getSurveysByType(type: string): Promise<Survey[]>;

  // Kalite Hedefleri
  getKaliteHedefleri(): Promise<(KaliteHedef & { sonOlcum: KaliteOlcum | null })[]>;
  createKaliteHedef(data: InsertKaliteHedef): Promise<KaliteHedef>;
  updateKaliteHedef(id: string, data: Partial<InsertKaliteHedef>): Promise<KaliteHedef>;
  deleteKaliteHedef(id: string): Promise<void>;
  getKaliteOlcumler(): Promise<(KaliteOlcum & { hedef: KaliteHedef })[]>;
  createKaliteOlcum(data: InsertKaliteOlcum): Promise<KaliteOlcum>;
  deleteKaliteOlcum(id: string): Promise<void>;

  // Belge Arşivi
  getBelgeler(filters: { anaKategori?: string; altKategori?: string; durum?: string; baslangic?: string; bitis?: string; arama?: string }): Promise<(Belge & { aktifVersiyon: BelgeVersiyon | null })[]>;
  getBelgeVersiyonlar(belgeId: string): Promise<BelgeVersiyon[]>;
  createBelge(data: InsertBelge & { versiyonNo: string; degisiklikNotu?: string; dosyaYolu: string }): Promise<Belge>;
  addBelgeVersiyon(belgeId: string, data: { versiyonNo: string; degisiklikNotu?: string; dosyaYolu: string }): Promise<BelgeVersiyon>;
  deleteBelge(id: string): Promise<void>;

  // ISO Personeller
  getIsoPersoneller(): Promise<(IsoPersonel & { egitimSayisi: number })[]>;
  getIsoPersonelKart(id: string): Promise<{ personel: IsoPersonel; egitimler: { egitimId: string; baslik: string; egitimTarihi: string; degerlendirmeDoldu: boolean }[] }>;
  createIsoPersonel(data: InsertIsoPersonel): Promise<IsoPersonel>;
  updateIsoPersonel(id: string, data: Partial<InsertIsoPersonel>): Promise<IsoPersonel>;
  deleteIsoPersonel(id: string): Promise<void>;

  // Eğitimler
  getEgitimler(): Promise<(Egitim & { katilimciSayisi: number; degerlendirmeSayisi: number })[]>;
  getEgitimKatilimcilar(egitimId: string): Promise<(EgitimKatilimci & { personel: IsoPersonel })[]>;
  createEgitim(data: InsertEgitim): Promise<Egitim>;
  updateEgitim(id: string, data: Partial<InsertEgitim>): Promise<Egitim>;
  deleteEgitim(id: string): Promise<void>;
  addEgitimKatilimcilar(egitimId: string, personelIds: string[]): Promise<void>;
  removeEgitimKatilimci(egitimId: string, personelId: string): Promise<void>;

  // Değerlendirme Şablonu
  getDegerlendirmeSorulari(): Promise<EgitimDegerlendirmeSoru[]>;
  createDegerlendirmeSoru(data: InsertEgitimDegerlendirmeSoru): Promise<EgitimDegerlendirmeSoru>;
  updateDegerlendirmeSoru(id: string, data: Partial<InsertEgitimDegerlendirmeSoru>): Promise<EgitimDegerlendirmeSoru>;
  deleteDegerlendirmeSoru(id: string): Promise<void>;

  // Public: Değerlendirme
  getEgitimForDegerlendirme(egitimId: string): Promise<{ egitim: Egitim; sorular: EgitimDegerlendirmeSoru[] } | null>;
  createEgitimDegerlendirme(data: { egitimId: string; katilimciAdi: string; cevaplar: { soruId: string; puan?: number; cevap?: string }[] }): Promise<void>;
  getEgitimDegerlendirmeleri(egitimId: string): Promise<(EgitimDegerlendirme & { cevaplar: EgitimDegerlendirmeCevap[] })[]>;

  // Yükleme geçmişi (Upload history)
  listGumrukDosyalar(yil?: number, tip?: string): Promise<{
    id: string;
    filename: string;
    uploadDate: Date | null;
    sizeBytes: number | null;
    md5Hash: string | null;
    kayitSayisi: number;
    yillar: number[];
    aylar: string[];
  }[]>;
  deleteGumrukDosyaWithVerileri(id: string): Promise<{ deletedRows: number; filename: string } | null>;

  // Bordro arşiv dosyaları
  insertBordroDosya(data: InsertBordroDosya): Promise<BordroDosya>;
  getBordroDosyalar(yil?: number, tip?: string): Promise<BordroDosya[]>;
  getBordroDosya(id: string): Promise<BordroDosya | null>;
  deleteBordroDosya(id: string): Promise<{ filename: string } | null>;

  // Toplu upsert: maaş listesinden gelen aylık çalışan kayıtlarını
  // (tcNo + ay + yıl unique) varsa günceller, yoksa ekler
  upsertCalisanlarToplu(kayitlar: InsertCalisan[]): Promise<{ inserted: number; updated: number }>;

  // İzin sistemi — kayıtlar
  getIzinler(filter?: { yil?: number; tcNo?: string; tur?: string }): Promise<CalisanIzin[]>;
  getIzinlerForCalendar(yil: number, ay: number): Promise<CalisanIzin[]>;
  insertIzin(data: InsertCalisanIzin): Promise<CalisanIzin>;
  updateIzin(id: string, data: Partial<InsertCalisanIzin>): Promise<CalisanIzin | null>;
  deleteIzin(id: string): Promise<{ success: boolean }>;

  // İzin sistemi — açılış bakiyesi
  getAcilisBakiyeler(): Promise<AcilisBakiye[]>;
  getAcilisBakiye(tcNo: string): Promise<AcilisBakiye | null>;
  upsertAcilisBakiye(data: InsertAcilisBakiye): Promise<AcilisBakiye>;

  // İzin sistemi — resmi tatiller
  seedResmiTatiller(): Promise<{ inserted: number }>;
  getResmiTatiller(yil?: number): Promise<ResmiTatil[]>;

  // Tahsilat — müşteri
  getMusteriler(filter?: { gorulmePencereGun?: number; sektor?: string; search?: string }): Promise<Musteri[]>;
  getMusteri(id: string): Promise<Musteri | null>;
  getMusteriByHesapKodu(hesapKodu: string): Promise<Musteri | null>;
  insertMusteri(data: InsertMusteri): Promise<Musteri>;
  updateMusteri(id: string, data: Partial<InsertMusteri>): Promise<Musteri | null>;

  // Tahsilat — mizan yüklemeleri
  getMizanYuklemeleri(): Promise<MizanYukleme[]>;
  getMizanYukleme(id: string): Promise<MizanYukleme | null>;
  getMizanByMd5(md5: string): Promise<MizanYukleme | null>;
  insertMizanYukleme(data: InsertMizanYukleme): Promise<MizanYukleme>;
  deleteMizanYukleme(id: string): Promise<{ filename: string } | null>;
  insertOtomatikYuklemeLog(data: InsertOtomatikYuklemeLog): Promise<OtomatikYuklemeLog>;
  getOtomatikYuklemeLoglar(tip: string | null, limit: number): Promise<OtomatikYuklemeLog[]>;

  // Tahsilat — bakiye
  insertMizanBakiyeBatch(rows: InsertMizanBakiye[]): Promise<number>;
  getMusteriBakiyeTimeline(musteriId: string): Promise<(MizanBakiye & { mizanTarihi: string })[]>;
  getEnSonBakiyelerByMizan(mizanId: string): Promise<MizanBakiye[]>;
  getMizanBakiyeSerisiByYil(yil: string): Promise<(MizanBakiye & { mizanTarihi: string })[]>;

  // Tahsilat — eşleştirme
  getEslestirmeOnerileri(): Promise<(EslestirmeOneri & { musteriAd: string })[]>;
  insertEslestirmeOneri(data: InsertEslestirmeOneri): Promise<EslestirmeOneri>;
  onaylaOneri(oneriId: string): Promise<EslestirmeOneri | null>;
  reddetOneri(oneriId: string): Promise<EslestirmeOneri | null>;
  insertEslestirmeLog(data: InsertEslestirmeLog): Promise<EslestirmeLog>;
  addGumrukUnvan(musteriId: string, gumrukUnvan: string): Promise<Musteri | null>;
  removeGumrukUnvan(musteriId: string, gumrukUnvan: string): Promise<Musteri | null>;

  // Tahsilat — ayarlar
  getTahsilatAyarlari(): Promise<TahsilatAyarlari>;
  updateTahsilatAyarlari(data: Partial<InsertTahsilatAyarlari>): Promise<TahsilatAyarlari>;

  // Ödemeler Portalı
  getPortalKullanicilar(): Promise<PortalKullanici[]>;
  getPortalKullanici(id: string): Promise<PortalKullanici | undefined>;
  getPortalKullaniciByKullaniciAdi(kullaniciAdi: string): Promise<PortalKullanici | undefined>;
  createPortalKullanici(k: InsertPortalKullanici): Promise<PortalKullanici>;
  updatePortalKullanici(id: string, k: Partial<InsertPortalKullanici>): Promise<PortalKullanici | undefined>;
  upsertBeyannameler(rows: InsertBeyanname[]): Promise<{ eklenen: number; guncellenen: number }>;
  getBeyannameler(kullanici?: string): Promise<Beyanname[]>;
  getBeyanname(id: string): Promise<Beyanname | undefined>;
  createManuelTransit(girdi: { beyanNo: string; alici: string; gumrukIdaresi: string | null }): Promise<Beyanname>;
  getEslesmeyenBeyannameKullanicilari(): Promise<{ kullanici: string; adet: number }[]>;
  getMasrafTurleri(sadeceAktif?: boolean): Promise<MasrafTuru[]>;
  createMasrafTuru(t: InsertMasrafTuru): Promise<MasrafTuru>;
  updateMasrafTuru(id: string, t: Partial<InsertMasrafTuru>): Promise<MasrafTuru | undefined>;
  getMasrafTuruByAd(ad: string): Promise<MasrafTuru | undefined>;
  seedMasrafTurleri(): Promise<void>;
  createOdemeTalep(t: InsertOdemeTalep): Promise<OdemeTalep>;
  getOdemeTalepleri(filtre?: { talepEdenId?: string; odemeTipi?: string }): Promise<OdemeTalepDetay[]>;
  getOdemeTalep(id: string): Promise<OdemeTalep | undefined>;
  updateOdemeTalep(id: string, t: Partial<InsertOdemeTalep>): Promise<OdemeTalep | undefined>;
  createOdemeBelge(b: InsertOdemeBelge): Promise<OdemeBelge>;
  upsertOdemeSirketi(ad: string, opts?: { iban?: string | null; paraBirimi?: string; kaynak?: string }): Promise<void>;
  getOdemeSirketleri(): Promise<OdemeSirketiDetay[]>;
  getOdemeSirketleriTumu(): Promise<OdemeSirketiDetay[]>;
  createOdemeSirketi(data: { ad: string; iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null; ibanlar?: { paraBirimi: string; iban: string; etiket?: string | null }[] }): Promise<OdemeSirketi | null>;
  updateOdemeSirketi(id: string, data: Partial<{ ad: string; iban: string | null; ibanTry: string | null; ibanUsd: string | null; banka: string | null; vergiNo: string | null; notlar: string | null; aktif: boolean; ibanlar: { paraBirimi: string; iban: string; etiket?: string | null }[] }>): Promise<OdemeSirketi | null>;
  bulkUpsertOdemeSirketleri(rows: { ad: string; iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }[]): Promise<{ eklendi: number; guncellendi: number; atlandi: number }>;
  bulkUpsertFirmaIbanRows(rows: { ad: string; paraBirimi: string; iban: string; etiket?: string | null; vergiNo?: string | null; notlar?: string | null }[]): Promise<{ eklendi: number; guncellendi: number; atlandi: number }>;
  firmaIbanlariExcelSablonu(): Promise<Buffer>;

  // Operasyon Kasası (Şube Masraf)
  getOperasyonKullanicilar(): Promise<PortalKullanici[]>;
  getOperasyonBakiye(operasyonId: string): Promise<number>;
  getSonKapanis(operasyonId: string): Promise<{ gunTarihi: string; kapanisBakiye: string } | null>;
  avansYukle(d: { operasyonId: string; tutar: number; aciklama: string | null; tarih: string; gonderenId: string; belgeDosya: string | null; belgeAdi: string | null }): Promise<OperasyonAvans>;
  masrafKaydet(d: { operasyonId: string; beyannameId: string | null; dosyaYok: boolean; masrafTuru: string | null; sube: string | null; tutar: number; alacakli: string; iban: string | null; aciklama: string | null; tarih: string; belgeDosya: string | null; belgeAdi: string | null }): Promise<OperasyonMasraf>;
  getOperasyonMasraf(id: string): Promise<OperasyonMasraf | undefined>;
  masrafSil(id: string): Promise<void>;
  getOperasyonAvans(id: string): Promise<OperasyonAvans | undefined>;
  avansSil(id: string): Promise<void>;
  getAcikHareketler(operasyonId: string): Promise<{ avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }>;
  gunuKapat(operasyonId: string, gunTarihi: string): Promise<OperasyonGunKapanis | null>;
  getKapanislar(operasyonId: string): Promise<Array<OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }>>;
  getKapanis(id: string): Promise<OperasyonGunKapanis | undefined>;
  geriAc(kapanisId: string, geriAcanId: string): Promise<OperasyonGunKapanis | null>;
  getSubeGiderRaporu(baslangic: string, bitis: string): Promise<SubeGiderRaporu>;
  subeGiderRaporuExcel(baslangic: string, bitis: string): Promise<Buffer>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    return undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    return user;
  }

  async getGumrukVerileri(ay: string, yil: number): Promise<GumrukVerisi[]> {
    return await db.select().from(gumrukVerileri).where(
      and(eq(gumrukVerileri.ay, ay), eq(gumrukVerileri.yil, yil))
    );
  }

  async getAllGumrukVerileri(): Promise<GumrukVerisi[]> {
    return await db.select().from(gumrukVerileri);
  }

  // Sadece firma unvanlarının benzersiz listesi — eşleştirme önerileri
  // için gerekli olan tek şey bu, tüm satırları çekmek gerekmez.
  async getDistinctGumrukUnvanlar(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ firmaUnvan: gumrukVerileri.firmaUnvan })
      .from(gumrukVerileri)
      .where(isNotNull(gumrukVerileri.firmaUnvan));
    return rows.map(r => r.firmaUnvan as string).filter(Boolean);
  }

  // DB-side fatura toplamları. Tahsilat risk hesabı için her firma
  // için son N gün + son 365 gün fatura tutarlarını döndürür.
  // refDateStr: "YYYY-MM-DD" (mizan tarihi referans)
  // faturaPenceresiDays: tipik 90
  // fatura_tarihi DD.MM.YYYY text formatında saklanıyor, to_date() ile parse'lıyoruz.
  async getGumrukFirmaFaturaAggregate(
    refDateStr: string,
    faturaPenceresiDays: number,
  ): Promise<Map<string, { son90: number; yillik: number; ytdCiro: number; ytdIslemSayisi: number }>> {
    // fatura_tarihi iki formatta gelebiliyor: Excel seri numarası (örn. 45923)
    // veya DD.MM.YYYY. Üretim verisinin tamamı seri numarası — eski sadece-noktalı
    // regex tüm satırları eliyordu ve son90/yillik herkes için 0 dönüyordu.
    const result: any = await db.execute(sql`
      SELECT
        firma_unvan AS firma,
        COALESCE(SUM(CASE
          WHEN ft BETWEEN (${refDateStr}::date - (${faturaPenceresiDays} || ' days')::interval)
                      AND ${refDateStr}::date
          THEN COALESCE(top_fatura_tutar, 0)
          ELSE 0 END), 0) AS son90,
        COALESCE(SUM(CASE
          WHEN ft BETWEEN (${refDateStr}::date - INTERVAL '365 days')
                      AND ${refDateStr}::date
          THEN COALESCE(top_fatura_tutar, 0)
          ELSE 0 END), 0) AS yillik,
        COALESCE(SUM(CASE
          WHEN ft BETWEEN date_trunc('year', ${refDateStr}::date)::date
                      AND ${refDateStr}::date
          THEN COALESCE(mal_bedeli, 0)
          ELSE 0 END), 0) AS ytd_ciro,
        COALESCE(SUM(CASE
          WHEN ft BETWEEN date_trunc('year', ${refDateStr}::date)::date
                      AND ${refDateStr}::date
          THEN 1 ELSE 0 END), 0) AS ytd_islem
      FROM (
        SELECT
          firma_unvan, mal_bedeli, top_fatura_tutar,
          CASE
            WHEN fatura_tarihi ~ '^[0-9]{2}\\.[0-9]{2}\\.[0-9]{4}$' THEN to_date(fatura_tarihi, 'DD.MM.YYYY')
            WHEN fatura_tarihi ~ '^[0-9]{4,5}$' THEN DATE '1899-12-30' + (fatura_tarihi)::int
            ELSE NULL
          END AS ft
        FROM gumruk_verileri
        WHERE firma_unvan IS NOT NULL
      ) t
      WHERE ft IS NOT NULL
      GROUP BY firma_unvan
    `);
    const map = new Map<string, { son90: number; yillik: number; ytdCiro: number; ytdIslemSayisi: number }>();
    const rows = (result.rows ?? result) as Array<{ firma: string; son90: any; yillik: any; ytd_ciro: any; ytd_islem: any }>;
    for (const r of rows) {
      map.set(r.firma, {
        son90: Number(r.son90 ?? 0),
        yillik: Number(r.yillik ?? 0),
        ytdCiro: Number(r.ytd_ciro ?? 0),
        ytdIslemSayisi: Number(r.ytd_islem ?? 0),
      });
    }
    return map;
  }

  // Nakliye eşleştirme için: sadece houseNo'su dolu satırları çek.
  // Toplam tablonun küçük bir alt kümesi.
  async getGumrukHouseNoVerileri(): Promise<GumrukVerisi[]> {
    return await db
      .select()
      .from(gumrukVerileri)
      .where(isNotNull(gumrukVerileri.houseNo));
  }

  // Tek firma için timeline. Eskiden tüm tabloyu çekip JS'de filter
  // yapılıyordu; şimdi DB-side WHERE ile tek firmanın satırları geliyor.
  async getGumrukVerileriByFirma(firma: string): Promise<GumrukVerisi[]> {
    return await db
      .select()
      .from(gumrukVerileri)
      .where(eq(gumrukVerileri.firmaUnvan, firma));
  }

  async createGumrukDosya(dosya: InsertGumrukDosya): Promise<GumrukDosya> {
    const [result] = await db.insert(gumrukDosyalar).values(dosya).returning();
    return result;
  }

  async findGumrukDosyaByMd5(hash: string, tip?: string): Promise<GumrukDosya | null> {
    const conditions = [eq(gumrukDosyalar.md5Hash, hash)];
    if (tip !== undefined) conditions.push(eq(gumrukDosyalar.tip, tip));
    const rows = await db
      .select()
      .from(gumrukDosyalar)
      .where(and(...conditions))
      .orderBy(desc(gumrukDosyalar.uploadDate))
      .limit(1);
    return rows[0] ?? null;
  }

  async insertGumrukVerileri(veriler: InsertGumrukVerisi[]): Promise<GumrukVerisi[]> {
    if (veriler.length === 0) return [];

    // Verileri 100'lük parçalar halinde ekle (PostgreSQL parametre limiti nedeniyle)
    // ON CONFLICT DO NOTHING ile (ay, yil, rowHash) çakışmalarını sessizce atla
    const BATCH_SIZE = 100;
    const results: GumrukVerisi[] = [];

    for (let i = 0; i < veriler.length; i += BATCH_SIZE) {
      const batch = veriler.slice(i, i + BATCH_SIZE);
      const inserted = await db
        .insert(gumrukVerileri)
        .values(batch)
        .onConflictDoNothing({
          target: [gumrukVerileri.ay, gumrukVerileri.yil, gumrukVerileri.rowHash],
        })
        .returning();
      results.push(...inserted);
    }

    return results;
  }

  async updateGumrukDosyaRecordCount(id: string, count: number): Promise<void> {
    await db.update(gumrukDosyalar).set({ recordCount: count }).where(eq(gumrukDosyalar.id, id));
  }

  async deleteGumrukVerileri(ay: string, yil: number): Promise<void> {
    await db.delete(gumrukVerileri).where(
      and(eq(gumrukVerileri.ay, ay), eq(gumrukVerileri.yil, yil))
    );
  }

  async getExistingRowHashes(ay: string, yil: number): Promise<Set<string>> {
    const result = await db.select({ rowHash: gumrukVerileri.rowHash })
      .from(gumrukVerileri)
      .where(and(eq(gumrukVerileri.ay, ay), eq(gumrukVerileri.yil, yil)));

    return new Set(result.map(r => r.rowHash).filter((h): h is string => h !== null));
  }

  async getExistingKompozitKeysByAyYillar(pairs: { ay: string; yil: number }[]): Promise<Set<string>> {
    // Kompozit dedup anahtarı: faturaNo + dosyaNo + tescilNo + malBedeli +
    // topFaturaTutar + siraNo birlikte değerlendirilir. Detay: server/dedup.ts.
    const set = new Set<string>();
    if (pairs.length === 0) return set;

    const distinctYillar = Array.from(new Set(pairs.map(p => p.yil)));
    const distinctAylar = Array.from(new Set(pairs.map(p => p.ay)));

    const rows = await db
      .select({
        ay: gumrukVerileri.ay,
        yil: gumrukVerileri.yil,
        faturaNo: gumrukVerileri.faturaNo,
        dosyaNo: gumrukVerileri.dosyaNo,
        tescilNo: gumrukVerileri.tescilNo,
        malBedeli: gumrukVerileri.malBedeli,
        topFaturaTutar: gumrukVerileri.topFaturaTutar,
        siraNo: gumrukVerileri.siraNo,
      })
      .from(gumrukVerileri)
      .where(and(
        inArray(gumrukVerileri.yil, distinctYillar),
        inArray(gumrukVerileri.ay, distinctAylar),
      ));

    for (const r of rows) {
      const key = buildDedupKey(r);
      if (key) set.add(key);
    }
    return set;
  }

  async getExistingFaturas(ay: string, yil: number): Promise<Set<string>> {
    const result = await db.select({ faturaNo: gumrukVerileri.faturaNo })
      .from(gumrukVerileri)
      .where(and(eq(gumrukVerileri.ay, ay), eq(gumrukVerileri.yil, yil)));
      
    // Return distinct FaturaNos
    return new Set(result.map(r => r.faturaNo).filter((f): f is string => f !== null));
  }

  async getGumrukAylari(): Promise<{ ay: string; yil: number; kayitSayisi: number }[]> {
    const result = await db.select({
      ay: gumrukVerileri.ay,
      yil: gumrukVerileri.yil,
    }).from(gumrukVerileri);

    const grouped = result.reduce<Record<string, { ay: string; yil: number; kayitSayisi: number }>>((acc, item) => {
      const key = `${item.ay}-${item.yil}`;
      if (!acc[key]) {
        acc[key] = { ay: item.ay, yil: item.yil, kayitSayisi: 0 };
      }
      acc[key].kayitSayisi++;
      return acc;
    }, {});

    return Object.values(grouped);
  }

  async getAylikOzet(yil: number): Promise<{ ay: string; yil: number; toplamSatis: number; toplamKdv: number; dosyaSayisi: number }[]> {
    const result = await db.select({
      ay: gumrukVerileri.ay,
      yil: gumrukVerileri.yil,
      malBedeli: gumrukVerileri.malBedeli,
      topKdvTutar: gumrukVerileri.topKdvTutar,
    }).from(gumrukVerileri).where(eq(gumrukVerileri.yil, yil));

    const grouped = result.reduce<Record<string, { ay: string; yil: number; toplamSatis: number; toplamKdv: number; dosyaSayisi: number }>>((acc, item) => {
      const key = item.ay;
      if (!acc[key]) {
        acc[key] = { ay: item.ay, yil: item.yil, toplamSatis: 0, toplamKdv: 0, dosyaSayisi: 0 };
      }
      acc[key].toplamSatis += parseFloat(item.malBedeli || "0");
      acc[key].toplamKdv += parseFloat(item.topKdvTutar || "0");
      acc[key].dosyaSayisi++;
      return acc;
    }, {});

    return Object.values(grouped);
  }

  async getGumrukTopFirmalar(yil: number, limit: number = 5): Promise<{ firmaUnvan: string; tutar: number; dosyaSayisi: number }[]> {
    // Fatura tutarı = malBedeli (KDV'siz) — kartın "yıllık ciro" başlığıyla aynı temel.
    // Böylece firma barlarının toplamı yıllık ciroyla tutarlı kalır.
    const result = await db
      .select({
        firmaUnvan: gumrukVerileri.firmaUnvan,
        tutar: sql<string>`coalesce(sum(${gumrukVerileri.malBedeli}), 0)`,
        dosyaSayisi: sql<number>`count(*)::int`,
      })
      .from(gumrukVerileri)
      .where(and(eq(gumrukVerileri.yil, yil), isNotNull(gumrukVerileri.firmaUnvan)))
      .groupBy(gumrukVerileri.firmaUnvan)
      .orderBy(sql`sum(${gumrukVerileri.malBedeli}) desc nulls last`)
      .limit(limit);

    return result
      .map((r) => ({
        firmaUnvan: (r.firmaUnvan ?? "Bilinmeyen").trim() || "Bilinmeyen",
        tutar: Number(r.tutar),
        dosyaSayisi: Number(r.dosyaSayisi),
      }))
      .filter((r) => r.tutar > 0);
  }

  async getAllUniqueFirmalar(): Promise<string[]> {
    const result = await db.selectDistinct({ firmaUnvan: gumrukVerileri.firmaUnvan })
      .from(gumrukVerileri);

    return result
      .map(r => r.firmaUnvan)
      .filter((n): n is string => !!n)
      .sort();
  }

  async getFirmalar(yil: number): Promise<string[]> {
    const result = await db.selectDistinct({ firmaUnvan: gumrukVerileri.firmaUnvan })
      .from(gumrukVerileri)
      .where(eq(gumrukVerileri.yil, yil));

    return result
      .map(r => r.firmaUnvan)
      .filter((n): n is string => !!n)
      .sort();
  }

  async getFirmaAylikOzet(yil: number, firma: string): Promise<{ ay: string; toplamSatis: number; toplamKdv: number; dosyaSayisi: number }[]> {
    const result = await db.select({
      ay: gumrukVerileri.ay,
      malBedeli: gumrukVerileri.malBedeli,
      topKdvTutar: gumrukVerileri.topKdvTutar,
    }).from(gumrukVerileri).where(
      and(eq(gumrukVerileri.yil, yil), eq(gumrukVerileri.firmaUnvan, firma))
    );

    const grouped = result.reduce<Record<string, { ay: string; toplamSatis: number; toplamKdv: number; dosyaSayisi: number }>>((acc, item) => {
      const key = item.ay;
      if (!acc[key]) {
        acc[key] = { ay: item.ay, toplamSatis: 0, toplamKdv: 0, dosyaSayisi: 0 };
      }
      acc[key].toplamSatis += parseFloat(item.malBedeli || "0");
      acc[key].toplamKdv += parseFloat(item.topKdvTutar || "0");
      acc[key].dosyaSayisi++;
      return acc;
    }, {});

    return Object.values(grouped);
  }

  async getGirisElemanlari(yil: number): Promise<string[]> {
    const result = await db.selectDistinct({ girisElemani: gumrukVerileri.girisElemani })
      .from(gumrukVerileri)
      .where(eq(gumrukVerileri.yil, yil));

    return result
      .map(r => r.girisElemani)
      .filter((n): n is string => !!n)
      .sort();
  }

  async getGirisElemaniOzet(yil: number): Promise<{ eleman: string; toplamSatis: number; dosyaSayisi: number }[]> {
    const result = await db.select({
      girisElemani: gumrukVerileri.girisElemani,
      malBedeli: gumrukVerileri.malBedeli,
    }).from(gumrukVerileri).where(eq(gumrukVerileri.yil, yil));

    const grouped = result.reduce<Record<string, { eleman: string; toplamSatis: number; dosyaSayisi: number }>>((acc, item) => {
      const key = item.girisElemani || "Bilinmiyor";
      if (!acc[key]) {
        acc[key] = { eleman: key, toplamSatis: 0, dosyaSayisi: 0 };
      }
      acc[key].toplamSatis += parseFloat(item.malBedeli || "0");
      acc[key].dosyaSayisi++;
      return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => b.toplamSatis - a.toplamSatis);
  }

  async getGumrukOzet(yil: number): Promise<{ gumruk: string; toplamSatis: number; dosyaSayisi: number }[]> {
    const result = await db.select({
      gumruk: gumrukVerileri.gumruk,
      malBedeli: gumrukVerileri.malBedeli,
    }).from(gumrukVerileri).where(eq(gumrukVerileri.yil, yil));

    const grouped = result.reduce<Record<string, { gumruk: string; toplamSatis: number; dosyaSayisi: number }>>((acc, item) => {
      const key = item.gumruk || "Bilinmiyor";
      if (!acc[key]) {
        acc[key] = { gumruk: key, toplamSatis: 0, dosyaSayisi: 0 };
      }
      acc[key].toplamSatis += parseFloat(item.malBedeli || "0");
      acc[key].dosyaSayisi++;
      return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => b.toplamSatis - a.toplamSatis);
  }

  async getGumrukler(yil: number): Promise<string[]> {
    const result = await db.selectDistinct({ gumruk: gumrukVerileri.gumruk })
      .from(gumrukVerileri)
      .where(eq(gumrukVerileri.yil, yil));

    return result
      .map(r => r.gumruk)
      .filter((n): n is string => !!n)
      .sort();
  }

  async getFaturaKesenler(yil: number): Promise<string[]> {
    const result = await db.selectDistinct({ faturayiKesen: gumrukVerileri.faturayiKesen })
      .from(gumrukVerileri)
      .where(eq(gumrukVerileri.yil, yil));

    return result
      .map(r => r.faturayiKesen)
      .filter((n): n is string => !!n)
      .sort();
  }

  async getAdvancedChartData(yil: number, groupBy: string, names?: string[]): Promise<any[]> {
    // Determine which column to group by
    let groupByColumn;
    switch (groupBy) {
      case "month":
        groupByColumn = gumrukVerileri.ay;
        break;
      case "employee":
        groupByColumn = gumrukVerileri.girisElemani;
        break;
      case "company":
        groupByColumn = gumrukVerileri.firmaUnvan;
        break;
      case "customs":
        groupByColumn = gumrukVerileri.gumruk;
        break;
      case "issuer":
        groupByColumn = gumrukVerileri.faturayiKesen;
        break;
      case "tip":
        groupByColumn = sql`CASE 
          WHEN ${gumrukVerileri.tip} IN ('T', 't') THEN 'İthalat'
          WHEN ${gumrukVerileri.tip} IN ('A', 'B') THEN 'Serbest Bölge'
          WHEN ${gumrukVerileri.tip} = 'H' THEN 'İhracat'
          WHEN ${gumrukVerileri.tip} = '@' THEN 'Transit'
          ELSE 'Diğer'
        END`;
        break;
      default:
        groupByColumn = gumrukVerileri.ay;
    }

    // Build the where clause
    const whereClause = [eq(gumrukVerileri.yil, yil)];

    // If specific names are selected, filter by them
    if (names && names.length > 0) {
      whereClause.push(inArray(groupByColumn as any, names));
    }

    // Use SQL GROUP BY for aggregation
    const result = await db
      .select({
        name: groupByColumn,
        malBedeli: sql<string>`sum(${gumrukVerileri.malBedeli})`,
        topKdvTutar: sql<string>`sum(${gumrukVerileri.topKdvTutar})`,
        topFaturaTutar: sql<string>`sum(${gumrukVerileri.topFaturaTutar})`,
        topIskonto: sql<string>`sum(${gumrukVerileri.topIskonto})`,
        dosyaSayisi: sql<number>`count(*)`,
      })
      .from(gumrukVerileri)
      .where(and(...whereClause))
      .groupBy(groupByColumn)
      .orderBy(sql`sum(${gumrukVerileri.malBedeli}) desc`);

    let finalResult = result;
    if (!names || names.length === 0) {
      if (groupBy !== "month" && finalResult.length > 15) {
        finalResult = finalResult.slice(0, 15);
      }
    }

    return finalResult.map((item) => ({
      name: item.name || "Bilinmeyen",
      malBedeli: parseFloat(item.malBedeli || "0"),
      topKdvTutar: parseFloat(item.topKdvTutar || "0"),
      topFaturaTutar: parseFloat(item.topFaturaTutar || "0"),
      topIskonto: parseFloat(item.topIskonto || "0"),
      dosyaSayisi: Number(item.dosyaSayisi) || 0,
    }));
  }

  async getAdvancedChartTrend(yil: number, groupBy: string, names?: string[]): Promise<any[]> {
    let groupByColumn;
    switch (groupBy) {
      case "month":
        groupByColumn = gumrukVerileri.ay;
        break;
      case "employee":
        groupByColumn = gumrukVerileri.girisElemani;
        break;
      case "company":
        groupByColumn = gumrukVerileri.firmaUnvan;
        break;
      case "customs":
        groupByColumn = gumrukVerileri.gumruk;
        break;
      case "issuer":
        groupByColumn = gumrukVerileri.faturayiKesen;
        break;
      case "tip":
        groupByColumn = sql`CASE 
          WHEN ${gumrukVerileri.tip} IN ('T', 't') THEN 'İthalat'
          WHEN ${gumrukVerileri.tip} IN ('A', 'B') THEN 'Serbest Bölge'
          WHEN ${gumrukVerileri.tip} = 'H' THEN 'İhracat'
          WHEN ${gumrukVerileri.tip} = '@' THEN 'Transit'
          ELSE 'Diğer'
        END`;
        break;
      default:
        groupByColumn = gumrukVerileri.ay;
    }

    const whereClause = [eq(gumrukVerileri.yil, yil)];

    if (groupBy !== "month") {
      let filterNames = names;

      if (!names || names.length === 0) {
        const topEntities = await db.select({ name: groupByColumn, val: sql`sum(${gumrukVerileri.malBedeli})` })
          .from(gumrukVerileri)
          .where(eq(gumrukVerileri.yil, yil))
          .groupBy(groupByColumn)
          .orderBy(sql`sum(${gumrukVerileri.malBedeli}) desc`)
          .limit(5);

        filterNames = topEntities.map(t => t.name).filter((n): n is string => !!n);
      }

      if (filterNames && filterNames.length > 0) {
        whereClause.push(inArray(groupByColumn as any, filterNames));
      }
    }

    const result = await db
      .select({
        month: gumrukVerileri.ay,
        entity: groupByColumn,
        malBedeli: sql<string>`sum(${gumrukVerileri.malBedeli})`,
        topKdvTutar: sql<string>`sum(${gumrukVerileri.topKdvTutar})`,
        topFaturaTutar: sql<string>`sum(${gumrukVerileri.topFaturaTutar})`,
        topIskonto: sql<string>`sum(${gumrukVerileri.topIskonto})`,
        dosyaSayisi: sql<number>`count(*)`,
      })
      .from(gumrukVerileri)
      .where(and(...whereClause))
      .groupBy(gumrukVerileri.ay, groupByColumn);

    return result.map(item => ({
      month: item.month,
      entity: item.entity || "Bilinmeyen",
      malBedeli: parseFloat(item.malBedeli || "0"),
      topKdvTutar: parseFloat(item.topKdvTutar || "0"),
      topFaturaTutar: parseFloat(item.topFaturaTutar || "0"),
      topIskonto: parseFloat(item.topIskonto || "0"),
      dosyaSayisi: Number(item.dosyaSayisi) || 0,
    }));
  }

  async getTips(yil: number): Promise<string[]> {
    const tipExpr = sql`CASE 
      WHEN ${gumrukVerileri.tip} IN ('T', 't') THEN 'İthalat'
      WHEN ${gumrukVerileri.tip} IN ('A', 'B') THEN 'Serbest Bölge'
      WHEN ${gumrukVerileri.tip} = 'H' THEN 'İhracat'
      WHEN ${gumrukVerileri.tip} = '@' THEN 'Transit'
      ELSE 'Diğer'
    END`;

    const result = await db
      .selectDistinct({ tip: tipExpr })
      .from(gumrukVerileri)
      .where(eq(gumrukVerileri.yil, yil));

    return result
      .map(r => r.tip)
      .filter((t): t is string => t !== null && t !== "")
      .sort();
  }

  async getAraclar(): Promise<(Arac & { toplamGider: number; seneBasindanBeriGider: number; amortismanGiderYtd: number; toplamMaliyet: number })[]> {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const startOfYear = `${currentYear}-01-01`;

    const result = await db
      .select({
        arac: araclar,
        toplamGider: sql<string>`coalesce(sum(${aracGiderler.tutar}), 0)`,
        ytdGider: sql<string>`coalesce(sum(CASE WHEN ${aracGiderler.tarih} >= ${startOfYear} THEN ${aracGiderler.tutar} ELSE 0 END), 0)`,
      })
      .from(araclar)
      .leftJoin(aracGiderler, eq(araclar.id, aracGiderler.aracId))
      .groupBy(araclar.id);

    return result.map(({ arac, toplamGider, ytdGider }) => {
      const trafikFiyat = Number(arac.trafikSigortaFiyat || 0);
      const kaskoFiyat = Number(arac.kaskoSigortaFiyat || 0);
      const amortismanAylik = (trafikFiyat + kaskoFiyat) / 12;
      const amortismanGiderYtd = amortismanAylik * currentMonth;
      const seneBasindanBeriGider = Number(ytdGider);

      return {
        ...arac,
        toplamGider: Number(toplamGider),
        seneBasindanBeriGider: seneBasindanBeriGider,
        amortismanGiderYtd: amortismanGiderYtd,
        toplamMaliyet: seneBasindanBeriGider + amortismanGiderYtd,
      };
    });
  }

  async createArac(arac: InsertArac): Promise<Arac> {
    const [newArac] = await db.insert(araclar).values(arac).returning();
    return newArac;
  }

  async updateArac(id: string, arac: Partial<InsertArac>): Promise<Arac> {
    const [updatedArac] = await db
      .update(araclar)
      .set(arac)
      .where(eq(araclar.id, id))
      .returning();
    if (!updatedArac) throw new Error("Araç bulunamadı");
    return updatedArac;
  }

  async deleteArac(id: string): Promise<void> {
    await db.delete(araclar).where(eq(araclar.id, id));
  }

  // ==========================================================
  // ARAÇ GIDERLER IMPLEMENTATION
  // ==========================================================
  async getAracGiderler(aracId: string): Promise<AracGider[]> {
    return await db.select().from(aracGiderler).where(eq(aracGiderler.aracId, aracId)).orderBy(desc(aracGiderler.tarih));
  }

  async createAracGider(gider: InsertAracGider): Promise<AracGider> {
    const [newGider] = await db.insert(aracGiderler).values(gider).returning();
    return newGider;
  }

  async insertAracGiderler(giderler: InsertAracGider[]): Promise<AracGider[]> {
    if (giderler.length === 0) return [];
    
    // Batch inserts for large datasets
    const BATCH_SIZE = 100;
    const results: AracGider[] = [];
    
    for (let i = 0; i < giderler.length; i += BATCH_SIZE) {
      const batch = giderler.slice(i, i + BATCH_SIZE);
      // rowHash çakışması = daha önce yüklenmiş satır → atla (null rowHash'ler çakışmaz, hep eklenir).
      // .returning() yalnızca gerçekten eklenen satırları döner; atlananlar sayımdan düşer.
      const inserted = await db.insert(aracGiderler).values(batch).onConflictDoNothing({ target: aracGiderler.rowHash }).returning();
      results.push(...inserted);
    }

    return results;
  }

  async deleteAracGider(id: string): Promise<void> {
    await db.delete(aracGiderler).where(eq(aracGiderler.id, id));
  }

  // Aynı (araç, tarih, tutar, açıklama) yakıt satırlarından yalnızca birini bırakır.
  // Eski format dökümlerde (Satış ID yok → rowHash null) oluşan tekrar kayıtları temizler.
  async removeDuplicateAracGiderler(): Promise<number> {
    const res = await db.execute(sql`
      DELETE FROM arac_giderler a
      USING arac_giderler b
      WHERE a.kategori = 'Yakıt' AND b.kategori = 'Yakıt'
        AND a.arac_id = b.arac_id
        AND a.tarih = b.tarih
        AND a.tutar = b.tutar
        AND coalesce(a.aciklama, '') = coalesce(b.aciklama, '')
        AND a.ctid > b.ctid
    `);
    return res.rowCount ?? 0;
  }

  async getNakliyeVerileri(): Promise<NakliyeVerisi[]> {
    return await db.select().from(nakliyeVerileri).orderBy(sql`${nakliyeVerileri.olusturmaTarihi} DESC`);
  }

  async insertNakliyeVerileri(veriler: InsertNakliyeVerisi[]): Promise<NakliyeVerisi[]> {
    if (veriler.length === 0) return [];

    const results: NakliyeVerisi[] = [];
    const BATCH_SIZE = 100;

    for (let i = 0; i < veriler.length; i += BATCH_SIZE) {
      const batch = veriler.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(nakliyeVerileri).values(batch).returning();
      results.push(...inserted);
    }

    return results;
  }

  async deleteNakliyeVerisi(id: string): Promise<void> {
    await db.delete(nakliyeVerileri).where(eq(nakliyeVerileri.id, id));
  }

  async updateNakliyeVerisi(id: string, veri: Partial<InsertNakliyeVerisi>): Promise<NakliyeVerisi> {
    const [updated] = await db
      .update(nakliyeVerileri)
      .set(veri)
      .where(eq(nakliyeVerileri.id, id))
      .returning();
    if (!updated) throw new Error("Nakliye verisi bulunamadı");
    return updated;
  }

  async getCalisanlar(ay?: string, yil?: number): Promise<Calisan[]> {
    const filters = [];
    if (ay) filters.push(eq(calisanlar.ay, ay));
    if (yil) filters.push(eq(calisanlar.yil, yil));

    if (filters.length > 0) {
      return await db.select().from(calisanlar).where(and(...filters)).orderBy(calisanlar.adSoyad);
    }
    return await db.select().from(calisanlar).orderBy(calisanlar.adSoyad);
  }

  // Yalnızca son ay'daki çalışan kayıtlarını döndürür — "izin bakiye"
  // endpoint'i için aktif çalışan listesi olarak kullanılıyor.
  // Tüm yılların kayıtlarını çekmek yerine 50-100 satır transfer eder.
  async getAktifCalisanlarSonAy(): Promise<Calisan[]> {
    const maxRow: any = await db.execute(sql`
      SELECT yil, ay FROM calisanlar
      WHERE tc_no IS NOT NULL AND tc_no <> ''
      ORDER BY yil DESC, CAST(NULLIF(ay, '') AS INTEGER) DESC NULLS LAST
      LIMIT 1
    `);
    const rows = (maxRow.rows ?? maxRow) as Array<{ yil: number; ay: string }>;
    if (rows.length === 0) return [];
    const { yil, ay } = rows[0];
    return await db
      .select()
      .from(calisanlar)
      .where(and(eq(calisanlar.yil, Number(yil)), eq(calisanlar.ay, ay)));
  }

  // Her TC için en güncel (yıl,ay) bordrosundaki şube değerini döndürür.
  // Bordro yüklemede şube geçmişini uygulamak için kullanılır.
  // DB-side DISTINCT ON sayesinde ~tüm tablo yerine kişi başına 1 satır transfer.
  async getCalisanSubeMap(): Promise<Map<string, string>> {
    const result: any = await db.execute(sql`
      SELECT DISTINCT ON (tc_no) tc_no, sube
      FROM calisanlar
      WHERE tc_no IS NOT NULL AND tc_no <> '' AND sube IS NOT NULL AND sube <> ''
      ORDER BY tc_no, yil DESC, CAST(NULLIF(ay, '') AS INTEGER) DESC NULLS LAST
    `);
    const rows = (result.rows ?? result) as Array<{ tc_no: string; sube: string }>;
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.tc_no && r.sube) map.set(r.tc_no, r.sube);
    }
    return map;
  }

  async insertCalisanlar(veriler: InsertCalisan[]): Promise<Calisan[]> {
    if (veriler.length === 0) return [];

    // Upsert (Conflict on tc_no, ay, yil)
    const results: Calisan[] = [];
    for (const data of veriler) {
      const [inserted] = await db
        .insert(calisanlar)
        .values(data)
        .onConflictDoUpdate({
          target: [calisanlar.tcNo, calisanlar.ay, calisanlar.yil],
          set: {
            brutUcret: data.brutUcret,
            netUcret: data.netUcret,
            sgkMatrahi: data.sgkMatrahi,
            gelirVergisiMatrahi: data.gelirVergisiMatrahi,
            kumulatifVergiMatrahi: data.kumulatifVergiMatrahi,
            gelirVergisi: data.gelirVergisi,
            damgaVergisi: data.damgaVergisi,
            sigortaKesintisi: data.sigortaKesintisi,
            issizlikSigortasiKesintisi: data.issizlikSigortasiKesintisi,
            isverenSgkPayi: data.isverenSgkPayi,
            isverenIssizlikPayi: data.isverenIssizlikPayi,
            toplamIsverenMaliyeti: data.toplamIsverenMaliyeti,
            isGirisTarihi: data.isGirisTarihi,
            statu: data.statu,
          }
        })
        .returning();
      results.push(inserted);
    }
    return results;
  }

  async deleteCalisanlar(ay: string, yil: number): Promise<void> {
    await db.delete(calisanlar).where(
      and(eq(calisanlar.ay, ay), eq(calisanlar.yil, yil))
    );
  }

  async updateCalisan(id: string, veri: Partial<InsertCalisan>): Promise<Calisan> {
    const [existing] = await db.select().from(calisanlar).where(eq(calisanlar.id, id));
    if (!existing) throw new Error("Çalışan bulunamadı");

    // If sube is updated, update for all records of this person (TC based)
    if (veri.sube) {
      await db
        .update(calisanlar)
        .set({ sube: veri.sube })
        .where(eq(calisanlar.tcNo, existing.tcNo));
    }

    const [updated] = await db
      .update(calisanlar)
      .set(veri)
      .where(eq(calisanlar.id, id))
      .returning();
    return updated;
    return updated;
  }

  // ==========================================================
  // GIDERLER IMPLEMENTATION
  // ==========================================================
  async getGiderler(ay?: string, yil?: number): Promise<Gider[]> {
    const filters = [];
    if (ay && ay !== "toplam") filters.push(eq(giderler.ay, ay));
    if (yil) filters.push(eq(giderler.yil, yil));

    const tarihOrder = sql`to_date(${giderler.tarih}, 'DD.MM.YYYY') DESC NULLS LAST`;

    if (filters.length > 0) {
      return await db.select().from(giderler).where(and(...filters)).orderBy(tarihOrder);
    }
    return await db.select().from(giderler).orderBy(tarihOrder);
  }

  async getGiderlerByPlaka(plaka: string): Promise<Gider[]> {
    return await db
      .select()
      .from(giderler)
      .where(eq(giderler.plaka, plaka))
      .orderBy(desc(giderler.tarih));
  }

  async insertGiderler(veriler: InsertGiderler[]): Promise<Gider[]> {
    if (veriler.length === 0) return [];

    // Verileri 100'lük parçalar halinde ekle
    const BATCH_SIZE = 100;
    const results: Gider[] = [];

    for (let i = 0; i < veriler.length; i += BATCH_SIZE) {
      const batch = veriler.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(giderler).values(batch).onConflictDoNothing().returning(); // Ignore duplicates based on index
      results.push(...inserted);
    }

    return results;
  }

  async deleteGiderler(ay: string, yil: number): Promise<void> {
    if (ay === 'toplam') {
      await db.delete(giderler).where(eq(giderler.yil, yil));
    } else {
      await db.delete(giderler).where(and(eq(giderler.ay, ay), eq(giderler.yil, yil)));
    }
  }

  async updateGider(id: string, veri: Partial<InsertGiderler>): Promise<Gider> {
    const [updated] = await db
      .update(giderler)
      .set(veri)
      .where(eq(giderler.id, id))
      .returning();
    if (!updated) throw new Error("Gider bulunamadı");
    return updated;
  }

  async updateGiderlerBulk(ids: string[], veri: Partial<InsertGiderler>): Promise<number> {
    if (ids.length === 0) return 0;
    const updated = await db
      .update(giderler)
      .set(veri)
      .where(inArray(giderler.id, ids))
      .returning({ id: giderler.id });
    return updated.length;
  }

  // Yakıt tedarikçisi (Halis Petrol) faturaları + o ayın araçlara dağıtılmış
  // yakıt gideri toplamı. '_' joker karakteri HALİS/HALIS yazımlarının ikisini
  // de yakalar; upper() büyük-küçük harf farkını kapatır.
  async getYakitFaturalari(): Promise<(Gider & { dagitilanTutar: number })[]> {
    const faturalar = await db
      .select()
      .from(giderler)
      .where(sql`upper(${giderler.firma}) LIKE '%HAL_S PETROL%'`)
      .orderBy(sql`to_date(${giderler.tarih}, 'DD.MM.YYYY') DESC NULLS LAST`);

    if (faturalar.length === 0) return [];

    // Araç yakıt giderleri GÜN bazında toplanır (tarih YYYY-MM-DD)
    const dagitim = await db
      .select({
        gun: aracGiderler.tarih,
        toplam: sql<string>`coalesce(sum(${aracGiderler.tutar}), 0)`,
      })
      .from(aracGiderler)
      .where(eq(aracGiderler.kategori, "Yakıt"))
      .groupBy(aracGiderler.tarih);

    // Halis Petrol iki haftada bir fatura keser (ör. ayın 15'i ve sonu). AY bazlı eşleşme
    // aynı aydaki İKİ faturaya aynı tutarı yazıyordu; onun yerine dönem bazlı eşleştir:
    // her gideri, fatura tarihi >= gider tarihi olan EN ERKEN faturaya ata (fatura tarihi = dönem sonu).
    const trToIso = (s: string | null): string => {
      const m = String(s ?? "").match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
      return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
    };
    const siraliFaturalar = faturalar
      .map((f) => ({ id: f.id, iso: trToIso(f.tarih) }))
      .filter((x) => x.iso)
      .sort((a, b) => (a.iso < b.iso ? -1 : 1)); // fatura tarihi ASC

    const dagitimById = new Map<string, number>();
    for (const d of dagitim) {
      const gun = String(d.gun ?? "");
      const hedef = siraliFaturalar.find((x) => x.iso >= gun); // tarihi >= gider günü olan ilk fatura
      if (hedef) dagitimById.set(hedef.id, (dagitimById.get(hedef.id) ?? 0) + Number(d.toplam));
    }

    return faturalar.map((f) => ({ ...f, dagitilanTutar: dagitimById.get(f.id) ?? 0 }));
  }

  async getGiderStats(yil?: number, ay?: string): Promise<{ toplamCount: number; toplamMalBedeli: number; toplamKdv: number; toplamTryTutar: number }> {
    const filters = [];
    if (yil) filters.push(eq(giderler.yil, yil));
    if (ay && ay !== "toplam") filters.push(eq(giderler.ay, ay));

    const result = await db
      .select({

        count: sql<number>`count(*)`,
        totalBase: sql<number>`sum(${giderler.malBedeli} * ${giderler.kur})`,
        totalVAT: sql<number>`sum(${giderler.kdvTutari} * ${giderler.kur})`,
        totalTRY: sql<number>`sum(${giderler.tryTutar})`,
      })
      .from(giderler)
      .where(and(...filters));

    const stats = result[0];
    return {
      toplamCount: Number(stats?.count || 0),
      toplamMalBedeli: Number(stats?.totalBase || 0),
      toplamKdv: Number(stats?.totalVAT || 0),
      toplamTryTutar: Number(stats?.totalTRY || 0),
    };
  }

  async getOzetSummary(yil: number): Promise<{
    ay: string;
    satisKdvHaric: number;
    satisKdv: number;
    satisToplam: number;
    giderKdvHaric: number;
    giderKdv: number;
    giderToplam: number;
    calisanBrut: number;
    calisanNet: number;
    calisanIsverenSgk: number;
    calisanMaliyet: number;
    yonetimNetUcret: number;
  }[]> {
    const aylar = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];

    // Get sales data grouped by month
    const salesData = await db
      .select({
        ay: gumrukVerileri.ay,
        malBedeli: sql<string>`sum(${gumrukVerileri.malBedeli})`,
        topKdvTutar: sql<string>`sum(${gumrukVerileri.topKdvTutar})`,
      })
      .from(gumrukVerileri)
      .where(eq(gumrukVerileri.yil, yil))
      .groupBy(gumrukVerileri.ay);

    // Get expenses data grouped by month
    const expensesData = await db
      .select({
        ay: giderler.ay,
        malBedeli: sql<string>`sum(${giderler.malBedeli} * ${giderler.kur})`,
        kdvTutari: sql<string>`sum(${giderler.kdvTutari} * ${giderler.kur})`,
        toplamTutar: sql<string>`sum(${giderler.tryTutar})`,
      })
      .from(giderler)
      .where(eq(giderler.yil, yil))
      .groupBy(giderler.ay);

    // Get employee data grouped by month (calculating total cost on-the-fly)
    const employeeData = await db
      .select({
        ay: calisanlar.ay,
        brutUcret: sql<string>`sum(${calisanlar.brutUcret})`,
        netUcret: sql<string>`sum(${calisanlar.netUcret})`,
        isverenSgkPayi: sql<string>`sum(${calisanlar.isverenSgkPayi})`,
        // Calculate total cost as brut + employer SGK (like the other pages do)
        toplamIsverenMaliyeti: sql<string>`sum(${calisanlar.brutUcret}) + sum(${calisanlar.isverenSgkPayi})`,
      })
      .from(calisanlar)
      .where(eq(calisanlar.yil, yil))
      .groupBy(calisanlar.ay);

    // Calculate Management Net Wages specifically
    const managerNames = ["CEM YILDIRIM", "ENİS ÜNER", "NEŞE YILDIRIM", "COŞKUN YILDIRIM", "CENGİZ ÜNER"];
    
    // Create a SQL OR condition for names using ILIKE for robustness
    const nameConditions = managerNames.map(name => sql`${calisanlar.adSoyad} ILIKE ${'%' + name + '%'}`);
    
    // Check if we have any conditions before querying
    let managementData: { ay: string; yonetimNet: string }[] = [];
    
    if (nameConditions.length > 0) {
      managementData = await db
        .select({
          ay: calisanlar.ay,
          yonetimNet: sql<string>`sum(${calisanlar.netUcret})`,
        })
        .from(calisanlar)
        .where(
          and(
            eq(calisanlar.yil, yil),
            sql`(${sql.join(nameConditions, sql` OR `)})`
          )
        )
        .groupBy(calisanlar.ay);
    }

    // Create lookup maps with normalization
    const normalizeKey = (k: string | null) => (k || "").trim().toLowerCase();

    const salesMap = new Map(salesData.map(s => [normalizeKey(s.ay), s]));
    const expensesMap = new Map(expensesData.map(e => [normalizeKey(e.ay), e]));

    // Create month number to name mapping (1-12 to "ocak"-"aralik")
    const monthNumToName: Record<string, string> = {};
    aylar.forEach((name, idx) => {
      monthNumToName[String(idx + 1)] = name;
    });

    // Create employee map with month name keys
    const employeeMap = new Map<string, typeof employeeData[0]>();
    employeeData.forEach(e => {
      const monthName = monthNumToName[e.ay || ""] || e.ay;
      employeeMap.set(normalizeKey(monthName), e);
    });

    const managementMap = new Map<string, typeof managementData[0]>();
    managementData.forEach(m => {
        const monthName = monthNumToName[m.ay || ""] || m.ay;
        managementMap.set(normalizeKey(monthName), m);
    });

    // Build result for all 12 months
    return aylar.map(ay => {
      const normalizedAy = normalizeKey(ay);
      const sales = salesMap.get(normalizedAy);
      const expenses = expensesMap.get(normalizedAy);
      const employee = employeeMap.get(normalizedAy);

      const satisKdvHaric = parseFloat(sales?.malBedeli || "0");
      const satisKdv = parseFloat(sales?.topKdvTutar || "0");

      return {
        ay,
        satisKdvHaric,
        satisKdv,
        satisToplam: satisKdvHaric + satisKdv,
        giderKdvHaric: parseFloat(expenses?.malBedeli || "0"),
        giderKdv: parseFloat(expenses?.kdvTutari || "0"),
        giderToplam: parseFloat(expenses?.toplamTutar || "0"),
        calisanBrut: parseFloat(employee?.brutUcret || "0"),
        calisanNet: parseFloat(employee?.netUcret || "0"),
        calisanIsverenSgk: parseFloat(employee?.isverenSgkPayi || "0"),
        calisanMaliyet: parseFloat(employee?.toplamIsverenMaliyeti || "0"),
        yonetimNetUcret: parseFloat(managementMap.get(normalizedAy)?.yonetimNet || "0"),
      };
    });
  }

  async getSigortaPoliceleri(sirket?: string, ay?: string, yil?: number): Promise<SigortaPolice[]> {
    const filters = [];
    if (sirket) filters.push(eq(sigortaPoliceleri.sirket, sirket));
    if (ay) filters.push(eq(sigortaPoliceleri.ay, ay));
    if (yil) filters.push(eq(sigortaPoliceleri.yil, yil));

    if (filters.length > 0) {
      return await db.select().from(sigortaPoliceleri).where(and(...filters)).orderBy(sigortaPoliceleri.tanzimTarihi);
    }
    return await db.select().from(sigortaPoliceleri).orderBy(sigortaPoliceleri.tanzimTarihi);
  }

  async insertSigortaPoliceleri(veriler: InsertSigortaPolice[]): Promise<SigortaPolice[]> {
    if (veriler.length === 0) return [];

    const BATCH_SIZE = 100;
    const results: SigortaPolice[] = [];

    for (let i = 0; i < veriler.length; i += BATCH_SIZE) {
      const batch = veriler.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(sigortaPoliceleri).values(batch)
        .onConflictDoUpdate({
           target: [sigortaPoliceleri.policeNo, sigortaPoliceleri.sirket],
           set: {
             netPrim: sql`excluded.net_prim`,
             brutPrim: sql`excluded.brut_prim`,
             komisyon: sql`excluded.komisyon`,
             sigortaBedeli: sql`excluded.sigorta_bedeli`,
             // Yeniden yüklemede mutabakat sonucu kaybolmasın: gelen değer boşsa mevcut tutulur,
             // gelen değer doluysa explicit bir update sayılır (UI üzerinden gelen update için gerekli).
             dekontDurumu: sql`COALESCE(NULLIF(excluded.dekont_durumu, ''), ${sigortaPoliceleri.dekontDurumu})`,
             tanzimTarihi: sql`excluded.tanzim_tarihi`,
             brans: sql`excluded.brans`,
             sigortali: sql`excluded.sigortali`,
             ay: sql`excluded.ay`,
             yil: sql`excluded.yil`,
           }
        })
        .returning();
      results.push(...inserted);
    }
    return results;
  }

  async deleteSigortaPoliceleri(sirket: string, ay?: string, yil?: number): Promise<void> {
     const filters = [eq(sigortaPoliceleri.sirket, sirket)];
     if (ay) filters.push(eq(sigortaPoliceleri.ay, ay));
     if (yil) filters.push(eq(sigortaPoliceleri.yil, yil)); // Corrected to use yil filter if provided.
     // WARNING: Original prompt logic mentioned matching "Veri Yükleme" page where users upload files.
     // Usually people re-upload a month. So deleting by month/year/company before insert is wise, or using upsert (which we did).
     
     // Let's rely on standard delete logic if requested explicitly. 
     await db.delete(sigortaPoliceleri).where(and(...filters));
  }

  async updateSigortaPoliceDekontDurumu(id: string, durum: string): Promise<SigortaPolice | null> {
    const [updated] = await db
      .update(sigortaPoliceleri)
      .set({ dekontDurumu: durum })
      .where(eq(sigortaPoliceleri.id, id))
      .returning();
    return updated || null;
  }

  async updateSigortaPoliceleriDekontDurumuBulk(ids: string[], durum: string): Promise<number> {
    if (ids.length === 0) return 0;
    const updated = await db
      .update(sigortaPoliceleri)
      .set({ dekontDurumu: durum })
      .where(inArray(sigortaPoliceleri.id, ids))
      .returning({ id: sigortaPoliceleri.id });
    return updated.length;
  }

  async getSigortaOzet(yil: number): Promise<{ ay: string; sirket: string; policeSayisi: number; toplamPrim: number; toplamKomisyon: number; toplamBedel: number; evetSayisi: number; tutarFarkiSayisi: number }[]> {
    const result = await db.select({
      ay: sigortaPoliceleri.ay,
      sirket: sigortaPoliceleri.sirket,
      policeSayisi: sql<number>`count(*)`,
      toplamPrim: sql<string>`sum(${sigortaPoliceleri.netPrim})`,
      toplamKomisyon: sql<string>`sum(${sigortaPoliceleri.komisyon})`,
      toplamBedel: sql<string>`sum(${sigortaPoliceleri.sigortaBedeli})`,
      evetSayisi: sql<number>`count(*) filter (where ${sigortaPoliceleri.dekontDurumu} = 'EVET')`,
      tutarFarkiSayisi: sql<number>`count(*) filter (where ${sigortaPoliceleri.dekontDurumu} = 'TUTAR FARKI')`,
    })
    .from(sigortaPoliceleri)
    .where(eq(sigortaPoliceleri.yil, yil))
    .groupBy(sigortaPoliceleri.ay, sigortaPoliceleri.sirket);

    return result.map(r => ({
      ay: r.ay || "",
      sirket: r.sirket,
      policeSayisi: Number(r.policeSayisi),
      toplamPrim: parseFloat(r.toplamPrim || "0"),
      toplamKomisyon: parseFloat(r.toplamKomisyon || "0"),
      toplamBedel: parseFloat(r.toplamBedel || "0"),
      evetSayisi: Number(r.evetSayisi),
      tutarFarkiSayisi: Number(r.tutarFarkiSayisi),
    }));
  }


  async getSigortaFirmaOzet(yil: number, ay?: string, sirket?: string): Promise<{ sigortali: string; brutPrim: number; komisyon: number; policeSayisi: number }[]> {
    const filters = [eq(sigortaPoliceleri.yil, yil)];
    if (ay && ay !== 'toplam' && ay !== 'ALL') {
      filters.push(eq(sigortaPoliceleri.ay, ay));
    }
    if (sirket) {
      // Acente filtresi (Mapfre / Ray Sigorta) — Özet'teki "En Çok Brüt Prim" tablosu için
      filters.push(eq(sigortaPoliceleri.sirket, sirket));
    }

    const result = await db.select({
      sigortali: sigortaPoliceleri.sigortali,
      brutPrim: sql<string>`sum(${sigortaPoliceleri.brutPrim})`,
      komisyon: sql<string>`sum(${sigortaPoliceleri.komisyon})`,
      policeSayisi: sql<number>`count(*)`,
    })
    .from(sigortaPoliceleri)
    .where(and(...filters))
    .groupBy(sigortaPoliceleri.sigortali);

    return result.map(r => ({
      sigortali: r.sigortali || '(Bilinmiyor)',
      brutPrim: parseFloat(r.brutPrim || '0'),
      komisyon: parseFloat(r.komisyon || '0'),
      policeSayisi: Number(r.policeSayisi),
    }));
  }

  // ==========================================================
  // SİGORTA MUHASEBE KAYITLARI IMPLEMENTATION
  // ==========================================================

  async getSigortaMuhasebeKayitlari(sirket?: string, ay?: string, yil?: number): Promise<SigortaMuhasebe[]> {
    const filters = [];
    if (sirket) filters.push(eq(sigortaMuhasebeKayitlari.sirket, sirket));
    if (ay && ay !== "ALL") filters.push(eq(sigortaMuhasebeKayitlari.ay, ay));
    if (yil) filters.push(eq(sigortaMuhasebeKayitlari.yil, yil));

    if (filters.length > 0) {
      return await db.select().from(sigortaMuhasebeKayitlari).where(and(...filters)).orderBy(sigortaMuhasebeKayitlari.tarih);
    }
    return await db.select().from(sigortaMuhasebeKayitlari).orderBy(sigortaMuhasebeKayitlari.tarih);
  }

  async getSigortaMuhasebeByPoliceId(policeId: string): Promise<SigortaMuhasebe[]> {
    return await db
      .select()
      .from(sigortaMuhasebeKayitlari)
      .where(eq(sigortaMuhasebeKayitlari.eslesenPolicyId, policeId))
      .orderBy(sigortaMuhasebeKayitlari.tarih);
  }

  async insertSigortaMuhasebeKayitlari(veriler: InsertSigortaMuhasebe[]): Promise<SigortaMuhasebe[]> {
    if (veriler.length === 0) return [];
    
    const results: SigortaMuhasebe[] = [];
    const BATCH_SIZE = 100;

    for (let i = 0; i < veriler.length; i += BATCH_SIZE) {
      const batch = veriler.slice(i, i + BATCH_SIZE);
      const inserted = await db
        .insert(sigortaMuhasebeKayitlari)
        .values(batch)
        .onConflictDoNothing() // Ignore duplicates if re-uploaded
        .returning();
      results.push(...inserted);
    }

    return results;
  }

  async deleteSigortaMuhasebeKayitlari(sirket: string, ay?: string, yil?: number): Promise<void> {
    const filters = [eq(sigortaMuhasebeKayitlari.sirket, sirket)];
    
    if (ay && ay !== "ALL") filters.push(eq(sigortaMuhasebeKayitlari.ay, ay));
    if (yil) filters.push(eq(sigortaMuhasebeKayitlari.yil, yil));

    await db.delete(sigortaMuhasebeKayitlari).where(and(...filters));
  }

  async updateSigortaMuhasebeKaydi(id: string, veri: Partial<InsertSigortaMuhasebe>): Promise<SigortaMuhasebe | null> {
      const [updated] = await db
      .update(sigortaMuhasebeKayitlari)
      .set(veri)
      .where(eq(sigortaMuhasebeKayitlari.id, id))
      .returning();
      return updated || null;
  }

  async deleteSigortaMuhasebeKaydi(id: string): Promise<void> {
    await db.delete(sigortaMuhasebeKayitlari).where(eq(sigortaMuhasebeKayitlari.id, id));
  }
  async executeRawSql(query: string): Promise<any[]> {
    try {
      const result = await db.execute(sql.raw(query));
      return result.rows;
    } catch (error) {
      console.error("Execute Raw SQL Error:", error);
      throw error;
    }
  }

  async getBranchProfitability(yil: number, ay?: string): Promise<any[]> {
    // 1. Get Income by Branch (Gümrük verileri)
    const filters = [eq(gumrukVerileri.yil, yil)];
    if (ay && ay !== "ALL") filters.push(eq(gumrukVerileri.ay, ay));

    const gumrukResult = await db.select({
        eleman: gumrukVerileri.girisElemani,
        malBedeli: gumrukVerileri.malBedeli,
        gumruk: gumrukVerileri.gumruk,
    }).from(gumrukVerileri).where(and(...filters));

    // Get Employees to map element -> branch
    const employees = await db.select({
        adSoyad: calisanlar.adSoyad,
        sube: calisanlar.sube,
        maliyet: calisanlar.toplamIsverenMaliyeti,
    }).from(calisanlar).where(and(eq(calisanlar.yil, yil), ay && ay !== "ALL" ? eq(calisanlar.ay, ay) : undefined));

    const employeeMap = new Map();
    const branchPersonelCosts = new Map<string, number>();

    employees.forEach(e => {
        employeeMap.set(e.adSoyad, e.sube || "Belirsiz");
        const maliyet = parseFloat(e.maliyet || "0");
        branchPersonelCosts.set(e.sube || "Belirsiz", (branchPersonelCosts.get(e.sube || "Belirsiz") || 0) + maliyet);
    });

    // 2. Get Gümrük Giderleri by Branch (from giderler table)
    // Exclude ARAÇ YAKIT category (will be handled separately from Araçlar page)
    const giderFilters = [eq(giderler.yil, yil)];
    if (ay && ay !== "ALL") giderFilters.push(eq(giderler.ay, ay));

    const giderlerResult = await db.select({
        sube: giderler.sube,
        kategori: giderler.kategori,
        malBedeli: giderler.malBedeli,
    }).from(giderler).where(and(...giderFilters));

    const branchGumrukCosts = new Map<string, number>();
    giderlerResult.forEach(g => {
        // ARAÇ YAKIT kategorisini hariç tut
        if (g.kategori?.toUpperCase() === "ARAÇ YAKIT") return;

        const branch = g.sube || "Belirsiz";
        const tutar = parseFloat(g.malBedeli || "0");
        branchGumrukCosts.set(branch, (branchGumrukCosts.get(branch) || 0) + tutar);
    });

    // 3. Get Araç Giderleri by Branch (Yakıt, Kasko, Trafik)
    const araclarList = await db.select().from(araclar);
    const aracGiderlerResult = await db.select().from(aracGiderler);

    const aracSubeMap = new Map<string, string>();
    araclarList.forEach(a => {
        aracSubeMap.set(a.id, a.sube || "Belirsiz");
    });

    const branchAracCosts = new Map<string, number>();

    // a) Manual vehicle expenses (filter by year)
    const yilStr = yil.toString();
    aracGiderlerResult.forEach(g => {
        if (!g.tarih.startsWith(yilStr)) return;

        if (ay && ay !== "ALL") {
            const ayIndex = ["ocak", "subat", "mart", "nisan", "mayis", "haziran",
                           "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"].indexOf(ay.toLowerCase());
            if (ayIndex !== -1) {
                const monthStr = String(ayIndex + 1).padStart(2, '0');
                if (!g.tarih.startsWith(`${yilStr}-${monthStr}`)) return;
            }
        }

        const branch = aracSubeMap.get(g.aracId) || "Belirsiz";
        const tutar = parseFloat(g.tutar || "0");
        branchAracCosts.set(branch, (branchAracCosts.get(branch) || 0) + tutar);
    });

    // b) Kasko and Trafik insurance from araçlar
    araclarList.forEach(a => {
        const branch = a.sube || "Belirsiz";

        // Trafik Sigortası
        if (a.trafikBitisTarihi && a.trafikSigortaFiyat) {
            const bitisTarihi = new Date(a.trafikBitisTarihi);
            const baslangicTarihi = new Date(bitisTarihi);
            baslangicTarihi.setFullYear(baslangicTarihi.getFullYear() - 1);

            if (baslangicTarihi.getFullYear() === yil) {
                if (ay && ay !== "ALL") {
                    const ayIndex = ["ocak", "subat", "mart", "nisan", "mayis", "haziran",
                                   "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"].indexOf(ay.toLowerCase());
                    if (ayIndex !== -1 && baslangicTarihi.getMonth() !== ayIndex) return;
                }
                const tutar = parseFloat(a.trafikSigortaFiyat || "0");
                branchAracCosts.set(branch, (branchAracCosts.get(branch) || 0) + tutar);
            }
        }

        // Kasko
        if (a.kaskoBitisTarihi && a.kaskoSigortaFiyat) {
            const bitisTarihi = new Date(a.kaskoBitisTarihi);
            const baslangicTarihi = new Date(bitisTarihi);
            baslangicTarihi.setFullYear(baslangicTarihi.getFullYear() - 1);

            if (baslangicTarihi.getFullYear() === yil) {
                if (ay && ay !== "ALL") {
                    const ayIndex = ["ocak", "subat", "mart", "nisan", "mayis", "haziran",
                                   "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"].indexOf(ay.toLowerCase());
                    if (ayIndex !== -1 && baslangicTarihi.getMonth() !== ayIndex) return;
                }
                const tutar = parseFloat(a.kaskoSigortaFiyat || "0");
                branchAracCosts.set(branch, (branchAracCosts.get(branch) || 0) + tutar);
            }
        }
    });

    // Customs mapping for Bursa
    const bursaGumrukleri = [
        "ADNAN MENDERES GÜM MÜD",
        "ALİAĞA GÜMRÜK MÜDÜRLÜĞÜ",
        "AYVALIK GÜMRÜK MÜDÜRLÜĞÜ",
        "BANDIRMA GÜMRÜK MÜDÜRLÜĞÜ",
        "BURSA GÜMRÜK MÜDÜRLÜĞÜ",
        "EGE SERB BÖL GÜM MÜD",
        "İNEGÖL GÜMRÜK MÜDÜRLÜĞÜ",
        "İZMİR SERBEST BÖLGE GÜM.MÜD.",
        "MANİSA GÜMRÜK MÜDÜRLÜĞÜ",
        "MUDANYA GÜMRÜK MÜDÜRLÜĞÜ",
        "KONYA GÜMRÜK MÜDÜRLÜĞÜ",
        "ANTALYA H.L. GÜMRÜK MÜDÜRLÜĞÜ",
        "ADANA GÜMRÜK MÜDÜRLÜĞÜ",
        "ANKARA GÜMRÜK MÜDÜRLÜĞÜ",
        "KAPIKULE GAR GÜMRÜK MÜDÜRLÜĞÜ",
        "MERSİN GÜMRÜK MÜDÜRLÜĞÜ",
        "İZMİR GÜMRÜK MÜDÜRLÜĞÜ",
        "ESENBOĞA GÜMRÜK MÜDÜRLÜĞÜ",
        "SİLOPİ GÜMRÜK MÜDÜRLÜĞÜ",
        "GAZİANTEP GÜMRÜK MÜDÜRLÜĞÜ",
        "İSKENDERUN GÜMRÜK MÜDÜRLÜĞÜ",
        "DENİZLİ GÜMRÜK MÜDÜRLÜĞÜ",
        "ANTAKYA GÜMRÜK MÜDÜRLÜĞÜ",
        "HOPA GÜMRÜK MÜDÜRLÜĞÜ"
    ];

    // Customs mapping for İstanbul - İHL
    const istIhlGumrukleri = [
        "AHL KARGO GÜMRÜK MÜDÜRLÜĞÜ",
        "AMBARLI GÜMRÜK MÜDÜRLÜĞÜ",
        "AMBARLI  GÜMRÜK MÜDÜRLÜGÜ",
        "AVRUPA SERB.BÖLGE GÜM.MÜD.",
        "HALKALI GAR GÜMRÜK MÜD.",
        "İSTANBUL HAVALİMANI GÜMRÜK MÜDÜRLÜĞÜ",
        "İSTANBUL HAVALİMANI YOLCU SALONU GÜMRÜK MÜDÜRLÜĞÜ"
    ];

    // Customs mapping for Muratbey
    const muratbeyGumrukleri = [
        "MURATBEY GÜMRÜK MÜDÜRLÜĞÜ",
        "TRAKYA SERB BÖL GÜM MÜD.",
        "TEKİRDAĞ GÜMRÜK MÜDÜRLÜĞÜ",
        "ÇERKEZKÖY GÜMRÜK MÜDÜRLÜĞÜ",
        "MARMARA EREĞLİSİ GÜMRÜK MÜDÜRLÜĞÜ",
        "İST. ENDÜSTRİ VE TİCARET SERBEST BÖLGE GÜM. MÜD.",
        "İSTANBUL İHTİSAS SERBEST BÖLGE GÜMRÜK MÜDÜRLÜĞÜ"
    ];

    // Customs mapping for İstanbul - Erenköy
    const erenkoyGumrukleri = [
        "DERİNCE GÜMRÜK MÜDÜRLÜĞÜ",
        "DİLOVASI GÜMRÜK MÜDÜRLÜĞÜ",
        "ERENKÖY GÜMRÜK MÜDÜRLÜĞÜ",
        "GEBZE GÜMRÜK MÜDÜRLÜĞÜ",
        "HAYDARPAŞA GÜMRÜK MÜDÜRLÜĞÜ",
        "İST DERİ SERB BÖL GÜM MÜD.",
        "KÖRFEZ PETROKİMYA GÜMRÜK MÜD.",
        "İZMİT GÜMRÜK MÜDÜRLÜĞÜ",
        "SABİHA GÖKÇEN HAVALİMANI GÜM.MD.",
        "PENDİK GÜMRÜK MÜDÜRLÜĞÜ"
    ];

    const branchIncome = new Map<string, number>();
    gumrukResult.forEach(g => {
        let branch = "Belirsiz";
        const gumrukUpper = (g.gumruk || "").toUpperCase();

        if (bursaGumrukleri.some(bg => gumrukUpper.includes(bg))) {
            branch = "Bursa";
        } else if (gumrukUpper.includes("GEMLİK")) {
            branch = "Gemlik";
        } else if (muratbeyGumrukleri.some(mg => gumrukUpper.includes(mg)) || gumrukUpper.includes("MURATBEY")) {
            branch = "Muratbey";
        } else if (erenkoyGumrukleri.some(eg => gumrukUpper.includes(eg)) || gumrukUpper.includes("ERENKÖY")) {
            branch = "İstanbul - Erenköy";
        } else if (istIhlGumrukleri.some(ig => gumrukUpper.includes(ig)) || gumrukUpper.includes("İHL") || gumrukUpper.includes("HAVAALANI")) {
            branch = "İstanbul - İHL";
        }

        const gelir = parseFloat(g.malBedeli || "0");
        branchIncome.set(branch, (branchIncome.get(branch) || 0) + gelir);
    });

    // Combine all branches
    const finalResult: {
        sube: string;
        gelir: number;
        giderPersonel: number;
        giderGumruk: number;
        giderArac: number;
        toplamGider: number;
        kar: number
    }[] = [];

    const allBranches = new Set<string>([
        ...Array.from(branchIncome.keys()),
        ...Array.from(branchPersonelCosts.keys()),
        ...Array.from(branchGumrukCosts.keys()),
        ...Array.from(branchAracCosts.keys())
    ]);

    allBranches.forEach(branch => {
        const gelir = branchIncome.get(branch) || 0;
        const giderPersonel = branchPersonelCosts.get(branch) || 0;
        const giderGumruk = branchGumrukCosts.get(branch) || 0;
        const giderArac = branchAracCosts.get(branch) || 0;
        const toplamGider = giderPersonel + giderGumruk + giderArac;

        finalResult.push({
            sube: branch,
            gelir,
            giderPersonel,
            giderGumruk,
            giderArac,
            toplamGider,
            kar: gelir - toplamGider
        });
    });

    return finalResult;
  }

  async getVehicleExpenses(plaka: string): Promise<any[]> {
    // Get Sigorta Policeleri for this vehicle
    // We search the 'sigortali' or 'brans' field for the plate? 
    // In current data, plates might be in 'sigortali' or specialized table.
    // The user had a seed_vehicles script with plates.
    // Let's assume we search sigortali field for plaka or use a like pattern.
    
    const policeler = await db.select()
        .from(sigortaPoliceleri)
        .where(sql`${sigortaPoliceleri.sigortali} ILIKE ${'%' + plaka + '%'}`);
        
    return policeler.map(p => ({
        id: p.id,
        policeNo: p.policeNo,
        brans: p.brans,
        prim: p.netPrim,
        tarih: p.tanzimTarihi,
        sirket: p.sirket
    }));
  }

  async getUpcomingPolicies(deadlineDays: number): Promise<any[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + deadlineDays);
    
    const todayStr = today.toISOString().split('T')[0];
    const futureStr = futureDate.toISOString().split('T')[0];

    // 1. Vehicle policies (trafik/kasko)
    const araclarList = await db.select().from(araclar);
    const reminders: { tip: string; baslik: string; tarih: string; id: string }[] = [];

    araclarList.forEach(arac => {
        if (arac.trafikBitisTarihi && arac.trafikBitisTarihi >= todayStr && arac.trafikBitisTarihi <= futureStr) {
            reminders.push({
                tip: "Araç (Trafik)",
                baslik: `${arac.plaka} - Trafik Sigortası`,
                tarih: arac.trafikBitisTarihi,
                id: arac.id
            });
        }
        if (arac.kaskoBitisTarihi && arac.kaskoBitisTarihi >= todayStr && arac.kaskoBitisTarihi <= futureStr) {
            reminders.push({
                tip: "Araç (Kasko)",
                baslik: `${arac.plaka} - Kasko`,
                tarih: arac.kaskoBitisTarihi,
                id: arac.id
            });
        }
    });

    // 2. Generic policies from sigorta_policeleri? 
    // We don't have bitisTarihi in sigorta_policeleri schema viewed above. 
    // Let's check schema again. Oh, it only has tanzimTarihi.
    // Usually policies are 1 year. 
    // If user didn't ask for generic policy expiry yet, we focus on vehicles.
    
    return reminders.sort((a, b) => a.tarih.localeCompare(b.tarih));
  }

  // ==========================================================
  // SALARY PLANS IMPLEMENTATION
  // ==========================================================
  async getSalaryPlans(year: number): Promise<SalaryPlan[]> {
    return await db.select().from(salaryPlans).where(eq(salaryPlans.year, year));
  }

  async insertSalaryPlans(plans: InsertSalaryPlan[]): Promise<SalaryPlan[]> {
    if (plans.length === 0) return [];
    
    const results: SalaryPlan[] = [];
    // PostgreSQL Upsert
    for (const plan of plans) {
        const [inserted] = await db
            .insert(salaryPlans)
            .values(plan)
            .onConflictDoUpdate({
                target: [salaryPlans.tcNo, salaryPlans.year],
                set: {
                    netSalary: plan.netSalary,
                    employeeType: plan.employeeType,
                    branch: plan.branch,
                    updatedAt: sql`CURRENT_DATE`
                }
            })
            .returning();
        results.push(inserted);
    }
    return results;
  }

  async getHistoricalMappings(): Promise<{ firma: string; sube: string; kategori: string }[]> {
    const all = await db
      .select({
        firma: giderler.firma,
        sube: giderler.sube,
        kategori: giderler.kategori,
        tarih: giderler.olusturmaTarihi
      })
      .from(giderler)
      .where(
        and(
          isNotNull(giderler.sube), 
          isNotNull(giderler.kategori),
          isNotNull(giderler.firma)
        )
      )
      .orderBy(desc(giderler.olusturmaTarihi));

    const map = new Map<string, { firma: string; sube: string; kategori: string }>();
    
    for (const item of all) {
      if (!item.firma) continue;
      if (!map.has(item.firma)) {
         map.set(item.firma, { 
             firma: item.firma, 
             sube: item.sube!, 
             kategori: item.kategori! 
         });
      }
    }

    return Array.from(map.values());
  }

  // ==========================================================
  // EXPENSE CATEGORIES IMPLEMENTATION
  // ==========================================================
  async getExpenseCategories(): Promise<ExpenseCategory[]> {
    return await db.select().from(expenseCategories).orderBy(expenseCategories.name);
  }

  async createExpenseCategory(category: InsertExpenseCategory): Promise<ExpenseCategory> {
    const [inserted] = await db.insert(expenseCategories).values(category).returning();
    return inserted;
  }

  async deleteExpenseCategory(id: string): Promise<void> {
    await db.delete(expenseCategories).where(eq(expenseCategories.id, id));
  }

  async seedExpenseCategories(): Promise<void> {
    const defaults = [
      "SU", "İNTERNET", "KARGO", "KIRTASİYE", "ELEKTRİK", "MUHASEBE", "KİRA", 
      "YAZICI", "YEMEK", "ARAÇ BAKIM", "BİLGİSAYAR BAKIM", "SODEXO", "ARAÇ ŞARJ", 
      "CEZA", "YAZILIM", "ARAÇ MUAYENE", "OFİS MASRAF", "DOĞALGAZ", "TONER", 
      "FOTOKOPİ", "TELEFON", "İNDİRİM", "KAĞIT", "OTOPARK", "ISINMA", 
      "YOL ÜCRETİ", "ARAÇ KİRA", "OFİX", "İADE", "BEYANNAME", "MESAİ YEMEK", 
      "KURYE", "ARAÇ ALIM"
    ];

    for (const name of defaults) {
      await db.insert(expenseCategories)
        .values({ name })
        .onConflictDoNothing()
        .returning();
    }
  }

  // Surveys
  async getSurveys(): Promise<Survey[]> {
    return await db.select().from(surveys).orderBy(desc(surveys.createdAt));
  }

  async getSurvey(id: string): Promise<Survey | undefined> {
    const [survey] = await db.select().from(surveys).where(or(eq(surveys.id, id), eq(surveys.slug, id)));
    return survey;
  }

  async createSurvey(survey: InsertSurvey): Promise<Survey> {
    const [newSurvey] = await db.insert(surveys).values(survey).returning();
    return newSurvey;
  }

  async updateSurvey(id: string, survey: Partial<InsertSurvey>): Promise<Survey> {
    const [updated] = await db.update(surveys).set(survey).where(eq(surveys.id, id)).returning();
    if (!updated) throw new Error("Anket bulunamadı");
    return updated;
  }

  async getSurveyResponses(surveyId: string): Promise<SurveyResponse[]> {
    return await db.select().from(surveyResponses).where(eq(surveyResponses.surveyId, surveyId)).orderBy(desc(surveyResponses.submittedAt));
  }

  async createSurveyResponse(response: InsertSurveyResponse): Promise<SurveyResponse> {
    const [newResponse] = await db.insert(surveyResponses).values(response).returning();
    return newResponse;
  }

  async deleteSurveyResponse(id: string): Promise<void> {
    await db.delete(surveyResponses).where(eq(surveyResponses.id, id));
  }

  async getSurveysByType(type: string): Promise<Survey[]> {
    return await db.select().from(surveys).where(eq(surveys.type, type)).orderBy(desc(surveys.createdAt));
  }

  async getTedarikcilar(): Promise<(Tedarikci & { degerlendirmeSayisi: number })[]> {
    const tumTedarikcilar = await db.select().from(tedarikcilar).orderBy(asc(tedarikcilar.ad));
    const counts = await db.select({
      tedarikciId: tedarikciDegerlendirmeler.tedarikciId,
      count: sql<number>`count(*)::int`,
    }).from(tedarikciDegerlendirmeler).groupBy(tedarikciDegerlendirmeler.tedarikciId);
    const countMap = new Map(counts.map(c => [c.tedarikciId, c.count]));
    return tumTedarikcilar.map(t => ({ ...t, degerlendirmeSayisi: countMap.get(t.id) ?? 0 }));
  }

  async createTedarikci(data: InsertTedarikci): Promise<Tedarikci> {
    const [row] = await db.insert(tedarikcilar).values(data).returning();
    return row;
  }

  async updateTedarikci(id: string, data: Partial<InsertTedarikci>): Promise<Tedarikci> {
    const [row] = await db.update(tedarikcilar).set(data).where(eq(tedarikcilar.id, id)).returning();
    return row;
  }

  async deleteTedarikci(id: string): Promise<void> {
    await db.delete(tedarikcilar).where(eq(tedarikcilar.id, id));
  }

  async getTedarikciKriterleri(): Promise<TedarikciDegerlendirmeKriter[]> {
    return await db.select().from(tedarikciDegerlendirmeKriterleri).orderBy(asc(tedarikciDegerlendirmeKriterleri.sira));
  }

  async createTedarikciKriter(data: InsertTedarikciDegerlendirmeKriter): Promise<TedarikciDegerlendirmeKriter> {
    const [row] = await db.insert(tedarikciDegerlendirmeKriterleri).values(data).returning();
    return row;
  }

  async updateTedarikciKriter(id: string, data: Partial<InsertTedarikciDegerlendirmeKriter>): Promise<TedarikciDegerlendirmeKriter> {
    const [row] = await db.update(tedarikciDegerlendirmeKriterleri).set(data).where(eq(tedarikciDegerlendirmeKriterleri.id, id)).returning();
    return row;
  }

  async deleteTedarikciKriter(id: string): Promise<void> {
    await db.delete(tedarikciDegerlendirmeKriterleri).where(eq(tedarikciDegerlendirmeKriterleri.id, id));
  }

  async getTedarikciDegerlendirmeleri(tedarikciId: string): Promise<(TedarikciDegerlendirme & { ortPuan: number | null })[]> {
    const list = await db.select().from(tedarikciDegerlendirmeler)
      .where(eq(tedarikciDegerlendirmeler.tedarikciId, tedarikciId))
      .orderBy(desc(tedarikciDegerlendirmeler.tarih));
    if (list.length === 0) return [];
    const cevaplar = await db.select().from(tedarikciDegerlendirmeCevaplari)
      .where(inArray(tedarikciDegerlendirmeCevaplari.degerlendirmeId, list.map(d => d.id)));
    return list.map(d => {
      const puanlar = cevaplar.filter(c => c.degerlendirmeId === d.id && c.puan !== null).map(c => c.puan as number);
      const ortPuan = puanlar.length > 0 ? Math.round((puanlar.reduce((a, b) => a + b, 0) / puanlar.length) * 10) / 10 : null;
      return { ...d, ortPuan };
    });
  }

  async getTedarikciDegerlendirme(tedarikciId: string, degerlendirmeId: string): Promise<(TedarikciDegerlendirme & { cevaplar: TedarikciDegerlendirmeCevap[] }) | null> {
    const [row] = await db.select().from(tedarikciDegerlendirmeler)
      .where(and(eq(tedarikciDegerlendirmeler.id, degerlendirmeId), eq(tedarikciDegerlendirmeler.tedarikciId, tedarikciId)));
    if (!row) return null;
    const cevaplar = await db.select().from(tedarikciDegerlendirmeCevaplari)
      .where(eq(tedarikciDegerlendirmeCevaplari.degerlendirmeId, degerlendirmeId));
    return { ...row, cevaplar };
  }

  async createTedarikciDegerlendirme(data: { tedarikciId: string; tarih: string; degerlendiren?: string; notlar?: string; cevaplar: { kriterId: string; puan?: number; cevap?: string }[] }): Promise<void> {
    const [degerlendirme] = await db.insert(tedarikciDegerlendirmeler).values({
      tedarikciId: data.tedarikciId,
      tarih: data.tarih,
      degerlendiren: data.degerlendiren,
      notlar: data.notlar,
    }).returning();
    if (data.cevaplar.length > 0) {
      await db.insert(tedarikciDegerlendirmeCevaplari).values(
        data.cevaplar.map(c => ({ degerlendirmeId: degerlendirme.id, kriterId: c.kriterId, puan: c.puan ?? null, cevap: c.cevap ?? null }))
      );
    }
  }

  async deleteTedarikciDegerlendirme(tedarikciId: string, degerlendirmeId: string): Promise<void> {
    await db.delete(tedarikciDegerlendirmeler).where(
      and(eq(tedarikciDegerlendirmeler.id, degerlendirmeId), eq(tedarikciDegerlendirmeler.tedarikciId, tedarikciId))
    );
  }

  async getToplantılar(): Promise<(YonetimGozdenGecirme & { aksiyon_sayisi: number })[]> {
    const list = await db.select().from(yonetimGozdenGecirmeler).orderBy(desc(yonetimGozdenGecirmeler.tarih));
    const counts = await db.select({
      toplantId: yonetimAksiyonlar.toplantId,
      count: sql<number>`count(*)::int`,
    }).from(yonetimAksiyonlar).groupBy(yonetimAksiyonlar.toplantId);
    const countMap = new Map(counts.map(c => [c.toplantId, c.count]));
    return list.map(t => ({ ...t, aksiyon_sayisi: countMap.get(t.id) ?? 0 }));
  }

  async getToplantı(id: string): Promise<(YonetimGozdenGecirme & { aksiyonlar: YonetimAksiyon[] }) | null> {
    const [row] = await db.select().from(yonetimGozdenGecirmeler).where(eq(yonetimGozdenGecirmeler.id, id));
    if (!row) return null;
    const aksiyonlar = await db.select().from(yonetimAksiyonlar)
      .where(eq(yonetimAksiyonlar.toplantId, id))
      .orderBy(asc(yonetimAksiyonlar.olusturmaTarihi));
    return { ...row, aksiyonlar };
  }

  async createToplantı(data: InsertYonetimGozdenGecirme): Promise<YonetimGozdenGecirme> {
    const [row] = await db.insert(yonetimGozdenGecirmeler).values(data).returning();
    return row;
  }

  async updateToplantı(id: string, data: Partial<InsertYonetimGozdenGecirme>): Promise<YonetimGozdenGecirme> {
    const [row] = await db.update(yonetimGozdenGecirmeler).set(data).where(eq(yonetimGozdenGecirmeler.id, id)).returning();
    return row;
  }

  async deleteToplantı(id: string): Promise<void> {
    await db.delete(yonetimGozdenGecirmeler).where(eq(yonetimGozdenGecirmeler.id, id));
  }

  async getAksiyonlar(): Promise<(YonetimAksiyon & { toplantıTarihi: string })[]> {
    const rows = await db
      .select({
        id: yonetimAksiyonlar.id,
        toplantId: yonetimAksiyonlar.toplantId,
        aksiyon: yonetimAksiyonlar.aksiyon,
        sorumlu: yonetimAksiyonlar.sorumlu,
        hedefTarih: yonetimAksiyonlar.hedefTarih,
        durum: yonetimAksiyonlar.durum,
        olusturmaTarihi: yonetimAksiyonlar.olusturmaTarihi,
        toplantıTarihi: yonetimGozdenGecirmeler.tarih,
      })
      .from(yonetimAksiyonlar)
      .innerJoin(yonetimGozdenGecirmeler, eq(yonetimAksiyonlar.toplantId, yonetimGozdenGecirmeler.id))
      .orderBy(desc(yonetimGozdenGecirmeler.tarih));
    return rows as (YonetimAksiyon & { toplantıTarihi: string })[];
  }

  async createAksiyon(data: InsertYonetimAksiyon): Promise<YonetimAksiyon> {
    const [row] = await db.insert(yonetimAksiyonlar).values(data).returning();
    return row;
  }

  async updateAksiyon(id: string, data: Partial<InsertYonetimAksiyon>): Promise<YonetimAksiyon> {
    const [row] = await db.update(yonetimAksiyonlar).set(data).where(eq(yonetimAksiyonlar.id, id)).returning();
    return row;
  }

  async deleteAksiyon(id: string): Promise<void> {
    await db.delete(yonetimAksiyonlar).where(eq(yonetimAksiyonlar.id, id));
  }

  async getIso9001Stats() {
    const today = new Date().toISOString().split("T")[0];

    const [belgeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(belgeler);

    const [musteriCount] = await db.select({ count: sql<number>`count(*)::int` }).from(surveys).where(eq(surveys.type, "musteri"));
    const [calisanCount] = await db.select({ count: sql<number>`count(*)::int` }).from(surveys).where(eq(surveys.type, "calisanlar"));

    const [dufAcik] = await db.select({ count: sql<number>`count(*)::int` }).from(duf).where(eq(duf.durum, "acik"));
    const [dufDevam] = await db.select({ count: sql<number>`count(*)::int` }).from(duf).where(eq(duf.durum, "devam_ediyor"));
    const [dufKapali] = await db.select({ count: sql<number>`count(*)::int` }).from(duf).where(eq(duf.durum, "kapali"));

    const gecikmisDuf = await db.select({ count: sql<number>`count(*)::int` }).from(duf)
      .where(and(
        sql`${duf.hedefKapanisTarihi} < ${today}`,
        ne(duf.durum, "kapali")
      ));

    const tamamlananTetkikler = await db.select()
      .from(tetkikPlanlar)
      .where(eq(tetkikPlanlar.durum, "tamamlandi"))
      .orderBy(desc(tetkikPlanlar.planlananTarih))
      .limit(1);

    const [planlananTetkik] = await db.select({ count: sql<number>`count(*)::int` }).from(tetkikPlanlar).where(eq(tetkikPlanlar.durum, "planlandi"));

    const aktifHedefler = await db.select().from(kaliteHedefleri).where(eq(kaliteHedefleri.durum, "Aktif"));
    const tumOlcumler = await db.select().from(kaliteOlcumler).orderBy(desc(kaliteOlcumler.olcumTarihi));

    let hedefYesilCount = 0;
    for (const hedef of aktifHedefler) {
      const sonOlcum = tumOlcumler.find(o => o.hedefId === hedef.id);
      if (!sonOlcum) continue;
      const g = Number(sonOlcum.gerceklesenDeger);
      const h = Number(hedef.hedefDeger);
      const yesil = hedef.yon === "yuksek_iyi" ? g >= h : g <= h;
      if (yesil) hedefYesilCount++;
    }

    const [egitimCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(egitimler);
    const [katilimciCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(egitimKatilimcilar);
    const [tedarikciCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(tedarikcilar);
    const currentYear = new Date().getFullYear().toString();
    const [buYilDegerlendirmeRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(tedarikciDegerlendirmeler)
      .where(sql`${tedarikciDegerlendirmeler.tarih} like ${currentYear + '%'}`);

    const sonToplantıRows = await db.select({ tarih: yonetimGozdenGecirmeler.tarih })
      .from(yonetimGozdenGecirmeler)
      .orderBy(desc(yonetimGozdenGecirmeler.tarih))
      .limit(1);
    const [acikAksiyon] = await db.select({ count: sql<number>`count(*)::int` })
      .from(yonetimAksiyonlar)
      .where(eq(yonetimAksiyonlar.durum, "acik"));

    return {
      belgeCount: belgeCount.count,
      hedefCount: aktifHedefler.length,
      hedefYesilCount,
      surveyCountMusteri: musteriCount.count,
      surveyCountCalisanlar: calisanCount.count,
      dufAcik: dufAcik.count + dufDevam.count,
      dufGecikmiş: gecikmisDuf[0].count,
      dufKapali: dufKapali.count,
      tetkikSonTarih: tamamlananTetkikler[0]?.planlananTarih ?? null,
      tetkikPlanlanan: planlananTetkik.count,
      egitimCount: egitimCountRow.count,
      toplamKatilimciCount: katilimciCountRow.count,
      tedarikciCount: tedarikciCountRow.count,
      buYilDegerlendirmeCount: buYilDegerlendirmeRow.count,
      sonToplantıTarihi: sonToplantıRows[0]?.tarih ?? null,
      acikAksiyon: acikAksiyon.count,
      bakimVarlikCount: (await db.select({ count: sql<number>`count(*)::int` }).from(bakimVarliklar))[0].count,
    };
  }

  async getDufList(): Promise<Duf[]> {
    return await db.select().from(duf).orderBy(desc(duf.olusturmaTarihi));
  }

  async getDuf(id: string): Promise<Duf | undefined> {
    const [row] = await db.select().from(duf).where(eq(duf.id, id));
    return row;
  }

  async createDuf(data: InsertDuf): Promise<Duf> {
    const [row] = await db.insert(duf).values(data).returning();
    return row;
  }

  async updateDuf(id: string, data: Partial<InsertDuf>): Promise<Duf> {
    const [row] = await db.update(duf).set(data).where(eq(duf.id, id)).returning();
    if (!row) throw new Error("DÜF bulunamadı");
    return row;
  }

  async deleteDuf(id: string): Promise<void> {
    await db.delete(duf).where(eq(duf.id, id));
  }

  async getBakimVarliklar(kategori?: string): Promise<(BakimVarlik & { sonBakimTarihi: string | null; kayitSayisi: number })[]> {
    const varliklar = await db.select().from(bakimVarliklar)
      .where(kategori ? eq(bakimVarliklar.kategori, kategori) : undefined)
      .orderBy(bakimVarliklar.marka, bakimVarliklar.model);
    if (varliklar.length === 0) return [];
    const ids = varliklar.map(v => v.id);
    const istatistikler = await db.select({
      varlikId: bakimKayitlari.varlikId,
      sonBakimTarihi: sql<string>`max(${bakimKayitlari.bakimTarihi})`,
      kayitSayisi: sql<number>`count(*)::int`,
    }).from(bakimKayitlari).where(inArray(bakimKayitlari.varlikId, ids)).groupBy(bakimKayitlari.varlikId);
    const map = new Map(istatistikler.map(k => [k.varlikId, k]));
    return varliklar.map(v => ({
      ...v,
      sonBakimTarihi: map.get(v.id)?.sonBakimTarihi ?? null,
      kayitSayisi: map.get(v.id)?.kayitSayisi ?? 0,
    }));
  }

  async getBakimVarlik(id: string): Promise<(BakimVarlik & { kayitlar: BakimKayit[] }) | undefined> {
    const [varlik] = await db.select().from(bakimVarliklar).where(eq(bakimVarliklar.id, id));
    if (!varlik) return undefined;
    const kayitlar = await db.select().from(bakimKayitlari)
      .where(eq(bakimKayitlari.varlikId, id))
      .orderBy(bakimKayitlari.bakimTarihi);
    return { ...varlik, kayitlar };
  }

  async createBakimVarlik(data: InsertBakimVarlik): Promise<BakimVarlik> {
    const [row] = await db.insert(bakimVarliklar).values(data).returning();
    return row;
  }

  async updateBakimVarlik(id: string, data: Partial<InsertBakimVarlik>): Promise<BakimVarlik> {
    const [row] = await db.update(bakimVarliklar).set(data).where(eq(bakimVarliklar.id, id)).returning();
    if (!row) throw new Error("Varlık bulunamadı");
    return row;
  }

  async deleteBakimVarlik(id: string): Promise<void> {
    await db.delete(bakimVarliklar).where(eq(bakimVarliklar.id, id));
  }

  async createBakimKayit(data: InsertBakimKayit): Promise<BakimKayit> {
    const [row] = await db.insert(bakimKayitlari).values(data).returning();
    return row;
  }

  async updateBakimKayit(id: string, data: Partial<InsertBakimKayit>): Promise<BakimKayit> {
    const [row] = await db.update(bakimKayitlari).set(data).where(eq(bakimKayitlari.id, id)).returning();
    if (!row) throw new Error("Bakım kaydı bulunamadı");
    return row;
  }

  async deleteBakimKayit(id: string): Promise<void> {
    await db.delete(bakimKayitlari).where(eq(bakimKayitlari.id, id));
  }

  async getTetkikPlanlar(): Promise<TetkikPlan[]> {
    return await db.select().from(tetkikPlanlar).orderBy(desc(tetkikPlanlar.planlananTarih));
  }

  async getTetkikPlan(id: string): Promise<TetkikPlan | undefined> {
    const [row] = await db.select().from(tetkikPlanlar).where(eq(tetkikPlanlar.id, id));
    return row;
  }

  async createTetkikPlan(data: InsertTetkikPlan): Promise<TetkikPlan> {
    const [row] = await db.insert(tetkikPlanlar).values(data).returning();
    return row;
  }

  async updateTetkikPlan(id: string, data: Partial<InsertTetkikPlan>): Promise<TetkikPlan> {
    const [row] = await db.update(tetkikPlanlar).set(data).where(eq(tetkikPlanlar.id, id)).returning();
    if (!row) throw new Error("Tetkik planı bulunamadı");
    return row;
  }

  async deleteTetkikPlan(id: string): Promise<void> {
    await db.delete(tetkikPlanlar).where(eq(tetkikPlanlar.id, id));
  }

  async getTetkikBulgular(tetkikPlanId?: string): Promise<TetkikBulgu[]> {
    if (tetkikPlanId) {
      return await db.select().from(tetkikBulgular).where(eq(tetkikBulgular.tetkikPlanId, tetkikPlanId)).orderBy(desc(tetkikBulgular.olusturmaTarihi));
    }
    return await db.select().from(tetkikBulgular).orderBy(desc(tetkikBulgular.olusturmaTarihi));
  }

  async createTetkikBulgu(data: InsertTetkikBulgu): Promise<TetkikBulgu> {
    const [row] = await db.insert(tetkikBulgular).values(data).returning();
    return row;
  }

  async updateTetkikBulgu(id: string, data: Partial<InsertTetkikBulgu>): Promise<TetkikBulgu> {
    const [row] = await db.update(tetkikBulgular).set(data).where(eq(tetkikBulgular.id, id)).returning();
    if (!row) throw new Error("Bulgu bulunamadı");
    return row;
  }

  async deleteTetkikBulgu(id: string): Promise<void> {
    await db.delete(tetkikBulgular).where(eq(tetkikBulgular.id, id));
  }

  // ==========================================================
  // BELGE ARŞİVİ IMPLEMENTATION
  // ==========================================================

  async getBelgeler(filters: { anaKategori?: string; altKategori?: string; durum?: string; baslangic?: string; bitis?: string; arama?: string }) {
    const tumBelgeler = await db.select().from(belgeler).orderBy(desc(belgeler.olusturmaTarihi));
    const tumVersiyonlar = await db.select().from(belgeVersiyonlar);

    let result = tumBelgeler.map(b => {
      const versiyonlar = tumVersiyonlar.filter(v => v.belgeId === b.id);
      const aktifVersiyon = versiyonlar.find(v => v.isAktif) ?? null;
      return { ...b, aktifVersiyon };
    });

    if (filters.anaKategori) result = result.filter(b => b.anaKategori === filters.anaKategori);
    if (filters.altKategori) result = result.filter(b => b.altKategori.toLowerCase().includes(filters.altKategori!.toLowerCase()));
    if (filters.arama) result = result.filter(b => b.baslik.toLowerCase().includes(filters.arama!.toLowerCase()));
    if (filters.durum === "aktif") result = result.filter(b => b.aktifVersiyon !== null);
    if (filters.durum === "arsiv") result = result.filter(b => b.aktifVersiyon === null);
    if (filters.baslangic) result = result.filter(b => b.olusturmaTarihi && b.olusturmaTarihi >= new Date(filters.baslangic!));
    if (filters.bitis) result = result.filter(b => b.olusturmaTarihi && b.olusturmaTarihi <= new Date(filters.bitis!));

    return result;
  }

  async getBelgeVersiyonlar(belgeId: string): Promise<BelgeVersiyon[]> {
    return await db.select().from(belgeVersiyonlar)
      .where(eq(belgeVersiyonlar.belgeId, belgeId))
      .orderBy(desc(belgeVersiyonlar.olusturmaTarihi));
  }

  async createBelge(data: InsertBelge & { versiyonNo: string; degisiklikNotu?: string; dosyaYolu: string }): Promise<Belge> {
    const { versiyonNo, degisiklikNotu, dosyaYolu, ...belgeData } = data;
    const [belge] = await db.insert(belgeler).values(belgeData).returning();
    await db.insert(belgeVersiyonlar).values({
      belgeId: belge.id,
      versiyonNo,
      degisiklikNotu: degisiklikNotu ?? null,
      dosyaYolu,
      isAktif: true,
    });
    return belge;
  }

  async addBelgeVersiyon(belgeId: string, data: { versiyonNo: string; degisiklikNotu?: string; dosyaYolu: string }): Promise<BelgeVersiyon> {
    await db.update(belgeVersiyonlar)
      .set({ isAktif: false })
      .where(and(eq(belgeVersiyonlar.belgeId, belgeId), eq(belgeVersiyonlar.isAktif, true)));

    const [versiyon] = await db.insert(belgeVersiyonlar).values({
      belgeId,
      versiyonNo: data.versiyonNo,
      degisiklikNotu: data.degisiklikNotu ?? null,
      dosyaYolu: data.dosyaYolu,
      isAktif: true,
    }).returning();
    return versiyon;
  }

  async deleteBelge(id: string): Promise<void> {
    await db.delete(belgeler).where(eq(belgeler.id, id));
  }

  async getKaliteHedefleri(): Promise<(KaliteHedef & { sonOlcum: KaliteOlcum | null })[]> {
    const hedefler = await db.select().from(kaliteHedefleri).orderBy(desc(kaliteHedefleri.olusturmaTarihi));
    const olcumler = await db.select().from(kaliteOlcumler).orderBy(desc(kaliteOlcumler.olcumTarihi));
    return hedefler.map(h => ({
      ...h,
      sonOlcum: olcumler.find(o => o.hedefId === h.id) ?? null,
    }));
  }

  async createKaliteHedef(data: InsertKaliteHedef): Promise<KaliteHedef> {
    const [row] = await db.insert(kaliteHedefleri).values(data).returning();
    return row;
  }

  async updateKaliteHedef(id: string, data: Partial<InsertKaliteHedef>): Promise<KaliteHedef> {
    const [row] = await db.update(kaliteHedefleri).set(data).where(eq(kaliteHedefleri.id, id)).returning();
    return row;
  }

  async deleteKaliteHedef(id: string): Promise<void> {
    await db.delete(kaliteHedefleri).where(eq(kaliteHedefleri.id, id));
  }

  async getKaliteOlcumler(): Promise<(KaliteOlcum & { hedef: KaliteHedef })[]> {
    const rows = await db.select({
      olcum: kaliteOlcumler,
      hedef: kaliteHedefleri,
    }).from(kaliteOlcumler)
      .innerJoin(kaliteHedefleri, eq(kaliteOlcumler.hedefId, kaliteHedefleri.id))
      .orderBy(desc(kaliteOlcumler.olcumTarihi));
    return rows.map(r => ({ ...r.olcum, hedef: r.hedef }));
  }

  async createKaliteOlcum(data: InsertKaliteOlcum): Promise<KaliteOlcum> {
    const [row] = await db.insert(kaliteOlcumler).values(data).returning();
    return row;
  }

  async deleteKaliteOlcum(id: string): Promise<void> {
    await db.delete(kaliteOlcumler).where(eq(kaliteOlcumler.id, id));
  }

  async getIsoPersoneller(): Promise<(IsoPersonel & { egitimSayisi: number })[]> {
    const personeller = await db.select().from(isoPersoneller).orderBy(asc(isoPersoneller.ad));
    const counts = await db.select({
      personelId: egitimKatilimcilar.personelId,
      count: sql<number>`count(*)::int`,
    }).from(egitimKatilimcilar).groupBy(egitimKatilimcilar.personelId);
    const countMap = new Map(counts.map(c => [c.personelId, c.count]));
    return personeller.map(p => ({ ...p, egitimSayisi: countMap.get(p.id) ?? 0 }));
  }

  async getIsoPersonelKart(id: string): Promise<{ personel: IsoPersonel; egitimler: { egitimId: string; baslik: string; egitimTarihi: string; degerlendirmeDoldu: boolean }[] }> {
    const [personel] = await db.select().from(isoPersoneller).where(eq(isoPersoneller.id, id));
    if (!personel) throw new Error("Personel bulunamadı");

    const katilimlar = await db
      .select({ egitimId: egitimKatilimcilar.egitimId, baslik: egitimler.baslik, egitimTarihi: egitimler.egitimTarihi })
      .from(egitimKatilimcilar)
      .innerJoin(egitimler, eq(egitimKatilimcilar.egitimId, egitimler.id))
      .where(eq(egitimKatilimcilar.personelId, id))
      .orderBy(desc(egitimler.egitimTarihi));

    const katilimEgitimIds = katilimlar.map(k => k.egitimId);
    const degerlendirmeler = katilimEgitimIds.length > 0
      ? await db.select({ egitimId: egitimDegerlendirmeler.egitimId, katilimciAdi: egitimDegerlendirmeler.katilimciAdi })
          .from(egitimDegerlendirmeler)
          .where(inArray(egitimDegerlendirmeler.egitimId, katilimEgitimIds))
      : [];

    const egitimlerWithDurum = katilimlar.map(k => ({
      egitimId: k.egitimId,
      baslik: k.baslik,
      egitimTarihi: k.egitimTarihi,
      degerlendirmeDoldu: degerlendirmeler.some(d => d.egitimId === k.egitimId && d.katilimciAdi.toLowerCase() === personel.ad.toLowerCase()),
    }));

    return { personel, egitimler: egitimlerWithDurum };
  }

  async createIsoPersonel(data: InsertIsoPersonel): Promise<IsoPersonel> {
    const [row] = await db.insert(isoPersoneller).values(data).returning();
    return row;
  }

  async updateIsoPersonel(id: string, data: Partial<InsertIsoPersonel>): Promise<IsoPersonel> {
    const [row] = await db.update(isoPersoneller).set(data).where(eq(isoPersoneller.id, id)).returning();
    if (!row) throw new Error("Personel bulunamadı");
    return row;
  }

  async deleteIsoPersonel(id: string): Promise<void> {
    await db.delete(isoPersoneller).where(eq(isoPersoneller.id, id));
  }

  async getEgitimler(): Promise<(Egitim & { katilimciSayisi: number; degerlendirmeSayisi: number })[]> {
    const tumEgitimler = await db.select().from(egitimler).orderBy(desc(egitimler.egitimTarihi));
    const katilimCounts = await db.select({
      egitimId: egitimKatilimcilar.egitimId,
      count: sql<number>`count(*)::int`,
    }).from(egitimKatilimcilar).groupBy(egitimKatilimcilar.egitimId);
    const degerlendirmeCounts = await db.select({
      egitimId: egitimDegerlendirmeler.egitimId,
      count: sql<number>`count(*)::int`,
    }).from(egitimDegerlendirmeler).groupBy(egitimDegerlendirmeler.egitimId);

    const katMap = new Map(katilimCounts.map(c => [c.egitimId, c.count]));
    const degMap = new Map(degerlendirmeCounts.map(c => [c.egitimId, c.count]));

    return tumEgitimler.map(e => ({
      ...e,
      katilimciSayisi: katMap.get(e.id) ?? 0,
      degerlendirmeSayisi: degMap.get(e.id) ?? 0,
    }));
  }

  async getEgitimKatilimcilar(egitimId: string): Promise<(EgitimKatilimci & { personel: IsoPersonel })[]> {
    return await db
      .select({
        id: egitimKatilimcilar.id,
        egitimId: egitimKatilimcilar.egitimId,
        personelId: egitimKatilimcilar.personelId,
        olusturmaTarihi: egitimKatilimcilar.olusturmaTarihi,
        personel: isoPersoneller,
      })
      .from(egitimKatilimcilar)
      .innerJoin(isoPersoneller, eq(egitimKatilimcilar.personelId, isoPersoneller.id))
      .where(eq(egitimKatilimcilar.egitimId, egitimId))
      .orderBy(asc(isoPersoneller.ad));
  }

  async createEgitim(data: InsertEgitim): Promise<Egitim> {
    const [row] = await db.insert(egitimler).values(data).returning();
    return row;
  }

  async updateEgitim(id: string, data: Partial<InsertEgitim>): Promise<Egitim> {
    const [row] = await db.update(egitimler).set(data).where(eq(egitimler.id, id)).returning();
    if (!row) throw new Error("Eğitim bulunamadı");
    return row;
  }

  async deleteEgitim(id: string): Promise<void> {
    await db.delete(egitimler).where(eq(egitimler.id, id));
  }

  async addEgitimKatilimcilar(egitimId: string, personelIds: string[]): Promise<void> {
    if (personelIds.length === 0) return;
    const values = personelIds.map(personelId => ({ egitimId, personelId }));
    await db.insert(egitimKatilimcilar).values(values).onConflictDoNothing();
  }

  async removeEgitimKatilimci(egitimId: string, personelId: string): Promise<void> {
    await db.delete(egitimKatilimcilar).where(
      and(eq(egitimKatilimcilar.egitimId, egitimId), eq(egitimKatilimcilar.personelId, personelId))
    );
  }

  async getDegerlendirmeSorulari(): Promise<EgitimDegerlendirmeSoru[]> {
    return await db.select().from(egitimDegerlendirmeSorulari).orderBy(asc(egitimDegerlendirmeSorulari.sira));
  }

  async createDegerlendirmeSoru(data: InsertEgitimDegerlendirmeSoru): Promise<EgitimDegerlendirmeSoru> {
    const [row] = await db.insert(egitimDegerlendirmeSorulari).values(data).returning();
    return row;
  }

  async updateDegerlendirmeSoru(id: string, data: Partial<InsertEgitimDegerlendirmeSoru>): Promise<EgitimDegerlendirmeSoru> {
    const [row] = await db.update(egitimDegerlendirmeSorulari).set(data).where(eq(egitimDegerlendirmeSorulari.id, id)).returning();
    if (!row) throw new Error("Soru bulunamadı");
    return row;
  }

  async deleteDegerlendirmeSoru(id: string): Promise<void> {
    await db.delete(egitimDegerlendirmeSorulari).where(eq(egitimDegerlendirmeSorulari.id, id));
  }

  async getEgitimForDegerlendirme(egitimId: string): Promise<{ egitim: Egitim; sorular: EgitimDegerlendirmeSoru[] } | null> {
    const [egitim] = await db.select().from(egitimler).where(eq(egitimler.id, egitimId));
    if (!egitim) return null;
    const sorular = await db.select().from(egitimDegerlendirmeSorulari).orderBy(asc(egitimDegerlendirmeSorulari.sira));
    return { egitim, sorular };
  }

  async createEgitimDegerlendirme(data: { egitimId: string; katilimciAdi: string; cevaplar: { soruId: string; puan?: number; cevap?: string }[] }): Promise<void> {
    const [degerlendirme] = await db.insert(egitimDegerlendirmeler).values({
      egitimId: data.egitimId,
      katilimciAdi: data.katilimciAdi,
    }).returning();

    if (data.cevaplar.length > 0) {
      await db.insert(egitimDegerlendirmeCevaplari).values(
        data.cevaplar.map(c => ({
          degerlendirmeId: degerlendirme.id,
          soruId: c.soruId,
          puan: c.puan ?? null,
          cevap: c.cevap ?? null,
        }))
      );
    }
  }

  async getEgitimDegerlendirmeleri(egitimId: string): Promise<(EgitimDegerlendirme & { cevaplar: EgitimDegerlendirmeCevap[] })[]> {
    const degerlendirmelerList = await db.select().from(egitimDegerlendirmeler)
      .where(eq(egitimDegerlendirmeler.egitimId, egitimId))
      .orderBy(desc(egitimDegerlendirmeler.olusturmaTarihi));

    if (degerlendirmelerList.length === 0) return [];

    const cevaplar = await db.select().from(egitimDegerlendirmeCevaplari)
      .where(inArray(egitimDegerlendirmeCevaplari.degerlendirmeId, degerlendirmelerList.map(d => d.id)));

    return degerlendirmelerList.map(d => ({
      ...d,
      cevaplar: cevaplar.filter(c => c.degerlendirmeId === d.id),
    }));
  }

  // Yükleme geçmişi (Upload history)
  async listGumrukDosyalar(yil?: number, tip?: string): Promise<{
    id: string;
    filename: string;
    uploadDate: Date | null;
    sizeBytes: number | null;
    md5Hash: string | null;
    kayitSayisi: number;
    yillar: number[];
    aylar: string[];
  }[]> {
    if (tip === "gider") {
      // Gider kayıtları için giderler tablosuna join atılır
      const rows = await db
        .select({
          id: gumrukDosyalar.id,
          filename: gumrukDosyalar.filename,
          uploadDate: gumrukDosyalar.uploadDate,
          sizeBytes: gumrukDosyalar.sizeBytes,
          md5Hash: gumrukDosyalar.md5Hash,
          kayitSayisi: sql<number>`count(${giderler.id})`,
          yillar: sql<number[]>`coalesce(array_agg(DISTINCT ${giderler.yil}) FILTER (WHERE ${giderler.yil} IS NOT NULL), ARRAY[]::integer[])`,
          aylar: sql<string[]>`coalesce(array_agg(DISTINCT ${giderler.ay}) FILTER (WHERE ${giderler.ay} IS NOT NULL), ARRAY[]::text[])`,
        })
        .from(gumrukDosyalar)
        .leftJoin(giderler, eq(giderler.dosyaId, gumrukDosyalar.id))
        .where(eq(gumrukDosyalar.tip, "gider"))
        .groupBy(gumrukDosyalar.id)
        .orderBy(desc(gumrukDosyalar.uploadDate));

      const normalized = rows.map(r => ({
        id: r.id,
        filename: r.filename,
        uploadDate: r.uploadDate,
        sizeBytes: r.sizeBytes,
        md5Hash: r.md5Hash,
        kayitSayisi: Number(r.kayitSayisi ?? 0),
        yillar: (r.yillar ?? []).map((y: any) => Number(y)),
        aylar: (r.aylar ?? []) as string[],
      }));

      if (yil !== undefined) {
        return normalized.filter(r => r.yillar.includes(yil));
      }

      return normalized;
    }

    // Default: gümrük (satışlar) — gumrukVerileri'ne join
    const rows = await db
      .select({
        id: gumrukDosyalar.id,
        filename: gumrukDosyalar.filename,
        uploadDate: gumrukDosyalar.uploadDate,
        sizeBytes: gumrukDosyalar.sizeBytes,
        md5Hash: gumrukDosyalar.md5Hash,
        kayitSayisi: sql<number>`count(${gumrukVerileri.id})`,
        yillar: sql<number[]>`coalesce(array_agg(DISTINCT ${gumrukVerileri.yil}) FILTER (WHERE ${gumrukVerileri.yil} IS NOT NULL), ARRAY[]::integer[])`,
        aylar: sql<string[]>`coalesce(array_agg(DISTINCT ${gumrukVerileri.ay}) FILTER (WHERE ${gumrukVerileri.ay} IS NOT NULL), ARRAY[]::text[])`,
      })
      .from(gumrukDosyalar)
      .leftJoin(gumrukVerileri, eq(gumrukVerileri.dosyaId, gumrukDosyalar.id))
      .where(tip === undefined ? sql`TRUE` : eq(gumrukDosyalar.tip, tip))
      .groupBy(gumrukDosyalar.id)
      .orderBy(desc(gumrukDosyalar.uploadDate));

    const normalized = rows.map(r => ({
      id: r.id,
      filename: r.filename,
      uploadDate: r.uploadDate,
      sizeBytes: r.sizeBytes,
      md5Hash: r.md5Hash,
      kayitSayisi: Number(r.kayitSayisi ?? 0),
      yillar: (r.yillar ?? []).map((y: any) => Number(y)),
      aylar: (r.aylar ?? []) as string[],
    }));

    if (yil !== undefined) {
      return normalized.filter(r => r.yillar.includes(yil));
    }

    return normalized;
  }

  async deleteGumrukDosyaWithVerileri(id: string): Promise<{ deletedRows: number; filename: string } | null> {
    const [dosya] = await db.select().from(gumrukDosyalar).where(eq(gumrukDosyalar.id, id));
    if (!dosya) return null;

    let deletedCount = 0;
    if (dosya.tip === "gider") {
      const deleted = await db.delete(giderler)
        .where(eq(giderler.dosyaId, id))
        .returning({ id: giderler.id });
      deletedCount = deleted.length;
    } else {
      const deleted = await db.delete(gumrukVerileri)
        .where(eq(gumrukVerileri.dosyaId, id))
        .returning({ id: gumrukVerileri.id });
      deletedCount = deleted.length;
    }

    await db.delete(gumrukDosyalar).where(eq(gumrukDosyalar.id, id));

    if (dosya.filepath) {
      try {
        await fs.unlink(dosya.filepath);
      } catch (err: any) {
        if (err && err.code !== "ENOENT") {
          console.error("Dosya silme hatası (filesystem):", err);
        }
      }
    }

    return { deletedRows: deletedCount, filename: dosya.filename };
  }

  // ============================================================================
  // BORDRO ARŞİV DOSYALARI
  // ============================================================================

  async insertBordroDosya(data: InsertBordroDosya): Promise<BordroDosya> {
    const [row] = await db.insert(bordroDosyalar).values(data).returning();
    return row;
  }

  async getBordroDosyalar(yil?: number, tip?: string): Promise<BordroDosya[]> {
    const filters = [];
    if (yil) filters.push(eq(bordroDosyalar.yil, yil));
    if (tip) filters.push(eq(bordroDosyalar.tip, tip));

    if (filters.length > 0) {
      return await db.select().from(bordroDosyalar).where(and(...filters)).orderBy(desc(bordroDosyalar.uploadDate));
    }
    return await db.select().from(bordroDosyalar).orderBy(desc(bordroDosyalar.uploadDate));
  }

  async getBordroDosya(id: string): Promise<BordroDosya | null> {
    const [row] = await db.select().from(bordroDosyalar).where(eq(bordroDosyalar.id, id));
    return row ?? null;
  }

  async deleteBordroDosya(id: string): Promise<{ filename: string } | null> {
    const [dosya] = await db.select().from(bordroDosyalar).where(eq(bordroDosyalar.id, id));
    if (!dosya) return null;

    await db.delete(bordroDosyalar).where(eq(bordroDosyalar.id, id));

    if (dosya.filepath) {
      try {
        await fs.unlink(dosya.filepath);
      } catch (err: any) {
        if (err && err.code !== "ENOENT") {
          console.error("Bordro dosyası silinemedi (filesystem):", err);
        }
      }
    }

    return { filename: dosya.filename };
  }

  // Toplu upsert — Maaş Listesi parse edildikten sonra her satır için.
  // (tcNo + ay + yıl) unique index'i sayesinde onConflictDoUpdate kullanılabilir.
  async upsertCalisanlarToplu(kayitlar: InsertCalisan[]): Promise<{ inserted: number; updated: number }> {
    if (kayitlar.length === 0) return { inserted: 0, updated: 0 };

    let inserted = 0;
    let updated = 0;

    // Drizzle PostgreSQL onConflictDoUpdate ile tek seferde upsert
    for (const k of kayitlar) {
      const existing = await db
        .select({ id: calisanlar.id })
        .from(calisanlar)
        .where(
          and(
            eq(calisanlar.tcNo, k.tcNo),
            eq(calisanlar.ay, k.ay),
            eq(calisanlar.yil, k.yil),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(calisanlar)
          .set(k)
          .where(eq(calisanlar.id, existing[0].id));
        updated++;
      } else {
        await db.insert(calisanlar).values(k);
        inserted++;
      }
    }

    return { inserted, updated };
  }

  // ============================================================================
  // İZİN SİSTEMİ — RESMİ TATİL SEED
  // ============================================================================

  // 2024-2030 arası TR resmi tatilleri (sabit + hicri).
  // Hicri bayramları her yıl Diyanet takviminden teyit edilir.
  private static readonly RESMI_TATILLER_DATA: { tarih: string; ad: string }[] = [
    // SABİT
    ...["2024", "2025", "2026", "2027", "2028", "2029", "2030"].flatMap((y) => [
      { tarih: `${y}-01-01`, ad: "Yılbaşı" },
      { tarih: `${y}-04-23`, ad: "Ulusal Egemenlik ve Çocuk Bayramı" },
      { tarih: `${y}-05-01`, ad: "Emek ve Dayanışma Günü" },
      { tarih: `${y}-05-19`, ad: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
      { tarih: `${y}-07-15`, ad: "Demokrasi ve Milli Birlik Günü" },
      { tarih: `${y}-08-30`, ad: "Zafer Bayramı" },
      { tarih: `${y}-10-29`, ad: "Cumhuriyet Bayramı" },
    ]),
    // HİCRİ — Diyanet takviminden alınan tarihler
    // 2024
    { tarih: "2024-04-10", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2024-04-11", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2024-04-12", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2024-06-16", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2024-06-17", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2024-06-18", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2024-06-19", ad: "Kurban Bayramı 4. Gün" },
    // 2025
    { tarih: "2025-03-30", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2025-03-31", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2025-04-01", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2025-06-06", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2025-06-07", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2025-06-08", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2025-06-09", ad: "Kurban Bayramı 4. Gün" },
    // 2026
    { tarih: "2026-03-20", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2026-03-21", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2026-03-22", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2026-05-27", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2026-05-28", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2026-05-29", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2026-05-30", ad: "Kurban Bayramı 4. Gün" },
    // 2027
    { tarih: "2027-03-09", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2027-03-10", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2027-03-11", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2027-05-16", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2027-05-17", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2027-05-18", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2027-05-19", ad: "Kurban Bayramı 4. Gün" },
    // 2028
    { tarih: "2028-02-26", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2028-02-27", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2028-02-28", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2028-05-04", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2028-05-05", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2028-05-06", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2028-05-07", ad: "Kurban Bayramı 4. Gün" },
    // 2029
    { tarih: "2029-02-14", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2029-02-15", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2029-02-16", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2029-04-24", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2029-04-25", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2029-04-26", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2029-04-27", ad: "Kurban Bayramı 4. Gün" },
    // 2030
    { tarih: "2030-02-04", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2030-02-05", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2030-02-06", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2030-04-13", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2030-04-14", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2030-04-15", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2030-04-16", ad: "Kurban Bayramı 4. Gün" },
  ];

  async seedResmiTatiller(): Promise<{ inserted: number }> {
    const existing = await db.select({ tarih: resmiTatiller.tarih }).from(resmiTatiller);
    const existingSet = new Set(existing.map((r) => r.tarih));
    const yeni = DatabaseStorage.RESMI_TATILLER_DATA
      .filter((r) => !existingSet.has(r.tarih))
      .map((r) => ({ ...r, yil: parseInt(r.tarih.slice(0, 4), 10) }));
    if (yeni.length === 0) return { inserted: 0 };
    await db.insert(resmiTatiller).values(yeni);
    return { inserted: yeni.length };
  }

  async getResmiTatiller(yil?: number): Promise<ResmiTatil[]> {
    if (yil) {
      return await db.select().from(resmiTatiller).where(eq(resmiTatiller.yil, yil)).orderBy(resmiTatiller.tarih);
    }
    return await db.select().from(resmiTatiller).orderBy(resmiTatiller.tarih);
  }

  // ============================================================================
  // İZİN SİSTEMİ — KAYITLAR (CRUD)
  // ============================================================================

  async getIzinler(filter?: { yil?: number; tcNo?: string; tur?: string }): Promise<CalisanIzin[]> {
    const filters = [];
    if (filter?.tcNo) filters.push(eq(calisanIzinler.tcNo, filter.tcNo));
    if (filter?.tur) filters.push(eq(calisanIzinler.tur, filter.tur));
    if (filter?.yil) {
      const start = `${filter.yil}-01-01`;
      const end = `${filter.yil}-12-31`;
      filters.push(sql`${calisanIzinler.baslangicTarihi} <= ${end} AND ${calisanIzinler.bitisTarihi} >= ${start}`);
    }
    if (filters.length > 0) {
      return await db.select().from(calisanIzinler).where(and(...filters)).orderBy(desc(calisanIzinler.baslangicTarihi));
    }
    return await db.select().from(calisanIzinler).orderBy(desc(calisanIzinler.baslangicTarihi));
  }

  async getIzinlerForCalendar(yil: number, ay: number): Promise<CalisanIzin[]> {
    const ayStr = String(ay).padStart(2, "0");
    const ayBas = `${yil}-${ayStr}-01`;
    const sonGun = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
    const ayBit = `${yil}-${ayStr}-${String(sonGun).padStart(2, "0")}`;
    return await db.select().from(calisanIzinler)
      .where(sql`${calisanIzinler.baslangicTarihi} <= ${ayBit} AND ${calisanIzinler.bitisTarihi} >= ${ayBas}`)
      .orderBy(calisanIzinler.baslangicTarihi);
  }

  async insertIzin(data: InsertCalisanIzin): Promise<CalisanIzin> {
    const [row] = await db.insert(calisanIzinler).values(data).returning();
    return row;
  }

  async updateIzin(id: string, data: Partial<InsertCalisanIzin>): Promise<CalisanIzin | null> {
    const [row] = await db.update(calisanIzinler).set(data).where(eq(calisanIzinler.id, id)).returning();
    return row ?? null;
  }

  async deleteIzin(id: string): Promise<{ success: boolean }> {
    const result = await db.delete(calisanIzinler).where(eq(calisanIzinler.id, id)).returning({ id: calisanIzinler.id });
    return { success: result.length > 0 };
  }

  // ============================================================================
  // İZİN SİSTEMİ — AÇILIŞ BAKİYESİ
  // ============================================================================

  async getAcilisBakiyeler(): Promise<AcilisBakiye[]> {
    return await db.select().from(calisanIzinAcilisBakiyesi);
  }

  async getAcilisBakiye(tcNo: string): Promise<AcilisBakiye | null> {
    const [row] = await db.select().from(calisanIzinAcilisBakiyesi).where(eq(calisanIzinAcilisBakiyesi.tcNo, tcNo));
    return row ?? null;
  }

  async upsertAcilisBakiye(data: InsertAcilisBakiye): Promise<AcilisBakiye> {
    const existing = await this.getAcilisBakiye(data.tcNo);
    if (existing) {
      const [row] = await db.update(calisanIzinAcilisBakiyesi)
        .set(data)
        .where(eq(calisanIzinAcilisBakiyesi.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(calisanIzinAcilisBakiyesi).values(data).returning();
    return row;
  }

  // ============================================================================
  // TAHSİLAT — MÜŞTERİ
  // ============================================================================

  async getMusteriler(filter?: { gorulmePencereGun?: number; sektor?: string; search?: string }): Promise<Musteri[]> {
    const filters = [];
    if (filter?.sektor) filters.push(eq(musteriler.sektor, filter.sektor));
    if (filter?.gorulmePencereGun != null) {
      const cutoff = new Date(Date.now() - filter.gorulmePencereGun * 86400000);
      filters.push(sql`${musteriler.sonGoruldugu} >= ${cutoff}`);
    }
    if (filter?.search) {
      const s = `%${filter.search}%`;
      filters.push(sql`(${musteriler.ad} ILIKE ${s} OR ${musteriler.hesapKodu} ILIKE ${s})`);
    }
    if (filters.length > 0) {
      return await db.select().from(musteriler).where(and(...filters)).orderBy(musteriler.ad);
    }
    return await db.select().from(musteriler).orderBy(musteriler.ad);
  }

  async getMusteri(id: string): Promise<Musteri | null> {
    const [row] = await db.select().from(musteriler).where(eq(musteriler.id, id));
    return row ?? null;
  }

  async getMusteriByHesapKodu(hesapKodu: string): Promise<Musteri | null> {
    const [row] = await db.select().from(musteriler).where(eq(musteriler.hesapKodu, hesapKodu));
    return row ?? null;
  }

  async insertMusteri(data: InsertMusteri): Promise<Musteri> {
    const [row] = await db.insert(musteriler).values(data).returning();
    return row;
  }

  async updateMusteri(id: string, data: Partial<InsertMusteri>): Promise<Musteri | null> {
    const [row] = await db.update(musteriler).set(data).where(eq(musteriler.id, id)).returning();
    return row ?? null;
  }

  // ============================================================================
  // TAHSİLAT — MİZAN
  // ============================================================================

  async getMizanYuklemeleri(): Promise<MizanYukleme[]> {
    return await db.select().from(mizanYuklemeleri).orderBy(desc(mizanYuklemeleri.mizanTarihi));
  }

  async getMizanYukleme(id: string): Promise<MizanYukleme | null> {
    const [row] = await db.select().from(mizanYuklemeleri).where(eq(mizanYuklemeleri.id, id));
    return row ?? null;
  }

  async getMizanByMd5(md5: string): Promise<MizanYukleme | null> {
    const [row] = await db.select().from(mizanYuklemeleri).where(eq(mizanYuklemeleri.md5Hash, md5));
    return row ?? null;
  }

  async insertMizanYukleme(data: InsertMizanYukleme): Promise<MizanYukleme> {
    const [row] = await db.insert(mizanYuklemeleri).values(data).returning();
    return row;
  }

  async insertOtomatikYuklemeLog(data: InsertOtomatikYuklemeLog): Promise<OtomatikYuklemeLog> {
    const [row] = await db.insert(otomatikYuklemeLog).values(data).returning();
    return row;
  }

  async getOtomatikYuklemeLoglar(tip: string | null, limit: number): Promise<OtomatikYuklemeLog[]> {
    if (tip) {
      return await db.select().from(otomatikYuklemeLog)
        .where(eq(otomatikYuklemeLog.tip, tip))
        .orderBy(desc(otomatikYuklemeLog.zaman)).limit(limit);
    }
    return await db.select().from(otomatikYuklemeLog)
      .orderBy(desc(otomatikYuklemeLog.zaman)).limit(limit);
  }

  async deleteMizanYukleme(id: string): Promise<{ filename: string } | null> {
    const [m] = await db.select().from(mizanYuklemeleri).where(eq(mizanYuklemeleri.id, id));
    if (!m) return null;
    // mizan_bakiye CASCADE ile silinir
    await db.delete(mizanYuklemeleri).where(eq(mizanYuklemeleri.id, id));
    if (m.filepath) {
      try { await fs.unlink(m.filepath); } catch (e: any) {
        if (e.code !== "ENOENT") console.error("Mizan dosyası silinemedi:", e);
      }
    }
    return { filename: m.filename };
  }

  // ============================================================================
  // TAHSİLAT — BAKİYE
  // ============================================================================

  async insertMizanBakiyeBatch(rows: InsertMizanBakiye[]): Promise<number> {
    if (rows.length === 0) return 0;
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const r = await db.insert(mizanBakiye).values(chunk).returning({ id: mizanBakiye.id });
      inserted += r.length;
    }
    return inserted;
  }

  async getMusteriBakiyeTimeline(musteriId: string): Promise<(MizanBakiye & { mizanTarihi: string })[]> {
    const rows = await db
      .select({
        id: mizanBakiye.id,
        mizanId: mizanBakiye.mizanId,
        musteriId: mizanBakiye.musteriId,
        borc: mizanBakiye.borc,
        alacak: mizanBakiye.alacak,
        bakiyeBorc: mizanBakiye.bakiyeBorc,
        bakiyeAlacak: mizanBakiye.bakiyeAlacak,
        sonBakiye: mizanBakiye.sonBakiye,
        sonBakiyeBA: mizanBakiye.sonBakiyeBA,
        sonBorcTarihi: mizanBakiye.sonBorcTarihi,
        sonAlacakTarihi: mizanBakiye.sonAlacakTarihi,
        mizanTarihi: mizanYuklemeleri.mizanTarihi,
      })
      .from(mizanBakiye)
      .innerJoin(mizanYuklemeleri, eq(mizanBakiye.mizanId, mizanYuklemeleri.id))
      .where(eq(mizanBakiye.musteriId, musteriId))
      .orderBy(mizanYuklemeleri.mizanTarihi);
    return rows as any;
  }

  async getEnSonBakiyelerByMizan(mizanId: string): Promise<MizanBakiye[]> {
    return await db.select().from(mizanBakiye).where(eq(mizanBakiye.mizanId, mizanId));
  }

  // Ritim/seri analizi: yılın tüm mizanlarının bakiye satırları tek join sorgusuyla.
  async getMizanBakiyeSerisiByYil(yil: string): Promise<(MizanBakiye & { mizanTarihi: string })[]> {
    return await db
      .select({
        id: mizanBakiye.id,
        mizanId: mizanBakiye.mizanId,
        musteriId: mizanBakiye.musteriId,
        borc: mizanBakiye.borc,
        alacak: mizanBakiye.alacak,
        bakiyeBorc: mizanBakiye.bakiyeBorc,
        bakiyeAlacak: mizanBakiye.bakiyeAlacak,
        sonBakiye: mizanBakiye.sonBakiye,
        sonBakiyeBA: mizanBakiye.sonBakiyeBA,
        sonBorcTarihi: mizanBakiye.sonBorcTarihi,
        sonAlacakTarihi: mizanBakiye.sonAlacakTarihi,
        mizanTarihi: mizanYuklemeleri.mizanTarihi,
      })
      .from(mizanBakiye)
      .innerJoin(mizanYuklemeleri, eq(mizanBakiye.mizanId, mizanYuklemeleri.id))
      .where(sql`${mizanYuklemeleri.mizanTarihi} LIKE ${yil + "-%"}`)
      .orderBy(mizanYuklemeleri.mizanTarihi);
  }

  // ============================================================================
  // TAHSİLAT — EŞLEŞTİRME
  // ============================================================================

  async getEslestirmeOnerileri(): Promise<(EslestirmeOneri & { musteriAd: string })[]> {
    const rows = await db
      .select({
        id: mizanEslestirmeOnerileri.id,
        musteriId: mizanEslestirmeOnerileri.musteriId,
        gumrukUnvan: mizanEslestirmeOnerileri.gumrukUnvan,
        benzerlikSkoru: mizanEslestirmeOnerileri.benzerlikSkoru,
        olusturmaTarihi: mizanEslestirmeOnerileri.olusturmaTarihi,
        reddedildi: mizanEslestirmeOnerileri.reddedildi,
        musteriAd: musteriler.ad,
      })
      .from(mizanEslestirmeOnerileri)
      .innerJoin(musteriler, eq(mizanEslestirmeOnerileri.musteriId, musteriler.id))
      .where(eq(mizanEslestirmeOnerileri.reddedildi, false))
      .orderBy(desc(mizanEslestirmeOnerileri.benzerlikSkoru));
    return rows as any;
  }

  async insertEslestirmeOneri(data: InsertEslestirmeOneri): Promise<EslestirmeOneri> {
    // Aynı musteriId+gumrukUnvan varsa skip (Postgres UNIQUE constraint = 23505)
    try {
      const [row] = await db.insert(mizanEslestirmeOnerileri).values(data).returning();
      return row;
    } catch (e: any) {
      // Sadece UNIQUE violation'da mevcut kaydı dön; diğer hataları (FK, bağlantı vs) yukarı fırlat
      if (e?.code !== "23505") throw e;
      const [existing] = await db.select().from(mizanEslestirmeOnerileri).where(
        and(eq(mizanEslestirmeOnerileri.musteriId, data.musteriId), eq(mizanEslestirmeOnerileri.gumrukUnvan, data.gumrukUnvan))
      );
      if (!existing) throw e; // beklenmedik: UNIQUE crash ama kayıt da yok
      return existing;
    }
  }

  async onaylaOneri(oneriId: string): Promise<EslestirmeOneri | null> {
    const [oneri] = await db.select().from(mizanEslestirmeOnerileri).where(eq(mizanEslestirmeOnerileri.id, oneriId));
    if (!oneri) return null;
    await this.addGumrukUnvan(oneri.musteriId, oneri.gumrukUnvan);
    await this.insertEslestirmeLog({
      musteriId: oneri.musteriId,
      gumrukUnvan: oneri.gumrukUnvan,
      eklemeTipi: "manual",
      benzerlikSkoru: oneri.benzerlikSkoru,
    });
    await db.delete(mizanEslestirmeOnerileri).where(eq(mizanEslestirmeOnerileri.id, oneriId));
    return oneri;
  }

  async reddetOneri(oneriId: string): Promise<EslestirmeOneri | null> {
    const [row] = await db.update(mizanEslestirmeOnerileri).set({ reddedildi: true }).where(eq(mizanEslestirmeOnerileri.id, oneriId)).returning();
    return row ?? null;
  }

  async insertEslestirmeLog(data: InsertEslestirmeLog): Promise<EslestirmeLog> {
    const [row] = await db.insert(mizanEslestirmeLog).values(data).returning();
    return row;
  }

  async addGumrukUnvan(musteriId: string, gumrukUnvan: string): Promise<Musteri | null> {
    const m = await this.getMusteri(musteriId);
    if (!m) return null;
    const yeni = Array.from(new Set([...(m.gumrukFirmaUnvanlari || []), gumrukUnvan]));
    return await this.updateMusteri(musteriId, { gumrukFirmaUnvanlari: yeni } as any);
  }

  async removeGumrukUnvan(musteriId: string, gumrukUnvan: string): Promise<Musteri | null> {
    const m = await this.getMusteri(musteriId);
    if (!m) return null;
    const yeni = (m.gumrukFirmaUnvanlari || []).filter((u) => u !== gumrukUnvan);
    return await this.updateMusteri(musteriId, { gumrukFirmaUnvanlari: yeni } as any);
  }

  // ============================================================================
  // TAHSİLAT — AYARLAR (single-row)
  // ============================================================================

  private static readonly TAHSILAT_AYARLARI_ID = "00000000-0000-0000-0000-000000000001";

  async getTahsilatAyarlari(): Promise<TahsilatAyarlari> {
    const [row] = await db.select().from(tahsilatAyarlari).where(eq(tahsilatAyarlari.id, DatabaseStorage.TAHSILAT_AYARLARI_ID));
    if (row) return row;
    // Default kayıt yoksa oluştur
    const [created] = await db.insert(tahsilatAyarlari).values({
      id: DatabaseStorage.TAHSILAT_AYARLARI_ID,
      vipEsik: "5000000",
      yuksekBakiyeEsik: "500000",
      eskiOdemeEsik: 30,
      cokEskiOdemeEsik: 60,
      eksiPozisyonYuzde: 20,
      faturaPenceresi: 90,
      ciroEsik: "500000",
      odemeOraniEsik: 60,
    }).returning();
    return created;
  }

  async updateTahsilatAyarlari(data: Partial<InsertTahsilatAyarlari>): Promise<TahsilatAyarlari> {
    await this.getTahsilatAyarlari(); // varlığı garanti et
    const [row] = await db
      .update(tahsilatAyarlari)
      .set({ ...data, guncellenme: new Date() })
      .where(eq(tahsilatAyarlari.id, DatabaseStorage.TAHSILAT_AYARLARI_ID))
      .returning();
    return row;
  }

  // ==================== ÖDEMELER PORTALI ====================

  async getPortalKullanicilar(): Promise<PortalKullanici[]> {
    return db.select().from(portalKullanicilar).orderBy(asc(portalKullanicilar.adSoyad));
  }

  async getPortalKullanici(id: string): Promise<PortalKullanici | undefined> {
    const [k] = await db.select().from(portalKullanicilar).where(eq(portalKullanicilar.id, id));
    return k;
  }

  async getPortalKullaniciByKullaniciAdi(kullaniciAdi: string): Promise<PortalKullanici | undefined> {
    const [k] = await db.select().from(portalKullanicilar)
      .where(eq(portalKullanicilar.kullaniciAdi, kullaniciAdi));
    return k;
  }

  async createPortalKullanici(k: InsertPortalKullanici): Promise<PortalKullanici> {
    const [yeni] = await db.insert(portalKullanicilar).values(k).returning();
    return yeni;
  }

  async updatePortalKullanici(id: string, k: Partial<InsertPortalKullanici>): Promise<PortalKullanici | undefined> {
    const [guncel] = await db.update(portalKullanicilar).set(k)
      .where(eq(portalKullanicilar.id, id)).returning();
    return guncel;
  }

  async upsertBeyannameler(rows: InsertBeyanname[]): Promise<{ eklenen: number; guncellenen: number }> {
    if (!rows.length) return { eklenen: 0, guncellenen: 0 };
    // Kimlik artik (dosyaNo, rejim) CIFTI. Tek kolonla tekillestirmek ayni numarali
    // IM ve EX satirlarini birbirine ezerdi — bu fazin onledigi asil hasar budur.
    const anahtar = (r: { dosyaNo?: string | null; rejim?: string | null }) =>
      `${r.dosyaNo ?? ""}|${r.rejim ?? "IM"}`;
    const tekil = new Map<string, InsertBeyanname>();
    for (const r of rows) tekil.set(anahtar(r), r);
    const kayitlar = Array.from(tekil.values());

    // dosyaNo artik nullable; null olanlar (transit) Excel akisindan GELMEZ ama
    // inArray'e null gecirmemek icin suzuluyor.
    const dosyaNolar = kayitlar.map((r) => r.dosyaNo).filter((d): d is string => !!d);
    const mevcutlar = dosyaNolar.length
      ? await db.select({ dosyaNo: beyannameler.dosyaNo, rejim: beyannameler.rejim })
          .from(beyannameler)
          .where(inArray(beyannameler.dosyaNo, dosyaNolar))
      : [];
    const mevcutSet = new Set(mevcutlar.map((m) => anahtar(m)));

    for (let i = 0; i < kayitlar.length; i += 500) {
      const parca = kayitlar.slice(i, i + 500);
      await db.insert(beyannameler).values(parca).onConflictDoUpdate({
        target: [beyannameler.dosyaNo, beyannameler.rejim],
        set: {
          alici: sql`excluded.alici`,
          gonderen: sql`excluded.gonderen`,
          koli: sql`excluded.koli`,
          gumrukIdaresi: sql`excluded.gumruk_idaresi`,
          beyanTarihi: sql`excluded.beyan_tarihi`,
          beyanNo: sql`excluded.beyan_no`,
          fatBedeli: sql`excluded.fat_bedeli`,
          doviz: sql`excluded.doviz`,
          kullanici: sql`excluded.kullanici`,
          // Basligi bozuk bir dosya, mevcut DOLU rejim kodlarini NULL'a EZMESIN.
          rejimKodu: sql`coalesce(excluded.rejim_kodu, ${beyannameler.rejimKodu})`,
          sonGuncelleme: sql`now()`,
        },
      });
    }
    const eklenen = kayitlar.filter((r) => !mevcutSet.has(anahtar(r))).length;
    return { eklenen, guncellenen: kayitlar.length - eklenen };
  }

  async getBeyannameler(kullanici?: string): Promise<Beyanname[]> {
    // Transit satirlari dosya_no=null; NULLS LAST ile listenin SONUNA gider (basini kaplamasin).
    // Emsal: storage.ts:700 sql`... desc nulls last`.
    const siralama = sql`${beyannameler.dosyaNo} desc nulls last, ${beyannameler.beyanNo} desc`;
    if (kullanici !== undefined) {
      // Temsilci kendi (avAdi) IM/EX dosyalarini gorur; ARTI tum transitler (kaynak='manuel',
      // kullanici=null) herkese ortak gorunur — Faz 1 karari: "transit ortak liste". Aksi halde
      // temsilci kendi ekledigi transiti bile filtreli gorunumde goremezdi.
      return db.select().from(beyannameler)
        .where(or(eq(beyannameler.kullanici, kullanici), eq(beyannameler.rejim, "TR")))
        .orderBy(siralama);
    }
    return db.select().from(beyannameler).orderBy(siralama);
  }

  async getBeyanname(id: string): Promise<Beyanname | undefined> {
    const [b] = await db.select().from(beyannameler).where(eq(beyannameler.id, id));
    return b;
  }

  async createManuelTransit(girdi: { beyanNo: string; alici: string; gumrukIdaresi: string | null }): Promise<Beyanname> {
    // Mukerrer beyan_no: mevcut TR satirini dondur (masraf-turu kalibi). Kismi unique indeks
    // (beyannameler_tr_beyan_no_idx WHERE rejim='TR') yaris backstop'u.
    const mevcutBul = async (): Promise<Beyanname | undefined> => {
      const [b] = await db.select().from(beyannameler)
        .where(and(eq(beyannameler.rejim, "TR"), eq(beyannameler.beyanNo, girdi.beyanNo)));
      return b;
    };
    const mevcut = await mevcutBul();
    if (mevcut) return mevcut;
    try {
      const [yeni] = await db.insert(beyannameler).values({
        dosyaNo: null,
        alici: girdi.alici,
        gonderen: null,
        gumrukIdaresi: girdi.gumrukIdaresi,
        beyanNo: girdi.beyanNo,
        kullanici: null,
        rejim: "TR",
        kaynak: "manuel",
      }).returning();
      return yeni;
    } catch (e) {
      // Yaris: iki kullanici ayni anda ekledi -> ikincisi mevcudu alsin.
      const tekrar = await mevcutBul();
      if (tekrar) return tekrar;
      throw e;
    }
  }

  async getEslesmeyenBeyannameKullanicilari(): Promise<{ kullanici: string; adet: number }[]> {
    const tanimliSatirlar = await db.select({ avAdi: portalKullanicilar.avAdi })
      .from(portalKullanicilar).where(isNotNull(portalKullanicilar.avAdi));
    const tanimli = tanimliSatirlar.map((k) => k.avAdi!).filter((a) => a.length > 0);
    const kosul = tanimli.length
      ? and(isNotNull(beyannameler.kullanici), notInArray(beyannameler.kullanici, tanimli))
      : isNotNull(beyannameler.kullanici);
    const satirlar = await db.select({ kullanici: beyannameler.kullanici, adet: count() })
      .from(beyannameler).where(kosul).groupBy(beyannameler.kullanici);
    return satirlar.map((r) => ({ kullanici: r.kullanici!, adet: Number(r.adet) }));
  }

  async getMasrafTurleri(sadeceAktif?: boolean): Promise<MasrafTuru[]> {
    if (sadeceAktif) {
      return db.select().from(masrafTurleri).where(eq(masrafTurleri.aktif, true))
        .orderBy(asc(masrafTurleri.sira), asc(masrafTurleri.ad));
    }
    return db.select().from(masrafTurleri).orderBy(asc(masrafTurleri.sira), asc(masrafTurleri.ad));
  }

  async createMasrafTuru(t: InsertMasrafTuru): Promise<MasrafTuru> {
    const [yeni] = await db.insert(masrafTurleri).values(t).returning();
    return yeni;
  }

  async updateMasrafTuru(id: string, t: Partial<InsertMasrafTuru>): Promise<MasrafTuru | undefined> {
    const [guncel] = await db.update(masrafTurleri).set(t)
      .where(eq(masrafTurleri.id, id)).returning();
    return guncel;
  }

  // Tür adından bayrak okumak için. tr-locale küçültme: "I/İ" tuzağı nedeniyle toLowerCase() DEĞİL.
  // FAIL-SAFE: ad case-SENSITIVE unique olduğundan "Ardiye"/"ardiye" gibi çift kayıt mümkün.
  // Böyle bir durumda EN KISITLAYICI kaydı döndürürüz (belgeZorunlu=true olan) — aksi hâlde
  // pasif bir adaş, aktif türün belge zorunluluğunu sessizce kaldırabilirdi.
  async getMasrafTuruByAd(ad: string): Promise<MasrafTuru | undefined> {
    const norm = (s: string) => s.trim().toLocaleLowerCase("tr");
    const hedef = norm(ad);
    if (!hedef) return undefined;
    const hepsi = await this.getMasrafTurleri();
    const eslesenler = hepsi.filter((t) => norm(t.ad) === hedef);
    if (eslesenler.length === 0) return undefined;
    return eslesenler.find((t) => t.belgeZorunlu) ?? eslesenler[0];
  }

  async seedMasrafTurleri(): Promise<void> {
    const varsayilan = ["Ardiye", "Liman Masrafı", "Demuraj", "Tahmil-Tahliye", "Ordino", "Diğer"];
    await db.insert(masrafTurleri)
      .values(varsayilan.map((ad, i) => ({ ad, sira: i })))
      .onConflictDoNothing({ target: masrafTurleri.ad });
  }

  async createOdemeTalep(t: InsertOdemeTalep): Promise<OdemeTalep> {
    const [yeni] = await db.insert(odemeTalepleri).values(t).returning();
    return yeni;
  }

  async getOdemeTalepleri(filtre?: { talepEdenId?: string; odemeTipi?: string }): Promise<OdemeTalepDetay[]> {
    const kosullar = [];
    if (filtre?.talepEdenId) kosullar.push(eq(odemeTalepleri.talepEdenId, filtre.talepEdenId));
    if (filtre?.odemeTipi) kosullar.push(eq(odemeTalepleri.odemeTipi, filtre.odemeTipi));
    const talepler = await db.select().from(odemeTalepleri)
      .where(kosullar.length ? and(...kosullar) : undefined)
      .orderBy(desc(odemeTalepleri.talepTarihi), desc(odemeTalepleri.id));
    if (!talepler.length) return [];

    // N+1 yok: üç toplu sorgu + Map join.
    // beyannameId dosyasız taleplerde null — filtrele; boş diziyle inArray çağrılmaz.
    const beyanIds = Array.from(new Set(
      talepler.map((t) => t.beyannameId).filter((x): x is string => x != null),
    ));
    const kullaniciIds = Array.from(new Set(talepler.map((t) => t.talepEdenId)));
    const talepIds = talepler.map((t) => t.id);
    const [beyanSatirlari, kullaniciSatirlari, belgeSatirlari] = await Promise.all([
      beyanIds.length
        ? db.select().from(beyannameler).where(inArray(beyannameler.id, beyanIds))
        : Promise.resolve([] as Beyanname[]),
      db.select().from(portalKullanicilar).where(inArray(portalKullanicilar.id, kullaniciIds)),
      db.select().from(odemeBelgeleri).where(inArray(odemeBelgeleri.talepId, talepIds)),
    ]);
    const beyanMap = new Map(beyanSatirlari.map((b) => [b.id, b]));
    const adMap = new Map(kullaniciSatirlari.map((k) => [k.id, k.adSoyad]));
    const belgeMap = new Map<string, OdemeBelge[]>();
    for (const b of belgeSatirlari) {
      const arr = belgeMap.get(b.talepId) ?? [];
      arr.push(b);
      belgeMap.set(b.talepId, arr);
    }
    return talepler.map((t) => ({
      ...t,
      beyanname: t.beyannameId ? beyanMap.get(t.beyannameId) ?? null : null,
      talepEdenAd: adMap.get(t.talepEdenId) ?? "?",
      belgeler: belgeMap.get(t.id) ?? [],
    }));
  }

  async getOdemeTalep(id: string): Promise<OdemeTalep | undefined> {
    const [t] = await db.select().from(odemeTalepleri).where(eq(odemeTalepleri.id, id));
    return t;
  }

  async updateOdemeTalep(id: string, t: Partial<InsertOdemeTalep>): Promise<OdemeTalep | undefined> {
    const [guncel] = await db.update(odemeTalepleri).set(t)
      .where(eq(odemeTalepleri.id, id)).returning();
    return guncel;
  }

  async createOdemeBelge(b: InsertOdemeBelge): Promise<OdemeBelge> {
    const [yeni] = await db.insert(odemeBelgeleri).values(b).returning();
    return yeni;
  }

  // Çocuk satırı olmayan firma için eski tekil kolonlardan sanal IBAN üretir (göç yok)
  private eskiKolonlardanIban(f: OdemeSirketi): FirmaIban[] {
    const r: FirmaIban[] = [];
    const tryVal = (f.ibanTry || f.iban || "").trim();
    if (tryVal) r.push({ id: `legacy-${f.id}-try`, firmaId: f.id, paraBirimi: "TRY", iban: tryVal, etiket: null });
    const usdVal = (f.ibanUsd || "").trim();
    if (usdVal) r.push({ id: `legacy-${f.id}-usd`, firmaId: f.id, paraBirimi: "USD", iban: usdVal, etiket: null });
    return r;
  }

  private async firmalaraIbanEkle(firmalar: OdemeSirketi[]): Promise<OdemeSirketiDetay[]> {
    if (firmalar.length === 0) return [];
    const satirlar = await db.select().from(firmaIbanlari).where(inArray(firmaIbanlari.firmaId, firmalar.map((f) => f.id)));
    const map = new Map<string, FirmaIban[]>();
    for (const s of satirlar) {
      const arr = map.get(s.firmaId) ?? [];
      arr.push(s);
      map.set(s.firmaId, arr);
    }
    return firmalar.map((f) => {
      const cocuk = map.get(f.id) ?? [];
      return { ...f, ibanlar: cocuk.length > 0 ? cocuk : this.eskiKolonlardanIban(f) };
    });
  }

  private async ibanlariYaz(firmaId: string, ibanlar?: { paraBirimi: string; iban: string; etiket?: string | null }[]): Promise<void> {
    const temizler = (ibanlar ?? [])
      .map((x) => ({ firmaId, paraBirimi: String(x.paraBirimi), iban: String(x.iban ?? "").trim(), etiket: x.etiket?.trim() || null }))
      .filter((x) => x.iban && ["TRY", "USD", "EUR"].includes(x.paraBirimi));
    if (temizler.length === 0) return;
    await db.insert(firmaIbanlari).values(temizler);
  }

  // Eski tekil iban alanlarını (F1.10 çağrıları) çocuk-satır listesine köprüler
  private legacyIbanlar(data: { iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null }): { paraBirimi: string; iban: string; etiket?: string | null }[] {
    const r: { paraBirimi: string; iban: string; etiket?: string | null }[] = [];
    const tryVal = (data.ibanTry ?? data.iban ?? "").trim();
    if (tryVal) r.push({ paraBirimi: "TRY", iban: tryVal });
    const usdVal = (data.ibanUsd ?? "").trim();
    if (usdVal) r.push({ paraBirimi: "USD", iban: usdVal });
    return r;
  }

  async upsertOdemeSirketi(ad: string, opts?: { iban?: string | null; paraBirimi?: string; kaynak?: string }): Promise<void> {
    const temiz = ad.trim();
    if (!temiz) return;
    const ibanTemiz = opts?.iban ? String(opts.iban).trim() : null;
    const pb = ["TRY", "USD", "EUR"].includes(String(opts?.paraBirimi)) ? String(opts?.paraBirimi) : "TRY";
    const mevcut = await db.select({ id: odemeSirketleri.id }).from(odemeSirketleri).where(eq(odemeSirketleri.ad, temiz)).limit(1);
    if (mevcut.length > 0) {
      // Mevcut firma: yalnız sayaç — çocuk IBAN EKLENMEZ (muhasebe yönetir, F1.9 kuralı)
      await db.update(odemeSirketleri)
        .set({ kullanimSayisi: sql`${odemeSirketleri.kullanimSayisi} + 1`, sonKullanim: sql`now()` })
        .where(eq(odemeSirketleri.id, mevcut[0].id));
    } else {
      const [yeni] = await db.insert(odemeSirketleri).values({ ad: temiz, kaynak: opts?.kaynak ?? "temsilci" }).returning();
      if (ibanTemiz) await db.insert(firmaIbanlari).values({ firmaId: yeni.id, paraBirimi: pb, iban: ibanTemiz, etiket: null });
    }
  }

  async getOdemeSirketleri(): Promise<OdemeSirketiDetay[]> {
    const firmalar = await db
      .select()
      .from(odemeSirketleri)
      .where(eq(odemeSirketleri.aktif, true))
      .orderBy(desc(odemeSirketleri.kullanimSayisi), desc(odemeSirketleri.sonKullanim))
      .limit(100);
    return this.firmalaraIbanEkle(firmalar);
  }

  async getOdemeSirketleriTumu(): Promise<OdemeSirketiDetay[]> {
    const firmalar = await db.select().from(odemeSirketleri).orderBy(asc(odemeSirketleri.ad));
    return this.firmalaraIbanEkle(firmalar);
  }

  async createOdemeSirketi(data: {
    ad: string; iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null;
    ibanlar?: { paraBirimi: string; iban: string; etiket?: string | null }[];
  }): Promise<OdemeSirketi | null> {
    const temiz = data.ad.trim();
    if (!temiz) return null;
    const mevcut = await db.select().from(odemeSirketleri).where(eq(odemeSirketleri.ad, temiz)).limit(1);
    if (mevcut.length > 0) return null; // ad çakışması → route 409
    const [yeni] = await db
      .insert(odemeSirketleri)
      .values({ ad: temiz, banka: data.banka?.trim() || null, vergiNo: data.vergiNo?.trim() || null, notlar: data.notlar?.trim() || null, kaynak: "muhasebe" })
      .returning();
    // ibanlar verildiyse onu, verilmediyse eski tekil alanları köprüle (F1.10 çağrıları)
    await this.ibanlariYaz(yeni.id, data.ibanlar ?? this.legacyIbanlar(data));
    return yeni;
  }

  async updateOdemeSirketi(
    id: string,
    data: Partial<{ ad: string; iban: string | null; ibanTry: string | null; ibanUsd: string | null; banka: string | null; vergiNo: string | null; notlar: string | null; aktif: boolean; ibanlar: { paraBirimi: string; iban: string; etiket?: string | null }[] }>,
  ): Promise<OdemeSirketi | null> {
    const set: Record<string, unknown> = {};
    if (data.ad !== undefined) set.ad = data.ad.trim();
    if (data.banka !== undefined) set.banka = data.banka?.trim() || null;
    if (data.vergiNo !== undefined) set.vergiNo = data.vergiNo?.trim() || null;
    if (data.notlar !== undefined) set.notlar = data.notlar?.trim() || null;
    if (data.aktif !== undefined) set.aktif = data.aktif;
    let firma: OdemeSirketi | undefined;
    if (Object.keys(set).length > 0) {
      [firma] = await db.update(odemeSirketleri).set(set).where(eq(odemeSirketleri.id, id)).returning();
    } else {
      [firma] = await db.select().from(odemeSirketleri).where(eq(odemeSirketleri.id, id)).limit(1);
    }
    if (!firma) return null;
    // ibanlar verildiyse çocuk satırları DEĞİŞTİR; yoksa eski tekil alan geldiyse onu köprüle;
    // ikisi de yoksa (ör. yalnız aktif toggle) çocuk satırlara DOKUNMA.
    let yeniIbanlar: { paraBirimi: string; iban: string; etiket?: string | null }[] | undefined;
    if (data.ibanlar !== undefined) {
      yeniIbanlar = data.ibanlar; // F1.11: açık liste (boş [] = tümünü temizle, kasıtlı)
    } else if (data.iban !== undefined || data.ibanTry !== undefined || data.ibanUsd !== undefined) {
      const lg = this.legacyIbanlar(data);
      yeniIbanlar = lg.length > 0 ? lg : undefined; // boş eski-alan çocuk satırları SİLMESİN (bayat F1.10 sekmesi koruması)
    }
    if (yeniIbanlar !== undefined) {
      await db.delete(firmaIbanlari).where(eq(firmaIbanlari.firmaId, id));
      await this.ibanlariYaz(id, yeniIbanlar);
    }
    return firma;
  }

  async bulkUpsertOdemeSirketleri(
    rows: { ad: string; iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }[],
  ): Promise<{ eklendi: number; guncellendi: number; atlandi: number }> {
    let eklendi = 0, guncellendi = 0, atlandi = 0;
    for (const row of rows) {
      const temiz = row.ad?.trim();
      if (!temiz) { atlandi++; continue; }
      const mevcut = await db.select().from(odemeSirketleri).where(eq(odemeSirketleri.ad, temiz)).limit(1);
      // Muhasebe Excel'i YETKİLİ: çakışmada dolu gelen alanları GÜNCELLER.
      const alanlar = {
        ibanTry: (row.ibanTry ?? row.iban)?.trim() || null, // eski iban → TRY köprüsü
        ibanUsd: row.ibanUsd?.trim() || null,
        banka: row.banka?.trim() || null,
        vergiNo: row.vergiNo?.trim() || null,
        notlar: row.notlar?.trim() || null,
      };
      if (mevcut.length > 0) {
        const set: Record<string, unknown> = {};
        if (alanlar.ibanTry) set.ibanTry = alanlar.ibanTry;
        if (alanlar.ibanUsd) set.ibanUsd = alanlar.ibanUsd;
        if (alanlar.banka) set.banka = alanlar.banka;
        if (alanlar.vergiNo) set.vergiNo = alanlar.vergiNo;
        if (alanlar.notlar) set.notlar = alanlar.notlar;
        if (Object.keys(set).length > 0) {
          await db.update(odemeSirketleri).set(set).where(eq(odemeSirketleri.ad, temiz));
        }
        guncellendi++;
      } else {
        await db.insert(odemeSirketleri).values({ ad: temiz, ...alanlar, kaynak: "muhasebe" });
        eklendi++;
      }
    }
    return { eklendi, guncellendi, atlandi };
  }

  async bulkUpsertFirmaIbanRows(
    rows: { ad: string; paraBirimi: string; iban: string; etiket?: string | null; vergiNo?: string | null; notlar?: string | null }[],
  ): Promise<{ eklendi: number; guncellendi: number; atlandi: number }> {
    // Satırları firma adına göre grupla (bir firmanın birden çok IBAN satırı olabilir)
    const gruplar = new Map<string, { vergiNo: string | null; notlar: string | null; ibanlar: { paraBirimi: string; iban: string; etiket: string | null }[] }>();
    let atlandi = 0;
    for (const row of rows) {
      const ad = String(row.ad ?? "").trim();
      const iban = String(row.iban ?? "").trim();
      const pb = String(row.paraBirimi ?? "").trim().toUpperCase();
      if (!ad) { atlandi++; continue; }
      const g = gruplar.get(ad) ?? { vergiNo: null, notlar: null, ibanlar: [] };
      if (!g.vergiNo && row.vergiNo?.trim()) g.vergiNo = row.vergiNo.trim();
      if (!g.notlar && row.notlar?.trim()) g.notlar = row.notlar.trim();
      if (iban && ["TRY", "USD", "EUR"].includes(pb)) g.ibanlar.push({ paraBirimi: pb, iban, etiket: row.etiket?.trim() || null });
      else if (iban) atlandi++; // geçersiz para birimi
      gruplar.set(ad, g);
    }
    let eklendi = 0, guncellendi = 0;
    for (const [ad, g] of gruplar) {
      const mevcut = await db.select({ id: odemeSirketleri.id }).from(odemeSirketleri).where(eq(odemeSirketleri.ad, ad)).limit(1);
      let firmaId: string;
      if (mevcut.length > 0) {
        firmaId = mevcut[0].id;
        const set: Record<string, unknown> = {};
        if (g.vergiNo) set.vergiNo = g.vergiNo;
        if (g.notlar) set.notlar = g.notlar;
        if (Object.keys(set).length > 0) await db.update(odemeSirketleri).set(set).where(eq(odemeSirketleri.id, firmaId));
        // Muhasebe Excel'i YETKİLİ: firmanın çocuk IBAN'larını DEĞİŞTİR
        await db.delete(firmaIbanlari).where(eq(firmaIbanlari.firmaId, firmaId));
        guncellendi++;
      } else {
        const [yeni] = await db.insert(odemeSirketleri).values({ ad, vergiNo: g.vergiNo, notlar: g.notlar, kaynak: "muhasebe" }).returning();
        firmaId = yeni.id;
        eklendi++;
      }
      if (g.ibanlar.length > 0) await db.insert(firmaIbanlari).values(g.ibanlar.map((x) => ({ firmaId, ...x })));
    }
    return { eklendi, guncellendi, atlandi };
  }

  async firmaIbanlariExcelSablonu(): Promise<Buffer> {
    const aoa = [
      ["Firma Adı", "Para Birimi", "IBAN", "Etiket", "Vergi/TC No", "Not"],
      ["ÖRNEK LOJİSTİK A.Ş.", "USD", "TR000000000000000000000000", "USD - Garanti", "1234567890", "örnek satır — silebilirsiniz"],
      ["ÖRNEK LOJİSTİK A.Ş.", "TRY", "TR111111111111111111111111", "TRY - İş Bankası", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Firmalar");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  // ==================== OPERASYON KASASI (ŞUBE MASRAF) ====================

  async getOperasyonKullanicilar(): Promise<PortalKullanici[]> {
    return db.select().from(portalKullanicilar)
      .where(and(eq(portalKullanicilar.rol, "operasyon"), eq(portalKullanicilar.aktif, true)))
      .orderBy(asc(portalKullanicilar.adSoyad));
  }

  async getOperasyonBakiye(operasyonId: string): Promise<number> {
    const [av] = await db.select({ t: sql<string>`COALESCE(SUM(${operasyonAvanslar.tutar}),0)` })
      .from(operasyonAvanslar).where(eq(operasyonAvanslar.operasyonId, operasyonId));
    const [ma] = await db.select({ t: sql<string>`COALESCE(SUM(${operasyonMasraflar.tutar}),0)` })
      .from(operasyonMasraflar).where(eq(operasyonMasraflar.operasyonId, operasyonId));
    return Math.round((parseFloat(av.t) - parseFloat(ma.t)) * 100) / 100;
  }

  async avansYukle(d: { operasyonId: string; tutar: number; aciklama: string | null; tarih: string; gonderenId: string; belgeDosya: string | null; belgeAdi: string | null }): Promise<OperasyonAvans> {
    const [yeni] = await db.insert(operasyonAvanslar).values({
      operasyonId: d.operasyonId, tutar: d.tutar.toFixed(2), aciklama: d.aciklama,
      tarih: d.tarih, gonderenId: d.gonderenId,
      belgeDosya: d.belgeDosya, belgeAdi: d.belgeAdi,
    }).returning();
    return yeni;
  }

  async masrafKaydet(d: { operasyonId: string; beyannameId: string | null; dosyaYok: boolean; masrafTuru: string | null; sube: string | null; tutar: number; alacakli: string; iban: string | null; aciklama: string | null; tarih: string; belgeDosya: string | null; belgeAdi: string | null }): Promise<OperasyonMasraf> {
    const [yeni] = await db.insert(operasyonMasraflar).values({
      operasyonId: d.operasyonId, beyannameId: d.beyannameId, dosyaYok: d.dosyaYok,
      masrafTuru: d.masrafTuru, sube: d.sube, tutar: d.tutar.toFixed(2), alacakli: d.alacakli, iban: d.iban,
      aciklama: d.aciklama, tarih: d.tarih, belgeDosya: d.belgeDosya, belgeAdi: d.belgeAdi,
    }).returning();
    return yeni;
  }

  // Şube × masraf türü kırılımı. Tek GROUP BY sorgusu — N+1 yok.
  // Tarih filtresi text YYYY-MM-DD üzerinde string karşılaştırmasıdır (new Date PARSE YOK).
  async getSubeGiderRaporu(baslangic: string, bitis: string): Promise<SubeGiderRaporu> {
    const satirlar = await db
      .select({
        sube: operasyonMasraflar.sube,
        masrafTuru: operasyonMasraflar.masrafTuru,
        adet: sql<string>`COUNT(*)`,
        tutar: sql<string>`COALESCE(SUM(${operasyonMasraflar.tutar}),0)`,
      })
      .from(operasyonMasraflar)
      .where(and(gte(operasyonMasraflar.tarih, baslangic), lte(operasyonMasraflar.tarih, bitis)))
      .groupBy(operasyonMasraflar.sube, operasyonMasraflar.masrafTuru);

    const harita = new Map<string, SubeGiderBloku>();
    for (const s of satirlar) {
      const subeAd = s.sube ?? "Şube atanmamış";
      const turAd = s.masrafTuru ?? "Belirtilmemiş";
      const tutar = Math.round(parseFloat(s.tutar) * 100) / 100;
      let blok = harita.get(subeAd);
      if (!blok) { blok = { sube: subeAd, toplam: 0, turler: [] }; harita.set(subeAd, blok); }
      blok.turler.push({ masrafTuru: turAd, adet: Number(s.adet), tutar });
      blok.toplam = Math.round((blok.toplam + tutar) * 100) / 100;
    }
    const bloklar = Array.from(harita.values());
    for (const b of bloklar) b.turler.sort((x, y) => y.tutar - x.tutar);
    bloklar.sort((a, b) => b.toplam - a.toplam);
    const genelToplam = Math.round(bloklar.reduce((t, b) => t + b.toplam, 0) * 100) / 100;
    return { subeler: bloklar, genelToplam };
  }

  async subeGiderRaporuExcel(baslangic: string, bitis: string): Promise<Buffer> {
    const rapor = await this.getSubeGiderRaporu(baslangic, bitis);
    // DÜZ tablo (spec §8): yalnız detay satırları. Ara/genel toplam satırı EKLENMEZ —
    // aksi hâlde kolonu seçip toplam alan kullanıcı toplamları da toplayıp katlanmış rakam görür.
    const aoa: (string | number)[][] = [["Şube", "Masraf Türü", "Adet", "Tutar (TL)"]];
    for (const b of rapor.subeler) {
      for (const t of b.turler) aoa.push([b.sube, t.masrafTuru, t.adet, t.tutar]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Şube Gider");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  async getOperasyonMasraf(id: string): Promise<OperasyonMasraf | undefined> {
    const [m] = await db.select().from(operasyonMasraflar).where(eq(operasyonMasraflar.id, id)).limit(1);
    return m;
  }

  async masrafSil(id: string): Promise<void> {
    await db.delete(operasyonMasraflar).where(eq(operasyonMasraflar.id, id));
  }

  async getOperasyonAvans(id: string): Promise<OperasyonAvans | undefined> {
    const [a] = await db.select().from(operasyonAvanslar).where(eq(operasyonAvanslar.id, id));
    return a;
  }

  async avansSil(id: string): Promise<void> {
    await db.delete(operasyonAvanslar).where(eq(operasyonAvanslar.id, id));
  }

  async getAcikHareketler(operasyonId: string): Promise<{ avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }> {
    const avanslar = await db.select().from(operasyonAvanslar)
      .where(and(eq(operasyonAvanslar.operasyonId, operasyonId), sql`${operasyonAvanslar.kapanisId} IS NULL`))
      .orderBy(desc(operasyonAvanslar.olusturma));
    const masraflar = await db.select().from(operasyonMasraflar)
      .where(and(eq(operasyonMasraflar.operasyonId, operasyonId), sql`${operasyonMasraflar.kapanisId} IS NULL`))
      .orderBy(desc(operasyonMasraflar.olusturma));
    return { avanslar, masraflar };
  }

  async gunuKapat(operasyonId: string, gunTarihi: string): Promise<OperasyonGunKapanis | null> {
    const { avanslar, masraflar } = await this.getAcikHareketler(operasyonId);
    if (avanslar.length === 0 && masraflar.length === 0) return null;
    const avansToplam = avanslar.reduce((s, a) => s + parseFloat(a.tutar), 0);
    const masrafToplam = masraflar.reduce((s, m) => s + parseFloat(m.tutar), 0);
    const kapanisBakiye = await this.getOperasyonBakiye(operasyonId);
    const acilisBakiye = Math.round((kapanisBakiye - (avansToplam - masrafToplam)) * 100) / 100;
    const [kapanis] = await db.insert(operasyonGunKapanis).values({
      operasyonId, gunTarihi,
      acilisBakiye: acilisBakiye.toFixed(2), avansToplam: avansToplam.toFixed(2),
      masrafToplam: masrafToplam.toFixed(2), kapanisBakiye: kapanisBakiye.toFixed(2), durum: "kapali",
    }).returning();
    await db.update(operasyonAvanslar).set({ kapanisId: kapanis.id })
      .where(and(eq(operasyonAvanslar.operasyonId, operasyonId), sql`${operasyonAvanslar.kapanisId} IS NULL`));
    await db.update(operasyonMasraflar).set({ kapanisId: kapanis.id })
      .where(and(eq(operasyonMasraflar.operasyonId, operasyonId), sql`${operasyonMasraflar.kapanisId} IS NULL`));
    return kapanis;
  }

  async getSonKapanis(operasyonId: string): Promise<{ gunTarihi: string; kapanisBakiye: string } | null> {
    const [k] = await db.select({ gunTarihi: operasyonGunKapanis.gunTarihi, kapanisBakiye: operasyonGunKapanis.kapanisBakiye })
      .from(operasyonGunKapanis)
      .where(eq(operasyonGunKapanis.operasyonId, operasyonId))
      .orderBy(desc(operasyonGunKapanis.kapanisZamani))
      .limit(1);
    return k ?? null;
  }

  async getKapanislar(operasyonId: string): Promise<Array<OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }>> {
    const kapanislar = await db.select().from(operasyonGunKapanis)
      .where(eq(operasyonGunKapanis.operasyonId, operasyonId))
      .orderBy(desc(operasyonGunKapanis.kapanisZamani));
    if (kapanislar.length === 0) return [];
    const ids = kapanislar.map((k) => k.id);
    const avanslar = await db.select().from(operasyonAvanslar).where(inArray(operasyonAvanslar.kapanisId, ids));
    const masraflar = await db.select().from(operasyonMasraflar).where(inArray(operasyonMasraflar.kapanisId, ids));
    const avMap = new Map<string, OperasyonAvans[]>();
    for (const a of avanslar) { if (!a.kapanisId) continue; const arr = avMap.get(a.kapanisId) ?? []; arr.push(a); avMap.set(a.kapanisId, arr); }
    const maMap = new Map<string, OperasyonMasraf[]>();
    for (const m of masraflar) { if (!m.kapanisId) continue; const arr = maMap.get(m.kapanisId) ?? []; arr.push(m); maMap.set(m.kapanisId, arr); }
    return kapanislar.map((k) => ({ ...k, avanslar: avMap.get(k.id) ?? [], masraflar: maMap.get(k.id) ?? [] }));
  }

  async getKapanis(id: string): Promise<OperasyonGunKapanis | undefined> {
    const [k] = await db.select().from(operasyonGunKapanis).where(eq(operasyonGunKapanis.id, id)).limit(1);
    return k;
  }

  async geriAc(kapanisId: string, geriAcanId: string): Promise<OperasyonGunKapanis | null> {
    const [k] = await db.update(operasyonGunKapanis)
      .set({ durum: "geri_acildi", geriAcanId })
      .where(eq(operasyonGunKapanis.id, kapanisId)).returning();
    if (!k) return null;
    await db.update(operasyonAvanslar).set({ kapanisId: null }).where(eq(operasyonAvanslar.kapanisId, kapanisId));
    await db.update(operasyonMasraflar).set({ kapanisId: null }).where(eq(operasyonMasraflar.kapanisId, kapanisId));
    return k;
  }
}

export const storage = new DatabaseStorage();
