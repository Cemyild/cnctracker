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
  bakimKayitlari, type BakimKayit, type InsertBakimKayit } from "@shared/schema";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import { db } from "./db";
import { eq, and, sql, inArray, desc, isNotNull, or, asc, ne, count } from "drizzle-orm";
import { buildDedupKey } from "./dedup";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Gümrük verileri
  getGumrukVerileri(ay: string, yil: number): Promise<GumrukVerisi[]>
  getAllGumrukVerileri(): Promise<GumrukVerisi[]>;
  insertGumrukVerileri(veriler: InsertGumrukVerisi[]): Promise<GumrukVerisi[]>;
  updateGumrukDosyaRecordCount(id: string, count: number): Promise<void>;
  createGumrukDosya(dosya: InsertGumrukDosya): Promise<GumrukDosya>;
  findGumrukDosyaByMd5(hash: string, tip?: string): Promise<GumrukDosya | null>;
  deleteGumrukVerileri(ay: string, yil: number): Promise<void>;
  getGumrukAylari(): Promise<{ ay: string; yil: number; kayitSayisi: number }[]>;
  getExistingRowHashes(ay: string, yil: number): Promise<Set<string>>;
  getExistingKompozitKeysByAyYillar(pairs: { ay: string; yil: number }[]): Promise<Set<string>>;
  getAylikOzet(yil: number): Promise<{ ay: string; yil: number; toplamSatis: number; toplamKdv: number; dosyaSayisi: number }[]>;
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

  // Nakliye verileri
  getNakliyeVerileri(): Promise<NakliyeVerisi[]>;
  insertNakliyeVerileri(veriler: InsertNakliyeVerisi[]): Promise<NakliyeVerisi[]>;
  deleteNakliyeVerisi(id: string): Promise<void>;
  updateNakliyeVerisi(id: string, veri: Partial<InsertNakliyeVerisi>): Promise<NakliyeVerisi>;

  // Çalışanlar
  getCalisanlar(ay?: string, yil?: number): Promise<Calisan[]>;
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
  getSigortaOzet(yil: number): Promise<{ ay: string; sirket: string; policeSayisi: number; toplamPrim: number; toplamKomisyon: number }[]>;

  // Sigorta Muhasebe Kayıtları
  getSigortaMuhasebeKayitlari(sirket?: string, ay?: string, yil?: number): Promise<SigortaMuhasebe[]>;
  insertSigortaMuhasebeKayitlari(veriler: InsertSigortaMuhasebe[]): Promise<SigortaMuhasebe[]>;
  deleteSigortaMuhasebeKayitlari(sirket: string, ay?: string, yil?: number): Promise<void>;
  updateSigortaMuhasebeKaydi(id: string, veri: Partial<InsertSigortaMuhasebe>): Promise<SigortaMuhasebe>;
  deleteSigortaMuhasebeKaydi(id: string): Promise<void>;
  deleteMapfreMuhasebe(): Promise<void>;
  
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
      const inserted = await db.insert(aracGiderler).values(batch).returning();
      results.push(...inserted);
    }
    
    return results;
  }

  async deleteAracGider(id: string): Promise<void> {
    await db.delete(aracGiderler).where(eq(aracGiderler.id, id));
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

    if (filters.length > 0) {
      return await db.select().from(giderler).where(and(...filters)).orderBy(giderler.tarih);
    }
    return await db.select().from(giderler).orderBy(giderler.tarih);
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
             // Update logic: fields that might change?
             // Usually reload overwrites, so let's update financials
             netPrim: sql`excluded.net_prim`,
             brutPrim: sql`excluded.brut_prim`,
             komisyon: sql`excluded.komisyon`,
             sigortaBedeli: sql`excluded.sigorta_bedeli`,
             dekontDurumu: sql`excluded.dekont_durumu`,
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

  async getSigortaOzet(yil: number): Promise<{ ay: string; sirket: string; policeSayisi: number; toplamPrim: number; toplamKomisyon: number }[]> {
    const result = await db.select({
      ay: sigortaPoliceleri.ay,
      sirket: sigortaPoliceleri.sirket,
      policeSayisi: sql<number>`count(*)`,
      toplamPrim: sql<string>`sum(${sigortaPoliceleri.netPrim})`,
      toplamKomisyon: sql<string>`sum(${sigortaPoliceleri.komisyon})`,
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

  async updateSigortaMuhasebeKaydi(id: string, veri: Partial<InsertSigortaMuhasebe>): Promise<SigortaMuhasebe> {
      const [updated] = await db
      .update(sigortaMuhasebeKayitlari)
      .set(veri)
      .where(eq(sigortaMuhasebeKayitlari.id, id))
      .returning();
      
      if (!updated) throw new Error("Muhasebe kaydı bulunamadı");
      return updated;
  }

  async deleteSigortaMuhasebeKaydi(id: string): Promise<void> {
    await db.delete(sigortaMuhasebeKayitlari).where(eq(sigortaMuhasebeKayitlari.id, id));
  }

  async deleteMapfreMuhasebe(): Promise<void> {
    await db.delete(sigortaMuhasebeKayitlari).where(eq(sigortaMuhasebeKayitlari.sirket, "Mapfre"));
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
}

export const storage = new DatabaseStorage();
