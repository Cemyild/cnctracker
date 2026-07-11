# Otomatik Excel Yükleme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Power Automate'in ofis PC'sinde klasöre kaydettiği Mizan ve Beyanname Excel'lerini, token korumalı bir HTTPS endpoint'i üzerinden uygulamaya otomatik (insan onayı olmadan) aktarmak; sonuçları uygulama içi log + durum rozetiyle görünür kılmak.

**Architecture:** Yeni `POST /api/ingest/:tip` endpoint'i ham binary gövde alır, `X-Ingest-Token` ile fail-closed doğrular; mizan için mevcut kayıt mantığından çıkarılan `processMizanBuffer()`'ı, beyanname için mevcut `upsertBeyannameler`'i çağırır. Her sonuç `otomatik_yukleme_log` tablosuna yazılır ve Tahsilat/Ödemeler sayfalarında rozet olarak gösterilir. Elle UI yükleme akışları birebir korunur.

**Tech Stack:** Express (ESM, tsx), Drizzle ORM (Neon Postgres), drizzle-zod, React 18 + TanStack Query + shadcn/ui, Power Automate Desktop + PowerShell.

## Global Constraints

- **Test runner YOK.** Kalite kapısı yalnız `npm run check` (tsc --noEmit). "Test" adımları = `npm run check` + dev sunucuya karşı `Invoke-RestMethod` ile gerçek çalışma-zamanı doğrulaması. Sahte test dosyası YAZILMAZ.
- **Migration workflow YOK.** Şema değişimi `npm run db:push` ile uygulanır. **db:push öncesi DATABASE_URL'in DEV DB'yi gösterdiği doğrulanır** (paralel oturum .env'i canlı tünele çevirmiş olabilir — canlıya yazma riski).
- **Tarih konvansiyonu:** tarihler `text` olarak `YYYY-MM-DD` (veya `YYYY-MM-DD HH:mm:ss`) saklanır; display `dd/mm/yyyy`, **`new Date(...)` ile display yönlendirmesi yapılmaz** (timezone off-by-one).
- **FK/kolon isimleri:** TS alan adı camelCase, DB kolonu explicit snake_case string (`text("dosya_adi")`).
- **Auth:** okuma uçları (GET log) frontend şifre kapısı arkasında, backend auth'suz — mevcut kalıp. Yalnız `/api/ingest/*` token korumalı.
- **Deploy = push.** Ara commit'ler deploy-güvenli olmalı (endpoint env yoksa 503 fail-closed). Push kullanıcı tarafından tetiklenir; bu plandaki adımlar push ETMEZ.
- **git add açık-yol** ile yapılır (paralel oturum commit karışması riski).
- Türkçe UI/isimlendirme konvansiyonu korunur.

## File Structure

- `shared/schema.ts` — MODIFY: `otomatikYuklemeLog` tablosu + insert şeması + tipler (dosya sonuna eklenir).
- `server/storage.ts` — MODIFY: import + IStorage 2 imza + DatabaseStorage 2 impl.
- `server/routes.ts` — MODIFY: crypto import; `Response`/`NextFunction` tip importu; `processMizanBuffer()` + hata sınıfları (top-level); `/api/tahsilat/mizan/save` refactor; `requireIngestToken` middleware; `POST /api/ingest/:tip`; `GET /api/otomatik-yukleme/log`.
- `client/src/pages/Tahsilat.tsx` — MODIFY: mizan durum rozeti.
- `client/src/pages/Odemeler.tsx` — MODIFY: beyanname durum rozeti.
- `.env.example` — MODIFY: `INGEST_TOKEN` satırı.
- `docs/superpowers/plans/2026-07-11-otomatik-excel-yukleme-deploy.md` — CREATE (Task 6): deploy + Power Automate kurulum notu.

---

### Task 1: `otomatik_yukleme_log` şeması + storage

**Files:**
- Modify: `shared/schema.ts` (dosya sonu)
- Modify: `server/storage.ts` (schema import; IStorage interface ~362-394 civarı; DatabaseStorage impl ~3200 civarı)

**Interfaces:**
- Produces:
  - `otomatikYuklemeLog` (pgTable), `InsertOtomatikYuklemeLog`, `OtomatikYuklemeLog` tipleri.
  - `storage.insertOtomatikYuklemeLog(data: InsertOtomatikYuklemeLog): Promise<OtomatikYuklemeLog>`
  - `storage.getOtomatikYuklemeLoglar(tip: string | null, limit: number): Promise<OtomatikYuklemeLog[]>`

- [ ] **Step 1: Şema tablosunu ekle**

`shared/schema.ts` dosyasının SONUNA ekle:

```ts
// Otomatik Excel yükleme log'u (Power Automate → /api/ingest)
export const otomatikYuklemeLog = pgTable("otomatik_yukleme_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tip: text("tip").notNull(),                       // "mizan" | "beyanname"
  dosyaAdi: text("dosya_adi").notNull(),
  durum: text("durum").notNull(),                   // "basarili" | "atlandi" | "hata"
  kayitSayisi: integer("kayit_sayisi").notNull().default(0),
  mesaj: text("mesaj"),
  zaman: text("zaman").notNull(),                   // yerel "YYYY-MM-DD HH:mm:ss"
});

export const insertOtomatikYuklemeLogSchema = createInsertSchema(otomatikYuklemeLog).omit({ id: true });
export type InsertOtomatikYuklemeLog = z.infer<typeof insertOtomatikYuklemeLogSchema>;
export type OtomatikYuklemeLog = typeof otomatikYuklemeLog.$inferSelect;
```

- [ ] **Step 2: storage.ts import'una tipleri ekle**

`server/storage.ts` içindeki `@shared/schema` import bloğuna ekle: `otomatikYuklemeLog`, `type InsertOtomatikYuklemeLog`, `type OtomatikYuklemeLog`. (Mevcut `mizanYuklemeleri`, `InsertMizanYukleme` importlarının yanına.)

- [ ] **Step 3: IStorage interface'ine 2 imza ekle**

`server/storage.ts` IStorage interface'inde (mizan imzalarının yakınına, ~363) ekle:

```ts
  insertOtomatikYuklemeLog(data: InsertOtomatikYuklemeLog): Promise<OtomatikYuklemeLog>;
  getOtomatikYuklemeLoglar(tip: string | null, limit: number): Promise<OtomatikYuklemeLog[]>;
```

- [ ] **Step 4: DatabaseStorage impl ekle**

`server/storage.ts` DatabaseStorage sınıfında (`insertMizanYukleme` impl'inin yakınına, ~3200) ekle:

```ts
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
```

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: PASS (hata yok). Hata varsa import/isim uyumsuzluğunu düzelt.

- [ ] **Step 6: DB'ye push (DEV hedefi doğrulanmış olmalı)**

Önce DB hedefini doğrula:
Run (PowerShell): `Select-String -Path .env -Pattern "DATABASE_URL"`
Expected: DEV Neon URL'i görünmeli (canlı VPS tüneli `localhost:5433` DEĞİL). Canlıysa DURDUR, .env'i dev'e çevir.

Sonra:
Run: `npm run db:push`
Expected: "Changes applied" — `otomatik_yukleme_log` tablosu oluşur.

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(otomasyon): otomatik_yukleme_log tablosu + storage metotlari"
```

---

### Task 2: `processMizanBuffer()` çıkarımı (mizan kayıt mantığı refactor)

**Files:**
- Modify: `server/routes.ts` (top-level fonksiyon ekle; `/api/tahsilat/mizan/save` ~1805-1942 refactor)

**Interfaces:**
- Consumes: `storage.getMizanByMd5`, `storage.insertMizanYukleme`, `storage.insertMizanBakiyeBatch`, `parseMizanXlsx`, `netBakiye`, `benzerlikSkoru`, `ESLESME_AUTO_ESIK`, `ESLESME_ONERI_ESIK` (hepsi routes.ts'de zaten import).
- Produces:
  - `processMizanBuffer(buffer: Buffer, filename: string, opts?: { mizanTarihi?: string | null; not?: string | null; overrideDuplicate?: boolean }): Promise<{ mizanId: string; eklenenMusteri: number; guncellenenMusteri: number; eklenenBakiye: number; kayitSayisi: number }>`
  - `class MizanMukerrerHata extends Error { duplicateId: string }`
  - `class MizanBosHata extends Error {}`

- [ ] **Step 1: Hata sınıfları + `processMizanBuffer` fonksiyonunu ekle**

`server/routes.ts` içinde, multer tanımlarından sonra ve `registerRoutes`'tan önce (top-level) ekle. Fonksiyon gövdesi mevcut `/save` mantığından TAŞINIR (parse → dedup → arşiv → insertMizanYukleme → müşteri upsert döngüsü → bakiye batch):

```ts
class MizanMukerrerHata extends Error {
  constructor(public duplicateId: string) {
    super("Aynı dosya daha önce yüklenmiş");
  }
}
class MizanBosHata extends Error {}

async function processMizanBuffer(
  buffer: Buffer,
  filename: string,
  opts: { mizanTarihi?: string | null; not?: string | null; overrideDuplicate?: boolean } = {},
): Promise<{ mizanId: string; eklenenMusteri: number; guncellenenMusteri: number; eklenenBakiye: number; kayitSayisi: number }> {
  const md5 = createHash("md5").update(buffer).digest("hex");
  if (!opts.overrideDuplicate) {
    const dup = await storage.getMizanByMd5(md5);
    if (dup) throw new MizanMukerrerHata(dup.id);
  }

  const parsed = parseMizanXlsx(buffer, filename);
  if (parsed.satirlar.length === 0) {
    throw new MizanBosHata("Mizan'da 120- ile başlayan satır bulunamadı");
  }

  const mizanTarihi = opts.mizanTarihi || parsed.mizanTarihi || new Date().toISOString().slice(0, 10);
  const not = opts.not ?? null;

  // Filesystem arşivi
  const yil = mizanTarihi.slice(0, 4);
  const ay = mizanTarihi.slice(5, 7);
  const safeName = filename.replace(/[\\/:*?"<>|]/g, "_");
  const archiveDir = path.join(process.cwd(), "uploads", "mizan", yil, ay);
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  const filepath = path.join(archiveDir, `${md5}-${safeName}`);
  await fs.promises.writeFile(filepath, buffer);

  const toplamNetBakiye = parsed.satirlar.reduce(
    (acc, r) => acc + netBakiye({ sonBakiye: r.sonBakiye, sonBakiyeBA: r.sonBakiyeBA }),
    0,
  );

  const mizan = await storage.insertMizanYukleme({
    mizanTarihi,
    filename,
    filepath,
    sizeBytes: buffer.length,
    md5Hash: md5,
    kayitSayisi: parsed.satirlar.length,
    toplamNetBakiye: String(toplamNetBakiye),
    not,
  });

  let eklenenMusteri = 0;
  let guncellenenMusteri = 0;
  const bakiyeBatch: InsertMizanBakiye[] = [];
  const gumrukUnvanlar = await storage.getDistinctGumrukUnvanlar();

  for (const r of parsed.satirlar) {
    let musteri = await storage.getMusteriByHesapKodu(r.hesapKodu);
    if (!musteri) {
      let gumrukEslesen: string | null = null;
      let gumrukEslesenSkor = 0;
      const oneriler: { unvan: string; skor: number }[] = [];
      for (const u of gumrukUnvanlar) {
        const s = benzerlikSkoru(r.hesapAdi, u);
        if (s >= ESLESME_AUTO_ESIK && !gumrukEslesen) {
          gumrukEslesen = u;
          gumrukEslesenSkor = s;
        } else if (s >= ESLESME_ONERI_ESIK && s < ESLESME_AUTO_ESIK) {
          oneriler.push({ unvan: u, skor: s });
        }
      }
      musteri = await storage.insertMusteri({
        hesapKodu: r.hesapKodu,
        ad: r.hesapAdi,
        sektor: r.sektor,
        firmaGrubu: r.firmaGrubu,
        limitTutar: r.limitTutar != null ? String(r.limitTutar) : null,
        problemli: r.problemli,
        gumrukFirmaUnvanlari: gumrukEslesen ? [gumrukEslesen] : [],
        sonGoruldugu: new Date(),
      } as any);
      if (gumrukEslesen) {
        await storage.insertEslestirmeLog({
          musteriId: musteri.id,
          gumrukUnvan: gumrukEslesen,
          eklemeTipi: "auto-fuzzy",
          benzerlikSkoru: gumrukEslesenSkor.toFixed(3),
        });
      }
      for (const o of oneriler.slice(0, 5)) {
        await storage.insertEslestirmeOneri({
          musteriId: musteri.id,
          gumrukUnvan: o.unvan,
          benzerlikSkoru: String(o.skor.toFixed(3)),
        });
      }
      eklenenMusteri++;
    } else {
      await storage.updateMusteri(musteri.id, {
        ad: r.hesapAdi,
        sektor: r.sektor,
        firmaGrubu: r.firmaGrubu,
        limitTutar: r.limitTutar != null ? String(r.limitTutar) : null,
        problemli: r.problemli,
        sonGoruldugu: new Date(),
      } as any);
      guncellenenMusteri++;
    }

    bakiyeBatch.push({
      mizanId: mizan.id,
      musteriId: musteri.id,
      borc: String(r.borc),
      alacak: String(r.alacak),
      bakiyeBorc: String(r.bakiyeBorc),
      bakiyeAlacak: String(r.bakiyeAlacak),
      sonBakiye: String(r.sonBakiye),
      sonBakiyeBA: r.sonBakiyeBA,
      sonBorcTarihi: r.sonBorcTarihi,
      sonAlacakTarihi: r.sonAlacakTarihi,
    });
  }

  const eklenenBakiye = await storage.insertMizanBakiyeBatch(bakiyeBatch);

  return {
    mizanId: mizan.id,
    eklenenMusteri,
    guncellenenMusteri,
    eklenenBakiye,
    kayitSayisi: parsed.satirlar.length,
  };
}
```

> NOT: `InsertMizanBakiye` tipi routes.ts'de zaten import (satır ~1854 kullanımı). Değilse `@shared/schema` importuna ekle.

- [ ] **Step 2: `/api/tahsilat/mizan/save` endpoint'ini fonksiyona bağla**

`server/routes.ts` içindeki mevcut `/save` handler gövdesini (satır ~1805-1942) şununla DEĞİŞTİR (dış imza aynı kalır):

```ts
  app.post("/api/tahsilat/mizan/save", uploadMizanMemory.single("xlsx"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Dosya gönderilmedi" });
      const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
      const overrideDuplicate = req.body.overrideDuplicate === "true";
      const sonuc = await processMizanBuffer(req.file.buffer, filename, {
        mizanTarihi: (req.body.mizanTarihi as string) || null,
        not: (req.body.not as string) || null,
        overrideDuplicate,
      });
      res.json({ success: true, ...sonuc });
    } catch (e: any) {
      if (e instanceof MizanMukerrerHata) {
        return res.status(409).json({ error: e.message, duplicateId: e.duplicateId });
      }
      if (e instanceof MizanBosHata) {
        return res.status(400).json({ error: e.message });
      }
      console.error("Mizan save hatası:", e);
      res.status(500).json({ error: e.message });
    }
  });
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Elle mizan yükleme regresyonu (gerçek dosya)**

Dev sunucuyu başlat (`npm run dev`). Tarayıcıda `/tahsilat` → mevcut mizan yükleme akışıyla gerçek bir mizan Excel'i yükle (önizle → onayla).
Expected: Yükleme başarılı, müşteri/bakiye sayıları önceki davranışla aynı; aynı dosyayı tekrar yüklemeyi dene → "Aynı dosya daha önce yüklenmiş" (409) uyarısı.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "refactor(tahsilat): mizan kayit mantigini processMizanBuffer'a cikar (davranis korunur)"
```

---

### Task 3: `requireIngestToken` middleware + `POST /api/ingest/:tip`

**Files:**
- Modify: `server/routes.ts` (crypto import ~159; express type import ~190; middleware + route; `.env.example`)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `processMizanBuffer` (Task 2), `parseBeyannameWorkbook`, `storage.upsertBeyannameler`, `storage.insertOtomatikYuklemeLog` (Task 1).
- Produces: `POST /api/ingest/:tip` endpoint; `requireIngestToken` middleware; `zamanDamgasi()` yardımcı.

- [ ] **Step 1: crypto ve express tip importlarını genişlet**

`server/routes.ts`:
- Satır 159: `import { createHash } from "crypto";` → `import { createHash, timingSafeEqual } from "crypto";`
- Satır 190: `import type { Request } from "express";` → `import type { Request, Response, NextFunction } from "express";`

- [ ] **Step 2: Zaman damgası yardımcısı + middleware ekle**

`server/routes.ts` top-level (registerRoutes'tan önce) ekle:

```ts
// Yerel "YYYY-MM-DD HH:mm:ss" (log zamanı) — new Date() display yönlendirmesi yok
function zamanDamgasi(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Otomatik alım token doğrulaması — fail-closed (env yoksa 503)
function requireIngestToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) return res.status(503).json({ error: "Otomatik alım devre dışı" });
  const got = req.header("x-ingest-token") || "";
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(expected).digest();
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Yetkisiz" });
  }
  next();
}
```

- [ ] **Step 3: `POST /api/ingest/:tip` endpoint'ini ekle**

`server/routes.ts` içinde `registerRoutes` gövdesinde (mizan uçlarının yakınına) ekle. **Route-scoped `express.raw`** kullanılır — global body parser etkilenmez:

```ts
  app.post(
    "/api/ingest/:tip",
    requireIngestToken,
    express.raw({ type: "application/octet-stream", limit: "25mb" }),
    async (req, res) => {
      const tip = req.params.tip;
      const dosyaAdi = (req.header("x-dosya-adi") || (req.query.dosya as string) || `ingest-${Date.now()}.xlsx`).toString();
      const buffer = req.body as Buffer;

      if (tip !== "mizan" && tip !== "beyanname") {
        return res.status(400).json({ error: "Geçersiz tip (mizan | beyanname)" });
      }
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        return res.status(400).json({ error: "Boş gövde — dosya gönderilmedi" });
      }

      try {
        if (tip === "mizan") {
          try {
            const sonuc = await processMizanBuffer(buffer, dosyaAdi, { overrideDuplicate: false });
            const mesaj = `${sonuc.kayitSayisi} kayıt, ${sonuc.eklenenMusteri} yeni müşteri`;
            await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "basarili", kayitSayisi: sonuc.kayitSayisi, mesaj, zaman: zamanDamgasi() });
            return res.json({ durum: "basarili", tip, kayitSayisi: sonuc.kayitSayisi, mesaj });
          } catch (e: any) {
            if (e instanceof MizanMukerrerHata) {
              await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "atlandi", kayitSayisi: 0, mesaj: "Aynı dosya daha önce yüklendi", zaman: zamanDamgasi() });
              return res.json({ durum: "atlandi", mesaj: "Aynı dosya daha önce yüklendi" });
            }
            throw e;
          }
        } else {
          const { rows } = parseBeyannameWorkbook(buffer);
          if (!rows.length) throw new Error("Excel'de veri satırı bulunamadı");
          const sonuc = await storage.upsertBeyannameler(rows);
          const mesaj = `${rows.length} satır (${sonuc.eklenen} yeni, ${sonuc.guncellenen} güncellendi)`;
          await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "basarili", kayitSayisi: rows.length, mesaj, zaman: zamanDamgasi() });
          return res.json({ durum: "basarili", tip, kayitSayisi: rows.length, mesaj });
        }
      } catch (e: any) {
        await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "hata", kayitSayisi: 0, mesaj: (e.message || "Bilinmeyen hata").slice(0, 500), zaman: zamanDamgasi() });
        return res.status(400).json({ durum: "hata", error: e.message || "İşlenemedi" });
      }
    },
  );
