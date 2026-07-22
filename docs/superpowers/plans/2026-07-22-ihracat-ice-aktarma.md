# İhracat (EX) İçe Aktarma — Faz 1b Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** İhracat beyanname listesini ithalattan bağımsız, kendi ucundan ve kendi ayrıştırıcısıyla sisteme almak.

**Architecture:** `server/beyannameParser.ts`'e ikinci bir ayrıştırıcı (`parseIhracatWorkbook`) eklenir; ithalat ayrıştırıcısının artık anlamsız kalan `rejim` parametresi kaldırılır. İkisi de `{ rows, uyarilar }` döndürür — Faz 1a'da ertelenen "sessiz rejim kodu kaybı" böylece loga yansır. `server/routes.ts`'e `/api/ingest/beyanname-ex` ucu eklenir; mevcut ithalat ucu adres ve davranış olarak değişmez. `server/storage.ts`'te `rejimKodu` NULL ile ezilmesin diye `coalesce` konur. **Şema değişikliği YOK.**

**Tech Stack:** Express (ESM, tsx) · Drizzle ORM 0.39.1 · xlsx · Neon Postgres

**Spec:** [docs/superpowers/specs/2026-07-22-ihracat-ice-aktarma-design.md](../specs/2026-07-22-ihracat-ice-aktarma-design.md)

## Global Constraints

- **ŞEMA DEĞİŞİKLİĞİ YOK.** `shared/schema.ts` dokunulmaz, `db:push` çalıştırılmaz, `migrations/` dokunulmaz.
- **Mevcut ithalat ucu `/api/ingest/beyanname` ADRESİ ve DAVRANIŞI değişmez.** Yalnız çağrı imzası sadeleşir (parametre kalkar) ve log mesajına uyarı eklenebilir.
- **`rejim` her zaman AÇIKÇA yazılır:** ithalat ayrıştırıcısı `"IM"`, ihracat ayrıştırıcısı `"EX"`. Şemadaki `DEFAULT 'IM'`'e güvenilmez.
- **`kaynak: "excel"`** her iki ayrıştırıcıda da yazılır.
- **İhracat sütun eşlemesi (spec §4, birebir):** `alici` ← **`B` GONDEREN** (bizim müşterimiz) · `gonderen` ← **`C` ALICI** (yurtdışı) · `fatBedeli` ← **`R` CIF** (FOB DEĞİL) · `kullanici` ← **`Z` GİREN** (`E` MÜŞTERİ TEMSİLCİSİ **kullanılmaz**) · `rejimKodu` ← `AM` REJİM.
- **`S` sütununun başlığı YOKTUR ve asla olmayacak.** Konumdan okunur; **komşuları `R="CIF"` ve `T="NAKLİYECİ"` katı doğrulamaya dahildir** (düzen kayarsa önce onlar patlar) ve içerik `/^[A-Z]{2,3}$/` desenine göre doğrulanır — **uyum oranı %95'in altındaysa yükleme REDDEDİLİR.**
- **`new Date(...)` ile tarih AYRIŞTIRILMAZ.** Excel seri numarası saf UTC aritmetiğiyle çevrilir; doğrulanmış değerler: `46205 → 2026-07-02`, `46212 → 2026-07-09`.
- **Sessiz sıfır-satır ithalatı yasak** — başlık uyuşmazlığında ve sıfır satırda yükleme reddedilir (mevcut felsefe korunur).
- Türkçe küçültme `toLocaleLowerCase("tr")`; `toLowerCase()` YASAK.
- **DEV DB izolasyonu:** yazma testi öncesi `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true`; değilse **DUR**.
- **YENİ NPM PAKETİ YOK.** `package.json`/lockfile değişmez.
- **`git add` YALNIZ açık dosya yoluyla.** `-A`/`.` ASLA. **`git push` YAPILMAZ.** **`.env` ve `.env.*-yedek` ASLA commit edilmez.** **`*.xlsx` commit EDİLMEZ.**
- **Türkçe kaynak dosyasını PowerShell `Set-Content` ile yeniden YAZMA.** Write/Edit; U+FFFD **ve** Kiril/Yunan homoglif taraması (`/[Ѐ-ӿͰ-Ͽ]/`).
- Kalite kapıları: `npm run check` (0 hata) ve `npm run build`. Test koşucusu/linter yok, uydurma.
- **Kalıcı dev test seti hazır** — yeni portal kullanıcısı yaratma: `optest`/`muhasebe`/`suleyman`, şifre `Test1234!`, giriş `POST /api/portal/login` (`/giris` DEĞİL).
- Dev sunucu işi bitince **kapatılır** (bu projede 11 kalıntı node süreci birikmişti).

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `server/beyannameParser.ts` | İki ayrıştırıcı + Excel seri tarih + `{rows, uyarilar}` dönüş | T1 |
| `server/storage.ts` | `rejimKodu` NULL ezilmesini `coalesce` ile önle | T1 |
| `server/routes.ts` | `/api/ingest/beyanname-ex` ucu + iki mevcut çağrı yeri + log uyarısı | T1 |
| — | Gerçek 13.942 satırlık dosyayla uçtan uca doğrulama | T2 |

