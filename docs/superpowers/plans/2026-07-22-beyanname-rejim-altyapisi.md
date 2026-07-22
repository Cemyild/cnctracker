# Beyanname Rejim Altyapısı (Faz 1a) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `beyannameler` tablosunu IM/EX/TR kanallarını taşıyabilecek hâle getirmek ve ihracat yüklemesinin ithalat kaydını ezmesini yapısal olarak imkânsız kılmak.

**Architecture:** `beyannameler`'a üç kolon eklenir (`rejim`, `rejimKodu`, `kaynak`), `dosyaNo` nullable olur, benzersizlik `(dosyaNo, rejim)` çiftine taşınır ve transit için `beyanNo` üzerinde kısmi benzersiz indeks açılır. Şema, `upsertBeyannameler`, parser ve tek istemci dosyası **birlikte** iner — aksi hâlde `tsc` yeşil olmaz. Arayüzde görünür değişiklik yoktur; TR satırı Faz 2'de doğacaktır.

**Tech Stack:** Drizzle ORM 0.39.1 + drizzle-kit 0.31.4 (`push`, migration dosyası yok) · Neon serverless Postgres · Express (ESM, tsx) · React 18 · xlsx

**Spec:** [docs/superpowers/specs/2026-07-22-beyanname-rejim-altyapisi-design.md](../specs/2026-07-22-beyanname-rejim-altyapisi-design.md)

## Global Constraints