```

> NOT: `parseBeyannameWorkbook` routes.ts'de zaten import (satır ~4547 kullanımı). Değilse importa ekle.

- [ ] **Step 4: `.env.example`'a INGEST_TOKEN ekle**

`.env.example` sonuna:

```
# Power Automate otomatik Excel alımı için paylaşılan gizli token (uzun rastgele değer).
# Tanımsızsa /api/ingest endpoint'i 503 döner (fail-closed).
INGEST_TOKEN=degistir-uzun-rastgele-bir-deger
```

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Çalışma-zamanı doğrulaması (dev)**

Dev `.env`'ine geçici `INGEST_TOKEN=test123` ekle, `npm run dev` başlat. PowerShell'de gerçek örnek dosyalarla:

```powershell
$h = @{ "X-Ingest-Token" = "test123"; "X-Dosya-Adi" = "mizan-test.xlsx" }
# Başarı:
Invoke-RestMethod -Uri "http://localhost:5000/api/ingest/mizan" -Method Post -InFile ".\ornek-mizan.xlsx" -ContentType "application/octet-stream" -Headers $h
# → { durum = "basarili"; kayitSayisi = N }
# Mükerrer (aynı dosya tekrar):
Invoke-RestMethod -Uri "http://localhost:5000/api/ingest/mizan" -Method Post -InFile ".\ornek-mizan.xlsx" -ContentType "application/octet-stream" -Headers $h
# → { durum = "atlandi" }
# Yanlış token (401):
try { Invoke-RestMethod -Uri "http://localhost:5000/api/ingest/mizan" -Method Post -InFile ".\ornek-mizan.xlsx" -ContentType "application/octet-stream" -Headers @{ "X-Ingest-Token"="yanlis" } } catch { $_.Exception.Response.StatusCode }
# → Unauthorized (401)
# Beyanname başarı:
$h2 = @{ "X-Ingest-Token" = "test123"; "X-Dosya-Adi" = "beyanname-test.xlsx" }
Invoke-RestMethod -Uri "http://localhost:5000/api/ingest/beyanname" -Method Post -InFile ".\ornek-beyanname.xlsx" -ContentType "application/octet-stream" -Headers $h2
# → { durum = "basarili" }
```
Expected: yukarıdaki dönüşler. Ayrıca `INGEST_TOKEN`'ı kaldırıp restart → herhangi bir çağrı `503`.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts .env.example
git commit -m "feat(otomasyon): token korumali POST /api/ingest/:tip (mizan + beyanname) + log"
```

