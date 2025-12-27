import { users, gumrukVerileri, type User, type InsertUser, type GumrukVerisi, type InsertGumrukVerisi, araclar, type Arac, type InsertArac, nakliyeVerileri, type NakliyeVerisi, type InsertNakliyeVerisi, calisanlar, type Calisan, type InsertCalisan } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, sql, inArray } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Gümrük verileri
  getGumrukVerileri(ay: string, yil: number): Promise<GumrukVerisi[]>;
  insertGumrukVerileri(veriler: InsertGumrukVerisi[]): Promise<GumrukVerisi[]>;
  deleteGumrukVerileri(ay: string, yil: number): Promise<void>;
  getGumrukAylari(): Promise<{ ay: string; yil: number; kayitSayisi: number }[]>;
  getExistingRowHashes(ay: string, yil: number): Promise<Set<string>>;
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
  getAraclar(): Promise<Arac[]>;
  createArac(arac: InsertArac): Promise<Arac>;
  updateArac(id: string, arac: Partial<InsertArac>): Promise<Arac>;
  deleteArac(id: string): Promise<void>;

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

  async insertGumrukVerileri(veriler: InsertGumrukVerisi[]): Promise<GumrukVerisi[]> {
    if (veriler.length === 0) return [];

    // Verileri 100'lük parçalar halinde ekle (PostgreSQL parametre limiti nedeniyle)
    const BATCH_SIZE = 100;
    const results: GumrukVerisi[] = [];

    for (let i = 0; i < veriler.length; i += BATCH_SIZE) {
      const batch = veriler.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(gumrukVerileri).values(batch).returning();
      results.push(...inserted);
    }

    return results;
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

  async getAraclar(): Promise<Arac[]> {
    return await db.select().from(araclar);
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
  }
}

export const storage = new DatabaseStorage();