- **`rejim` = KANAL, gümrük rejim kodu DEĞİL.** Değerler yalnız `IM` | `EX` | `TR`. İthalat Raporu'ndan gelen antrepo kaydı da `IM`'dir. Ham gümrük kodu ayrı kolonda (`rejimKodu`) durur.
- **Mevcut IM içe aktarma ucu `/api/ingest/beyanname` ADRESİ DEĞİŞMEZ.** Power Automate akışına bu fazda dokunulmaz. EX ucu Faz 1b'dir, bu planda **yoktur**.
- **`ON CONFLICT` hedefi `(dosyaNo, rejim)`** olacak. `set` bloğuna **`rejim` ve `kaynak` KONMAZ** (kayıt kimliğinin parçası).
- **`AU` sütunu katı başlık doğrulamasına EKLENMEZ.** Yalnız `AU` başlığı tam `"REJİM"` ise `rejimKodu` yazılır, aksi hâlde `null`. Gerekçe: `rejimKodu` tamamlayıcıdır; eksikliği çalışan IM akışını durdurmamalı.
- **Parser `rejim`'i HER ZAMAN açıkça yazar.** Şemadaki `DEFAULT 'IM'` yalnız mevcut satırların doldurulması içindir; ona güvenilmez.
- **Bu faz TR satırı OLUŞTURMAZ.** Faz 1a sonunda `dosya_no`'su null olan hiçbir satır olmamalıdır (test verisi hariç, o da temizlenir). Geri alınabilirlik buna bağlı.
- **Arayüzde görünür değişiklik YOK.** `BeyannameSecici` değişikliği yalnız null-güvenliktir; mevcut davranış birebir korunur.
- Tarihler `text` `YYYY-MM-DD`; `new Date(...)` ile parse edilmez (`parseBeyanTarihi` korunur).
- Türkçe küçültme `toLocaleLowerCase("tr")`; `toLowerCase()` YASAK.
- **DEV DB izolasyonu:** her `db:push` ve yazma testi öncesi `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true`; değilse **DUR**. Bu görevde `db:push` var — yanlış hedef canlı şemayı değiştirir.
- **YENİ NPM PAKETİ YOK.** `package.json`/lockfile değişmez. **Migration dosyası OLUŞTURULMAZ** (proje `push` kullanır).
- **`git add` YALNIZ açık dosya yoluyla.** `-A`/`.` ASLA. **`git push` YAPILMAZ.**
- **Türkçe kaynak dosyasını PowerShell `Set-Content` ile yeniden YAZMA.** Edit/Write; U+FFFD taraması.
- Kalite kapıları: `npm run check` (0 hata) ve `npm run build`. Test koşucusu/linter yok, uydurma.
- **Kalıcı dev test seti hazır** — yeni portal kullanıcısı/masraf türü YARATMA: `optest` (operasyon), `muhasebe`, `suleyman` (temsilci, avAdi=SÜLEYMAN); şifre `Test1234!`; giriş ucu `POST /api/portal/login` (**`/giris` DEĞİL** — o yol yok, SPA'ya düşüp HTML ile 200 döner).

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `shared/schema.ts` | `beyannameler` kolonları + üç indeks kuralı | T1 |
| `server/storage.ts` | `upsertBeyannameler` — (dosyaNo, rejim) kimliği | T1 |
| `server/beyannameParser.ts` | `rejim` parametresi + `AU` koşullu okuma | T1 |
| `server/routes.ts` | Parser çağrısına `"IM"` geçirme (tek satır) | T1 |
| `client/src/pages/portal/BeyannameSecici.tsx` | `dosyaNo` null-güvenliği | T1 |
| — | Uçtan uca doğrulama + kalite kapıları | T2 |

---

### Task 1: Şema + derleme uyumu

**Files:**
- Modify: `shared/schema.ts` (`beyannameler` bloğu, satır 983-999)
- Modify: `server/storage.ts` (`upsertBeyannameler`, satır 3441-3472)
- Modify: `server/beyannameParser.ts` (tamamı)
- Modify: `server/routes.ts` (satır 2017)
- Modify: `client/src/pages/portal/BeyannameSecici.tsx` (satır ~40, ~65, ~94-96)

**Interfaces:**
- Produces: `Beyanname` tipine `rejim: string`, `rejimKodu: string | null`, `kaynak: string` alanları; `dosyaNo: string | null` olur. `parseBeyannameWorkbook(buffer: Buffer, rejim: "IM" | "EX"): { rows: InsertBeyanname[] }`. T2 bunları tüketir.

- [ ] **Step 1: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise **DUR ve bildir** — bu görevde `db:push` var, yanlış hedef canlı şemayı değiştirir.

- [ ] **Step 2: Göç öncesi durumu kaydet (geri dönüş referansı)**

Run:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select indexname, indexdef from pg_indexes where tablename='beyannameler' order by indexname\").then(r=>{console.table(r.rows);return p.query(\"select count(*)::int toplam, count(*) filter (where dosya_no is null)::int dosyasiz from beyannameler\")}).then(r=>{console.log('ONCE:',r.rows[0]);process.exit(0)})"
```
Expected: `beyannameler_dosya_no_idx` (UNIQUE, dosya_no) ve `beyannameler_kullanici_idx` listelenir; `dosyasiz: 0`. Çıktıyı rapora **aynen** yapıştır.

- [ ] **Step 3: Şemayı değiştir**

`shared/schema.ts`'te `beyannameler` bloğunun TAMAMINI (satır 983-999) şununla DEĞİŞTİR:

```ts
export const beyannameler = pgTable("beyannameler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Transitte dosya no YOKTUR -> nullable. IM/EX icin parser her zaman doldurur.
  dosyaNo: text("dosya_no"),
  alici: text("alici"),
  gonderen: text("gonderen"),
  koli: integer("koli"),
  gumrukIdaresi: text("gumruk_idaresi"),
  beyanTarihi: text("beyan_tarihi"), // YYYY-MM-DD; Excel'de "." veya boş → null
  beyanNo: text("beyan_no"),
  fatBedeli: decimal("fat_bedeli", { precision: 18, scale: 2 }),
  doviz: text("doviz"),
  kullanici: text("kullanici"), // AV sütunu — temsilci filtre alanı
  // KANAL: hangi rapordan/uctan geldi. Gumruk rejim kodu DEGIL.
  // DEFAULT yalniz mevcut satirlari doldurmak icin; ice aktarma her zaman acikca yazar.
  rejim: text("rejim").notNull().default("IM"), // 'IM' | 'EX' | 'TR'
  // Ham gumruk rejim kodu (Excel AU sutunu): 4000, 7100, 5171 ...
  rejimKodu: text("rejim_kodu"),
  kaynak: text("kaynak").notNull().default("excel"), // 'excel' | 'manuel'
  sonGuncelleme: timestamp("son_guncelleme").defaultNow(),
}, (table) => [
  // IM ve EX ayni dosya no'yu kullanabilir -> kimlik CIFTTIR.
  // Tek kolonluk eski indeks, EX yuklemesinin IM kaydini sessizce ezmesine yol aciyordu.
  uniqueIndex("beyannameler_dosya_rejim_idx").on(table.dosyaNo, table.rejim),
  // Transitin kimligi beyan no'dur (dosya no'su yok). Kismi indeks: yalniz rejim='TR'.
  uniqueIndex("beyannameler_tr_beyan_no_idx").on(table.beyanNo).where(sql`${table.rejim} = 'TR'`),
  index("beyannameler_kullanici_idx").on(table.kullanici),
]);
```

**DİKKAT:** `uniqueIndex` ve `index` zaten dosyanın üst kısmında import edilmiş durumda — yeni import gerekmez. Doğrula: `grep -n "uniqueIndex" shared/schema.ts | head -3`.

- [ ] **Step 4: Şemayı dev veritabanına uygula**

Run: `npm run db:push`

Beklenen: hatasız tamamlanır. **Onay sorusu (prompt) çıkarsa çıktıyı aynen rapora yaz** — CI'da `db:push` etkileşimsiz çalışır ve bir prompt deploy'u sessizce kilitler (bu projede yaşandı). Prompt çıkarsa **DUR ve bildir**, kendi başına onaylama.

- [ ] **Step 5: Göç sonucunu doğrula — kolonlar**

Run:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select column_name, is_nullable, column_default from information_schema.columns where table_name='beyannameler' and column_name in ('dosya_no','rejim','rejim_kodu','kaynak') order by column_name\").then(r=>{console.table(r.rows);process.exit(0)})"
```
Expected: dört satır. `dosya_no` → `is_nullable: YES`. `rejim` → `NO`, default `'IM'::text`. `kaynak` → `NO`, default `'excel'::text`. `rejim_kodu` → `YES`.