---

### Task 4: Görünürlük — GET log endpoint + UI durum rozeti

**Files:**
- Modify: `server/routes.ts` (`GET /api/otomatik-yukleme/log`)
- Modify: `client/src/pages/Tahsilat.tsx`
- Modify: `client/src/pages/Odemeler.tsx`

**Interfaces:**
- Consumes: `storage.getOtomatikYuklemeLoglar` (Task 1).
- Produces: `GET /api/otomatik-yukleme/log?tip=&limit=`; UI'da `OtomatikYuklemeRozeti` (her sayfada inline).

- [ ] **Step 1: GET log endpoint'i ekle**

`server/routes.ts` `registerRoutes` içinde (ingest ucunun yakınına):

```ts
  app.get("/api/otomatik-yukleme/log", async (req, res) => {
    try {
      const tip = (req.query.tip as string) || null;
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      const loglar = await storage.getOtomatikYuklemeLoglar(tip, limit);
      res.json(loglar);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
```

- [ ] **Step 2: Tahsilat.tsx'e mizan rozeti ekle**

`client/src/pages/Tahsilat.tsx` içinde, mevcut `useQuery` importu ve `mizanList` sorgusunun yanına ekle:

```tsx
  const { data: otoLog } = useQuery<Array<{ id: string; durum: string; kayitSayisi: number; mesaj: string | null; zaman: string; dosyaAdi: string }>>({
    queryKey: ["/api/otomatik-yukleme/log?tip=mizan&limit=5"],
  });
```