---

### Task 1: İhracat ayrıştırıcısı + uç + taşınan iki düzeltme

**Files:**
- Modify: `server/beyannameParser.ts` (tamamı)
- Modify: `server/storage.ts` (`upsertBeyannameler` `set` bloğu, `rejimKodu` satırı)
- Modify: `server/routes.ts` (satır ~1993 tip kontrolü, ~2017 ithalat dalı, EX dalı ekleme, ~4648 elle yükleme ucu)

**Interfaces:**
- Produces:
  - `type AyristirmaSonucu = { rows: InsertBeyanname[]; uyarilar: string[] }`
  - `parseBeyannameWorkbook(buffer: Buffer): AyristirmaSonucu` — **parametre KALKTI**, içeride `rejim: "IM"`
  - `parseIhracatWorkbook(buffer: Buffer): AyristirmaSonucu` — içeride `rejim: "EX"`
  - `excelSeriTarih(deger: unknown): string | null`
  - Uç: `POST /api/ingest/beyanname-ex` (token korumalı, ham binary, log `tip: "beyanname-ex"`)
- T2 bunları tüketir.

- [ ] **Step 1: Ayrıştırıcı dosyasını yeniden yaz**

`server/beyannameParser.ts` dosyasının TAMAMINI şununla DEĞİŞTİR:

```ts
import * as XLSX from "xlsx";
import { type InsertBeyanname } from "@shared/schema";

// Her iki ayristirici da bunu doner. `uyarilar` YUKLEMEYI BLOKLAMAZ — cagiran uc
// bunlari otomatik_yukleme_log mesajina ekler. Amac: sessizce eksik yazilan bir
// alanin haftalarca fark edilmemesini onlemek.
export type AyristirmaSonucu = { rows: InsertBeyanname[]; uyarilar: string[] };

// ---------------------------------------------------------------- ITHALAT

// Beklenen başlıklar → sütun harfleri ("İthalat Raporu" sayfası)
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
// eşleşmiyorsa hiç okunmaz (yanlış sütundan değer yazmaktansa null bırakılır) —
// ama artık SESSİZ değil, uyarı olarak dönülür.
const REJIM_KODU_SUTUNU = "AU";
const REJIM_KODU_BASLIGI = "REJİM";

// ---------------------------------------------------------------- IHRACAT

// "İhracat Raporu" sayfası. Q (FOB) ve T (NAKLİYECİ) SAKLANMAZ — yalnız başlıksız
// S sütununu konumlandıran ÇAPA olarak doğrulanır: düzen kayarsa önce bunlar patlar.
const EX_BASLIKLAR: Record<string, string> = {
  A: "DOSYA NO",
  B: "GONDEREN",
  C: "ALICI",
  F: "GÇB NO",
  G: "GÇB TAR.",
  I: "KOLİ",
  M: "GÜMRÜK",
  Q: "FOB",
  R: "CIF",
  T: "NAKLİYECİ",
  Z: "GİREN",
  AM: "REJİM",
};

// S sutununun BASLIGI YOKTUR ve kaynak rapor degistirilemiyor (kullanici teyit etti).
// Bu yuzden konumdan okunur ama ICERIKTEN dogrulanir: doviz kodu deseni.
// Olcum: 13942/13942 uyuyor (CHF EUR GBP NOK RUB TL USD).
const EX_DOVIZ_SUTUNU = "S";
const DOVIZ_DESENI = /^[A-Z]{2,3}$/;
const DOVIZ_ASGARI_UYUM = 0.95;

// ---------------------------------------------------------------- YARDIMCILAR

// "DD.MM.YYYY" → "YYYY-MM-DD"; "." veya boş → null.
// new Date() ile AYRIŞTIRMA yapılmaz — timezone off-by-one tuzağı (commit c897dff).
export function parseBeyanTarihi(deger: unknown): string | null {
  if (typeof deger !== "string") return null;
  const m = deger.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Excel seri numarası → "YYYY-MM-DD". İhracat raporunda tarihler sayı olarak gelir (46205).
// Date BURADA yalnız EPOCH ARİTMETİĞİ için kullanılır: girdi bir milisaniye sayısıdır,
// çıktı getUTC* ile okunur. Metin AYRIŞTIRMA veya yerel saat YOKTUR, dolayısıyla
// timezone kaymasi imkansizdir. Epoch 1899-12-30 (Excel'in 1900 artık yıl hatası dahil).
// Doğrulanmış: 46205 → 2026-07-02, 46212 → 2026-07-09.
export function excelSeriTarih(deger: unknown): string | null {
  if (typeof deger !== "number" || !Number.isFinite(deger) || deger <= 0) return null;
  const gun = Math.floor(deger);
  const d = new Date(Date.UTC(1899, 11, 30) + gun * 86400000);
  const yil = d.getUTCFullYear();
  if (yil < 1990 || yil > 2100) return null; // sacma seri -> null, sessizce yanlis tarih yazma
  const ay = String(d.getUTCMonth() + 1).padStart(2, "0");
  const gunStr = String(d.getUTCDate()).padStart(2, "0");
  return `${yil}-${ay}-${gunStr}`;
}

const metin = (v: unknown) => (v == null ? null : String(v).trim() || null);
const sayi = (v: unknown) => (typeof v === "number" ? v : null);
const paraMetni = (v: unknown) => (typeof v === "number" ? String(v) : null);

// Başlık satırını DİNAMİK bul — bazı export'larda 1. satır bir bilgi satırıdır ve
// gerçek başlıklar aşağı kayar. İlk 15 satırda A sütunu "DOSYA NO" olanı ara.
function baslikSatiriniBul(grid: unknown[][], sheetName: string): number {
  const aCol = XLSX.utils.decode_col("A");
  const sinir = Math.min(grid.length, 15);
  for (let r = 0; r < sinir; r++) {
    if (String(grid[r]?.[aCol] ?? "").trim() === "DOSYA NO") return r;
  }
  throw new Error(`"${sheetName}" sayfasında başlık satırı (A="DOSYA NO") ilk 15 satırda bulunamadı`);
}

// Başlık doğrulaması — uyuşmazlıkta yükleme REDDEDİLİR.
// Sessiz sıfır-satır ithalatı yasak (gümrük fatura_tarihi dersinden).
function basliklariDogrula(baslikSatiri: unknown[], beklenen: Record<string, string>): void {
  const sorunlar: string[] = [];
  for (const [harf, bek] of Object.entries(beklenen)) {
    const bulunan = String(baslikSatiri[XLSX.utils.decode_col(harf)] ?? "").trim();
    if (bulunan !== bek) sorunlar.push(`${harf} sütunu "${bek}" olmalı, "${bulunan}" bulundu`);
  }
  if (sorunlar.length) throw new Error(`Excel başlıkları uyuşmuyor: ${sorunlar.join("; ")}`);
}

function sayfaVeGrid(buffer: Buffer, tercihEdilen: string) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.includes(tercihEdilen) ? tercihEdilen : wb.SheetNames[0];
  const grid: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
  if (!grid.length) throw new Error(`"${sheetName}" sayfası boş`);
  return { sheetName, grid };
}

// Gerçek dosya no "YY-NNNNN" biçimindedir (ör. 26-10694).
// "TOPLAM KAYIT : 1982" gibi footer/özet satırları bu desene uymaz.
const DOSYA_NO_DESENI = /^\d+-\d/;

// ---------------------------------------------------------------- ITHALAT AYRISTIRICI

export function parseBeyannameWorkbook(buffer: Buffer): AyristirmaSonucu {
  const { sheetName, grid } = sayfaVeGrid(buffer, "İthalat Raporu");
  const baslikIdx = baslikSatiriniBul(grid, sheetName);
  const baslikSatiri = grid[baslikIdx];
  basliklariDogrula(baslikSatiri, BEKLENEN_BASLIKLAR);

  const uyarilar: string[] = [];
  const rejimKoduIdx = XLSX.utils.decode_col(REJIM_KODU_SUTUNU);
  const rejimKoduVar = String(baslikSatiri[rejimKoduIdx] ?? "").trim() === REJIM_KODU_BASLIGI;
  if (!rejimKoduVar) {
    uyarilar.push(
      `rejim kodu sütunu okunamadı (${REJIM_KODU_SUTUNU} başlığı "${REJIM_KODU_BASLIGI}" değil) — rejim kodları boş bırakıldı`,
    );
  }

  const col = (harf: string) => XLSX.utils.decode_col(harf);
  const rows: InsertBeyanname[] = [];
  for (let r = baslikIdx + 1; r < grid.length; r++) {
    const satir = grid[r];
    if (!satir) continue;
    const dosyaNo = String(satir[col("A")] ?? "").trim();
    if (!dosyaNo || !DOSYA_NO_DESENI.test(dosyaNo)) continue;
    rows.push({
      dosyaNo,
      alici: metin(satir[col("B")]),
      gonderen: metin(satir[col("D")]),
      koli: sayi(satir[col("F")]),
      gumrukIdaresi: metin(satir[col("I")]),
      beyanTarihi: parseBeyanTarihi(satir[col("K")]),
      beyanNo: metin(satir[col("L")]),
      fatBedeli: paraMetni(satir[col("M")]),
      doviz: metin(satir[col("N")]),
      kullanici: metin(satir[col("AV")]),
      rejim: "IM",
      rejimKodu: rejimKoduVar ? metin(satir[rejimKoduIdx]) : null,
      kaynak: "excel",
    });
  }
  return { rows, uyarilar };
}

// ---------------------------------------------------------------- IHRACAT AYRISTIRICI

export function parseIhracatWorkbook(buffer: Buffer): AyristirmaSonucu {
  const { sheetName, grid } = sayfaVeGrid(buffer, "İhracat Raporu");
  const baslikIdx = baslikSatiriniBul(grid, sheetName);
  basliklariDogrula(grid[baslikIdx], EX_BASLIKLAR);

  const col = (harf: string) => XLSX.utils.decode_col(harf);
  const dovizIdx = col(EX_DOVIZ_SUTUNU);
  const uyarilar: string[] = [];
  const rows: InsertBeyanname[] = [];
  let dovizDolu = 0;
  let dovizUyan = 0;

  for (let r = baslikIdx + 1; r < grid.length; r++) {
    const satir = grid[r];
    if (!satir) continue;
    const dosyaNo = String(satir[col("A")] ?? "").trim();
    if (!dosyaNo || !DOSYA_NO_DESENI.test(dosyaNo)) continue;

    const dovizHam = metin(satir[dovizIdx]);
    if (dovizHam) {
      dovizDolu++;
      if (DOVIZ_DESENI.test(dovizHam)) dovizUyan++;
    }

    rows.push({
      dosyaNo,
      // ROLLER TERS: ihracatta BIZIM MUSTERIMIZ gonderendir. Ekranlarda her rejimde
      // "bizim musteri" gorunsun diye B -> alici, C -> gonderen (kullanici karari).
      alici: metin(satir[col("B")]),
      gonderen: metin(satir[col("C")]),
      koli: sayi(satir[col("I")]),
      gumrukIdaresi: metin(satir[col("M")]),
      beyanTarihi: excelSeriTarih(satir[col("G")]) ?? parseBeyanTarihi(satir[col("G")]),
      beyanNo: metin(satir[col("F")]),
      fatBedeli: paraMetni(satir[col("R")]), // CIF — kullanici karari, FOB DEGIL
      doviz: dovizHam,
      kullanici: metin(satir[col("Z")]), // GİREN — E "MÜŞTERİ TEMSİLCİSİ" degil (246 satiri bos)
      rejim: "EX",
      rejimKodu: metin(satir[col("AM")]),
      kaynak: "excel",
    });
  }

  // S sutunu basliksiz oldugu icin ICERIKTEN dogrulanir. Sutun duzeni kaydiysa
  // burada sayi/metin karisimi gelir ve oran coker -> yukleme REDDEDILIR.
  if (dovizDolu > 0) {
    const oran = dovizUyan / dovizDolu;
    if (oran < DOVIZ_ASGARI_UYUM) {
      throw new Error(
        `${EX_DOVIZ_SUTUNU} sütunu döviz kodu içermiyor (${dovizUyan}/${dovizDolu} uyumlu, ` +
          `beklenen en az %${Math.round(DOVIZ_ASGARI_UYUM * 100)}). Sütun düzeni değişmiş olabilir.`,
      );
    }
  } else if (rows.length > 0) {
    uyarilar.push(`${EX_DOVIZ_SUTUNU} sütunu tamamen boş — döviz bilgisi yazılamadı`);
  }

  return { rows, uyarilar };
}
```