- [ ] **Step 6: Göç sonucunu doğrula — indeksler (KRİTİK)**

Run:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select indexname, indexdef from pg_indexes where tablename='beyannameler' order by indexname\").then(r=>{r.rows.forEach(x=>console.log(x.indexname,'=>',x.indexdef));process.exit(0)})"
```
Expected — üçü de bulunmalı:
- `beyannameler_dosya_rejim_idx` → `UNIQUE ... (dosya_no, rejim)`
- `beyannameler_tr_beyan_no_idx` → `UNIQUE ... (beyan_no) WHERE (rejim = 'TR'::text)` — **`WHERE` kısmı MUTLAKA olmalı**
- `beyannameler_kullanici_idx`

Ve `beyannameler_dosya_no_idx` **listede OLMAMALI**.

**Kısmi indeks `WHERE`'siz oluşmuşsa veya hiç oluşmamışsa:** `drizzle-kit push` bu yapıyı desteklemiyor demektir. O zaman elle uygula ve bunu rapora yaz:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"drop index if exists beyannameler_tr_beyan_no_idx\").then(()=>p.query(\"create unique index beyannameler_tr_beyan_no_idx on beyannameler (beyan_no) where rejim = 'TR'\")).then(()=>{console.log('kismi indeks elle olusturuldu');process.exit(0)})"
```
Sonra Step 6'yı tekrar çalıştırıp `WHERE`'in geldiğini doğrula. **Şema tanımı olduğu gibi kalır** — runtime tablo ile şema tanımı ayrışmamalı.

- [ ] **Step 7: Mevcut satırların backfill'ini doğrula**

Run:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('select rejim, kaynak, count(*)::int adet from beyannameler group by 1,2 order by 3 desc').then(r=>{console.table(r.rows);return p.query(\"select count(*) filter (where dosya_no is null)::int dosyasiz, count(*) filter (where rejim_kodu is not null)::int kodlu from beyannameler\")}).then(r=>{console.log(r.rows[0]);process.exit(0)})"
```
Expected: tek grup — `rejim: IM`, `kaynak: excel`, `adet: 275` (dev DB'deki sayı). `dosyasiz: 0`, `kodlu: 0` (henüz yeniden içe aktarma yapılmadı).

- [ ] **Step 8: `upsertBeyannameler`'ı değiştir**

`server/storage.ts`'te `upsertBeyannameler` metodunun TAMAMINI şununla DEĞİŞTİR:

```ts
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
          rejimKodu: sql`excluded.rejim_kodu`,
          sonGuncelleme: sql`now()`,
        },
      });
    }
    const eklenen = kayitlar.filter((r) => !mevcutSet.has(anahtar(r))).length;
    return { eklenen, guncellenen: kayitlar.length - eklenen };
  }
```

**`set` bloğunda `rejim` ve `kaynak` YOKTUR** — ikisi de kayıt kimliğinin parçasıdır ve güncelleme sırasında değişmemelidir.

- [ ] **Step 9: Parser'ı değiştir**

`server/beyannameParser.ts` dosyasının TAMAMINI şununla DEĞİŞTİR:

```ts
import * as XLSX from "xlsx";
import { type InsertBeyanname } from "@shared/schema";

