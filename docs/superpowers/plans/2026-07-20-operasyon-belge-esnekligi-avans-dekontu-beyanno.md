# Operasyon Kasası: Belge Esnekliği + Avans Dekontu + beyan_no Araması — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operasyon masrafında belge zorunluluğunu masraf türü bazında esnetmek, avansa opsiyonel dekont eklemek ve beyanname aramasını şubelerin kullandığı `beyan_no` ile de çalışır hâle getirmek.

**Architecture:** `masraf_turleri.belge_zorunlu` bayrağı (varsayılan `true`, mevcut davranış korunur) sunucuda tür adından okunur; bayrak `false` olduğunda `operasyon_masraflar.belge_dosya`/`belge_adi` null yazılabilir — bu yüzden iki NOT NULL kısıtı gevşetilir. Avans ucu JSON'dan multipart'a çevrilip mevcut `uploadOperasyonBelge` yazıcısıyla opsiyonel dekont alır. Beyanname araması istemcide olduğu için `beyan_no` filtreye eklenmekle çözülür — sunucu değişmez.

**Tech Stack:** Express (ESM, tsx) · Drizzle ORM (pg, `db:push`) · multer · React 18 + Vite + TanStack Query · shadcn/ui

**Spec:** [docs/superpowers/specs/2026-07-20-operasyon-belge-esnekligi-avans-dekontu-beyanno-design.md](../specs/2026-07-20-operasyon-belge-esnekligi-avans-dekontu-beyanno-design.md)

## Global Constraints

Her görevin gereksinimleri bu bölümü kapsar.