- [ ] **Step 2: `rejimKodu` NULL ezilmesini engelle**

`server/storage.ts`'te `upsertBeyannameler`'ın `set` bloğundaki şu satırı BUL:

```ts
          rejimKodu: sql`excluded.rejim_kodu`,
```

şununla DEĞİŞTİR:

```ts
          // Basligi bozuk bir dosya, mevcut DOLU rejim kodlarini NULL'a EZMESIN.
          rejimKodu: sql`coalesce(excluded.rejim_kodu, ${beyannameler.rejimKodu})`,
```

`beyannameler` zaten bu dosyada import edilmiş durumda — doğrula: `grep -n "beyannameler," server/storage.ts | head -2`.

- [ ] **Step 3: İthalat çağrı yerlerini sadeleştir**

`server/routes.ts`'te **iki** çağrı yeri var. Birincisi (otomatik alım, ~satır 2017-2018):

```ts
          // Bu uc YALNIZ ithalat raporunu alir. EX icin ayri uc gelecek (Faz 1b).
          const { rows } = parseBeyannameWorkbook(buffer, "IM");
          if (!rows.length) throw new Error("Excel'de veri satırı bulunamadı");
          const sonuc = await storage.upsertBeyannameler(rows);
          const mesaj = `${rows.length} satır (${sonuc.eklenen} yeni, ${sonuc.guncellenen} güncellendi)`;
```

şununla DEĞİŞTİR:

```ts
          // Bu uc YALNIZ ithalat raporunu alir; ihracat /api/ingest/beyanname-ex'e gider.
          const { rows, uyarilar } = parseBeyannameWorkbook(buffer);
          if (!rows.length) throw new Error("Excel'de veri satırı bulunamadı");
          const sonuc = await storage.upsertBeyannameler(rows);
          const mesaj = `${rows.length} satır (${sonuc.eklenen} yeni, ${sonuc.guncellenen} güncellendi)`
            + (uyarilar.length ? ` — UYARI: ${uyarilar.join("; ")}` : "");
```

