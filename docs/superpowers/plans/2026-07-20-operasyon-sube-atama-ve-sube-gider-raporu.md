# Operasyon Şube Atama + Şube Gider Raporu — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operasyon (şube) kullanıcılarına şube atamak, her masrafa şubeyi snapshot olarak işlemek ve muhasebeye şube bazlı gider kırılımı sunmak.

**Architecture:** Yeni tablo yok — mevcut `subeler` sabit listesi kanonik şube kaynağıdır. `portal_kullanicilar.sube` kullanıcının güncel şubesini, `operasyon_masraflar.sube` kayıt anındaki şubenin snapshot'ını tutar. Şube yalnız bir etiket ve raporlama boyutudur; hiçbir görünürlük filtresi uygulamaz. Muhasebe tarafında mevcut "Şube Masraf" ekranı şube başlıkları altında gruplanır ve yeni bir "Şube Raporu" sekmesi tarih aralıklı kırılım + Excel sunar.

**Tech Stack:** Express (ESM, tsx) · Drizzle ORM (pg, `db:push`) · React 18 + Vite + wouter + TanStack Query · shadcn/ui · xlsx

**Spec:** [docs/superpowers/specs/2026-07-20-operasyon-sube-atama-ve-sube-gider-raporu-design.md](../specs/2026-07-20-operasyon-sube-atama-ve-sube-gider-raporu-design.md)

## Global Constraints

Her görevin gereksinimleri bu bölümü kapsar.