// Beklenen başlıklar → sütun harfleri ("İthalat Raporu" sayfası, 1. satır)
const BEKLENEN_BASLIKLAR: Record<string, string> = {
  A: "DOSYA NO",
  B: "ALICI",
  D: "GONDEREN",
  F: "KOLİ",
  I: "GUM.",
  K: "BEYAN TARİHİ",
  L: "BEYAN NO",
  M: "FAT.BEDELİ",
  N: "DÖVİZ",
  AV: "KULLANICI",
};

// Ham gümrük rejim kodu sütunu (4000, 7100, 5171 ...). KATI DOĞRULAMAYA DAHİL DEĞİL:
// tamamlayıcı bir alan, eksikliği çalışan içe aktarmayı durdurmamalı. Başlık tam
// eşleşmiyorsa hiç okunmaz (yanlış sütundan değer yazmaktansa null bırakılır).
const REJIM_KODU_SUTUNU = "AU";
const REJIM_KODU_BASLIGI = "REJİM";

// "DD.MM.YYYY" → "YYYY-MM-DD"; "." veya boş → null.
// new Date() KULLANILMAZ — timezone off-by-one tuzağı (commit c897dff).
export function parseBeyanTarihi(deger: unknown): string | null {
  if (typeof deger !== "string") return null;
  const m = deger.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseBeyannameWorkbook(
  buffer: Buffer,
  rejim: "IM" | "EX",
): { rows: InsertBeyanname[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.includes("İthalat Raporu")
    ? "İthalat Raporu"
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!grid.length) throw new Error(`"${sheetName}" sayfası boş`);

  // Başlık satırını DİNAMİK bul — bazı export'larda 1. satır bir bilgi/başlık
  // satırıdır ve gerçek başlıklar 2. (veya sonraki) satıra kayar. İlk 15 satırda
  // A sütunu "DOSYA NO" olan satırı ara; başlık 1. satırdaysa davranış değişmez.
  const aCol = XLSX.utils.decode_col("A");
  const taraSinir = Math.min(grid.length, 15);
  let baslikIdx = -1;
  for (let r = 0; r < taraSinir; r++) {
    if (String(grid[r]?.[aCol] ?? "").trim() === "DOSYA NO") {
      baslikIdx = r;
      break;
    }
  }
  if (baslikIdx === -1) {
    throw new Error(`"${sheetName}" sayfasında başlık satırı (A="DOSYA NO") ilk 15 satırda bulunamadı`);
  }

  // Başlık doğrulaması — uyuşmazlıkta yükleme REDDEDİLİR.
  // Sessiz sıfır-satır ithalatı yasak (gümrük fatura_tarihi dersinden).
  const baslikSatiri = grid[baslikIdx];
  const sorunlar: string[] = [];
  for (const [harf, beklenen] of Object.entries(BEKLENEN_BASLIKLAR)) {
    const idx = XLSX.utils.decode_col(harf);
    const bulunan = String(baslikSatiri[idx] ?? "").trim();
    if (bulunan !== beklenen) {
      sorunlar.push(`${harf} sütunu "${beklenen}" olmalı, "${bulunan}" bulundu`);
    }
  }
  if (sorunlar.length) {
    throw new Error(`Excel başlıkları uyuşmuyor: ${sorunlar.join("; ")}`);
  }

  // Rejim kodu sütunu KOŞULLU: başlık tam eşleşirse oku, yoksa hepsine null.
  const rejimKoduIdx = XLSX.utils.decode_col(REJIM_KODU_SUTUNU);
  const rejimKoduVar =
    String(baslikSatiri[rejimKoduIdx] ?? "").trim() === REJIM_KODU_BASLIGI;

  const col = (harf: string) => XLSX.utils.decode_col(harf);
  const metin = (v: unknown) => (v == null ? null : String(v).trim() || null);
  const rows: InsertBeyanname[] = [];
  for (let r = baslikIdx + 1; r < grid.length; r++) {
    const satir = grid[r];
    if (!satir) continue;
    const dosyaNo = String(satir[col("A")] ?? "").trim();
    if (!dosyaNo) continue; // boş satır — atla
    // Footer/özet satırlarını atla: gerçek dosya no "YY-NNNNN" biçimindedir
    // (ör. 26-10694). "TOPLAM KAYIT : 1982" gibi toplam satırları bu desene uymaz.
    if (!/^\d+-\d/.test(dosyaNo)) continue;
    rows.push({
      dosyaNo,
      alici: metin(satir[col("B")]),
      gonderen: metin(satir[col("D")]),
      koli: typeof satir[col("F")] === "number" ? (satir[col("F")] as number) : null,
      gumrukIdaresi: metin(satir[col("I")]),
      beyanTarihi: parseBeyanTarihi(satir[col("K")]),
      beyanNo: metin(satir[col("L")]),
      fatBedeli: typeof satir[col("M")] === "number" ? String(satir[col("M")]) : null,
      doviz: metin(satir[col("N")]),
      kullanici: metin(satir[col("AV")]),
      rejim,
      rejimKodu: rejimKoduVar ? metin(satir[rejimKoduIdx]) : null,
      kaynak: "excel",
    });
  }
  return { rows };
}
```

- [ ] **Step 10: Parser çağrısına rejim geçir**

`server/routes.ts` satır 2017'yi DEĞİŞTİR:

```ts
          const { rows } = parseBeyannameWorkbook(buffer);
```

şununla:

```ts
          // Bu uc YALNIZ ithalat raporunu alir. EX icin ayri uc gelecek (Faz 1b).
          const { rows } = parseBeyannameWorkbook(buffer, "IM");
```

- [ ] **Step 11: İstemci null-güvenliği**

`client/src/pages/portal/BeyannameSecici.tsx`:

**(a)** Filtre satırını DEĞİŞTİR:

```tsx
        b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
```

şununla:

```tsx
        (b.dosyaNo ?? "").toLocaleLowerCase("tr").includes(q) ||
```

**(b)** `const secili = beyannameler.find((b) => b.id === value);` satırının ALTINA ekle:

```tsx
  // dosyaNo transitte null olabilir -> beyanNo'ya duser.
  const kimlik = (b: Beyanname) => b.dosyaNo ?? b.beyanNo ?? "?";
```

**(c)** Tetikleyici etiketini DEĞİŞTİR:

```tsx
            {secili ? `${secili.dosyaNo} — ${secili.alici ?? "?"}` : placeholder}
```

şununla:

```tsx
            {secili ? `${kimlik(secili)} — ${secili.alici ?? "?"}` : placeholder}
```

**(d)** Liste satırındaki iki satırı DEĞİŞTİR:

```tsx
                    <div className="font-semibold">{b.dosyaNo}</div>
                    <div className="truncate text-xs text-muted-foreground">{b.alici ?? "?"}</div>
                    {b.beyanNo && <div className="truncate text-xs text-muted-foreground">{b.beyanNo}</div>}
```

şununla (beyan no üstte kimlik olarak gösterildiyse altta tekrar edilmez):

```tsx
                    <div className="font-semibold">{kimlik(b)}</div>
                    <div className="truncate text-xs text-muted-foreground">{b.alici ?? "?"}</div>
                    {b.dosyaNo && b.beyanNo && <div className="truncate text-xs text-muted-foreground">{b.beyanNo}</div>}
```

- [ ] **Step 12: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata. Hata çıkarsa nerede olduğunu rapora yaz ve **kaynağını** düzelt (tip zorlamasıyla `as any` bastırma).

- [ ] **Step 13: U+FFFD ve `toLowerCase` taraması**

Run:
```bash
node -e "['shared/schema.ts','server/storage.ts','server/beyannameParser.ts','server/routes.ts','client/src/pages/portal/BeyannameSecici.tsx'].forEach(f=>console.log(f, require('fs').readFileSync(f,'utf8').includes(String.fromCharCode(0xFFFD))))"
grep -c "toLowerCase(" client/src/pages/portal/BeyannameSecici.tsx server/beyannameParser.ts
```
Expected: beş `false`; `toLowerCase(` sayımı `BeyannameSecici.tsx` için `1` (satır ~32'deki **yorum**, kod değil — doğrula) ve parser için `0`.

- [ ] **Step 14: IM içe aktarma regresyonu — rejim kodu geliyor mu?**

**ÖNCE TOKEN:** dev `.env`'de `INGEST_TOKEN` **YOKTUR** — bu hâliyle uç `503 "Otomatik alım devre dışı"` döner ([routes.ts:384](../../../server/routes.ts#L384)). Test için geçici olarak ekle:

```bash
cp .env .env.ingest-yedek
printf '\nINGEST_TOKEN=e2e-test-token\n' >> .env
grep -c "^INGEST_TOKEN=" .env    # 1 olmalı
```
Bu adım `.env`'e yazdığı için **dev Neon'a bağlı olduğunu Step 1'de doğruladığından emin ol.** Görev sonunda (Step 15'ten ÖNCE) `cp .env.ingest-yedek .env` ile geri al ve `grep -c "^INGEST_TOKEN=" .env` → `0` olduğunu doğrula. **`.env` ve `.env.ingest-yedek` ASLA commit edilmez.**

Dev sunucuyu **token eklendikten SONRA** başlat (`npm run dev`, arka planda) — `INGEST_TOKEN` süreç başlangıcında okunur. Sonra depodaki `BEYANNAME LİSTESİ.xlsx` dosyasını yükle:

```bash
node -e "
require('dotenv').config();
const fs=require('fs');
const buf=fs.readFileSync('BEYANNAME LİSTESİ.xlsx');
fetch('http://localhost:5000/api/ingest/beyanname',{method:'POST',headers:{'Content-Type':'application/octet-stream','x-dosya-adi':'regresyon.xlsx','x-ingest-token':process.env.INGEST_TOKEN||''},body:buf})
 .then(r=>r.json()).then(j=>{console.log(JSON.stringify(j));process.exit(0)});
"
```
Token başlığı `x-ingest-token`, env değişkeni `INGEST_TOKEN` ([routes.ts:382-390](../../../server/routes.ts#L382-L390)).

Expected: `durum: "basarili"`, ~275 satır, **`eklenen: 0`** (hepsi zaten var, güncellendi). Sonra:

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('select rejim_kodu, count(*)::int adet from beyannameler group by 1 order by 2 desc').then(r=>{console.table(r.rows);process.exit(0)})"
```
Expected: `7100`→92, `4000`→73, `4071`→47, `5171`→23, `5100`→12, `6771`→7, `5371`→6, `6121`→5, `7123`→5, `4010`→4, `6323`→1. (Toplam 275; sayılar Excel'deki `AU` dağılımıyla birebir aynı olmalı.) `null` grubu **olmamalı**.

Uyuşmazlık varsa kodu değiştirip "geçirmeye" çalışma — nedenini bul ve raporla.

- [ ] **Step 15: Commit**

```bash
git add shared/schema.ts server/storage.ts server/beyannameParser.ts server/routes.ts client/src/pages/portal/BeyannameSecici.tsx
git status
git commit -m "feat(beyanname): rejim altyapisi — IM/EX/TR kanali, rejim kodu, (dosya_no, rejim) benzersizligi

EX yuklemesinin ayni numarali IM kaydini sessizce ezmesi yapisal olarak
imkansiz hale geldi: kimlik artik (dosya_no, rejim) cifti. Transit icin
dosya_no nullable ve beyan_no uzerinde kismi benzersiz indeks var.
Excel'in AU=REJIM sutunu ham gumruk kodu olarak saklaniyor (katı baslik
dogrulamasina dahil DEGIL — eksikligi calisan akisi durdurmasin).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
`git status` YALNIZ bu 5 dosyayı staged göstermeli.

---

### Task 2: Uçtan uca doğrulama + kalite kapıları

**Files:**
- Create (scratchpad): `e2e-rejim.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla; "geçsin diye" değiştirme.

**Interfaces:**
- Consumes: T1'in şeması ve `parseBeyannameWorkbook(buffer, rejim)` imzası

- [ ] **Step 1: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise **DUR**.

- [ ] **Step 2: ÇAKIŞMA TESTİ — bu fazın varlık sebebi**

Aynı `dosya_no` ile biri `IM` biri `EX` iki satır eklenir; **ikisi de yaşamalıdır**. Eski şemada ikincisi birinciyi ezerdi.

```bash
node -e "
require('dotenv').config();const{Pool}=require('@neondatabase/serverless');
const p=new Pool({connectionString:process.env.DATABASE_URL});
(async()=>{
  await p.query(\"delete from beyannameler where dosya_no = 'E2E-9001'\");
  await p.query(\"insert into beyannameler (dosya_no, alici, rejim, kaynak) values ('E2E-9001','ITHALAT FIRMASI','IM','excel')\");
  await p.query(\"insert into beyannameler (dosya_no, alici, rejim, kaynak) values ('E2E-9001','IHRACAT FIRMASI','EX','excel')\");
  const r = await p.query(\"select dosya_no, rejim, alici from beyannameler where dosya_no='E2E-9001' order by rejim\");
  console.table(r.rows);
  console.log(r.rows.length === 2 ? 'PASS: iki satir da yasiyor' : 'FAIL: satir sayisi ' + r.rows.length);
  process.exit(0);
})();
"
```
Expected: **iki satır**, biri `IM`/`ITHALAT FIRMASI`, biri `EX`/`IHRACAT FIRMASI`. `PASS` yazmalı.

- [ ] **Step 3: Aynı rejimde çakışma hâlâ engelleniyor mu?**

```bash
node -e "
require('dotenv').config();const{Pool}=require('@neondatabase/serverless');
const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(\"insert into beyannameler (dosya_no, alici, rejim, kaynak) values ('E2E-9001','IKINCI ITHALAT','IM','excel')\")
 .then(()=>{console.log('FAIL: ayni (dosya_no, rejim) ikinci kez eklendi — benzersizlik CALISMIYOR');process.exit(1)})
 .catch(e=>{console.log('PASS: reddedildi ->', e.message.slice(0,80));process.exit(0)});
"
```
Expected: `PASS` — benzersizlik ihlali hatası.

- [ ] **Step 4: TR benzersizlik testi**

```bash
node -e "
require('dotenv').config();const{Pool}=require('@neondatabase/serverless');
const p=new Pool({connectionString:process.env.DATABASE_URL});
(async()=>{
  await p.query(\"delete from beyannameler where beyan_no in ('E2ETR0001','E2ETR0002')\");
  await p.query(\"insert into beyannameler (dosya_no, beyan_no, alici, rejim, kaynak) values (null,'E2ETR0001','TRANSIT FIRMA','TR','manuel')\");
  try {
    await p.query(\"insert into beyannameler (dosya_no, beyan_no, alici, rejim, kaynak) values (null,'E2ETR0001','BASKA FIRMA','TR','manuel')\");
    console.log('FAIL: ayni beyan_no ile ikinci TR eklendi');
  } catch (e) { console.log('PASS: mukerrer TR reddedildi ->', e.message.slice(0,60)); }
  await p.query(\"insert into beyannameler (dosya_no, beyan_no, alici, rejim, kaynak) values (null,'E2ETR0002','IKINCI TRANSIT','TR','manuel')\");
  const r = await p.query(\"select count(*)::int c from beyannameler where rejim='TR'\");
  console.log(r.rows[0].c === 2 ? 'PASS: farkli beyan_no ile ikinci TR kabul edildi' : 'FAIL: TR sayisi ' + r.rows[0].c);
  process.exit(0);
})();
"
```
Expected: iki `PASS`. (Kısmi indeks doğru kurulmuşsa `rejim='IM'` satırlarındaki tekrar eden/boş `beyan_no`'lar bu indeksi ihlal etmez — Step 2'deki IM satırının `beyan_no`'su null olduğu için sorun çıkmamalı.)

- [ ] **Step 5: Portal regresyonu (Playwright)**

Kalıcı test setini kullan — **yeni kullanıcı/beyanname YARATMA**. `optest` / `muhasebe` / `suleyman`, şifre `Test1234!`, giriş `POST /api/portal/login`.

Dört masraf ekranında beyanname seçicinin bozulmadığını doğrula:
1. **Kasam** (`optest`) → Yeni Ödeme Kaydet → seçici açılır, liste gelir, Ref ile ara → eşleşir, seç → tetikleyicide `{dosyaNo} — {alici}` görünür.
2. **Doğrudan Ödeme** (`muhasebe`) → aynı akış; **beyan no ile arama** çalışır.
3. **Yeni Talep** (`suleyman`) → liste `SÜLEYMAN` beyannameleriyle geliyor (boş değil), seçim çalışıyor.
4. **Türkçe I/İ:** büyük harfli Türkçe alıcı adını **küçük harfle** ara → eşleşir (`toLocaleLowerCase("tr")` korunmuş).
5. **E2E-9001** aramasında **iki satır** (IM ve EX) görünür — ikisi de seçilebilir. Bu, çakışma düzeltmesinin arayüzde de doğru göründüğünün kanıtıdır.
6. Bir masraf kaydet → **gerçek HTTP yanıt kodu** 2xx (yalnız toast metnine bakma).

Her adımın PASS/FAIL + kanıtını raporla.

- [ ] **Step 6: Test verisini temizle**

```bash
node -e "
require('dotenv').config();const{Pool}=require('@neondatabase/serverless');
const p=new Pool({connectionString:process.env.DATABASE_URL});
(async()=>{
  await p.query(\"delete from operasyon_masraflar where beyanname_id in (select id from beyannameler where dosya_no='E2E-9001' or beyan_no like 'E2ETR%')\");
  await p.query(\"delete from odeme_talepleri where beyanname_id in (select id from beyannameler where dosya_no='E2E-9001' or beyan_no like 'E2ETR%')\");
  await p.query(\"delete from beyannameler where dosya_no='E2E-9001' or beyan_no like 'E2ETR%'\");
  const r = await p.query(\"select count(*) filter (where dosya_no='E2E-9001' or beyan_no like 'E2ETR%')::int kalan, count(*) filter (where dosya_no is null)::int dosyasiz, count(*)::int toplam from beyannameler\");
  console.log(r.rows[0]);
  process.exit(0);
})();
"
```
Expected: `kalan: 0`, **`dosyasiz: 0`** (Faz 1a sonunda dosya no'su null satır kalmamalı — geri alınabilirlik buna bağlı), `toplam: 275`.

- [ ] **Step 7: Kalite kapıları**

Run: `npm run check` → 0 hata.
Run: `npm run build` → hatasız; `dist/` üretilir.
Run: `git diff --stat $(git merge-base origin/main HEAD)..HEAD -- package.json package-lock.json migrations/` → **boş** (yeni paket yok, migration dosyası yok).

- [ ] **Step 8: Dev sunucuyu durdur**

Testler bittiğinde başlattığın `npm run dev` sürecini kapat — bu projede daha önce 11 kalıntı node süreci birikmişti.

- [ ] **Step 9: Commit (yalnız gerçek bir hata düzeltildiyse)**

Kod değişmediyse commit YOK. Değiştiyse açık yolla ekle + `fix(beyanname): …` mesajı.

---

## Self-Review Notu

**Spec kapsamı:**
- §3.1 tek tablo → T1 Step 3 (ayrı transit tablosu yok)
- §3.2 `rejim` = kanal → T1 Step 3 (kolon + yorum), Step 10 (`"IM"` açıkça geçiliyor)
- §3.3 ham gümrük kodu → T1 Step 9 (koşullu `AU` okuma), Step 14 (dağılım doğrulaması)
- §3.4 `kaynak` → T1 Step 3, Step 9
- §3.5 geri alınabilirlik → T2 Step 6 (`dosyasiz: 0` şartı)
- §4 şema tablosu + üç indeks → T1 Step 3; doğrulaması Step 5-7
- §5 upsert üç değişiklik → T1 Step 8
- §6 parser → T1 Step 9-10
- §7 istemci üç nokta → T1 Step 11
- §8 göç riski (prompt, kısmi indeks, canlı doğrulama) → T1 Step 2, 4, 6
- §8 doğrulama listesi → T1 Step 12-14 + T2 Step 2-7

**Tip tutarlılığı:** `parseBeyannameWorkbook(buffer, rejim)` imzası T1 Step 9'da tanımlanıyor, Step 10'da aynen çağrılıyor. `anahtar()` yardımcısı `{ dosyaNo?: string | null; rejim?: string | null }` alıyor; hem `InsertBeyanname` (rejim opsiyonel — `notNull().default()` olduğu için) hem `select` sonucu (rejim `string`) bu şekle uyuyor. `kimlik(b: Beyanname)` T1 Step 11b'de tanımlanıp 11c ve 11d'de kullanılıyor; `Beyanname` tipi dosyada zaten import edilmiş.

**Bu görevin üç tuzağı:**
1. **`db:push` promptu** — CI'da etkileşimsiz çalışır, bir onay sorusu deploy'u sessizce kilitler (bu projede yaşandı). T1 Step 4 promptu görürse durmayı şart koşuyor.
2. **Kısmi indeks** — `drizzle-kit push` `WHERE`'li unique indeksi atlayabilir. T1 Step 6 `pg_indexes` çıktısında `WHERE` metnini **birebir** arıyor ve atlanmışsa elle uygulama yolunu veriyor.
3. **`set` bloğuna `rejim` sızması** — `ON CONFLICT ... SET rejim = excluded.rejim` yazılırsa kimlik güncellemede değişebilir hale gelir ve çakışma koruması anlamsızlaşır. T1 Step 8 bunu açıkça yasaklıyor.

**Kapsam dışı (görev YOK):** EX parser'ı ve `/api/ingest/beyanname-ex` (Faz 1b) · arayüzde IM/EX/TR seçimi ve filtreleme (Faz 2) · manuel transit ekleme ucu ve akışı (Faz 2) · rejim kırılımlı raporlar · `gumruk_verileri` tablosu · mevcut IM ingest ucunun adresi.