İkincisi (yönetim panelinden elle yükleme, **satır 4648**) — **farklı bir tampon kullanıyor**, dikkat:

```ts
      const { rows } = parseBeyannameWorkbook(req.file.buffer, "IM");
```

şununla DEĞİŞTİR:

```ts
      const { rows } = parseBeyannameWorkbook(req.file.buffer);
```

(Uyarılar bu uçta gösterilmiyor — elle yükleme, kullanıcı sonucu ekranda görüyor.)

**Doğrula:** `grep -c "parseBeyannameWorkbook(.*\"IM\")" server/routes.ts` → **0** olmalı; `grep -n "parseBeyannameWorkbook" server/routes.ts` → import + iki çağrı = 3 satır.

- [ ] **Step 4: EX ucunu ekle**

`server/routes.ts`'te tip kontrolünü BUL (~satır 1993):

```ts
      if (tip !== "mizan" && tip !== "beyanname") {
        await storage.insertOtomatikYuklemeLog({ tip: req.params.tip, dosyaAdi, durum: "hata", kayitSayisi: 0, mesaj: "Geçersiz tip (mizan | beyanname)", zaman: zamanDamgasi() });
        return res.status(400).json({ error: "Geçersiz tip (mizan | beyanname)" });
      }
```

şununla DEĞİŞTİR:

```ts
      if (tip !== "mizan" && tip !== "beyanname" && tip !== "beyanname-ex") {
        await storage.insertOtomatikYuklemeLog({ tip: req.params.tip, dosyaAdi, durum: "hata", kayitSayisi: 0, mesaj: "Geçersiz tip (mizan | beyanname | beyanname-ex)", zaman: zamanDamgasi() });
        return res.status(400).json({ error: "Geçersiz tip (mizan | beyanname | beyanname-ex)" });
      }
```

Sonra ithalat dalının (`} else {` ile başlayan blok) yapısını üç dallı hâle getir. Step 3'te düzenlediğin `} else {` satırını şununla DEĞİŞTİR:

```ts
        } else if (tip === "beyanname-ex") {
          const { rows, uyarilar } = parseIhracatWorkbook(buffer);
          if (!rows.length) throw new Error("Excel'de veri satırı bulunamadı");
          const sonuc = await storage.upsertBeyannameler(rows);
          const mesaj = `${rows.length} satır (${sonuc.eklenen} yeni, ${sonuc.guncellenen} güncellendi)`
            + (uyarilar.length ? ` — UYARI: ${uyarilar.join("; ")}` : "");
          await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "basarili", kayitSayisi: rows.length, mesaj, zaman: zamanDamgasi() });
          return res.json({ durum: "basarili", tip, kayitSayisi: rows.length, mesaj });
        } else {
```

Import satırını güncelle: `import { parseBeyannameWorkbook } from "./beyannameParser";` →

```ts
import { parseBeyannameWorkbook, parseIhracatWorkbook } from "./beyannameParser";
```

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata. Hata varsa **kaynağını** düzelt, `as any` ile bastırma.

- [ ] **Step 6: Karakter taraması**

Run:
```bash
node -e "['server/beyannameParser.ts','server/routes.ts','server/storage.ts'].forEach(f=>{const s=require('fs').readFileSync(f,'utf8');console.log(f,'U+FFFD:',s.includes(String.fromCharCode(0xFFFD)),'| Kiril/Yunan:',[...s.matchAll(/[Ѐ-ӿͰ-Ͽ]/g)].length)})"
grep -c "toLowerCase(" server/beyannameParser.ts
```
Expected: üç satırda da `U+FFFD: false` ve `Kiril/Yunan: 0`; `toLowerCase(` sayımı `0`.

- [ ] **Step 7: Seri tarih dönüşümünü doğrula**

Run:
```bash
npx tsx -e "import {excelSeriTarih} from './server/beyannameParser'; console.log(excelSeriTarih(46205), excelSeriTarih(46212), excelSeriTarih(null), excelSeriTarih('x'), excelSeriTarih(0), excelSeriTarih(-5), excelSeriTarih(999999999))"
```
Expected: `2026-07-02 2026-07-09 null null null null null`