Mizan yükleme bölümünün üstüne, JSX içinde bir durum kartı ekle (mevcut shadcn Card/Badge kalıbıyla):

```tsx
  {otoLog && otoLog.length > 0 && (
    <div className="rounded-md border p-3 text-sm space-y-1" data-testid="oto-yukleme-mizan">
      <div className="font-medium">
        Son otomatik yükleme:{" "}
        {otoLog[0].zaman.slice(8, 10)}/{otoLog[0].zaman.slice(5, 7)}/{otoLog[0].zaman.slice(0, 4)}{" "}
        {otoLog[0].zaman.slice(11, 16)}
        {" — "}
        <span className={
          otoLog[0].durum === "hata" ? "text-red-600"
          : otoLog[0].durum === "atlandi" ? "text-muted-foreground"
          : "text-green-600"
        }>
          {otoLog[0].mesaj || otoLog[0].durum}
        </span>
      </div>
      <ul className="text-xs text-muted-foreground">
        {otoLog.slice(1).map((l) => (
          <li key={l.id}>
            {l.zaman.slice(11, 16)} · {l.dosyaAdi} · {l.durum}
          </li>
        ))}
      </ul>
    </div>
  )}
```

> Tarih `dd/mm/yyyy` string-slice ile üretilir — `new Date()` yönlendirmesi YOK (timezone güvenliği).

