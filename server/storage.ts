import { users, gumrukVerileri, type User, type InsertUser, type GumrukVerisi, type InsertGumrukVerisi, araclar, type Arac, type InsertArac, nakliyeVerileri, type NakliyeVerisi, type InsertNakliyeVerisi } from "@shared/schema";
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
  getFirmaAylikOzet(yil: number, firma: string): Promise<{ ay: string; toplamSatis: number; toplamKdv: number; dosyaSayisi: number }[]>;
  getGirisElemanlari(yil: number): Promise<string[]>;
  getGirisElemaniOzet(yil: number): Promise<{ eleman: string; toplamSatis: number; dosyaSayisi: number }[]>;
  getGumrukOzet(yil: number): Promise<{ gumruk: string; toplamSatis: number; dosyaSayisi: number }[]>;
  getGumrukler(yil: number): Promise<string[]>;
  getFaturaKesenler(yil: number): Promise<string[]>;
  getAdvancedChartData(yil: number, groupBy: string, names?: string[]): Promise<any[]>;
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
      case "issuer":
        groupByColumn = gumrukVerileri.faturayiKesen;
        break;
      case "tip":
        groupByColumn = gumrukVerileri.tip;
        break;
      default:
        groupByColumn = gumrukVerileri.ay;
    }

    // Build the where clause
    const whereClause = [eq(gumrukVerileri.yil, yil)];

    // If specific names are selected, filter by them
    if (names && names.length > 0) {
      whereClause.push(inArray(groupByColumn, names));
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

    // If no names selected, stick to top 15 default behavior (client side slice for now as we fetched all groups in query if no filtering)
    // Actually, to be safe on performance, if NO names are selected, we should LIMIT the query.
    // However, since we removed .limit() from the chain above, we might get ALL groups (e.g. 500 companies).
    // Let's optimize: if names is empty, use limit.

    // Re-implementing limit logic safely:
    // We can't easily conditionally add .limit() in method chain without a variable for the query builder.
    // Instead, let's just slice the result array. 
    // Grouping 50,000 records into ~500 companies is fast enough (few ms). Returning 500 rows is fine.
    // Client can decide to show top 15 if no filter is active.

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
        // For 'month', trend view is just standard monthly data, effectively same as default view but we return standardized structure
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
      case "issuer":
        groupByColumn = gumrukVerileri.faturayiKesen;
        break;
      case "tip":
        groupByColumn = gumrukVerileri.tip;
        break;
      default:
        groupByColumn = gumrukVerileri.ay;
    }

    const whereClause = [eq(gumrukVerileri.yil, yil)];

    // If groupBy is NOT month, handle filtering logic
    if (groupBy !== "month") {
      let filterNames = names;

      // If specific names NOT selected, default to TOP 5 to prevent overload
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
        whereClause.push(inArray(groupByColumn, filterNames));
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
    const result = await db
      .selectDistinct({ tip: gumrukVerileri.tip })
      .from(gumrukVerileri)
      .where(eq(gumrukVerileri.yil, yil));

    return result
      .map(r => r.tip)
      .filter((t): t is string => t !== null && t !== "");
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

    // Batch insert
    const results: NakliyeVerisi[] = [];
    const BATCH_SIZE = 100;

    for (let i = 0; i < veriler.length; i += BATCH_SIZE) {
      const batch = veriler.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(nakliyeVerileri).values(batch).returning();
      results.push(...inserted);
    }

    return results;
  }
}



export const storage = new DatabaseStorage();