- [ ] **Step 8: Gerçek dosyayla ayrıştırıcı testi (DB'ye YAZMADAN)**

Run:
```bash
npx tsx -e "
import * as fs from 'fs';
import {parseIhracatWorkbook} from './server/beyannameParser';
const {rows, uyarilar} = parseIhracatWorkbook(fs.readFileSync('EX 2026 TÜM LİSTE.xlsx'));
console.log('satir:', rows.length, '| uyari:', JSON.stringify(uyarilar));
const s = rows.find(r => r.dosyaNo === '26-00002');
console.log('26-00002 ->', JSON.stringify(s));
const doviz = new Set(rows.map(r => r.doviz)); console.log('doviz:', [...doviz].sort().join(','));
const rej = new Set(rows.map(r => r.rejim)); console.log('rejim:', [...rej].join(','));
const kul: Record<string, number> = {}; rows.forEach(r => { const k = r.kullanici ?? '(bos)'; kul[k] = (kul[k]||0)+1; });
console.log('kullanici:', JSON.stringify(kul));
console.log('tarihsiz:', rows.filter(r => !r.beyanTarihi).length, '| kodsuz:', rows.filter(r => !r.rejimKodu).length);
"
```
Expected: `satir: 13942`, `uyari: []`, rejim yalnız `EX`, döviz `CHF,EUR,GBP,NOK,RUB,TL,USD`, kullanıcı 8 isim (`ÖMER:2163 EMİN:2043 EMİRCAN:2009 CİHANGİR:1934 HASAN:1899 ÖZKAN:1443 ORHAN:1363 SULTAN:1088`), `tarihsiz: 94`, `kodsuz: 2`.
`26-00002` satırında `alici` = `AKOĞLU OTOMOTİV...` (GONDEREN sütunundan), `kullanici` = `ÖMER`.

- [ ] **Step 9: Hatalı dosya yolları**

Run:
```bash
npx tsx -e "
import * as fs from 'fs';
import {parseIhracatWorkbook, parseBeyannameWorkbook} from './server/beyannameParser';
try { parseIhracatWorkbook(fs.readFileSync('BEYANNAME LİSTESİ.xlsx')); console.log('HATA: ithalat dosyasi EX ayristiricisindan GECTI'); }
catch (e: any) { console.log('OK reddedildi (IM->EX):', e.message.slice(0, 90)); }
try { parseBeyannameWorkbook(fs.readFileSync('EX 2026 TÜM LİSTE.xlsx')); console.log('HATA: ihracat dosyasi IM ayristiricisindan GECTI'); }
catch (e: any) { console.log('OK reddedildi (EX->IM):', e.message.slice(0, 90)); }
"
```
Expected: iki satır da `OK reddedildi` ile başlar — yanlış uca gönderilen dosya **kabul edilmez**.

- [ ] **Step 10: Commit**

```bash
git add server/beyannameParser.ts server/storage.ts server/routes.ts
git status
git commit -m "feat(beyanname): ihracat ice aktarma — /api/ingest/beyanname-ex + EX ayristirici

Ihracat raporu ithalattan tamamen farkli duzende: ayri ayristirici yazildi.
Basliksiz S (doviz) sutunu konumdan okunuyor ama komsu capalar (R=CIF, T=NAKLIYECI)
kati dogrulamaya dahil ve icerik doviz kodu desenine gore dogrulaniyor (%95 esik).
Tarihler Excel seri numarasi -> UTC aritmetigiyle cevriliyor, metin ayristirma yok.

Faz 1a'dan tasinan iki duzeltme: rejim kodu okunamadiginda artik loga uyari
yaziliyor (onceden sessizdi) ve bozuk bir dosya mevcut dolu kodlari NULL'a
ezemiyor (coalesce).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
`git status` YALNIZ bu 3 dosyayı staged göstermeli. **`*.xlsx` staged OLMAMALI.**

---

### Task 2: Uçtan uca doğrulama (gerçek dosya, dev DB)

**Files:**
- Create (scratchpad): `e2e-ihracat.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla; "geçsin diye" değiştirme.

**Interfaces:**
- Consumes: T1'in `parseIhracatWorkbook`, `/api/ingest/beyanname-ex`, `coalesce`'li upsert

- [ ] **Step 1: DB hedefini doğrula ve ÖN DURUMU kaydet**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise **DUR**.

Run:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select rejim, count(*)::int adet, count(rejim_kodu)::int kodlu from beyannameler group by rejim order by 1\").then(r=>{console.table(r.rows);process.exit(0)})"
```
Çıktıyı rapora **aynen** yaz — `IM` satırındaki `adet` ve `kodlu` değerleri sonraki adımların referansıdır.

- [ ] **Step 2: Token'ı geçici ekle ve sunucuyu başlat**

```bash
cp .env .env.ingest-yedek
printf '\nINGEST_TOKEN=e2e-test-token\n' >> .env
grep -c "^INGEST_TOKEN=" .env    # 1 olmali
```
Sonra `npm run dev` (arka planda). Token süreç başlangıcında okunur, bu yüzden **sıra önemli**.
Görev sonunda (Step 8'den ÖNCE) `cp .env.ingest-yedek .env` ile geri al, `grep -c` → `0` doğrula, yedeği sil.
**`.env` ve `.env.ingest-yedek` ASLA commit edilmez.**

- [ ] **Step 3: Tam listeyi yükle**

```bash
node -e "
require('dotenv').config();
const buf=require('fs').readFileSync('EX 2026 TÜM LİSTE.xlsx');
fetch('http://localhost:5000/api/ingest/beyanname-ex',{method:'POST',headers:{'Content-Type':'application/octet-stream','x-dosya-adi':'EX-tam-2026.xlsx','x-ingest-token':process.env.INGEST_TOKEN},body:buf})
 .then(r=>r.json()).then(j=>{console.log(JSON.stringify(j));process.exit(0)});
"
```
Expected: `durum: "basarili"`, `kayitSayisi: 13942`, mesajda `13942 satır (13942 yeni, 0 güncellendi)`, **UYARI yok**.

- [ ] **Step 4: İTHALAT ETKİLENMEDİ Mİ — bu fazın asıl sınavı**

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select rejim, count(*)::int adet, count(rejim_kodu)::int kodlu from beyannameler group by rejim order by 1\").then(r=>{console.table(r.rows);process.exit(0)})"
```
Expected: `IM` satırındaki **`adet` ve `kodlu` Step 1'dekiyle BİREBİR AYNI**; yeni bir `EX` satırı `adet: 13942`.
`IM` sayısı bir tık bile düşerse **FAIL** — bir ithalat kaydı ezilmiş demektir.

- [ ] **Step 5: Çakışan numara yan yana duruyor mu**

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select dosya_no, rejim, alici, gonderen, beyan_no, kullanici, fat_bedeli, doviz, beyan_tarihi, rejim_kodu from beyannameler where dosya_no='26-00002' order by rejim\").then(r=>{console.table(r.rows);return p.query(\"select count(*)::int cakisan from (select dosya_no from beyannameler where dosya_no is not null group by dosya_no having count(distinct rejim)>1) x\")}).then(r=>{console.log('CAKISAN DOSYA NO:',r.rows[0].cakisan);process.exit(0)})"
```
Expected: **iki satır** — `IM`'de BURTEK/ÖZCAN, `EX`'te AKOĞLU/ÖMER. `CAKISAN DOSYA NO` ≈ 10.911.
EX satırında: `alici` = AKOĞLU (bizim müşteri), `gonderen` = yurtdışı taraf, `doviz` dolu, `beyan_tarihi` `YYYY-MM-DD`, `rejim_kodu` dolu.

- [ ] **Step 6: Alan kalitesi**

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select 'tarihsiz='||count(*) filter (where beyan_tarihi is null)||' kodsuz='||count(*) filter (where rejim_kodu is null)||' dovizsiz='||count(*) filter (where doviz is null)||' bedelsiz='||count(*) filter (where fat_bedeli is null)||' kullanicisiz='||count(*) filter (where kullanici is null) ozet from beyannameler where rejim='EX'\").then(r=>{console.log(r.rows[0].ozet);return p.query(\"select doviz, count(*)::int from beyannameler where rejim='EX' group by 1 order by 2 desc\")}).then(r=>{console.table(r.rows);return p.query(\"select kullanici, count(*)::int from beyannameler where rejim='EX' group by 1 order by 2 desc\")}).then(r=>{console.table(r.rows);process.exit(0)})"
```
Expected: `tarihsiz=94 kodsuz=2 dovizsiz=0 kullanicisiz=0`; döviz yalnız `CHF/EUR/GBP/NOK/RUB/TL/USD`; kullanıcı 8 isim ve dağılım `ÖMER:2163 EMİN:2043 EMİRCAN:2009 CİHANGİR:1934 HASAN:1899 ÖZKAN:1443 ORHAN:1363 SULTAN:1088`.

- [ ] **Step 7: İdempotentlik + ithalat regresyonu**

Aynı EX dosyasını **ikinci kez** yükle (Step 3'ün komutu). Expected: `13942 satır (0 yeni, 13942 güncellendi)`, toplam satır sayısı **değişmez**.

Sonra gerçek ithalat dosyasını **ithalat ucundan** yükle:
```bash
node -e "
require('dotenv').config();
const buf=require('fs').readFileSync('BEYANNAME LİSTESİ.xlsx');
fetch('http://localhost:5000/api/ingest/beyanname',{method:'POST',headers:{'Content-Type':'application/octet-stream','x-dosya-adi':'IM-regresyon.xlsx','x-ingest-token':process.env.INGEST_TOKEN},body:buf})
 .then(r=>r.json()).then(j=>{console.log(JSON.stringify(j));process.exit(0)});
"
```
Expected: `durum: "basarili"`, ~275 satır, **UYARI yok**, `rejim='EX'` sayısı **değişmez** (13942).

Ayrıca yanlış uç testi: ithalat dosyasını `/api/ingest/beyanname-ex`'e gönder → **`durum: "hata"`**, mesajda başlık uyuşmazlığı. Log'a `tip: "beyanname-ex"` ile hata yazılmalı.

- [ ] **Step 8: Temizlik ve kapatma**

EX kayıtlarını dev DB'den sil:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"delete from beyannameler where rejim='EX'\").then(()=>p.query(\"select rejim, count(*)::int from beyannameler group by 1\")).then(r=>{console.table(r.rows);process.exit(0)})"
```
Expected: yalnız `IM` satırı, adedi Step 1'dekiyle **aynı**.

`.env`'i geri yükle (`cp .env.ingest-yedek .env`, `grep -c "^INGEST_TOKEN=" .env` → `0`, yedeği sil). Dev sunucu sürecini **kapat**, port 5000'in boş olduğunu `curl` ile doğrula.

- [ ] **Step 9: Kalite kapıları**

Run: `npm run check` → 0 hata.
Run: `npm run build` → hatasız.
Run: `git status --short` → **hiçbir `.xlsx` veya `.env*` staged olmamalı**; çalışma ağacında yalnız beklenen dosyalar.
Run: `git diff --stat $(git merge-base origin/main HEAD)..HEAD -- shared/ migrations/ package.json package-lock.json` → **boş** (şema/paket değişikliği yok).

- [ ] **Step 10: Commit (yalnız gerçek bir hata düzeltildiyse)**

Kod değişmediyse commit YOK. Değiştiyse açık yolla ekle + `fix(beyanname): …` mesajı.

---

## Self-Review Notu

**Spec kapsamı:**
- §4 sütun eşlemesi (B→alici, C→gonderen, R→CIF, Z→GİREN, AM→rejimKodu) → T1 Step 1 `parseIhracatWorkbook`
- §5 başlıksız `S` (komşu çapa + %95 içerik eşiği) → T1 Step 1 (`EX_BASLIKLAR`'da `R` ve `T`, `DOVIZ_ASGARI_UYUM`); T2 Step 6 (`dovizsiz=0`)
- §6 Excel seri tarih, `new Date` ile ayrıştırma yok → T1 Step 1 `excelSeriTarih` + Step 7 doğrulaması
- §7 yeni uç, ithalat ucu değişmez → T1 Step 3-4; T2 Step 7 regresyonu
- §8 taşınan iki düzeltme (uyarı + coalesce) → T1 Step 1 (`uyarilar`) + Step 2 (`coalesce`)
- §10 operasyon (toplu yükleme, hesaplar, Power Automate) → **kod görevi değil**, deploy sonrası; T2 Step 3-6 aynı dosyayla provası
- §11 doğrulama listesi (a)-(i) → T2 Step 3-7

**Tip tutarlılığı:** `AyristirmaSonucu` T1 Step 1'de tanımlanıp her iki ayrıştırıcının dönüşünde ve Step 3-4'teki çağrı yerlerinde aynen kullanılıyor. `parseBeyannameWorkbook(buffer)` **tek parametreli** hâle geliyor — iki çağrı yeri de Step 3'te güncelleniyor. `excelSeriTarih` Step 1'de export ediliyor, Step 7'de test ediliyor. `InsertBeyanname` alan adları (`dosyaNo`, `alici`, `gonderen`, `koli`, `gumrukIdaresi`, `beyanTarihi`, `beyanNo`, `fatBedeli`, `doviz`, `kullanici`, `rejim`, `rejimKodu`, `kaynak`) Faz 1a şemasıyla birebir.

**Bu görevin dört tuzağı:**
1. **`parseBeyannameWorkbook`'un parametresi kalkıyor** — **iki** çağrı yeri var (`routes.ts` ~2018 otomatik alım ve ~4648 elle yükleme). Faz 1a'da ikincisi gözden kaçmıştı ve `tsc` yakalamıştı; bu sefer plana yazıldı.
2. **Yanlış uca gönderilen dosya** sessizce kabul edilmemeli. T1 Step 9 iki yönü de test ediyor: ithalat dosyası EX ayrıştırıcısından, ihracat dosyası IM ayrıştırıcısından **geçmemeli**.
3. **`S` sütunu eşiği** — tek tük bozuk hücre yüklemeyi durdurmamalı ama sistematik kayma durdurmalı. `%95` eşiği bunu ayırır; ölçüm 13942/13942 (%100) olduğu için bugünkü veri rahatça geçer.
4. **`coalesce` yönü** — `coalesce(excluded.rejim_kodu, beyannameler.rejim_kodu)`. Ters yazılırsa (`coalesce(beyannameler.rejim_kodu, excluded.rejim_kodu)`) kod bir kez yazıldıktan sonra **hiç güncellenemez**. T2 Step 4'te `IM` satırının `kodlu` sayısının azalmadığı kontrol ediliyor.

**Kapsam dışı (görev YOK):** arayüzde IM/EX/TR seçimi ve filtreleme (Faz 2) · manuel transit (Faz 2) · `upsertBeyannameler`'ın TR dalı ve `NULLS LAST` (Faz 2, taşınan M2/M3) · rejim kırılımlı raporlar · şema değişikliği · canlıya toplu yükleme ve portal hesabı açma (deploy sonrası operasyon).