- [ ] **Step 3: Odemeler.tsx'e beyanname rozeti ekle**

`client/src/pages/Odemeler.tsx` içine aynı deseni ekle, yalnız `queryKey` `?tip=beyanname&limit=5` ve `data-testid="oto-yukleme-beyanname"`. (Task 4 Step 2'deki JSX'in birebir aynısı, sadece testid ve queryKey farklı — kopyala.)

```tsx
  const { data: otoLogBeyanname } = useQuery<Array<{ id: string; durum: string; kayitSayisi: number; mesaj: string | null; zaman: string; dosyaAdi: string }>>({
    queryKey: ["/api/otomatik-yukleme/log?tip=beyanname&limit=5"],
  });
```
JSX bloğu: Step 2'deki kartın `otoLog` → `otoLogBeyanname`, `data-testid="oto-yukleme-beyanname"` değiştirilmiş hali; beyanname yükleme bölümünün üstüne yerleştir.

- [ ] **Step 4: Tip kontrolü**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: UI doğrulaması (dev)**

`npm run dev` çalışırken (Task 3'te log kayıtları oluşmuş olmalı) `/tahsilat` ve `/odemeler` sayfalarını aç.
Expected: "Son otomatik yükleme: dd/mm/yyyy HH:mm — N kayıt" kartı görünür; atlandı gri, hata kırmızı, başarı yeşil.

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts client/src/pages/Tahsilat.tsx client/src/pages/Odemeler.tsx
git commit -m "feat(otomasyon): otomatik yukleme log GET ucu + Tahsilat/Odemeler durum rozeti"
```

---

### Task 5: Deploy + Power Automate kurulum notu

**Files:**
- Create: `docs/superpowers/plans/2026-07-11-otomatik-excel-yukleme-deploy.md`

**Interfaces:**
- Consumes: Task 1-4 (canlıya alınacak).
- Produces: deploy checklist + Power Automate akış dokümanı (kullanıcı uygular).

- [ ] **Step 1: Deploy + kurulum dokümanını yaz**

`docs/superpowers/plans/2026-07-11-otomatik-excel-yukleme-deploy.md` oluştur:

```markdown
# Otomatik Excel Yükleme — Deploy & Power Automate Kurulumu

## VPS ön koşulları (push ÖNCESİ)
1. VPS'e SSH: `ssh root@167.235.252.49`
2. `.env`'e `INGEST_TOKEN=<uzun-rastgele>` ekle (yedek: `.env.yedek-YYYYMMDD`).
   Değer üret: `openssl rand -hex 24`
3. Token'ı bir yere kaydet (Power Automate'e aynısı girilecek).