- **Avans dekontu OPSİYONELDİR.** Dekontsuz avans geçerlidir ve 200 döner.
- **`masraf_turleri.belge_zorunlu` varsayılanı `true`** — mevcut hiçbir türün davranışı değişmez.
- **Bayrağı SUNUCU okur** (tür adından `masraf_turleri`'ne bakarak), istemciden gelen bilgiye GÜVENMEZ. **Tür bulunamazsa/boşsa belge ZORUNLU** sayılır (güvenli varsayılan).
- **Belge opsiyonel olduğunda alan GİZLENMEZ**, etiketi "opsiyonel" olur ve yüklenebilir kalır.
- **Masrafın diğer doğrulamaları DEĞİŞMEZ:** tutar, alacaklı, ofis masrafında (`dosyaYok`) açıklama zorunlu, `dosyaYok`/`beyannameId` dalları.
- **beyan_no araması istemcide** yapılır; `/api/portal/beyannameler` ucu ve sunucu tarafı DEĞİŞMEZ. Ek ayrıştırma/normalizasyon YOK — düz `includes` yeterlidir.
- **Şema bu fazda EKLEMELİ DEĞİL:** iki kolonda `NOT NULL → nullable` gevşetmesi var. `drizzle-kit push` bunu `ALTER COLUMN DROP NOT NULL` olarak uygular (veri silmez, onay sorusu üretmez), ama **`--force` ASLA kullanılmaz** ve silme sorusu çıkarsa DURULUR.
- **DEV DB izolasyonu:** her yazma/`db:push` öncesi `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true` olmalı; değilse DUR ve raporla. (Paralel oturum `.env`'i canlı prod tüneline çevirebiliyor.)
- **git add YALNIZ açık dosya yollarıyla.** `git add -A` / `git add .` ASLA — ağaçta bu dala ait olmayan değişiklikler, `uploads/`, `*.xlsx`, `.env*` var.
- **`git push` YAPILMAZ** — push bu repoda otomatik deploy tetikler.
- **Türkçe kaynak dosyalarını PowerShell `Set-Content` ile yeniden YAZMA.** Edit tool ile nokta düzenleme yap; her görevde U+FFFD taraması yapılır.
- Yüklenen dosya adları `fixUploadFilename` ile düzeltilir (multer Latin-1 mojibake'i — Türkçe dosya adları için zorunlu).
- Mevcut testid'ler korunur.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `shared/schema.ts` | 3 kolon ekleme + 2 NOT NULL gevşetme | T1 |
| `server/storage.ts` | `avansYukle`/`masrafKaydet` imzaları, `getMasrafTuruByAd` | T1 |
| `server/routes.ts` (avans ucu) | multipart + opsiyonel dekont | T2 |
| `client/src/pages/portal/OperasyonTakipSayfasi.tsx` + `OperasyonKasaSayfasi.tsx` | dekont yükleme + dekont linki | T3 |
| `server/routes.ts` (masraf + tür PUT) + `client/src/pages/Odemeler.tsx` | belgeZorunlu bayrağı | T4 |
| `client/src/pages/portal/OperasyonKasaSayfasi.tsx` | belge opsiyonelliği + beyan_no araması | T5 |
| — | Uçtan uca doğrulama | T6 |

---

### Task 1: Şema kolonları + kısıt gevşetme + storage imzaları

**Files:**
- Modify: `shared/schema.ts` (`operasyonAvanslar` ~1116-1125, `masrafTurleri` ~1005-1010, `operasyonMasraflar` ~1128-1146)
- Modify: `server/storage.ts` (`IStorage` ~401/420/421, `updateMasrafTuru` ~3513, `avansYukle` ~3815, `masrafKaydet` ~3823)
- Modify: `server/routes.ts` (avans çağrısına GEÇİCİ null'lar)

**Interfaces:**
- Consumes: yok (ilk görev)
- Produces:
  - `operasyonAvanslar.belgeDosya` / `.belgeAdi` (nullable text) → `OperasyonAvans.belgeDosya: string | null`
  - `masrafTurleri.belgeZorunlu` (boolean NOT NULL default true) → `MasrafTuru.belgeZorunlu: boolean`
  - `operasyonMasraflar.belgeDosya` / `.belgeAdi` artık `string | null`
  - `storage.avansYukle(d)` — `d` artık `belgeDosya: string | null; belgeAdi: string | null` içerir (ZORUNLU alanlar, çağıran vermeli)
  - `storage.masrafKaydet(d)` — `belgeDosya`/`belgeAdi` artık `string | null`
  - `storage.getMasrafTuruByAd(ad: string): Promise<MasrafTuru | undefined>` — tr-locale, trim'li, case-insensitive ad eşleşmesi

- [ ] **Step 1: `operasyonAvanslar`'a dekont kolonları**

`shared/schema.ts` içinde `operasyonAvanslar` tanımında `gonderenId` satırının ALTINA ekle:

```ts
  belgeDosya: text("belge_dosya"), // Dekont — OPSİYONEL (elden nakit avansta olmayabilir)
  belgeAdi: text("belge_adi"),
```

- [ ] **Step 2: `masrafTurleri`'ne belge zorunluluk bayrağı**

`shared/schema.ts` içinde `masrafTurleri` tanımında `aktif` satırının ALTINA ekle:

```ts
  belgeZorunlu: boolean("belge_zorunlu").notNull().default(true), // false: DOSYA gibi ayrı fişi olmayan yüksek hacimli türler
```

- [ ] **Step 3: `operasyonMasraflar` belge kısıtlarını gevşet**

`shared/schema.ts` içinde `operasyonMasraflar` tanımındaki iki satırı DEĞİŞTİR (`.notNull()` KALDIRILIR):

```ts
  belgeDosya: text("belge_dosya"), // belgeZorunlu=false türlerde null olabilir
  belgeAdi: text("belge_adi"),
```

- [ ] **Step 4: `IStorage` imzalarını güncelle**

`server/storage.ts` içinde `IStorage` arayüzünde `avansYukle` ve `masrafKaydet` satırlarını şunlarla DEĞİŞTİR:

```ts
  avansYukle(d: { operasyonId: string; tutar: number; aciklama: string | null; tarih: string; gonderenId: string; belgeDosya: string | null; belgeAdi: string | null }): Promise<OperasyonAvans>;
  masrafKaydet(d: { operasyonId: string; beyannameId: string | null; dosyaYok: boolean; masrafTuru: string | null; sube: string | null; tutar: number; alacakli: string; iban: string | null; aciklama: string | null; tarih: string; belgeDosya: string | null; belgeAdi: string | null }): Promise<OperasyonMasraf>;
```

Ve `updateMasrafTuru` bildiriminin ALTINA ekle:

```ts
  getMasrafTuruByAd(ad: string): Promise<MasrafTuru | undefined>;
```

- [ ] **Step 5: `avansYukle` implementasyonu**

`server/storage.ts` içindeki `async avansYukle(...)` gövdesini şununla DEĞİŞTİR:

```ts
  async avansYukle(d: { operasyonId: string; tutar: number; aciklama: string | null; tarih: string; gonderenId: string; belgeDosya: string | null; belgeAdi: string | null }): Promise<OperasyonAvans> {
    const [yeni] = await db.insert(operasyonAvanslar).values({
      operasyonId: d.operasyonId, tutar: d.tutar.toFixed(2), aciklama: d.aciklama,
      tarih: d.tarih, gonderenId: d.gonderenId,
      belgeDosya: d.belgeDosya, belgeAdi: d.belgeAdi,
    }).returning();
    return yeni;
  }
```

- [ ] **Step 6: `masrafKaydet` imzasını gevşet**

`server/storage.ts` içindeki `async masrafKaydet(...)` satırında YALNIZ imzayı değiştir (gövde aynen kalır) — `belgeDosya: string` → `belgeDosya: string | null`, `belgeAdi: string` → `belgeAdi: string | null`:

```ts
  async masrafKaydet(d: { operasyonId: string; beyannameId: string | null; dosyaYok: boolean; masrafTuru: string | null; sube: string | null; tutar: number; alacakli: string; iban: string | null; aciklama: string | null; tarih: string; belgeDosya: string | null; belgeAdi: string | null }): Promise<OperasyonMasraf> {
```

- [ ] **Step 7: `getMasrafTuruByAd` implementasyonu**

`server/storage.ts` içinde `updateMasrafTuru` implementasyonunun hemen ALTINA ekle:

```ts
  // Tür adından bayrak okumak için. tr-locale küçültme: "I/İ" tuzağı nedeniyle toLowerCase() DEĞİL.
  // Kayıt sayısı ~40 olduğundan bellekte eşleştirmek yeterli (POST /api/portal/masraf-turleri dedup kalıbıyla aynı).
  async getMasrafTuruByAd(ad: string): Promise<MasrafTuru | undefined> {
    const norm = (s: string) => s.trim().toLocaleLowerCase("tr");
    const hedef = norm(ad);
    const hepsi = await this.getMasrafTurleri();
    return hepsi.find((t) => norm(t.ad) === hedef);
  }
```

- [ ] **Step 8: Çağıranı geçici olarak derlenir hâle getir**

`avansYukle` imzası iki yeni ZORUNLU alan aldığı için tek çağıranı (`server/routes.ts`) tsc'yi kırar. `server/routes.ts` içindeki `storage.avansYukle({...})` çağrısında `gonderenId: ben.id,` satırının ALTINA GEÇİCİ olarak ekle:

```ts
        belgeDosya: null, belgeAdi: null, // T2'de req.file (dekont) değerinden gelecek
```

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 9: DB hedefini doğrula ve şemayı it**

Run:
```bash
node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"
```
Expected: `DEV_NEON: true`. **`false` ise DUR ve raporla — hiçbir şey yazma.**

Run: `npm run db:push`
Expected: `[✓] Changes applied`. **Silme/veri kaybı sorusu çıkarsa iptal et (`--force` KULLANMA), DUR ve raporla.**

Kolonları ve kısıtları doğrula:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where (table_name='operasyon_avanslar' and column_name in ('belge_dosya','belge_adi')) or (table_name='masraf_turleri' and column_name='belge_zorunlu') or (table_name='operasyon_masraflar' and column_name in ('belge_dosya','belge_adi')) order by table_name,column_name\").then(r=>{console.table(r.rows);process.exit(0)})"
```
Expected: 5 satır.
- `masraf_turleri.belge_zorunlu` → boolean, `is_nullable=NO`, `column_default=true`
- `operasyon_avanslar.belge_dosya` / `belge_adi` → text, `is_nullable=YES`
- **`operasyon_masraflar.belge_dosya` / `belge_adi` → text, `is_nullable=YES`** (kısıt gevşetildi — bu adımın en kritik doğrulaması)

- [ ] **Step 10: Storage duman testi**

Proje KÖKÜNDE `smoke-belge.ts` oluştur (COMMIT EDİLMEZ, testten sonra silinir):

```ts
import "dotenv/config";
import { storage } from "./server/storage";
import { db } from "./server/db";
import { portalKullanicilar, operasyonAvanslar, operasyonMasraflar, masrafTurleri } from "./shared/schema";
import { eq } from "drizzle-orm";

const esit = (ad: string, gercek: unknown, beklenen: unknown) => {
  const ok = JSON.stringify(gercek) === JSON.stringify(beklenen);
  console.log(`${ok ? "✓" : "✗"} ${ad}${ok ? "" : ` — beklenen ${JSON.stringify(beklenen)}, gelen ${JSON.stringify(gercek)}`}`);
  if (!ok) process.exitCode = 1;
};

(async () => {
  // Temizlik (önceki koşudan kalıntı)
  for (const k of await db.select().from(portalKullanicilar).where(eq(portalKullanicilar.kullaniciAdi, "SMOKEBELGE"))) {
    await db.delete(operasyonMasraflar).where(eq(operasyonMasraflar.operasyonId, k.id));
    await db.delete(operasyonAvanslar).where(eq(operasyonAvanslar.operasyonId, k.id));
    await db.delete(portalKullanicilar).where(eq(portalKullanicilar.id, k.id));
  }
  await db.delete(masrafTurleri).where(eq(masrafTurleri.ad, "SMOKE TÜR"));

  const k = await storage.createPortalKullanici({
    kullaniciAdi: "SMOKEBELGE", sifreHash: "x:y", adSoyad: "Smoke Belge",
    rol: "operasyon", avAdi: null, sube: "Gemlik", aktif: true,
  });

  // 1) Mevcut türler varsayılan olarak belge ZORUNLU gelmeli (geriye uyum)
  const turler = await storage.getMasrafTurleri();
  esit("mevcut turlerin hepsi belgeZorunlu=true", turler.every((t) => t.belgeZorunlu === true), true);

  // 2) Yeni tür de varsayılan true
  const yeniTur = await storage.createMasrafTuru({ ad: "SMOKE TÜR", sira: 0, aktif: true });
  esit("yeni tur varsayilan belgeZorunlu", yeniTur.belgeZorunlu, true);

  // 3) getMasrafTuruByAd — tr-locale, trim, case-insensitive
  esit("getMasrafTuruByAd tam ad", (await storage.getMasrafTuruByAd("SMOKE TÜR"))?.id, yeniTur.id);
  esit("getMasrafTuruByAd bosluklu+kucuk", (await storage.getMasrafTuruByAd("  smoke tür  "))?.id, yeniTur.id);
  esit("getMasrafTuruByAd bulunamayan", await storage.getMasrafTuruByAd("YOK BÖYLE TÜR"), undefined);

  // 4) Bayrak güncellenebiliyor
  const kapali = await storage.updateMasrafTuru(yeniTur.id, { belgeZorunlu: false });
  esit("belgeZorunlu false yapilabildi", kapali?.belgeZorunlu, false);

  // 5) BELGESİZ masraf kaydedilebiliyor (NOT NULL gevşetmesinin kanıtı)
  const m = await storage.masrafKaydet({
    operasyonId: k.id, beyannameId: null, dosyaYok: true, masrafTuru: "SMOKE TÜR",
    sube: "Gemlik", tutar: 20, alacakli: "Test", iban: null, aciklama: "smoke",
    tarih: "2026-07-20", belgeDosya: null, belgeAdi: null,
  });
  esit("belgesiz masraf kaydedildi", m.belgeDosya, null);

  // 6) Dekontsuz ve dekontlu avans
  const a1 = await storage.avansYukle({ operasyonId: k.id, tutar: 100, aciklama: "dekontsuz", tarih: "2026-07-20", gonderenId: k.id, belgeDosya: null, belgeAdi: null });
  esit("dekontsuz avans", a1.belgeDosya, null);
  const a2 = await storage.avansYukle({ operasyonId: k.id, tutar: 200, aciklama: "dekontlu", tarih: "2026-07-20", gonderenId: k.id, belgeDosya: "uploads/operasyon/d.pdf", belgeAdi: "dekont.pdf" });
  esit("dekontlu avans yolu", a2.belgeDosya, "uploads/operasyon/d.pdf");
  esit("dekontlu avans adi", a2.belgeAdi, "dekont.pdf");

  // 7) Bakiye türetimi bozulmadı (100+200-20)
  esit("bakiye dogru", await storage.getOperasyonBakiye(k.id), 280);

  // Temizlik
  await db.delete(operasyonMasraflar).where(eq(operasyonMasraflar.operasyonId, k.id));
  await db.delete(operasyonAvanslar).where(eq(operasyonAvanslar.operasyonId, k.id));
  await db.delete(portalKullanicilar).where(eq(portalKullanicilar.id, k.id));
  await db.delete(masrafTurleri).where(eq(masrafTurleri.ad, "SMOKE TÜR"));
  esit("temizlik tamam", (await db.select().from(portalKullanicilar).where(eq(portalKullanicilar.kullaniciAdi, "SMOKEBELGE"))).length, 0);
  process.exit(process.exitCode ?? 0);
})();
```

Run: `npx tsx smoke-belge.ts`
Expected: 12 satırın hepsi `✓`, çıkış kodu 0.

Sonra sil: `rm smoke-belge.ts`

- [ ] **Step 11: U+FFFD taraması ve commit**

Run:
```bash
node -e "['shared/schema.ts','server/storage.ts','server/routes.ts'].forEach(f=>console.log(f, require('fs').readFileSync(f,'utf8').includes('�')))"
```
Expected: üç satır da `false`.

```bash
git add shared/schema.ts server/storage.ts server/routes.ts
git status
git commit -m "feat(operasyon): belge zorunlu bayragi + avans dekont kolonlari + masraf belge kisiti gevsetildi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
`git status` çıktısında YALNIZ bu 3 dosya staged olmalı.

---

### Task 2: Avans ucu multipart + opsiyonel dekont

**Files:**
- Modify: `server/routes.ts` (`POST /api/portal/operasyon-takip/:operasyonId/avans` ~5492-5505)

**Interfaces:**
- Consumes: T1'in `storage.avansYukle` imzası (`belgeDosya`/`belgeAdi`), mevcut `uploadOperasyonBelge` multer yazıcısı, `fixUploadFilename`
- Produces: `POST /api/portal/operasyon-takip/:operasyonId/avans` artık **multipart/form-data** kabul eder; alanlar `tutar`, `aciklama`, **opsiyonel** `dekont` (dosya). Dönüş: `OperasyonAvans` (artık `belgeDosya`/`belgeAdi` taşır).

- [ ] **Step 1: Ucu multipart'a çevir ve dekontu kaydet**

`server/routes.ts` içindeki avans ucunun TAMAMINI şununla DEĞİŞTİR (T1'de eklenen geçici `belgeDosya: null, belgeAdi: null` satırı da burada gerçek değere dönüşür):

```ts
  app.post("/api/portal/operasyon-takip/:operasyonId/avans", requireMuhasebe, uploadOperasyonBelge.single("dekont"), async (req, res) => {
    const dekont = req.file; // OPSİYONEL — elden nakit avansta dekont olmayabilir
    const sil = () => { if (dekont) fs.promises.unlink(dekont.path).catch(() => {}); };
    try {
      const ben = await portalKullanici(req);
      if (!ben) { sil(); return res.status(401).json({ error: "Giriş gerekli" }); }
      const { tutar, aciklama } = req.body || {};
      const tutarNum = parseTutar(tutar);
      if (tutarNum === null || tutarNum <= 0) { sil(); return res.status(400).json({ error: "Geçerli tutar girin" }); }
      const avans = await storage.avansYukle({
        operasyonId: req.params.operasyonId, tutar: tutarNum,
        aciklama: aciklama ? String(aciklama) : null, tarih: bugunYmd(), gonderenId: ben.id,
        belgeDosya: dekont ? dekont.path.replace(/\\/g, "/") : null,
        belgeAdi: dekont ? fixUploadFilename(dekont.originalname) : null,
      });
      res.json(avans);
    } catch (e: any) { sil(); res.status(500).json({ error: e.message }); }
  });
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 3: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 4: Uç duman testi**

Dev sunucu çalışmıyorsa `npm run dev` (port 5000, arka planda).

Scratchpad'de bir Node betiğiyle (Node'un yerleşik `fetch`/`FormData`'sını kullan — Git-Bash'te `curl` multipart gövdesinde Türkçe UTF-8'i bozuyor):

1. `POST /api/odemeler/kullanicilar` → `{kullaniciAdi:"AVANSTEST", adSoyad:"Avans Test", rol:"operasyon", sube:"Gemlik", sifre:"1234"}`.
2. `POST /api/portal/login` `{kullaniciAdi:"muhasebe", sifre:"1234"}` → cookie sakla.
3. `GET /api/portal/operasyon-takip` → AVANSTEST'in id'sini bul.
4. **Dekontsuz avans:** `FormData` ile `tutar=500`, `aciklama=dekontsuz` → **200**, dönen kayıtta `belgeDosya === null`.
5. **Dekontlu avans:** `FormData` ile `tutar=1000`, `aciklama=Bayram Aksoy`, `dekont` = küçük bir dummy PDF → **200**, `belgeDosya` dolu, `belgeAdi` özgün ad.
6. Diskte dosyanın gerçekten oluştuğunu doğrula (`uploads/operasyon/` içinde).
7. **Geçersiz tutar + dekont:** `tutar=0` + dekont dosyası → **400** VE yüklenen dosyanın diskte BIRAKILMADIĞI doğrulanır (`sil()` çalıştı mı — dosya sayısı adım 6'daki ile aynı kalmalı).
8. `GET /api/portal/operasyon-takip/{id}` → açık avanslarda iki kayıt, biri dekontlu.

Beklenen: 8/8. Adım 7 en kritik olanıdır (yetim dosya bırakmama).

**Temizlik:** AVANSTEST kullanıcısı + avansları + `uploads/operasyon/` altındaki test dosyaları silinir; silindiği sorguyla ve dizin listesiyle kanıtlanır.

- [ ] **Step 5: U+FFFD taraması ve commit**

Run: `node -e "console.log(require('fs').readFileSync('server/routes.ts','utf8').includes('�'))"`
Expected: `false`

```bash
git add server/routes.ts
git status
git commit -m "feat(operasyon): avans ucu multipart - opsiyonel dekont yukleme

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Avans dekontu arayüzü (yükleme + iki ekranda link)

**Files:**
- Modify: `client/src/pages/portal/OperasyonTakipSayfasi.tsx` (state ~23-30, `avansGonder` ~62-76, avans satırı ~126-128, dialog ~165-169)
- Modify: `client/src/pages/portal/OperasyonKasaSayfasi.tsx` (açık hareketlerdeki avans satırı ~195-199)

**Interfaces:**
- Consumes: T2'nin multipart avans ucu (`tutar`, `aciklama`, opsiyonel `dekont`); T1'in `OperasyonAvans.belgeDosya: string | null`
- Produces: testid `input-avans-dekont` (dosya seçici). Avans satırlarında `belgeDosya` doluysa `dekont` linki.

- [ ] **Step 1: Dialog state'ine dekont ekle**

`client/src/pages/portal/OperasyonTakipSayfasi.tsx` içinde `const [avansAciklama, setAvansAciklama] = useState("");` satırının ALTINA ekle:

```ts
  const [avansDekont, setAvansDekont] = useState<File | null>(null);
  const [dekontSayac, setDekontSayac] = useState(0); // file input'u sıfırlamak için key
```

- [ ] **Step 2: `avansGonder`'i FormData'ya çevir**

`avansGonder` fonksiyonundaki `fetch` çağrısını ve sıfırlama satırını şununla DEĞİŞTİR:

```ts
      const fd = new FormData();
      fd.set("tutar", avansTutar);
      fd.set("aciklama", avansAciklama);
      if (avansDekont) fd.set("dekont", avansDekont); // OPSİYONEL
      const res = await fetch(`/api/portal/operasyon-takip/${secili.id}/avans`, {
        method: "POST", body: fd, credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Gönderilemedi");
      toast({ title: "Avans yüklendi", description: `${secili.adSoyad} bakiyesine geçti.` });
      setAvansDialog(false); setAvansTutar(""); setAvansAciklama("");
      setAvansDekont(null); setDekontSayac((s) => s + 1);
      tazele();
```

**Not:** `Content-Type` başlığı GÖNDERİLMEZ — tarayıcı multipart sınırını kendisi ekler. Elle `multipart/form-data` yazmak isteği bozar.

- [ ] **Step 3: Dialog'a dosya seçici ekle**

Avans dialog'unda "Açıklama" alanının HEMEN ALTINA ekle:

```tsx
            <div className="space-y-1"><Label>Dekont (opsiyonel)</Label><Input key={dekontSayac} type="file" onChange={(e) => setAvansDekont(e.target.files?.[0] ?? null)} data-testid="input-avans-dekont" /></div>
```

- [ ] **Step 4: Muhasebe detayındaki avans satırına dekont linki**

`OperasyonTakipSayfasi.tsx` içindeki açık avans satırını şununla DEĞİŞTİR:

```tsx
                <div key={a.id} className="flex justify-between text-sm py-0.5"><span className="text-green-600">Avans · {formatTarih(a.tarih)} · {a.aciklama ?? "—"}{a.belgeDosya && <> · <a className="underline" href={"/" + a.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">dekont</a></>}</span><span className="text-green-600">+{formatPara(a.tutar, "TL")}</span></div>
```

- [ ] **Step 5: Operasyon Kasam'daki avans satırına dekont linki**

`client/src/pages/portal/OperasyonKasaSayfasi.tsx` içindeki açık hareketler avans satırının iç `<div>`'ini şununla DEĞİŞTİR:

```tsx
              <div><span className="font-medium text-green-600">Avans</span> · {formatTarih(a.tarih)} · {a.aciklama ?? "—"}{a.belgeDosya && <> · <a className="underline" href={"/" + a.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">dekont</a></>}</div>
```

- [ ] **Step 6: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 7: Playwright doğrulaması**

DB hedefini doğrula (`DEV_NEON: true`). Dev sunucu 5000'de.

1. API ile operasyon kullanıcısı `DEKONTUI` (şube `Gemlik`) oluştur.
2. `/portal` → `muhasebe` / `1234` ile gir → "Şube Masraf".
3. `button-avans-{id}` → dialog açılır → `input-avans-dekont` alanı **görünür** olmalı.
4. **Dekontsuz:** tutar `500`, açıklama `dekontsuz`, dosya SEÇME → Yükle → başarı; bakiye 500,00 TL.
5. `button-detay-{id}` → açık avanslarda `dekontsuz` satırı var ve **dekont linki YOK**.
6. **Dekontlu:** tekrar `button-avans-{id}` → dialog'da dosya alanı **BOŞ** olmalı (önceki seçim sıfırlandı) → tutar `1000`, açıklama `Bayram Aksoy`, dummy PDF seç → Yükle → bakiye 1.500,00 TL.
7. Detayda `Bayram Aksoy` satırında **dekont linki VAR**; linke tıklanınca 200 dönmeli (ağ yanıtını doğrula).
8. `DEKONTUI` ile portala gir → Kasam → açık hareketlerde aynı iki avans; dekontlu olanda **dekont linki VAR**, dekontsuzda YOK.

**Temizlik:** `DEKONTUI` kullanıcısı + avansları + `uploads/operasyon/` test dosyaları silinir; kanıtla.

- [ ] **Step 8: U+FFFD taraması ve commit**

Run:
```bash
node -e "['client/src/pages/portal/OperasyonTakipSayfasi.tsx','client/src/pages/portal/OperasyonKasaSayfasi.tsx'].forEach(f=>console.log(f, require('fs').readFileSync(f,'utf8').includes('�')))"
```
Expected: iki satır da `false`.

```bash
git add client/src/pages/portal/OperasyonTakipSayfasi.tsx client/src/pages/portal/OperasyonKasaSayfasi.tsx
git status
git commit -m "feat(operasyon): avans dekontu yukleme + Kasam ve Sube Masraf ekranlarinda dekont linki

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Belge zorunluluk bayrağı — sunucu + yönetim ekranı

**Files:**
- Modify: `server/routes.ts` (`PUT /api/odemeler/masraf-turleri/:id` ~5539-5550, `POST /api/portal/operasyon/masraf` ~5376-5400)
- Modify: `client/src/pages/Odemeler.tsx` (`MasrafTurleri` bileşeni ~329-400)

**Interfaces:**
- Consumes: T1'in `masrafTurleri.belgeZorunlu` kolonu, `storage.getMasrafTuruByAd`, `storage.masrafKaydet` (`belgeDosya`/`belgeAdi` artık nullable)
- Produces: `PUT /api/odemeler/masraf-turleri/:id` gövdesi `belgeZorunlu: boolean` kabul eder. `POST /api/portal/operasyon/masraf` belge zorunluluğunu türün bayrağından belirler. Testid'ler: `row-masraf-turu-<id>`, `switch-belge-zorunlu-<id>`.

**TUZAK — sessiz alan düşmesi:** `PUT /api/odemeler/masraf-turleri/:id` **elle yazılmış beyaz liste** (`{ ad, aktif, sira }`) kullanır. `belgeZorunlu` bu listeye AÇIKÇA eklenmezse yönetici anahtarı çevirir, istek 200 döner, hata çıkmaz — ama değer **sessizce düşer**. Bu sınıf hata bu projede iki kez yaşandı (F1.11 IBAN alanları; şube atama PUT'u).

- [ ] **Step 1: PUT beyaz listesini genişlet**

`server/routes.ts` içindeki `PUT /api/odemeler/masraf-turleri/:id` gövdesinde `izinli` tipini ve `sira` kontrolünün ALTINI şöyle DEĞİŞTİR/EKLE:

```ts
      const izinli: { ad?: string; aktif?: boolean; sira?: number; belgeZorunlu?: boolean } = {};
```

ve `if (Number.isFinite(Number(req.body?.sira))) izinli.sira = Number(req.body.sira);` satırının ALTINA ekle:

```ts
      // Beyaz listeye AÇIKÇA eklenmezse sessizce düşer.
      if (typeof req.body?.belgeZorunlu === "boolean") izinli.belgeZorunlu = req.body.belgeZorunlu;
```

- [ ] **Step 2: Masraf ucunda bayrağa göre belge kontrolü**

`server/routes.ts` içindeki `POST /api/portal/operasyon/masraf` gövdesinde, `if (!belge) return res.status(400).json({ error: "Belge (fiş/fatura) zorunlu" });` satırını şununla DEĞİŞTİR:

```ts
      // Belge zorunluluğu masraf TÜRÜNE bağlı. Bayrağı SUNUCU okur — istemciye güvenilmez.
      // Tür boş veya bulunamadıysa GÜVENLİ varsayılan: belge zorunlu.
      const turAdi = String(masrafTuru ?? "").trim();
      const tur = turAdi ? await storage.getMasrafTuruByAd(turAdi) : undefined;
      const belgeZorunlu = tur ? tur.belgeZorunlu : true;
      if (belgeZorunlu && !belge) return res.status(400).json({ error: "Belge (fiş/fatura) zorunlu" });
```

Ve aynı handler'daki `storage.masrafKaydet({...})` çağrısındaki iki satırı şunlarla DEĞİŞTİR:

```ts
        belgeDosya: belge ? belge.path.replace(/\\/g, "/") : null,
        belgeAdi: belge ? fixUploadFilename(belge.originalname) : null,
```

Diğer doğrulamalar (tutar, alacaklı, `dosyaYok`+açıklama, `beyannameId`) **DEĞİŞMEZ**.

- [ ] **Step 3: Yönetim ekranına bayrak anahtarı**

`client/src/pages/Odemeler.tsx` içindeki `MasrafTurleri` bileşeninde, `aktifDegistir` fonksiyonunun ALTINA ekle:

```ts
  const belgeZorunluDegistir = async (t: MasrafTuru, belgeZorunlu: boolean) => {
    try {
      const res = await fetch(`/api/odemeler/masraf-turleri/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ belgeZorunlu }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Güncellenemedi");
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/masraf-turleri"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    }
  };
```

Tablo başlığında `<TableHead>Aktif (kapalıysa formda görünmez)</TableHead>` satırının ALTINA ekle:

```tsx
              <TableHead>Belge zorunlu (kapalıysa fiş istenmez)</TableHead>
```

Ve satır gövdesini şununla DEĞİŞTİR (satıra testid eklenir, yeni hücre gelir):

```tsx
              <TableRow key={t.id} data-testid={`row-masraf-turu-${t.id}`}>
                <TableCell>{t.ad}</TableCell>
                <TableCell>
                  <Switch checked={t.aktif} onCheckedChange={(a) => aktifDegistir(t, a)} data-testid={`switch-aktif-tur-${t.id}`} />
                </TableCell>
                <TableCell>
                  <Switch checked={t.belgeZorunlu} onCheckedChange={(b) => belgeZorunluDegistir(t, b)} data-testid={`switch-belge-zorunlu-${t.id}`} />
                </TableCell>
              </TableRow>
```

- [ ] **Step 4: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 5: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 6: Uç duman testi**

Dev sunucu 5000'de. Node'un yerleşik `fetch`/`FormData`'sıyla (Git-Bash `curl` multipart'ta Türkçe'yi bozuyor):

1. `POST /api/odemeler/masraf-turleri` `{ad:"BELGESIZ TÜR", sira:0}` → 200; dönen kayıtta `belgeZorunlu === true` (varsayılan).
2. `PUT /api/odemeler/masraf-turleri/{id}` `{belgeZorunlu:false}` → 200, `belgeZorunlu === false`.
3. **KALICILIK:** `GET /api/odemeler/masraf-turleri` → aynı türde `belgeZorunlu === false` (sessiz düşme YOK — bu adım tuzağın kanıtıdır).
4. `PUT` `{aktif:false}` tek başına → 200 ve `belgeZorunlu` HÂLÂ `false` (diğer alan ezilmedi).
5. Operasyon kullanıcısı `BAYRAKTEST` (şube `Gemlik`) oluştur, giriş yap.
6. **Bayrak false → belgesiz masraf GEÇER:** `POST /api/portal/operasyon/masraf` multipart, `masrafTuru=BELGESIZ TÜR`, `dosyaYok=true`, `tutar=20`, `alacakli=Test`, `aciklama=fişsiz`, **belge YOK** → **200**, dönen kayıtta `belgeDosya === null`.
7. **Bayrak true → belgesiz masraf REDDEDİLİR:** aynı istek ama `masrafTuru` = varsayılan bayraklı mevcut bir tür (örn. `Yemek`) → **400 "Belge (fiş/fatura) zorunlu"**.
8. **Tür boş → güvenli varsayılan:** `masrafTuru=""`, belge YOK → **400**.
9. **Bilinmeyen tür → güvenli varsayılan:** `masrafTuru=HİÇ OLMAYAN TÜR`, belge YOK → **400**.
10. **Bayrak false + belge VAR → yine kaydedilir:** `masrafTuru=BELGESIZ TÜR` + dummy PDF → **200**, `belgeDosya` dolu.

Beklenen: 10/10. Adım 3, 8 ve 9 kritik olanlardır.

**Temizlik:** `BAYRAKTEST` kullanıcısı + masrafları, `BELGESIZ TÜR` masraf türü ve `uploads/operasyon/` test dosyaları silinir; kanıtla.

- [ ] **Step 7: Playwright doğrulaması (yönetim ekranı)**

1. `/odemeler` aç (parola kapısı varsa `cnctracker_admin_auth` localStorage anahtarını doldurarak geç) → "Masraf Türleri" sekmesi.
2. Tabloda **"Belge zorunlu"** kolonu görünmeli.
3. Herhangi bir mevcut türde `switch-belge-zorunlu-{id}` **açık** (checked) olmalı — geriye uyum kanıtı.
4. Anahtarı kapat → sayfayı yenile → **kapalı kalmalı** (PUT sessiz düşme yok).
5. Tekrar aç → yenile → açık kalmalı. (Test sonunda tür orijinal hâline döndürülmeli.)

- [ ] **Step 8: U+FFFD taraması ve commit**

Run:
```bash
node -e "['server/routes.ts','client/src/pages/Odemeler.tsx'].forEach(f=>console.log(f, require('fs').readFileSync(f,'utf8').includes('�')))"
```
Expected: iki satır da `false`.

```bash
git add server/routes.ts client/src/pages/Odemeler.tsx
git status
git commit -m "feat(operasyon): masraf turu bazinda belge zorunlulugu (sunucu + yonetim anahtari)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Kasam formu — belge opsiyonelliği + beyan_no araması

**Files:**
- Modify: `client/src/pages/portal/OperasyonKasaSayfasi.tsx` (filtre ~47-53, `kaydet` ~65-91, arama/select ~141-152, belge alanı ~172-175)

**Interfaces:**
- Consumes: T1'in `MasrafTuru.belgeZorunlu`; T4'ün sunucu tarafı bayrak kontrolü; `Beyanname.beyanNo: string | null` (şemada mevcut)
- Produces: kullanıcıya görünen belge etiketi türün bayrağına göre değişir; beyanname araması `beyan_no` ile de eşleşir

- [ ] **Step 1: Seçili türün bayrağını hesapla**

`client/src/pages/portal/OperasyonKasaSayfasi.tsx` içinde `filtreliBeyannameler` useMemo'sunun ALTINA ekle:

```ts
  // Belge zorunluluğu seçili masraf türünden gelir. Tür seçilmemişse GÜVENLİ varsayılan: zorunlu.
  // (Sunucu da aynı kuralı bağımsız uygular — bu yalnız kullanıcıya erken geri bildirim.)
  const seciliTur = useMemo(() => masrafTurleri.find((t) => t.ad === masrafTuru), [masrafTurleri, masrafTuru]);
  const belgeZorunlu = seciliTur ? seciliTur.belgeZorunlu : true;
```

- [ ] **Step 2: Aramaya `beyan_no` ekle**

`filtreliBeyannameler` useMemo'sundaki filtre ifadesini şununla DEĞİŞTİR:

```ts
    return beyannameler.filter((b) =>
      b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
      (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
      (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q));
```

**Neden düz `includes` yeterli:** şubeler `167929` yazıyor; bizdeki karşılığı `26341200IM00167929`. Aranan metin beyan_no'nun İÇİNDE geçtiği için ek ayrıştırma/normalizasyon gerekmez.

- [ ] **Step 3: Arama kutusu ve seçenek etiketini güncelle**

Arama `Input`'unun `placeholder`'ını DEĞİŞTİR:

```tsx
                  <Input placeholder="Dosya no, beyan no veya müşteri ara…" value={arama} onChange={(e) => setArama(e.target.value)} data-testid="input-op-arama" />
```

Ve `SelectItem` etiketini şununla DEĞİŞTİR (kullanıcı doğru dosyayı seçtiğini doğrulayabilsin):

```tsx
                        <SelectItem key={b.id} value={b.id}>{b.dosyaNo} — {b.alici ?? "?"}{b.beyanNo ? ` · ${b.beyanNo}` : ""}</SelectItem>
```

- [ ] **Step 4: Kaydetme doğrulamasını bayrağa bağla**

`kaydet` fonksiyonundaki `if (!belge) { toast({ title: "Belge (fiş/fatura) zorunlu", ... }); return; }` satırını şununla DEĞİŞTİR:

```ts
    if (belgeZorunlu && !belge) { toast({ title: "Belge (fiş/fatura) zorunlu", variant: "destructive" }); return; }
```

Ve aynı fonksiyondaki `fd.set("belge", belge);` satırını şununla DEĞİŞTİR:

```ts
      if (belge) fd.set("belge", belge);
```

- [ ] **Step 5: Belge alanının etiketini bayrağa bağla**

Belge alanının `<Label>`'ını şununla DEĞİŞTİR (alan GİZLENMEZ, yalnız etiket değişir):

```tsx
                <Label>{belgeZorunlu ? "Belge (fiş/fatura — ZORUNLU)" : "Belge (fiş/fatura — opsiyonel)"}</Label>
```

- [ ] **Step 6: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 7: Playwright doğrulaması**

DB hedefini doğrula (`DEV_NEON: true`). Dev sunucu 5000'de. Hazırlık: API ile `KASAMUI` operasyon kullanıcısı (şube `Gemlik`) + `BELGESIZ TÜR` masraf türü (`belgeZorunlu=false`) oluştur; muhasebeden 2000 TL avans yükle.

1. `KASAMUI` ile portala gir → Kasam.
2. Masraf türü **seçilmemişken** belge etiketi **"ZORUNLU"** içermeli (güvenli varsayılan).
3. Masraf türünü `Yemek` (bayrak açık) seç → etiket hâlâ **"ZORUNLU"**.
4. Masraf türünü `BELGESIZ TÜR` seç → etiket **"opsiyonel"** olmalı; belge alanı hâlâ **görünür**.
5. **Belgesiz kayıt:** Ofis Masrafı işaretle, tutar `20`, alacaklı `Test`, açıklama `fişsiz`, belge SEÇME → Kaydet → **başarı**; açık hareketlerde satır var, **[belge] linki YOK**; bakiye 1.980,00 TL.
6. **Zorunlu türde engelleme:** türü `Yemek` yap, belge seçmeden Kaydet → uyarı toast'ı, kayıt OLUŞMAMALI.
7. **beyan_no araması:** Ofis Masrafı işaretini kaldır → arama kutusuna gerçek bir beyanname'nin `beyan_no` kuyruğunu yaz (hazırlıkta dev DB'den bir `beyanNo` değeri okuyup son 6 hanesini kullan) → listede doğru dosya çıkmalı ve seçenek etiketinde `· <beyanNo>` görünmeli.
8. **Regresyon:** dosya no ile arama ve müşteri adı ile arama hâlâ çalışmalı.

**Temizlik:** `KASAMUI` kullanıcısı + masrafları + avansı, `BELGESIZ TÜR` türü ve `uploads/operasyon/` test dosyaları silinir; kanıtla.

- [ ] **Step 8: U+FFFD taraması ve commit**

Run: `node -e "console.log(require('fs').readFileSync('client/src/pages/portal/OperasyonKasaSayfasi.tsx','utf8').includes('�'))"`
Expected: `false`

```bash
git add client/src/pages/portal/OperasyonKasaSayfasi.tsx
git status
git commit -m "feat(operasyon): Kasam formunda belge opsiyonelligi + beyan_no ile beyanname aramasi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Uçtan uca doğrulama + kalite kapıları

**Files:**
- Create (scratchpad): `e2e-belge.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla; "geçsin diye" kod değiştirme.

**Interfaces:**
- Consumes: T1-T5'in tamamı

- [ ] **Step 1: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 2: Karma E2E senaryosu**

Scratchpad'de `e2e-belge.js` (Playwright chromium + kurulum için Node `fetch`/`FormData`).

**Kurulum:** operasyon kullanıcısı `E2EBLG` (şube `İstanbul - Erenköy` — boşluklu/Türkçe ad kasıtlı), masraf türleri `E2E DOSYA` (`belgeZorunlu=false`) ve `E2E YEMEK` (`belgeZorunlu=true`); muhasebeden dekontlu 10.000 TL avans.

**(A) Avans dekontu:** muhasebe → Şube Masraf → Avans Yükle → tutar `10000`, açıklama `Bayram Aksoy`, dekont PDF → Yükle. Detayda satırda **dekont linki** var ve 200 dönüyor. `E2EBLG` Kasam'ında da aynı satırda dekont linki görünüyor.

**(B) Dekontsuz avans:** ikinci avans `500`, dekontsuz → 200; satırda dekont linki YOK. İki avans da bakiyeye giriyor (10.500,00 TL).

**(C) Belgesiz masraf (bayrak false):** `E2EBLG` → Kasam → tür `E2E DOSYA` → etiket "opsiyonel" → Ofis Masrafı + tutar `20` + açıklama `dosya ücreti` + belge YOK → Kaydet → 200. Bakiye 10.480,00 TL. Satırda `[belge]` linki YOK.

**(D) Zorunlu tür engelliyor:** tür `E2E YEMEK` → belge seçmeden Kaydet → uyarı, kayıt yok. Bakiye değişmedi.

**(E) Zorunlu tür belgeyle geçiyor:** tür `E2E YEMEK` + dummy PDF + tutar `300` → 200. Bakiye 10.180,00 TL. Satırda `[belge]` linki VAR.

**(F) Sunucu bayrağı bağımsız uyguluyor:** istemciyi atlayarak doğrudan API'ye `masrafTuru=E2E YEMEK` + belge YOK gönder → **400**. (İstemci kontrolü kapatılabilir olsa da sunucu koruyor.)

**(G) beyan_no araması:** dev DB'den gerçek bir `beyanNo` oku, son 6 hanesini Kasam aramasına yaz → doğru dosya listede; seçenek etiketinde `· <beyanNo>` görünüyor; seçilip masraf kaydedilebiliyor.

**(H) Geriye uyum:** mevcut (E2E dışı) bir masraf türünün `belgeZorunlu` değeri `true` — yani sistemin varsayılan davranışı değişmemiş.

**(I) Boşluklu/Türkçe şube adı:** `E2EBLG`'nin masrafları Şube Raporu'nda `İstanbul - Erenköy` bloğunda görünüyor ve ad bozulmamış.

Her adımın PASS/FAIL sonucunu ve kanıtını (tutar, DOM assert, ekran görüntüsü yolu) raporla.

- [ ] **Step 3: Temizlik**

`E2EBLG` kullanıcısı; avansları; masrafları; `E2E DOSYA` ve `E2E YEMEK` masraf türleri; `uploads/operasyon/` altındaki test dosyaları silinir. Doğrula:

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select (select count(*)::int from portal_kullanicilar where kullanici_adi like 'E2E%') k, (select count(*)::int from masraf_turleri where ad like 'E2E%') t\").then(r=>{console.log('kalan E2E kullanici:',r.rows[0].k,'| kalan E2E tur:',r.rows[0].t);process.exit(0)})"
```
Expected: `kalan E2E kullanici: 0 | kalan E2E tur: 0`

Ayrıca `ls uploads/operasyon/` → test dosyası kalmamalı.

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
- §3 Veri modeli (3 kolon + 2 NOT NULL gevşetme, DB risk notu) → T1 S1-S3, S9
- §4 Avans dekontu (multipart, opsiyonel, `sil()`, `fixUploadFilename`, storage imzası) → T1 S4-S5 + T2
- §4 Görünürlük (avans satırlarının render edildiği İKİ yer) → T3 S4-S5
- §5 Bayrak (varsayılan true, yönetim anahtarı, PUT beyaz liste tuzağı, sunucu okur, güvenli varsayılan, diğer doğrulamalar değişmez) → T1 S2/S7 + T4
- §5 İstemci etiketi (gizlenmez, "opsiyonel" olur) → T5 S1, S4-S5
- §6 beyan_no araması (istemci filtre, düz includes, etikette gösterim, sunucu değişmez) → T5 S2-S3
- §8 Doğrulama (check/build, DEV DB izolasyonu, db:push + nullable teyidi, geriye uyum, uç duman testleri, Playwright, temizlik) → her görevin son adımları + T6

**Tip tutarlılığı:** `belgeZorunlu` adı üç katmanda aynı (`masrafTurleri.belgeZorunlu`, `MasrafTuru.belgeZorunlu`, istemci `seciliTur.belgeZorunlu`). `belgeDosya`/`belgeAdi` hem avans hem masrafta aynı adla ve aynı `string | null` tipiyle. `storage.getMasrafTuruByAd(ad)` T1'de tanımlanır, T4 S2'de aynı adla çağrılır. Dekont form alanı adı `dekont` (T2 sunucu `.single("dekont")`, T3 istemci `fd.set("dekont", ...)`) — masrafın `belge` alanından kasıtlı olarak farklı.

**Bilinçli taviz:** T1 Step 8'de `routes.ts`'e geçici `belgeDosya: null, belgeAdi: null` konulur; her görevin tsc-yeşil bitmesi içindir ve T2 Step 1'de gerçek değere çevrilir. **T2 incelemesinde bu satırın gerçekten değiştiği açıkça doğrulanmalıdır** — atlanırsa dekont hiç kaydedilmez (sessiz kayıp).

**Kapsam dışı (planda görev YOK, kasıtlı):** Excel ile toplu masraf yükleme · masrafa gümrük boyutu · EX beyannamelerinin aktarılması · temsilci/muhasebe talep formlarındaki belge kuralları · belgesiz masraflar için ayrı rozet/rapor · kapanmış gün dökümüne avans satırı · `masrafSil`'in diskteki yetim belgeyi silmemesi.