- **Şube kaynağı:** `shared/schema.ts` içindeki mevcut `subeler` sabit dizisi. **Yeni şube tablosu YOK.**
- **Şube bir görünürlük filtresi DEĞİLDİR.** `GET /api/portal/beyannameler` **hiç değişmez** — operasyon kullanıcısı TÜM beyannameleri görmeye devam eder (Operasyon Kasası spec §9 kararı).
- **Masrafa şube SNAPSHOT olarak yazılır**, sunucuda oturum sahibinden (`ben.sube`) okunur. **İstemciden GELMEZ.**
- **Operasyon rolünde şube ZORUNLU** — hem istemcide hem sunucuda doğrulanır. Rol operasyon dışına çevrilirse `sube` null'a çekilir.
- **Avanslara şube EKLENMEZ.** Avans para girişidir, gider değildir.
- **Boş değerler gizlenmez:** `sube = null` → `"Şube atanmamış"`, `masrafTuru = null` → `"Belirtilmemiş"`. Toplamlara dahildirler.
- **Kullanıcısı/masrafı olmayan şube gösterilmez** — başlıklar sabit listeden değil, mevcut veriden türetilir.
- **Tarih karşılaştırması** `text` `YYYY-MM-DD` üzerinde string olarak yapılır. Depolanan tarihleri `new Date(...)` ile PARSE ETME (timezone kaymaları off-by-one hatalara yol açtı, commit `c897dff`).
- **Rapor ucu iki segmentlidir:** `/api/portal/operasyon-takip/rapor/sube`. Tek segmentli isim (`/sube-raporu`) mevcut `/:operasyonId` ile çakışır.
- **Şema değişikliği eklemelidir** (2 nullable kolon). `db:push` çalıştırılır; **`--force` ASLA kullanılmaz**; silme sorusu çıkarsa DURULUR ve raporlanır.
- **DEV DB izolasyonu:** her yazma testinden önce `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true` olmalı. Değilse DUR ve raporla. (Paralel bir oturum `.env`'i canlı prod tüneline çevirebiliyor.)
- **git add YALNIZ açık dosya yollarıyla.** `git add -A` / `git add .` **ASLA** — ağaçta bu dala ait olmayan değişiklikler ve `uploads/`, `*.xlsx`, `.env*` dosyaları var.
- **`git push` YAPILMAZ** — push bu repoda otomatik deploy tetikler. Push kararı kullanıcıdadır.
- **Türkçe kaynak dosyalarını PowerShell `Set-Content` ile yeniden YAZMA.** Edit tool ile nokta düzenleme yap; `tsc` bozuk Türkçe karakteri yakalamaz. Her görevde U+FFFD taraması yapılır.
- Mevcut testid'ler korunur; masraf kaydetme doğrulama mantığı (belge zorunlu, ofis masrafında açıklama zorunlu) değişmez.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `shared/schema.ts` | 2 kolon + rapor tipleri | T1 |
| `server/storage.ts` | `masrafKaydet` şube alanı, `getSubeGiderRaporu`, `subeGiderRaporuExcel` | T1 |
| `server/routes.ts` (kullanıcı CRUD) | POST doğrulama + PUT beyaz listesi | T2 |
| `client/src/pages/Odemeler.tsx` | Şube Select + liste kolonu | T3 |
| `server/routes.ts` (operasyon) | masraf snapshot + takip listesine `sube` | T4 |
| `client/src/pages/portal/OperasyonTakipSayfasi.tsx` | Şube-merkezli gruplama | T5 |
| `server/routes.ts` (rapor) + `SubeRaporuSayfasi.tsx` + `PortalSidebar.tsx` + `PortalApp.tsx` | Şube Raporu ekranı | T6 |
| — | Uçtan uca doğrulama | T7 |

---

### Task 1: Şema kolonları + storage (rapor sorgusu dahil)

**Files:**
- Modify: `shared/schema.ts` (`portalKullanicilar` ~963-973, `operasyonMasraflar` ~1128-1145, rapor tipleri ~1164 civarı)
- Modify: `server/storage.ts` (import satırı 40, `IStorage` 414-428, `masrafKaydet` ~3820, yeni metotlar)

**Interfaces:**
- Consumes: yok (ilk görev)
- Produces:
  - `portalKullanicilar.sube` (nullable text), `operasyonMasraflar.sube` (nullable text)
  - `PortalKullanici.sube: string | null`, `OperasyonMasraf.sube: string | null` (drizzle `$inferSelect` ile otomatik)
  - `InsertPortalKullanici` artık `sube?: string | null` taşır (`createInsertSchema` tablodan türer)
  - `export type SubeGiderSatiri = { masrafTuru: string; adet: number; tutar: number }`
  - `export type SubeGiderBloku = { sube: string; toplam: number; turler: SubeGiderSatiri[] }`
  - `export type SubeGiderRaporu = { subeler: SubeGiderBloku[]; genelToplam: number }`
  - `storage.masrafKaydet(d)` — `d` artık `sube: string | null` alanı içerir (ZORUNLU alan, çağıran vermeli)
  - `storage.getSubeGiderRaporu(baslangic: string, bitis: string): Promise<SubeGiderRaporu>`
  - `storage.subeGiderRaporuExcel(baslangic: string, bitis: string): Promise<Buffer>`

- [ ] **Step 1: `portalKullanicilar`'a şube kolonu ekle**

`shared/schema.ts` içinde `portalKullanicilar` tanımında `avAdi` satırının ALTINA ekle:

```ts
  sube: text("sube"), // Şube (yalnız rol='operasyon' için anlamlı; `subeler` listesinden). Nullable — operasyon dışı roller ve eski satırlar için.
```

- [ ] **Step 2: `operasyonMasraflar`'a şube kolonu ekle**

`shared/schema.ts` içinde `operasyonMasraflar` tanımında `masrafTuru` satırının ALTINA ekle:

```ts
  sube: text("sube"), // Kayıt anındaki şube SNAPSHOT'ı — kullanıcının güncel şubesinden TÜRETİLMEZ (geçmiş sabit kalır)
```

- [ ] **Step 3: Rapor tiplerini ekle**

`shared/schema.ts` içinde `export type OperasyonGunKapanis = typeof operasyonGunKapanis.$inferSelect;` satırının ALTINA ekle:

```ts
// Şube gider raporu — türetilmiş tipler (tablo DEĞİL, /api/portal/operasyon-takip/rapor/sube dönüşü)
export type SubeGiderSatiri = { masrafTuru: string; adet: number; tutar: number };
export type SubeGiderBloku = { sube: string; toplam: number; turler: SubeGiderSatiri[] };
export type SubeGiderRaporu = { subeler: SubeGiderBloku[]; genelToplam: number };
```

- [ ] **Step 4: storage'da `gte`/`lte` operatörlerini içe aktar**

`server/storage.ts` satır 40'taki import'u genişlet (`gte, lte` EKLENİR, mevcutlar korunur):

```ts
import { eq, and, sql, inArray, desc, isNotNull, or, asc, ne, count, notInArray, gte, lte } from "drizzle-orm";
```

- [ ] **Step 5: `IStorage` imzalarını güncelle**

`server/storage.ts` içinde `IStorage` arayüzünde `masrafKaydet` satırını (satır ~420) şununla DEĞİŞTİR ve altına 2 yeni satır EKLE:

```ts
  masrafKaydet(d: { operasyonId: string; beyannameId: string | null; dosyaYok: boolean; masrafTuru: string | null; sube: string | null; tutar: number; alacakli: string; iban: string | null; aciklama: string | null; tarih: string; belgeDosya: string; belgeAdi: string }): Promise<OperasyonMasraf>;
  getSubeGiderRaporu(baslangic: string, bitis: string): Promise<SubeGiderRaporu>;
  subeGiderRaporuExcel(baslangic: string, bitis: string): Promise<Buffer>;
```

`SubeGiderRaporu` tipini `server/storage.ts`'in `@shared/schema` import listesine ekle (dosyanın başındaki mevcut `import { ... } from "@shared/schema";` bloğuna `SubeGiderRaporu`, `SubeGiderBloku` isimlerini ekle).

- [ ] **Step 6: `masrafKaydet` implementasyonuna şubeyi ekle**

`server/storage.ts` içindeki `async masrafKaydet(...)` gövdesini şununla DEĞİŞTİR:

```ts
  async masrafKaydet(d: { operasyonId: string; beyannameId: string | null; dosyaYok: boolean; masrafTuru: string | null; sube: string | null; tutar: number; alacakli: string; iban: string | null; aciklama: string | null; tarih: string; belgeDosya: string; belgeAdi: string }): Promise<OperasyonMasraf> {
    const [yeni] = await db.insert(operasyonMasraflar).values({
      operasyonId: d.operasyonId, beyannameId: d.beyannameId, dosyaYok: d.dosyaYok,
      masrafTuru: d.masrafTuru, sube: d.sube, tutar: d.tutar.toFixed(2), alacakli: d.alacakli, iban: d.iban,
      aciklama: d.aciklama, tarih: d.tarih, belgeDosya: d.belgeDosya, belgeAdi: d.belgeAdi,
    }).returning();
    return yeni;
  }
```

- [ ] **Step 7: `getSubeGiderRaporu` implementasyonu**

`server/storage.ts` içinde `masrafKaydet`'in hemen ALTINA ekle:

```ts
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
```

- [ ] **Step 8: `subeGiderRaporuExcel` implementasyonu**

`server/storage.ts` içinde `getSubeGiderRaporu`'nun hemen ALTINA ekle (mevcut `firmaIbanlariExcelSablonu` kalıbı):

```ts
  async subeGiderRaporuExcel(baslangic: string, bitis: string): Promise<Buffer> {
    const rapor = await this.getSubeGiderRaporu(baslangic, bitis);
    const aoa: (string | number)[][] = [["Şube", "Masraf Türü", "Adet", "Tutar (TL)"]];
    for (const b of rapor.subeler) {
      for (const t of b.turler) aoa.push([b.sube, t.masrafTuru, t.adet, t.tutar]);
      aoa.push([b.sube, "ŞUBE TOPLAMI", "", b.toplam]);
    }
    aoa.push(["", "GENEL TOPLAM", "", rapor.genelToplam]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Şube Gider");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }
```

- [ ] **Step 9: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata. (`masrafKaydet` çağıranı `server/routes.ts` henüz `sube` göndermediği için **hata bekleniyor** — bu beklenen: T4 düzeltecek. Bu görevde geçici olarak çağıran tarafa `sube: null` eklenerek tsc yeşile alınır; T4 onu `ben.sube ?? null` yapacak.)

`server/routes.ts` içindeki `storage.masrafKaydet({ ... })` çağrısına geçici olarak ekle (masrafTuru satırının altına):

```ts
        sube: null, // T4'te ben.sube ?? null olacak
```

Sonra tekrar Run: `npm run check` → 0 hata.

- [ ] **Step 10: DB hedefini doğrula ve şemayı it**

Run:
```bash
node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"
```
Expected: `DEV_NEON: true`. **`false` ise DUR ve raporla — hiçbir şey yazma.**

Run: `npm run db:push`
Expected: `[✓] Changes applied`, **silme sorusu ÇIKMAMALI** (eklemeli değişiklik). Silme sorusu çıkarsa iptal et (`--force` KULLANMA), DUR ve raporla.

Kolonları doğrula:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select table_name,column_name from information_schema.columns where column_name='sube' and table_name in ('portal_kullanicilar','operasyon_masraflar') order by table_name\").then(r=>{console.log(r.rows);process.exit(0)})"
```
Expected: iki satır — `operasyon_masraflar/sube` ve `portal_kullanicilar/sube`.

- [ ] **Step 11: Storage duman testi**

Proje KÖKÜNDE `smoke-sube.ts` oluştur (bu dosya COMMIT EDİLMEZ, testten sonra silinir):

```ts
import "dotenv/config";
import { storage } from "./server/storage";
import { db } from "./server/db";
import { portalKullanicilar, operasyonMasraflar } from "./shared/schema";
import { eq } from "drizzle-orm";

const esit = (ad: string, gercek: unknown, beklenen: unknown) => {
  const ok = JSON.stringify(gercek) === JSON.stringify(beklenen);
  console.log(`${ok ? "✓" : "✗"} ${ad}${ok ? "" : ` — beklenen ${JSON.stringify(beklenen)}, gelen ${JSON.stringify(gercek)}`}`);
  if (!ok) process.exitCode = 1;
};

(async () => {
  // Temizlik (önceki koşudan kalıntı)
  const eski = await db.select().from(portalKullanicilar).where(eq(portalKullanicilar.kullaniciAdi, "SMOKESUBE"));
  for (const k of eski) {
    await db.delete(operasyonMasraflar).where(eq(operasyonMasraflar.operasyonId, k.id));
    await db.delete(portalKullanicilar).where(eq(portalKullanicilar.id, k.id));
  }

  const k = await storage.createPortalKullanici({
    kullaniciAdi: "SMOKESUBE", sifreHash: "x:y", adSoyad: "Smoke Şube",
    rol: "operasyon", avAdi: null, sube: "Gemlik", aktif: true,
  });
  esit("kullanici sube kaydedildi", k.sube, "Gemlik");

  const m1 = await storage.masrafKaydet({
    operasyonId: k.id, beyannameId: null, dosyaYok: true, masrafTuru: "Benzin",
    sube: "Gemlik", tutar: 500, alacakli: "Petrol", iban: null, aciklama: "smoke",
    tarih: "2026-07-15", belgeDosya: "uploads/smoke.pdf", belgeAdi: "smoke.pdf",
  });
  esit("masraf sube snapshot", m1.sube, "Gemlik");

  await storage.masrafKaydet({
    operasyonId: k.id, beyannameId: null, dosyaYok: true, masrafTuru: "Benzin",
    sube: "Gemlik", tutar: 300, alacakli: "Petrol", iban: null, aciklama: "smoke",
    tarih: "2026-07-16", belgeDosya: "uploads/smoke.pdf", belgeAdi: "smoke.pdf",
  });
  await storage.masrafKaydet({
    operasyonId: k.id, beyannameId: null, dosyaYok: true, masrafTuru: null,
    sube: null, tutar: 100, alacakli: "Bilinmeyen", iban: null, aciklama: "smoke",
    tarih: "2026-07-16", belgeDosya: "uploads/smoke.pdf", belgeAdi: "smoke.pdf",
  });
  // Aralık DIŞI kayıt — raporda görünmemeli
  await storage.masrafKaydet({
    operasyonId: k.id, beyannameId: null, dosyaYok: true, masrafTuru: "Benzin",
    sube: "Gemlik", tutar: 999, alacakli: "Petrol", iban: null, aciklama: "smoke",
    tarih: "2026-08-01", belgeDosya: "uploads/smoke.pdf", belgeAdi: "smoke.pdf",
  });

  const r = await storage.getSubeGiderRaporu("2026-07-01", "2026-07-31");
  const gemlik = r.subeler.find((b) => b.sube === "Gemlik");
  const atanmamis = r.subeler.find((b) => b.sube === "Şube atanmamış");
  esit("Gemlik toplami (500+300, 999 haric)", gemlik?.toplam, 800);
  esit("Gemlik Benzin adedi", gemlik?.turler.find((t) => t.masrafTuru === "Benzin")?.adet, 2);
  esit("null sube -> Sube atanmamis", atanmamis?.toplam, 100);
  esit("null tur -> Belirtilmemis", atanmamis?.turler[0]?.masrafTuru, "Belirtilmemiş");
  esit("genel toplam", r.genelToplam, 900);
  esit("sube sirasi tutar azalan", r.subeler.map((b) => b.sube), ["Gemlik", "Şube atanmamış"]);

  const buf = await storage.subeGiderRaporuExcel("2026-07-01", "2026-07-31");
  esit("excel buffer uretildi", buf.length > 100, true);

  // Temizlik
  await db.delete(operasyonMasraflar).where(eq(operasyonMasraflar.operasyonId, k.id));
  await db.delete(portalKullanicilar).where(eq(portalKullanicilar.id, k.id));
  const kalan = await db.select().from(portalKullanicilar).where(eq(portalKullanicilar.kullaniciAdi, "SMOKESUBE"));
  esit("temizlik tamam", kalan.length, 0);
  process.exit(process.exitCode ?? 0);
})();
```

Run: `npx tsx smoke-sube.ts`
Expected: 10 satırın hepsi `✓`, çıkış kodu 0.

Sonra sil: `rm smoke-sube.ts`

- [ ] **Step 12: U+FFFD taraması ve commit**

Run:
```bash
node -e "['shared/schema.ts','server/storage.ts'].forEach(f=>console.log(f, require('fs').readFileSync(f,'utf8').includes('�')))"
```
Expected: her iki satır da `false`.

```bash
git add shared/schema.ts server/storage.ts server/routes.ts
git status
git commit -m "feat(operasyon): sube kolonlari + sube gider raporu storage sorgusu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
`git status` çıktısında YALNIZ bu 3 dosya staged olmalı.

---

### Task 2: Kullanıcı uçlarında şube (POST doğrulama + PUT beyaz listesi)

**Files:**
- Modify: `server/routes.ts` (`POST /api/odemeler/kullanicilar` ~4744-4765, `PUT /api/odemeler/kullanicilar/:id` ~4767-4791)

**Interfaces:**
- Consumes: T1'in `portalKullanicilar.sube` kolonu ve `InsertPortalKullanici.sube` alanı
- Produces: `POST /api/odemeler/kullanicilar` gövdesi `sube` kabul eder; `PUT /api/odemeler/kullanicilar/:id` gövdesi `sube` kabul eder. Her iki uç da `rol==='operasyon'` iken boş şubede **400** döner.

**KRİTİK ASİMETRİ:** `insertPortalKullaniciSchema` tablodan türediği için (`createInsertSchema`) POST'taki `parse` çağrısı `sube`'yi **otomatik** kabul eder ve `...parsed` ile storage'a iletir — POST'a alan iletimi için kod eklemeye gerek YOK, yalnız doğrulama+normalizasyon eklenir. PUT ise **elle yazılmış beyaz liste** kullanır; `sube` oraya açıkça eklenmezse **hata vermeden sessizce düşer** (aynı sınıf hata F1.11'de yaşandı: POST/PUT eski IBAN alanlarını iletmiyordu → firma eklenirken 0 IBAN).

- [ ] **Step 1: POST ucuna şube doğrulaması + normalizasyonu**

`server/routes.ts` içinde `POST /api/odemeler/kullanicilar` gövdesinde, rol whitelist kontrolünün HEMEN ALTINA ekle:

```ts
      if (parsed.rol === "operasyon" && !String(parsed.sube ?? "").trim()) {
        return res.status(400).json({ error: "Operasyon kullanıcısı için şube zorunlu" });
      }
```

Ve aynı handler'daki `storage.createPortalKullanici({...})` çağrısına `avAdi` satırının ALTINA ekle:

```ts
        sube: parsed.rol === "operasyon" ? String(parsed.sube).trim() : null,
```

- [ ] **Step 2: PUT beyaz listesine şubeyi ekle**

`server/routes.ts` içinde `PUT /api/odemeler/kullanicilar/:id` gövdesinde, `aktif` kontrolünün (`if (typeof req.body?.aktif === "boolean") ...`) HEMEN ALTINA ekle:

```ts
      // Şube — beyaz listeye AÇIKÇA eklenmezse sessizce düşer.
      if (req.body?.sube !== undefined) {
        izinli.sube = req.body.sube ? String(req.body.sube).trim() : null;
      }
      // Rol operasyon dışına çevrildiyse şube temizlenir.
      if (izinli.rol && izinli.rol !== "operasyon") izinli.sube = null;
      // Operasyona çevriliyorsa şube zorunlu (istemci her zaman birlikte gönderir).
      if (izinli.rol === "operasyon" && !String(izinli.sube ?? "").trim()) {
        return res.status(400).json({ error: "Operasyon kullanıcısı için şube zorunlu" });
      }
```

**Not:** Yalnız `{aktif:true}` gönderen mevcut Switch akışında `izinli.rol` ve `izinli.sube` `undefined` kalır → hiçbir dal tetiklenmez, davranış değişmez.

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 4: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 5: Uç duman testi (curl)**

Dev sunucu çalışmıyorsa `npm run dev` ile başlat (arka planda, port 5000).

```bash
# 1) Şubesiz operasyon -> 400
curl -s -X POST localhost:5000/api/odemeler/kullanicilar -H "Content-Type: application/json" \
  -d '{"kullaniciAdi":"SUBETEST","adSoyad":"Sube Test","rol":"operasyon","sifre":"1234"}'
# Beklenen: {"error":"Operasyon kullanıcısı için şube zorunlu"}

# 2) Şubeli operasyon -> 200 + sube görünür
curl -s -X POST localhost:5000/api/odemeler/kullanicilar -H "Content-Type: application/json" \
  -d '{"kullaniciAdi":"SUBETEST","adSoyad":"Sube Test","rol":"operasyon","sube":"Gemlik","sifre":"1234"}'
# Beklenen: {"id":"...","sube":"Gemlik",...}

# 3) PUT ile şube değiştir -> KALICI (sessiz düşme yok)
ID=$(curl -s localhost:5000/api/odemeler/kullanicilar | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).find(k=>k.kullaniciAdi==='SUBETEST').id))")
curl -s -X PUT localhost:5000/api/odemeler/kullanicilar/$ID -H "Content-Type: application/json" \
  -d '{"adSoyad":"Sube Test","rol":"operasyon","sube":"Muratbey"}'
# Beklenen: {"sube":"Muratbey",...}
curl -s localhost:5000/api/odemeler/kullanicilar | grep -o '"sube":"Muratbey"'
# Beklenen: "sube":"Muratbey"  (GET'te de kalıcı)

# 4) Rol temsilciye çevrilince şube null'a çekilir
curl -s -X PUT localhost:5000/api/odemeler/kullanicilar/$ID -H "Content-Type: application/json" \
  -d '{"adSoyad":"Sube Test","rol":"temsilci"}'
# Beklenen: {"rol":"temsilci","sube":null,...}

# 5) Sadece aktif gönderimi eski davranışı bozmaz
curl -s -X PUT localhost:5000/api/odemeler/kullanicilar/$ID -H "Content-Type: application/json" -d '{"aktif":false}'
# Beklenen: 200, {"aktif":false,...} (hata YOK)

# Temizlik
curl -s -X DELETE localhost:5000/api/odemeler/kullanicilar/$ID
curl -s localhost:5000/api/odemeler/kullanicilar | grep -c SUBETEST
# Beklenen: 0
```

DELETE ucu yoksa temizliği doğrudan DB'den yap:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"delete from portal_kullanicilar where kullanici_adi='SUBETEST'\").then(r=>{console.log('silinen',r.rowCount);process.exit(0)})"
```

Tüm 5 senaryo beklendiği gibi geçmeli. Geçmezse kodu "geçsin diye" değiştirme — gerçek hatayı raporla.

- [ ] **Step 6: U+FFFD taraması ve commit**

Run: `node -e "console.log(require('fs').readFileSync('server/routes.ts','utf8').includes('�'))"`
Expected: `false`

```bash
git add server/routes.ts
git status
git commit -m "feat(operasyon): kullanici uclarinda sube (POST dogrulama + PUT beyaz listesi)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Admin kullanıcı formunda şube seçimi

**Files:**
- Modify: `client/src/pages/Odemeler.tsx` (import satır 4, `KullaniciFormDialog` 120-230, `Kullanicilar` tablosu 262-296)

**Interfaces:**
- Consumes: T1'in `PortalKullanici.sube` alanı (`KullaniciGoruntu = Omit<PortalKullanici,"sifreHash">` otomatik taşır); T2'nin POST/PUT `sube` desteği; `subeler` sabit dizisi
- Produces: testid `select-kullanici-sube` (Şube Select tetikleyicisi)

- [ ] **Step 1: `subeler` listesini içe aktar**

`client/src/pages/Odemeler.tsx` satır 4'ü DEĞİŞTİR:

```ts
import { subeler, type MasrafTuru, type PortalKullanici } from "@shared/schema";
```

- [ ] **Step 2: Form state'ine şubeyi ekle**

`KullaniciFormDialog` içinde `const [avAdi, setAvAdi] = useState(k?.avAdi ?? "");` satırının ALTINA ekle:

```ts
  const [sube, setSube] = useState(k?.sube ?? "");
```

- [ ] **Step 3: Kaydetmede şube doğrulaması + gönderimi**

`kaydet` fonksiyonunun EN BAŞINA (`setGonderiliyor(true);` satırının ÖNÜNE) ekle:

```ts
    if (rol === "operasyon" && !sube.trim()) {
      toast({ title: "Operasyon kullanıcısı için şube seçin", variant: "destructive" });
      return;
    }
```

POST gövdesinde `avAdi` satırının ALTINA ekle:

```ts
            sube: rol === "operasyon" ? sube : null,
```

PUT gövdesinde `avAdi` satırının ALTINA ekle:

```ts
            sube: rol === "operasyon" ? sube : null,
```

- [ ] **Step 4: Şube Select'i forma ekle**

`KullaniciFormDialog` JSX'inde Rol + AV Adı'nı içeren `<div className="grid grid-cols-2 gap-4">` bloğunun KAPANIŞINDAN (`</div>`) hemen SONRA, şifre alanının ÖNÜNE ekle:

```tsx
          {rol === "operasyon" && (
            <div className="space-y-2">
              <Label>Şube</Label>
              <Select value={sube} onValueChange={setSube}>
                <SelectTrigger data-testid="select-kullanici-sube"><SelectValue placeholder="Şube seçin" /></SelectTrigger>
                <SelectContent>
                  {subeler.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`select-item-sube-${s}`}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
```

- [ ] **Step 5: Kullanıcı listesine Şube kolonu**

`Kullanicilar` bileşeninde tablo başlığında `<TableHead>AV Adı</TableHead>` satırının ALTINA ekle:

```tsx
              <TableHead>Şube</TableHead>
```

Ve satır gövdesinde `<TableCell>{k.avAdi ?? "—"}</TableCell>` satırının ALTINA ekle:

```tsx
                <TableCell>{k.sube ?? "—"}</TableCell>
```

- [ ] **Step 6: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 7: Playwright doğrulaması**

Dev sunucu 5000'de çalışmalı. DB hedefini doğrula (`DEV_NEON: true`), sonra scratchpad'de bir Playwright betiği ile:

1. `http://localhost:5000/odemeler` aç (yönetim paneli parola kapısı varsa geç), "Kullanıcılar" sekmesine git (`tab-odemeler-kullanicilar`).
2. `button-yeni-kullanici` tıkla.
3. Rol Select'i "Müşteri Temsilcisi"nde bırak → **`select-kullanici-sube` GÖRÜNMEMELİ**.
4. Rol'ü "Operasyon" yap → **`select-kullanici-sube` GÖRÜNMELİ**.
5. Şube seçmeden `button-kullanici-kaydet` → "Operasyon kullanıcısı için şube seçin" uyarısı, kayıt OLUŞMAMALI.
6. Kullanıcı adı `SUBEUI`, Ad Soyad `Sube UI`, Şube `Gemlik`, şifre `1234` → Kaydet → başarı.
7. Listede `SUBEUI` satırında Şube kolonunda `Gemlik` görünmeli.
8. Düzenle → Şube `Muratbey` → Kaydet → listede `Muratbey` (PUT sessiz düşme YOK).
9. Düzenle → Rol `Müşteri Temsilcisi` → Kaydet → Şube kolonu `—`.

Sonuçları raporla. Başarısızlıkta kodu değiştirme, gerçek hatayı bildir.

**Temizlik:** `SUBEUI` kullanıcısını dev DB'den sil:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"delete from portal_kullanicilar where kullanici_adi='SUBEUI'\").then(r=>{console.log('silinen',r.rowCount);process.exit(0)})"
```

- [ ] **Step 8: U+FFFD taraması ve commit**

Run: `node -e "console.log(require('fs').readFileSync('client/src/pages/Odemeler.tsx','utf8').includes('�'))"`
Expected: `false`

```bash
git add client/src/pages/Odemeler.tsx
git status
git commit -m "feat(operasyon): admin formunda sube secimi (yalniz operasyon rolu, zorunlu)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Masrafa şube snapshot'ı + takip listesine şube

**Files:**
- Modify: `server/routes.ts` (`POST /api/portal/operasyon/masraf` ~5355-5386, `GET /api/portal/operasyon-takip` ~5419-5431)

**Interfaces:**
- Consumes: T1'in `storage.masrafKaydet` `sube` alanı ve `PortalKullanici.sube`
- Produces: `GET /api/portal/operasyon-takip` dönüşündeki her satır artık `sube: string | null` taşır (T5 bunu tüketir)

- [ ] **Step 1: Masraf kaydında şubeyi sunucudan al**

`server/routes.ts` içindeki `POST /api/portal/operasyon/masraf` handler'ında, `storage.masrafKaydet({...})` çağrısındaki T1'de eklenen geçici `sube: null,` satırını şununla DEĞİŞTİR:

```ts
        sube: ben.sube ?? null, // SNAPSHOT — istemciden GELMEZ, oturum sahibinden okunur
```

**Doğrulama mantığı DEĞİŞMEZ** — belge zorunlu, ofis masrafında açıklama zorunlu, `dosyaYok`/`beyannameId` dalları aynen kalır.

- [ ] **Step 2: Takip listesine şubeyi ekle**

`server/routes.ts` içindeki `GET /api/portal/operasyon-takip` handler'ında `return { id: k.id, adSoyad: ... }` ifadesini şununla DEĞİŞTİR:

```ts
        return { id: k.id, adSoyad: k.adSoyad, kullaniciAdi: k.kullaniciAdi, sube: k.sube ?? null, bakiye, bugunHarcanan: Math.round(bugunHarcanan * 100) / 100 };
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 4: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 5: Snapshot duman testi**

Dev sunucu 5000'de çalışmalı. Scratchpad'de bir Node betiğiyle:

1. `POST /api/odemeler/kullanicilar` → `{kullaniciAdi:"SNAPTEST", adSoyad:"Snap Test", rol:"operasyon", sube:"Gemlik", sifre:"1234"}`.
2. `POST /api/portal/login` `{kullaniciAdi:"SNAPTEST", sifre:"1234"}` → cookie sakla.
3. `POST /api/portal/operasyon/masraf` (multipart: `belge` = küçük bir dummy dosya, `dosyaYok=true`, `masrafTuru=Benzin`, `tutar=250`, `alacakli=Petrol`, `aciklama=snap`) → 200.
4. Dönen masraf satırında **`sube === "Gemlik"`** olduğunu doğrula.
5. `PUT /api/odemeler/kullanicilar/{id}` ile kullanıcının şubesini `Muratbey` yap.
6. Adım 3-4'teki masrafı DB'den yeniden oku → **`sube` HÂLÂ `"Gemlik"`** olmalı (snapshot geçmişi dondurur, kullanıcıdan türetilmiyor).
7. Muhasebe kullanıcısıyla giriş yap → `GET /api/portal/operasyon-takip` → SNAPTEST satırında `sube === "Muratbey"` (canlı bakiye listesi GÜNCEL şubeyi gösterir).

Beklenen: 7/7 doğrulama geçer. Adım 6 en kritik olanıdır — snapshot ile türetilmiş arasındaki farkı kanıtlar.

**Temizlik:** SNAPTEST kullanıcısı, masrafları ve yüklenen belge dosyası silinir:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{const r=await p.query(\"select id from portal_kullanicilar where kullanici_adi='SNAPTEST'\");for(const row of r.rows){await p.query('delete from operasyon_masraflar where operasyon_id=\$1',[row.id]);await p.query('delete from portal_kullanicilar where id=\$1',[row.id]);}console.log('temizlendi',r.rows.length);process.exit(0)})()"
```
`uploads/operasyon/` altındaki test belgesini de sil.

- [ ] **Step 6: U+FFFD taraması ve commit**

Run: `node -e "console.log(require('fs').readFileSync('server/routes.ts','utf8').includes('�'))"`
Expected: `false`

```bash
git add server/routes.ts
git status
git commit -m "feat(operasyon): masrafa sube snapshot + takip listesinde sube

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: "Şube Masraf" ekranında şube-merkezli gruplama

**Files:**
- Modify: `client/src/pages/portal/OperasyonTakipSayfasi.tsx` (satır 1, 14, 71-84)

**Interfaces:**
- Consumes: T4'ün `GET /api/portal/operasyon-takip` dönüşündeki `sube` alanı; `subeler` sabit dizisi
- Produces: testid `grup-sube-<şube adı>` (grup bloğu), `grup-sube-toplam-<şube adı>` (şube toplam bakiyesi)

- [ ] **Step 1: `useMemo` ve `subeler` içe aktarımları**

`client/src/pages/portal/OperasyonTakipSayfasi.tsx` satır 1'i DEĞİŞTİR:

```ts
import { useMemo, useState } from "react";
```

Satır 4'teki tip import'unun ALTINA ekle:

```ts
import { subeler } from "@shared/schema";
```

- [ ] **Step 2: `Satir` tipine şubeyi ekle**

Satır 14'ü DEĞİŞTİR:

```ts
type Satir = { id: string; adSoyad: string; kullaniciAdi: string; sube: string | null; bakiye: number; bugunHarcanan: number };
```

- [ ] **Step 3: Gruplama hesabı**

`const [secili, setSecili] = useState<Satir | null>(null);` satırının ÖNÜNE ekle:

```ts
  // Şube başlıkları MEVCUT KULLANICILARDAN türetilir — sabit listeden değil (boş şube bloğu gösterilmez).
  const gruplar = useMemo(() => {
    const harita = new Map<string, Satir[]>();
    for (const s of liste) {
      const ad = s.sube ?? "Şube atanmamış";
      const g = harita.get(ad);
      if (g) g.push(s); else harita.set(ad, [s]);
    }
    const sira = (ad: string) => {
      const i = (subeler as readonly string[]).indexOf(ad);
      return i === -1 ? subeler.length : i;
    };
    return Array.from(harita.entries())
      .map(([sube, satirlar]) => ({
        sube,
        satirlar,
        toplam: Math.round(satirlar.reduce((t, s) => t + s.bakiye, 0) * 100) / 100,
      }))
      .sort((a, b) => sira(a.sube) - sira(b.sube) || a.sube.localeCompare(b.sube, "tr"));
  }, [liste]);
```

- [ ] **Step 4: Listeyi gruplu render et**

"Şube Bakiyeleri" kartının `<CardContent className="space-y-2">` içindeki mevcut bloğu — yani

```tsx
          {liste.length === 0 && <p className="text-sm text-muted-foreground">Operasyon kullanıcısı yok.</p>}
          {liste.map((s) => (
            ...
          ))}
```

— şununla DEĞİŞTİR (kullanıcı satırı işaretlemesi ve MEVCUT TESTID'LER birebir korunur):

```tsx
          {gruplar.length === 0 && <p className="text-sm text-muted-foreground">Operasyon kullanıcısı yok.</p>}
          {gruplar.map((g) => (
            <div key={g.sube} className="space-y-2" data-testid={`grup-sube-${g.sube}`}>
              <div className="flex items-center justify-between border-b pb-1">
                <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.sube}</span>
                <span className="text-sm font-bold" data-testid={`grup-sube-toplam-${g.sube}`}>{formatPara(g.toplam, "TL")}</span>
              </div>
              {g.satirlar.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid={`sube-${s.id}`}>
                  <div>
                    <div className="font-medium">{s.adSoyad}</div>
                    <div className="text-xs text-muted-foreground">Bugün harcanan: {formatPara(s.bugunHarcanan, "TL")}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-lg font-bold ${s.bakiye < 0 ? "text-destructive" : ""}`} data-testid={`sube-bakiye-${s.id}`}>{formatPara(s.bakiye, "TL")}</div>
                    <Button size="sm" onClick={() => { setSecili(s); setAvansDialog(true); }} data-testid={`button-avans-${s.id}`}>Avans Yükle</Button>
                    <Button size="sm" variant="outline" onClick={() => setSecili(s)} data-testid={`button-detay-${s.id}`}>Detay</Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
```

**Detay kartı, avans dialog'u ve "Geri Aç" akışı HİÇ DEĞİŞMEZ.**

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 6: Playwright doğrulaması**

DB hedefini doğrula (`DEV_NEON: true`). Scratchpad betiğiyle:

1. API ile iki operasyon kullanıcısı oluştur: `GRPA` (şube `Gemlik`), `GRPB` (şube `Muratbey`); ayrıca `GRPC` (şube olmadan oluşturulamaz — bunun yerine `GRPB`'yi oluşturduktan sonra PUT ile şubesini boşaltmayı DENEME; "Şube atanmamış" grubunu doğrulamak için doğrudan DB'de `update portal_kullanicilar set sube=null where kullanici_adi='GRPC'` ile bir operasyon kullanıcısı hazırla).
2. Muhasebe kullanıcısıyla portala gir, `/portal/sube-masraf` aç.
3. `grup-sube-Gemlik`, `grup-sube-Muratbey` ve `grup-sube-Şube atanmamış` blokları görünmeli.
4. Her kullanıcı satırı kendi grubunun İÇİNDE olmalı (`grup-sube-Gemlik` içinde `sube-{GRPA.id}`).
5. Muhasebeden `GRPA`'ya 1000 TL avans yükle → `grup-sube-toplam-Gemlik` `1.000,00 TL` göstermeli.
6. Mevcut testid'ler çalışmaya devam etmeli: `button-avans-{id}`, `button-detay-{id}`, `sube-bakiye-{id}`.
7. `Detay` tıkla → detay kartı eskisi gibi açılmalı (regresyon yok).

**Temizlik:** GRPA/GRPB/GRPC kullanıcıları, avansları ve masrafları dev DB'den silinir; silindiğini doğrula.

- [ ] **Step 7: U+FFFD taraması ve commit**

Run: `node -e "console.log(require('fs').readFileSync('client/src/pages/portal/OperasyonTakipSayfasi.tsx','utf8').includes('�'))"`
Expected: `false`

```bash
git add client/src/pages/portal/OperasyonTakipSayfasi.tsx
git status
git commit -m "feat(operasyon): Sube Masraf ekraninda sube-merkezli gruplama

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Şube Raporu — uçlar + sayfa + menü/rota

**Files:**
- Modify: `server/routes.ts` (rapor uçları; `GET /api/portal/operasyon-takip/:operasyonId` tanımının ÖNÜNE eklenir)
- Create: `client/src/pages/portal/SubeRaporuSayfasi.tsx`
- Modify: `client/src/pages/portal/PortalSidebar.tsx` (`MUHASEBE_MENU` ~26-32, icon import ~8)
- Modify: `client/src/pages/portal/PortalApp.tsx` (import ~16, Route ~104-106)

**Interfaces:**
- Consumes: T1'in `storage.getSubeGiderRaporu` / `storage.subeGiderRaporuExcel` ve `SubeGiderRaporu` tipi
- Produces: `GET /api/portal/operasyon-takip/rapor/sube`, `GET /api/portal/operasyon-takip/rapor/sube/excel`; rota `/portal/sube-raporu`; testid'ler `input-rapor-baslangic`, `input-rapor-bitis`, `button-sube-rapor-excel`, `text-rapor-genel-toplam`, `text-rapor-bos`, `rapor-sube-<ad>`, `rapor-sube-toplam-<ad>`

**ROTA SIRASI NOTU:** Uç adı **iki segmentlidir** (`rapor/sube`), bu yüzden tek segmentlik `/:operasyonId` ile çakışması **yapısal olarak imkânsızdır**. Yine de okunabilirlik için rapor uçlarını `/:operasyonId` tanımının ÖNÜNE koy.

- [ ] **Step 1: Rapor uçlarını ekle**

`server/routes.ts` içinde `app.get("/api/portal/operasyon-takip/:operasyonId", ...)` tanımının HEMEN ÖNÜNE ekle:

```ts
  // Şube gider raporu — İKİ SEGMENTLİ yol (rapor/sube): tek segmentlik /:operasyonId ile çakışmaz.
  const raporAraligi = (req: any): { baslangic: string; bitis: string } | null => {
    const baslangic = String(req.query?.baslangic ?? "");
    const bitis = String(req.query?.bitis ?? "");
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymd.test(baslangic) || !ymd.test(bitis)) return null;
    return { baslangic, bitis };
  };

  app.get("/api/portal/operasyon-takip/rapor/sube", requireMuhasebe, async (req, res) => {
    try {
      const aralik = raporAraligi(req);
      if (!aralik) return res.status(400).json({ error: "baslangic ve bitis YYYY-MM-DD olmalı" });
      res.json(await storage.getSubeGiderRaporu(aralik.baslangic, aralik.bitis));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/portal/operasyon-takip/rapor/sube/excel", requireMuhasebe, async (req, res) => {
    try {
      const aralik = raporAraligi(req);
      if (!aralik) return res.status(400).json({ error: "baslangic ve bitis YYYY-MM-DD olmalı" });
      const buf = await storage.subeGiderRaporuExcel(aralik.baslangic, aralik.bitis);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="sube-gider-${aralik.baslangic}_${aralik.bitis}.xlsx"`);
      res.end(buf);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
```

- [ ] **Step 2: Şube Raporu sayfasını oluştur**

`client/src/pages/portal/SubeRaporuSayfasi.tsx` dosyasını OLUŞTUR:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SubeGiderRaporu } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatPara } from "./portalUtils";

// YEREL bileşenlerden YYYY-MM-DD üretir. Depolanan tarih string'ini PARSE ETMEZ
// (new Date("2026-07-01") UTC yorumlanıp timezone kayması yaratır — bu fonksiyonlar o riski taşımaz).
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ayBasi(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function SubeRaporuSayfasi() {
  const [baslangic, setBaslangic] = useState(ayBasi());
  const [bitis, setBitis] = useState(ymd(new Date()));

  const { data, isLoading } = useQuery<SubeGiderRaporu>({
    queryKey: [`/api/portal/operasyon-takip/rapor/sube?baslangic=${baslangic}&bitis=${bitis}`],
  });

  const excelIndir = () => {
    window.location.href = `/api/portal/operasyon-takip/rapor/sube/excel?baslangic=${baslangic}&bitis=${bitis}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Şube Gider Raporu</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Başlangıç</Label>
              <Input type="date" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} data-testid="input-rapor-baslangic" />
            </div>
            <div className="space-y-1">
              <Label>Bitiş</Label>
              <Input type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} data-testid="input-rapor-bitis" />
            </div>
            <Button variant="outline" onClick={excelIndir} data-testid="button-sube-rapor-excel">Excel İndir</Button>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Yükleniyor…</p>}
          {!isLoading && (data?.subeler.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="text-rapor-bos">Seçilen aralıkta masraf yok.</p>
          )}

          {data?.subeler.map((b) => (
            <div key={b.sube} className="rounded-md border p-3 space-y-1" data-testid={`rapor-sube-${b.sube}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{b.sube}</span>
                <span className="font-bold" data-testid={`rapor-sube-toplam-${b.sube}`}>{formatPara(b.toplam, "TL")}</span>
              </div>
              <div className="border-t pt-1 space-y-0.5">
                {b.turler.map((t) => (
                  <div key={t.masrafTuru} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t.masrafTuru} · {t.adet} adet</span>
                    <span>{formatPara(t.tutar, "TL")}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {data && data.subeler.length > 0 && (
            <div className="flex items-center justify-between border-t pt-3">
              <span className="font-medium">GENEL TOPLAM</span>
              <span className="text-lg font-bold" data-testid="text-rapor-genel-toplam">{formatPara(data.genelToplam, "TL")}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Menüye ekle**

`client/src/pages/portal/PortalSidebar.tsx` satır 8'deki lucide import'una `BarChart3` EKLE (mevcutlar korunur):

```ts
import { FilePlus2, ListChecks, Inbox, Warehouse, Banknote, Building2, LogOut, Wallet, CalendarCheck, Building, BarChart3 } from "lucide-react";
```

`MUHASEBE_MENU` dizisinde `{ title: "Şube Masraf", ... }` satırının ALTINA ekle:

```ts
  { title: "Şube Raporu", href: "/portal/sube-raporu", icon: BarChart3 },
```

- [ ] **Step 4: Rotayı bağla**

`client/src/pages/portal/PortalApp.tsx` içinde `import OperasyonTakipSayfasi from "./OperasyonTakipSayfasi";` satırının ALTINA ekle:

```ts
import SubeRaporuSayfasi from "./SubeRaporuSayfasi";
```

Ve `<Route path="/portal/sube-masraf" component={OperasyonTakipSayfasi} />` bloğunun (kapanış `)}` dahil) ALTINA ekle:

```tsx
              {me.rol === "muhasebe" && (
                <Route path="/portal/sube-raporu" component={SubeRaporuSayfasi} />
              )}
```

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 6: Uç duman testi**

DB hedefini doğrula (`DEV_NEON: true`). Dev sunucu 5000'de.

```bash
# Auth'suz -> 401 (requireMuhasebe çalışıyor, 404 DEĞİL -> rota kayıtlı)
curl -s -o /dev/null -w "%{http_code}\n" "localhost:5000/api/portal/operasyon-takip/rapor/sube?baslangic=2026-07-01&bitis=2026-07-31"
# Beklenen: 401
curl -s -o /dev/null -w "%{http_code}\n" "localhost:5000/api/portal/operasyon-takip/rapor/sube/excel?baslangic=2026-07-01&bitis=2026-07-31"
# Beklenen: 401
```

Muhasebe oturumuyla (cookie ile):
- Geçerli aralık → 200 + `{subeler:[...], genelToplam:...}` şeklinde JSON.
- `baslangic` eksik → 400 `"baslangic ve bitis YYYY-MM-DD olmalı"`.
- `baslangic=01.07.2026` (yanlış format) → 400.
- `/excel` geçerli aralıkla → 200 + `Content-Type` xlsx + `Content-Disposition: attachment`.
- **Çakışma kontrolü:** `GET /api/portal/operasyon-takip/rapor` (tek segment, var olmayan kullanıcı id'si gibi) → `/:operasyonId` handler'ına düşer ve boş/`bakiye:0` döner; `rapor/sube` ise DOĞRU handler'a gider (JSON'da `genelToplam` alanı var). İkisinin farklı davrandığını göster.

- [ ] **Step 7: Playwright doğrulaması**

1. API ile operasyon kullanıcısı `RPRA` (şube `Gemlik`) oluştur; giriş yap; iki masraf ekle (`Benzin` 500, `Dosya` 300 — belge dosyası zorunlu).
2. Muhasebe ile portala gir → kenar menüde **"Şube Raporu"** görünmeli → tıkla.
3. Varsayılan aralık içinde bulunulan ay olmalı (`input-rapor-baslangic` ayın 01'i).
4. `rapor-sube-Gemlik` bloğu görünmeli; `rapor-sube-toplam-Gemlik` = `800,00 TL`; içinde `Benzin · 1 adet` ve `Dosya · 1 adet` satırları.
5. `text-rapor-genel-toplam` = `800,00 TL`.
6. Tarih aralığını masrafların DIŞINA al (örn. gelecek ay) → `text-rapor-bos` görünmeli ("Seçilen aralıkta masraf yok").
7. `button-sube-rapor-excel` tıkla → indirme 200 dönmeli (ağ yanıtını doğrula).
8. Temsilci rolüyle girildiğinde menüde "Şube Raporu" **GÖRÜNMEMELİ**; `/portal/sube-raporu` adresine gidildiğinde varsayılan rotaya yönlenmeli.

**Temizlik:** `RPRA` kullanıcısı, masrafları ve yüklenen belge dosyaları dev DB'den ve `uploads/operasyon/` altından silinir; silindiğini doğrula.

- [ ] **Step 8: U+FFFD taraması ve commit**

Run:
```bash
node -e "['server/routes.ts','client/src/pages/portal/SubeRaporuSayfasi.tsx','client/src/pages/portal/PortalSidebar.tsx','client/src/pages/portal/PortalApp.tsx'].forEach(f=>console.log(f, require('fs').readFileSync(f,'utf8').includes('�')))"
```
Expected: dört satır da `false`.

```bash
git add server/routes.ts client/src/pages/portal/SubeRaporuSayfasi.tsx client/src/pages/portal/PortalSidebar.tsx client/src/pages/portal/PortalApp.tsx
git status
git commit -m "feat(operasyon): Sube Raporu ekrani + rapor/excel uclari

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Uçtan uca doğrulama + kalite kapıları

**Files:**
- Create (scratchpad): `e2e-sube.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla; "geçsin diye" kod değiştirme.

**Interfaces:**
- Consumes: T1-T6'nın tamamı

- [ ] **Step 1: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 2: Karma E2E senaryosu**

Scratchpad'de `e2e-sube.js` (Playwright chromium + kurulum için API çağrıları). Senaryo:

**Kurulum (API):** admin ucuyla iki operasyon kullanıcısı oluştur — `E2EGEM` (şube `Gemlik`), `E2EMUR` (şube `Muratbey`); her birine muhasebeden 2000 TL avans yükle.

**(A) Admin formu:** `/odemeler` → Kullanıcılar → Yeni Kullanıcı → rol `Müşteri Temsilcisi` iken `select-kullanici-sube` YOK → rol `Operasyon` → Select GÖRÜNÜR → şube seçmeden Kaydet → uyarı, kayıt yok.

**(B) Şube snapshot:** `E2EGEM` ile portala gir → Kasam → Ofis Masrafı işaretle → masraf türü `Benzin` → tutar 500 → alacaklı `Petrol` → açıklama `E2E` → belge yükle → Kaydet. `E2EMUR` ile aynısını yap (tür `Nakliye`, tutar 700).

**(C) Şube Masraf gruplama:** muhasebe ile gir → Şube Masraf → `grup-sube-Gemlik` ve `grup-sube-Muratbey` blokları; her kullanıcı doğru grubun içinde; `grup-sube-toplam-Gemlik` = 1.500,00 TL (2000 avans − 500 masraf).

**(D) Şube Raporu:** menüde "Şube Raporu" → tıkla → `rapor-sube-Gemlik` 500,00 TL (`Benzin · 1 adet`), `rapor-sube-Muratbey` 700,00 TL (`Nakliye · 1 adet`), `text-rapor-genel-toplam` 1.200,00 TL.

**(E) Snapshot kanıtı:** `/odemeler` → `E2EGEM`'i düzenle → şube `Muratbey` → Kaydet. Şube Raporu'nu yenile → **`rapor-sube-Gemlik` HÂLÂ 500,00 TL** (geçmiş taşınmadı). Şube Masraf ekranında ise `E2EGEM` artık `grup-sube-Muratbey` içinde (canlı bakiye güncel şubeyi izler). Bu adım Karar 2'nin (snapshot) tek en önemli kanıtıdır.

**(F) Filtre YOK kanıtı:** `E2EGEM` ile Kasam'da beyanname aramasının hâlâ TÜM dosyaları döndürdüğünü doğrula (şube filtresi uygulanmamalı — Karar 1).

**(G) Excel:** Şube Raporu'nda `button-sube-rapor-excel` → yanıt 200 + xlsx content-type.

**(H) Rol izolasyonu:** temsilci `suleyman` ile gir → menüde "Şube Raporu" YOK.

Her adımın PASS/FAIL sonucunu ve kanıtını (ekran görüntüsü yolu / DOM assert / tutar) raporla.

- [ ] **Step 3: Temizlik**

`E2EGEM`, `E2EMUR` kullanıcıları; avansları; masrafları; yüklenen belge dosyaları (`uploads/operasyon/`) dev DB'den ve diskten silinir. Silindiğini sorguyla doğrula:

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select count(*)::int c from portal_kullanicilar where kullanici_adi like 'E2E%'\").then(r=>{console.log('kalan E2E kullanici:',r.rows[0].c);process.exit(0)})"
```
Expected: `kalan E2E kullanici: 0`

- [ ] **Step 4: Kalite kapıları**

Run: `npm run check`
Expected: 0 hata.

Run: `npm run build`
Expected: hatasız; `dist/` üretilir.

- [ ] **Step 5: Commit (yalnız gerçek bir hata düzeltildiyse)**

Kod değişikliği yapılmadıysa commit YOK. Yapıldıysa yalnız değişen dosyaları açık yolla ekle:

```bash
git add <değişen dosya yolları>
git status
git commit -m "fix(operasyon): <bulunan gercek hatanin ozeti>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notu

**Spec kapsamı:**
- §3 Veri modeli (2 kolon, `subeler` listesi, nullable gerekçesi) → T1 S1-S2
- §4 Admin formu (yalnız operasyon, zorunlu, rol değişince null, liste kolonu, POST/PUT beyaz liste tuzağı) → T2 (sunucu) + T3 (istemci)
- §5 Yazma yolu (sunucu-tarafı snapshot, avansa şube yok, doğrulama değişmez) → T4 S1
- §6 Ekran 1 (şube gruplama, şube toplamı, "Şube atanmamış", sıra, boş şube gösterilmez, detay değişmez) → T5; liste ucuna `sube` → T4 S2
- §7 Ekran 2 (tarih aralığı, kırılım, genel toplam, Excel, boş mesajı, snapshot'tan okuma, null etiketleri) → T1 S7-S8 (sorgu) + T6 (uç + sayfa + menü/rota)
- §8 Uçlar (şekil, 400 doğrulaması, sıralama, Excel kalıbı, rota çakışması) → T1 S7-S8 + T6 S1, S6
- §9 Storage (`masrafKaydet` + `getSubeGiderRaporu`, N+1 yok) → T1 S5-S7
- §11 Doğrulama (check/build, DEV DB izolasyonu, db:push eklemeli, duman testleri, snapshot kanıtı, Playwright, temizlik) → her görevin son adımları + T7

**Tip tutarlılığı:** `sube` alan adı üç katmanda da aynı (`portalKullanicilar.sube`, `operasyonMasraflar.sube`, `Satir.sube`). `SubeGiderRaporu` T1'de tanımlanır, T6'da hem uçta hem sayfada aynı adla tüketilir. `masrafKaydet` imzasındaki `sube: string | null` T1'de tanımlanır ve T4'te `ben.sube ?? null` ile beslenir. `storage.getSubeGiderRaporu(baslangic, bitis)` parametre sırası T1 ve T6'da aynıdır.

**Bilinçli taviz:** T1 Step 9'da `routes.ts`'e geçici `sube: null` eklenir; bu, her görevin tsc-yeşil bitmesi içindir ve T4 Step 1'de gerçek değere çevrilir. T4'ün ilk adımı bu geçici satırı değiştirmektir — atlanırsa masraflara şube HİÇ yazılmaz (sessiz kayıp), bu yüzden T4 incelemesinde açıkça doğrulanmalıdır.

**Kapsam dışı (planda görev YOK, kasıtlı):** beyanname şube filtresi · şube başına ortak kasa · ana panel Giderler/Dashboard entegrasyonu · şube CRUD ekranı · avansa şube · geçmiş veri geri-doldurma (canlıda geçmiş masraf yok) · şube bazlı yetkilendirme.