## Deploy (push = deploy)
1. Lokal `main`'de Task 1-4 commit'leri hazır.
2. `git push` → GitHub Actions: db:push → build → pm2 restart.
3. Deploy sonrası canlı DB'de tabloyu doğrula (yeşil ≠ migration):
   `psql $DATABASE_URL -c "\d otomatik_yukleme_log"`
4. Canlı smoke test (gerçek küçük dosya):
   `Invoke-RestMethod -Uri "https://cncgumruk.space/api/ingest/mizan" -Method Post -InFile mizan.xlsx -ContentType application/octet-stream -Headers @{ "X-Ingest-Token"="<token>"; "X-Dosya-Adi"="mizan.xlsx" }`
   → `{ durum: "basarili" }`. Token'sız → 401; (env varsa) → 200/atlandi.

## Power Automate Desktop akışı (her tür için bir akış)
1. **Tetikleyici:** "Dosya oluşturuldu" — izlenen klasör (ör. `C:\Otomasyon\Mizan\`).
2. **Wait:** dosya kilidi açılana kadar kısa bekleme.
3. **Run PowerShell script:**
   ```powershell
   $token = "<INGEST_TOKEN>"
   $file  = "%FileToProcess%"
   $name  = [System.IO.Path]::GetFileName($file)
   Invoke-RestMethod -Uri "https://cncgumruk.space/api/ingest/mizan" `
     -Method Post -InFile $file -ContentType "application/octet-stream" `
     -Headers @{ "X-Ingest-Token" = $token; "X-Dosya-Adi" = $name }
   ```
   (Beyanname akışında URL `.../api/ingest/beyanname` ve klasör `C:\Otomasyon\Beyanname\`.)
4. **Başarı sonrası:** dosyayı `İşlenenler\` alt klasörüne taşı (yeniden tetiklemeyi önle).
5. **Doğrulama:** klasöre bir dosya bırak → `/tahsilat` veya `/odemeler`'de "Son otomatik yükleme" rozetinin güncellendiğini gör.

## Sorun giderme
- 503 → VPS `.env`'de INGEST_TOKEN yok/yanlış yüklenmiş (pm2 restart gerekebilir).
- 401 → Power Automate'teki token ile VPS token'ı uyuşmuyor.
- 400 → dosya formatı beklenenden farklı; rozet listesinde "hata" satırı + mesaj görünür.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-11-otomatik-excel-yukleme-deploy.md
git commit -m "docs(otomasyon): deploy + Power Automate kurulum notu"
```

- [ ] **Step 3: Kullanıcı onayıyla canlıya alma**

`git push` (deploy tetikler) — **yalnız kullanıcı onayıyla**. Push öncesi VPS'e `INGEST_TOKEN` eklendiğini teyit et. Push sonrası deploy dokümanındaki smoke test'i çalıştır.

---

## Self-Review (yazım sonrası)

**Spec coverage:** spec §4.1 requireIngestToken → Task 3; §4.2 ingest endpoint → Task 3; §4.3 processMizanBuffer → Task 2; §4.4 tablo → Task 1; §4.5 storage → Task 1; §4.6 GET log → Task 4; §4.7 UI rozet → Task 4; §5 sözleşme → Task 3; §6 güvenlik/deploy → Task 3 + Task 5; §7 Power Automate → Task 5; §8 test → her görevin doğrulama adımları. Tüm bölümler kapsandı.

**Placeholder scan:** `<INGEST_TOKEN>`, `<uzun-rastgele>`, `%FileToProcess%` bilinçli secret/PA değişkenleri; TBD/TODO yok. Doğrulama adımları gerçek komut + beklenen çıktı içerir.

**Type consistency:** `processMizanBuffer` dönüş tipi Task 2'de tanımlı, Task 3'te `sonuc.kayitSayisi`/`sonuc.eklenenMusteri` ile tutarlı kullanılıyor. `insertOtomatikYuklemeLog`/`getOtomatikYuklemeLoglar` imzaları Task 1 ↔ Task 3/4 tutarlı. `MizanMukerrerHata.duplicateId` Task 2 ↔ Task 2 /save + Task 3 tutarlı. Log alan adları (`durum`/`kayitSayisi`/`mesaj`/`zaman`/`dosyaAdi`) şema ↔ storage ↔ route ↔ UI tutarlı.
