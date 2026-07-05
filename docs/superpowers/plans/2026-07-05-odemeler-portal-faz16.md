# Ödemeler Portalı Faz 1.6 — Konşimento Zorunluluğu ve Yapay Zekâ Analizi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depo teminat taleplerinde konşimento yüklemesi temsilciye geçer ve zorunlu olur; PDF, Claude API ile analiz edilip konşimento no + taşıyıcı + Türkiye ödeme acentesi çıkarılır, temsilci onayından geçip taleple birlikte muhasebeye düşer.

**Architecture:** Yeni `server/konsimentoAnaliz.ts` PDF buffer'ını Claude'a (haiku, `document` bloğu + `output_config.format` json_schema) gönderir; `POST /api/portal/konsimento-analiz` memory-multer ile servis eder. `odeme_talepleri`'ne `konsimento_no`/`tasiyici` kolonları eklenir; talepler ve doğrudan-ödeme rotaları depo tipinde konşimento dosyası + numarasını zorunlu doğrular. Frontend'de paylaşılan `KonsimentoAnalizAlani` bileşeni (dosya→analiz→düzenlenebilir onay kartı) iki forma takılır; muhasebe tablolarına kolonlar eklenir, Öde dialogundan konşimento alanı kalkar.

**Tech Stack:** Mevcut yığın + `@anthropic-ai/sdk` (kurulu, latest'e güncellenecek — repoda başka kullanıcısı yok). `ANTHROPIC_API_KEY` lokal ve VPS .env'lerinde MEVCUT.

**Spec:** [docs/superpowers/specs/2026-07-05-odemeler-portal-faz16-konsimento-design.md](../specs/2026-07-05-odemeler-portal-faz16-konsimento-design.md)

## Global Constraints

- UI metinleri Türkçe; tarih gösterimi yalnız `portalUtils.formatTarih`.
- Model kimliği TAM OLARAK `claude-haiku-4-5` (tarih eki YOK). PDF, `document` content bloğu (base64, media_type `application/pdf`) olarak text bloğundan ÖNCE gönderilir. Yapılandırılmış çıktı `output_config: {format: {type: "json_schema", schema}}` ile (şemada her nesnede `additionalProperties: false` + `required` zorunlu; nullable alanlar `anyOf` ile).
- Yapay zekâ ödeme hedefi UYDURMAZ: sistem istemi "belgeden oku, emin değilsen null döndür" kuralını taşır; sonuç her zaman insan onayından geçer.
- Analiz aşamasında dosya DİSKE YAZILMAZ (memory multer); kalıcı kayıt yalnız talep gönderiminde.
- Rol/kimlik sunucu oturumundan; analiz rotası `requirePortal` (iki rol de kullanır).
- Hata mesajı deseni: raw fetch + `(await res.json()).error || "..."`. Yetim dosya temizliği upload rotalarında tüm erken dönüşlerde iki alan grubunu da kapsar.
- Mevcut işlev korunur: masraf talebi akışı, dosyasız talep, eşleştirme, dialog key-remount davranışları DEĞİŞMEZ.
- Test altyapısı yok — `npm run check` + curl + Playwright (scratchpad: `C:\Users\cem\AppData\Local\Temp\claude\e--CEM-APPS-cnctracker\f8e48f44-2295-45d2-af94-f819937c735a\scratchpad`). Sahte konşimento PDF'i Playwright `page.pdf()` ile HTML'den üretilir.
- `git add` açık yollarla; **`git push` YOK** (push = canlıya deploy). `uploads/` commit edilmez. Test verisi `alacakli` değerleri `E2E ` önekli; iş sonunda temizlenir.
- Türkçe kaynak dosyaları PowerShell Set-Content ile yazılmaz — Edit/Write araçları.
- Commit mesajları repo stilinde + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Dev sunucu port 5000; yeniden başlatma: `powershell -Command "$c = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id ($c.OwningProcess | Select-Object -Unique) -Force }"` sonra arka planda `npm run dev`.
- Lokal test kullanıcıları: `suleyman`/1234 (temsilci, SÜLEYMAN), `muhasebe`/1234.

---

### Task 1: Şema — `konsimento_no` ve `tasiyici` kolonları

**Files:**
- Modify: `shared/schema.ts` (`odemeTalepleri` tablosu)

**Interfaces:**
- Produces: `OdemeTalep`/`InsertOdemeTalep` tiplerinde `konsimentoNo: string | null` ve `tasiyici: string | null` alanları (drizzle otomatik türetir). Task 3 rotaları ve Task 4-5 frontend'i bunları kullanır.

- [ ] **Step 1: Kolonları ekle**

`shared/schema.ts` içinde `odemeTalepleri` tablosunda şu satırları bul:

```ts
  aciklama: text("aciklama"),
  durum: text("durum").notNull().default("bekliyor"), // 'bekliyor' | 'odendi'
```

Aralarına iki kolon ekle (sonuç):

```ts
  aciklama: text("aciklama"),
  // Depo teminatında zorunlu (sunucu doğrular); masrafta null
  konsimentoNo: text("konsimento_no"),
  tasiyici: text("tasiyici"),
  durum: text("durum").notNull().default("bekliyor"), // 'bekliyor' | 'odendi'
```

- [ ] **Step 2: Tip kontrolü + db:push**

Run: `npm run check` → hatasız.
Run: `npm run db:push` → iki kolon eklenir (interaktif onay sorarsa `npx drizzle-kit push --force`).

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(odemeler): odeme_talepleri'ne konsimento_no ve tasiyici kolonlari

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Analiz servisi — `konsimentoAnaliz.ts` + `POST /api/portal/konsimento-analiz`

**Files:**
- Modify: `package.json` (SDK güncelleme — komutla)
- Create: `server/konsimentoAnaliz.ts`
- Modify: `server/routes.ts` (multer + import + rota)

**Interfaces:**
- Consumes: `ANTHROPIC_API_KEY` (.env'de mevcut), `requirePortal`.
- Produces:
  - `konsimentoAnalizEt(pdfBuffer: Buffer): Promise<KonsimentoAnalizSonucu>` — `KonsimentoAnalizSonucu = { konsimentoNo: string | null; tasiyici: string | null; turkiyeAcentesi: { ad: string; adres: string | null } | null }`; hata/zaman aşımında throw.
  - `analizYapilandirildiMi(): boolean` — API anahtarı var mı.
  - Rota `POST /api/portal/konsimento-analiz` (multipart alan `konsimento`, yalnız PDF, 10 MB):
    - 200 → `{ konsimentoNo, tasiyici, acenteAdi, acenteAdres, acenteBulundu }`
    - 503 → `{error:"Analiz servisi yapılandırılmamış"}` (anahtar yoksa)
    - 502 → `{error:"Analiz yapılamadı — bilgileri elle girin"}` (Claude hatası)
    - 400 → dosya yok / PDF değil / boyut aşımı (multer sınırı).

- [ ] **Step 1: SDK'yı güncelle**

Kurulu `@anthropic-ai/sdk@^0.71.2` eski olabilir (`output_config` tipleri eksik olabilir). Repoda SDK'yı kullanan başka kod YOK — güncelleme risksiz:

Run: `npm install @anthropic-ai/sdk@latest --no-fund --no-audit`
Expected: package.json güncellenir, hata yok.

- [ ] **Step 2: server/konsimentoAnaliz.ts oluştur**

```ts
import Anthropic from "@anthropic-ai/sdk";

// Konşimento PDF'inden yapılandırılmış çıkarım — tek sorumluluk.
// Ödeme hedefi asla tahmin edilmez: model belgeden okur, bulamazsa null döner;
// sonuç her zaman kullanıcı onayından geçer.

export type KonsimentoAnalizSonucu = {
  konsimentoNo: string | null;
  tasiyici: string | null;
  turkiyeAcentesi: { ad: string; adres: string | null } | null;
};

export function analizYapilandirildiMi(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SISTEM_ISTEMI = `Sen bir gümrük operasyon asistanısın. Sana bir konşimento (Bill of Lading) PDF'i verilecek. Görevin belgeden ŞU üç bilgiyi çıkarmak:

1. konsimentoNo: Konşimento numarası. Belgede "B/L No", "Bill of Lading No", "BL Number", "Konşimento No" gibi etiketlerle geçer. Belge numarasını birebir, boşluksuz aktar.
2. tasiyici: Taşıyıcı firma (carrier/line). Genelde belge başlığında veya logo bölgesinde yazar (örn. MSC, MAERSK, ONE, YANG MING, ARKAS).
3. turkiyeAcentesi: Belgede TÜRKİYE ADRESLİ bir firma varsa (delivery agent, destination agent, notify address bölümlerinde Türkiye/Turkey/TR adresli acente) o firmanın adı ve adresi. Türk limanı adı tek başına acente DEĞİLDİR; adresli bir FİRMA olmalı.

KURALLAR:
- Yalnız belgede YAZAN bilgiyi aktar. ASLA tahmin etme, tamamlama veya uydurma.
- Bir alandan emin değilsen o alanı null döndür.
- Belge taranmış/fotoğraf olabilir — görüntüden oku.
- Firma adlarını belgede yazıldığı gibi aktar (kısaltma açma).`;

// Yapılandırılmış çıktı şeması — her nesnede additionalProperties:false + required zorunlu.
const CIKTI_SEMASI = {
  type: "object",
  properties: {
    konsimentoNo: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Konşimento (B/L) numarası; bulunamazsa null",
    },
    tasiyici: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Taşıyıcı firma adı; bulunamazsa null",
    },
    turkiyeAcentesi: {
      anyOf: [
        {
          type: "object",
          properties: {
            ad: { type: "string", description: "Türkiye adresli acente firmanın adı" },
            adres: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description: "Acentenin adresi; belgede yoksa null",
            },
          },
          required: ["ad", "adres"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
      description: "Belgede yazılı Türkiye adresli acente; yoksa null",
    },
  },
  required: ["konsimentoNo", "tasiyici", "turkiyeAcentesi"],
  additionalProperties: false,
} as const;

export async function konsimentoAnalizEt(pdfBuffer: Buffer): Promise<KonsimentoAnalizSonucu> {
  const client = new Anthropic({ maxRetries: 1, timeout: 20_000 }); // ms — 20 sn bütçe
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: SISTEM_ISTEMI,
    output_config: { format: { type: "json_schema", schema: CIKTI_SEMASI } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          },
          { type: "text", text: "Bu konşimentodan istenen üç alanı çıkar." },
        ],
      },
    ],
  });

  if (response.stop_reason !== "end_turn") {
    throw new Error(`Analiz tamamlanamadı (stop_reason: ${response.stop_reason})`);
  }
  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) throw new Error("Analiz yanıtı boş");
  return JSON.parse(textBlock.text) as KonsimentoAnalizSonucu;
}
```

Not: SDK güncellemesine rağmen `output_config` tipi tanınmıyorsa (tsc hatası), `output_config`'i `// @ts-expect-error` ile DEĞİL — `client.messages.create({...} as Anthropic.MessageCreateParamsNonStreaming & { output_config: unknown })` gibi hack'lerle de DEĞİL; önce `npm ls @anthropic-ai/sdk` ile sürümü doğrula ve raporla (DONE_WITH_CONCERNS). Beklenen: latest SDK'da tip mevcut.

- [ ] **Step 3: Rotayı ekle**

`server/routes.ts` import bölümüne:

```ts
import { konsimentoAnalizEt, analizYapilandirildiMi } from "./konsimentoAnaliz";
```

`uploadBeyannameMemory` tanımının yanına:

```ts
// Konşimento analizi — memory storage: analiz aşamasında diske yazılmaz
const uploadKonsimentoMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Yalnız PDF dosyası yüklenebilir"));
  },
});
```

`registerRoutes` içinde, `PUT /api/portal/talepler/:id/beyanname` rotasının altına:

```ts
  // Konşimento PDF analizi — Claude ile konşimento no / taşıyıcı / TR acentesi çıkarımı.
  // Sonuç her zaman kullanıcı onayından geçer; hata durumunda istemci elle girişe düşer.
  app.post(
    "/api/portal/konsimento-analiz",
    requirePortal,
    (req, res, next) => {
      uploadKonsimentoMemory.single("konsimento")(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
      });
    },
    async (req, res) => {
      try {
        if (!analizYapilandirildiMi()) {
          return res.status(503).json({ error: "Analiz servisi yapılandırılmamış" });
        }
        if (!req.file) return res.status(400).json({ error: "Konşimento dosyası gerekli" });
        const sonuc = await konsimentoAnalizEt(req.file.buffer);
        res.json({
          konsimentoNo: sonuc.konsimentoNo,
          tasiyici: sonuc.tasiyici,
          acenteAdi: sonuc.turkiyeAcentesi?.ad ?? null,
          acenteAdres: sonuc.turkiyeAcentesi?.adres ?? null,
          acenteBulundu: sonuc.turkiyeAcentesi != null,
        });
      } catch (e: any) {
        console.warn(`[konsimento-analiz] hata: ${e.message}`);
        res.status(502).json({ error: "Analiz yapılamadı — bilgileri elle girin" });
      }
    },
  );
```

- [ ] **Step 4: Tip kontrolü**

Run: `npm run check` → hatasız.

- [ ] **Step 5: Sahte konşimento PDF'i üret + curl doğrulaması**

Scratchpad'de `sahte-konsimento.js` yaz ve çalıştır (Playwright kurulu):

```js
// node sahte-konsimento.js — bilinen değerlerle sahte konşimento PDF'i üretir
const { chromium } = require("playwright");
(async () => {
  const html = `<html><body style="font-family:Arial">
    <h1>MSC MEDITERRANEAN SHIPPING COMPANY S.A.</h1>
    <h2>BILL OF LADING</h2>
    <p><b>B/L No:</b> MEDUTEST12345</p>
    <p><b>Vessel:</b> MSC TEST VOYAGE 001</p>
    <p><b>Port of Discharge:</b> AMBARLI, ISTANBUL, TURKEY</p>
    <h3>DELIVERY AGENT:</h3>
    <p>MSC GEMİ ACENTELİĞİ A.Ş.<br/>Büyükdere Cad. No:100 Şişli / İstanbul, TÜRKİYE<br/>Tel: +90 212 000 0000</p>
  </body></html>`;
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(html);
  await p.pdf({ path: "sahte-konsimento.pdf", format: "A4" });
  await b.close();
  console.log("sahte-konsimento.pdf yazildi");
})();
```

Dev sunucuyu yeniden başlat, sonra:

```bash
SCRATCH="C:/Users/cem/AppData/Local/Temp/claude/e--CEM-APPS-cnctracker/f8e48f44-2295-45d2-af94-f819937c735a/scratchpad"
# Login (temsilci)
curl -s -c "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/login \
  -H "Content-Type: application/json" -d '{"kullaniciAdi":"suleyman","sifre":"1234"}' > /dev/null

# 1) Girişsiz → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5000/api/portal/konsimento-analiz
# Beklenen: 401

# 2) Dosyasız → 400
curl -s -b "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/konsimento-analiz
# Beklenen: {"error":"Konşimento dosyası gerekli"}

# 3) PDF olmayan dosya → 400
echo "metin" > "$TEMP/duz.txt"
curl -s -b "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/konsimento-analiz \
  -F "konsimento=@$TEMP/duz.txt;type=text/plain"
# Beklenen: {"error":"Yalnız PDF dosyası yüklenebilir"}

# 4) Sahte konşimento → gerçek analiz
curl -s -b "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/konsimento-analiz \
  -F "konsimento=@$SCRATCH/sahte-konsimento.pdf;type=application/pdf"
# Beklenen: {"konsimentoNo":"MEDUTEST12345","tasiyici":"MSC..." ,"acenteAdi":"MSC GEMİ ACENTELİĞİ A.Ş.","acenteBulundu":true,...}
# (Alan değerlerinde küçük biçim farkları kabul: önemli olan konsimentoNo'nun MEDUTEST12345 içermesi ve acenteBulundu:true)
```

Gerçek çıktıyı rapora yaz.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/konsimentoAnaliz.ts server/routes.ts
git commit -m "feat(odemeler): konsimento PDF analizi - Claude ile no/tasiyici/TR acentesi cikarimi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Backend doğrulama — depo teminatında konşimento zorunlu (iki rota)

**Files:**
- Modify: `server/routes.ts` (`POST /api/portal/talepler` ve `POST /api/portal/dogrudan-odeme`)

**Interfaces:**
- Consumes: Task 1 kolonları; mevcut helpers (`portalKullanici`, `parseTutar`, `bugunYmd`, `fixUploadFilename`, `uploadOdemeBelge`).
- Produces (Task 4-5 frontend sözleşmesi):
  - `POST /api/portal/talepler`: multer artık `uploadOdemeBelge.fields([{ name: "belgeler", maxCount: 10 }, { name: "konsimento", maxCount: 1 }])`. Gövde alanları + `konsimentoNo`, `tasiyici`. depo_teminat'ta: konşimento dosyası yoksa `400 {"error":"Depo teminatında konşimento zorunlu"}`; `konsimentoNo` boşsa `400 {"error":"Konşimento numarası zorunlu"}`. Konşimento `belgeTipi:"konsimento"` ile kaydedilir; `konsimentoNo`/`tasiyici` talebe yazılır (masrafta null).
  - `POST /api/portal/dogrudan-odeme`: aynı depo doğrulamaları (konşimento dosyası ZATEN alınıyordu ama opsiyoneldi — artık depo'da zorunlu) + `konsimentoNo`/`tasiyici` kaydı.

- [ ] **Step 1: `POST /api/portal/talepler` rotasını güncelle**

1. Multer middleware'ini değiştir:

```ts
  app.post("/api/portal/talepler", requirePortal, uploadOdemeBelge.array("belgeler", 10), async (req, res) => {
```

→

```ts
  app.post(
    "/api/portal/talepler",
    requirePortal,
    uploadOdemeBelge.fields([
      { name: "belgeler", maxCount: 10 },
      { name: "konsimento", maxCount: 1 },
    ]),
    async (req, res) => {
```

2. Handler başındaki dosya yakalama/temizlik bloğunu iki alan grubunu kapsayacak şekilde değiştir. Mevcut:

```ts
      const yuklenenDosyalar = (req.files as Express.Multer.File[]) || [];
      const yuklenenleriSil = () => {
        for (const f of yuklenenDosyalar) fs.unlink(f.path, () => {});
      };
```

→

```ts
      const dosyaGruplari = req.files as Record<string, Express.Multer.File[]> | undefined;
      const yuklenenDosyalar = dosyaGruplari?.belgeler ?? [];
      const konsimentoDosyasi = dosyaGruplari?.konsimento?.[0];
      const yuklenenleriSil = () => {
        for (const f of [...yuklenenDosyalar, ...(konsimentoDosyasi ? [konsimentoDosyasi] : [])]) {
          fs.unlink(f.path, () => {});
        }
      };
```

3. Gövde destructuring'ine iki alan ekle:

```ts
      const { beyannameId, odemeTipi, masrafTuru, tutar, paraBirimi, alacakli, iban, aciklama } = req.body || {};
```

→

```ts
      const { beyannameId, odemeTipi, masrafTuru, tutar, paraBirimi, alacakli, iban, aciklama, konsimentoNo, tasiyici } = req.body || {};
```

4. `masrafTuruStr` kontrolünden SONRA, `createOdemeTalep`'ten ÖNCE depo doğrulamasını ekle:

```ts
      // Depo teminatında konşimento dosyası ve numarası ZORUNLU (Faz 1.6 iş kuralı)
      const konsimentoNoStr = String(konsimentoNo ?? "").trim();
      if (odemeTipi === "depo_teminat") {
        if (!konsimentoDosyasi) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Depo teminatında konşimento zorunlu" });
        }
        if (!konsimentoNoStr) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Konşimento numarası zorunlu" });
        }
      }
```

5. `createOdemeTalep` çağrısına iki alan ekle (`iadeDurumu` satırından önce):

```ts
        konsimentoNo: odemeTipi === "depo_teminat" ? konsimentoNoStr : null,
        tasiyici: odemeTipi === "depo_teminat" && String(tasiyici ?? "").trim() ? String(tasiyici).trim() : null,
```

6. Belge kayıt döngüsünden sonra (fatura `belgeler` döngüsü), konşimento dosyasını kaydet:

```ts
      if (konsimentoDosyasi) {
        await storage.createOdemeBelge({
          talepId: talep.id,
          belgeTipi: "konsimento",
          filename: fixUploadFilename(konsimentoDosyasi.originalname),
          filepath: konsimentoDosyasi.path.replace(/\\/g, "/"),
          yukleyenId: ben.id,
        });
      }
```

(Masraf tipinde konşimento gönderilirse de kaydedilir — zararsız; frontend masrafta göndermeyecek.)

- [ ] **Step 2: `POST /api/portal/dogrudan-odeme` rotasını güncelle**

1. Gövde destructuring'ine `konsimentoNo, tasiyici` ekle (talepler rotasındaki gibi).
2. `masrafTuruStr` kontrolünden sonra, dekont kontrolünden ÖNCE depo doğrulamasını ekle:

```ts
        const konsimentoNoStr = String(konsimentoNo ?? "").trim();
        const konsimento = files?.konsimento?.[0];
        if (odemeTipi === "depo_teminat") {
          if (!konsimento) {
            yuklenenleriSil();
            return res.status(400).json({ error: "Depo teminatında konşimento zorunlu" });
          }
          if (!konsimentoNoStr) {
            yuklenenleriSil();
            return res.status(400).json({ error: "Konşimento numarası zorunlu" });
          }
        }
```

(Rotanın ilerisindeki mevcut `const konsimento = files?.konsimento?.[0];` satırını KALDIR — artık yukarıda tanımlı; konşimento kayıt bloğu aynı kalır.)

3. `createOdemeTalep` çağrısına aynı iki alanı ekle:

```ts
          konsimentoNo: odemeTipi === "depo_teminat" ? konsimentoNoStr : null,
          tasiyici: odemeTipi === "depo_teminat" && String(tasiyici ?? "").trim() ? String(tasiyici).trim() : null,
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check` → hatasız.

- [ ] **Step 4: curl doğrulaması**

Dev sunucuyu yeniden başlat. `BEYAN_ID`'yi temsilcinin beyanname listesinden al (`curl -s -b "$TEMP/pc.txt" http://localhost:5000/api/portal/beyannameler | head -c 300`).

```bash
echo "dekont" > "$TEMP/d.pdf"

# 1) Depo talebi KONŞİMENTOSUZ → 400
curl -s -b "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/talepler \
  -F "beyannameId=BEYAN_ID" -F "odemeTipi=depo_teminat" -F "tutar=1000" -F "alacakli=E2E Depo AS"
# Beklenen: {"error":"Depo teminatında konşimento zorunlu"}

# 2) Konşimentolu ama NUMARASIZ → 400
curl -s -b "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/talepler \
  -F "beyannameId=BEYAN_ID" -F "odemeTipi=depo_teminat" -F "tutar=1000" -F "alacakli=E2E Depo AS" \
  -F "konsimento=@$SCRATCH/sahte-konsimento.pdf;type=application/pdf"
# Beklenen: {"error":"Konşimento numarası zorunlu"}

# 3) Tam geçerli depo talebi → kayıt + konşimento belgesi + alanlar
curl -s -b "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/talepler \
  -F "beyannameId=BEYAN_ID" -F "odemeTipi=depo_teminat" -F "tutar=1000" -F "alacakli=E2E MSC Acente" \
  -F "konsimentoNo=MEDUTEST12345" -F "tasiyici=MSC" \
  -F "konsimento=@$SCRATCH/sahte-konsimento.pdf;type=application/pdf"
# Beklenen: "konsimentoNo":"MEDUTEST12345","tasiyici":"MSC","iadeDurumu":"beklemede"
# Talep listesinde belgeler dizisinde belgeTipi:"konsimento" olmalı:
curl -s -b "$TEMP/pc.txt" http://localhost:5000/api/portal/talepler | grep -c konsimento

# 4) MASRAF talebi konşimentosuz → hâlâ ÇALIŞIR (regresyon)
curl -s -b "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/talepler \
  -F "beyannameId=BEYAN_ID" -F "odemeTipi=masraf" -F "masrafTuru=Ardiye" -F "tutar=200" -F "alacakli=E2E Masraf AS"
# Beklenen: "durum":"bekliyor","konsimentoNo":null

# 5) Doğrudan ödeme: depo + konşimentosuz → 400; tam set → odendi
curl -s -c "$TEMP/mc.txt" -X POST http://localhost:5000/api/portal/login \
  -H "Content-Type: application/json" -d '{"kullaniciAdi":"muhasebe","sifre":"1234"}' > /dev/null
curl -s -b "$TEMP/mc.txt" -X POST http://localhost:5000/api/portal/dogrudan-odeme \
  -F "odemeTipi=depo_teminat" -F "tutar=500" -F "alacakli=E2E DD" -F "aciklama=t" -F "dekont=@$TEMP/d.pdf"
# Beklenen: {"error":"Depo teminatında konşimento zorunlu"}
curl -s -b "$TEMP/mc.txt" -X POST http://localhost:5000/api/portal/dogrudan-odeme \
  -F "odemeTipi=depo_teminat" -F "tutar=500" -F "alacakli=E2E DD" -F "aciklama=t" \
  -F "konsimentoNo=MEDUTEST12345" -F "tasiyici=MSC" \
  -F "dekont=@$TEMP/d.pdf" -F "konsimento=@$SCRATCH/sahte-konsimento.pdf;type=application/pdf"
# Beklenen: "durum":"odendi","konsimentoNo":"MEDUTEST12345"
```

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(odemeler): depo teminatinda konsimento dosyasi + numarasi zorunlu (iki rota)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Paylaşılan bileşen — `KonsimentoAnalizAlani`

**Files:**
- Create: `client/src/pages/portal/KonsimentoAnalizAlani.tsx`

**Interfaces:**
- Consumes: `POST /api/portal/konsimento-analiz` (Task 2 sözleşmesi); shadcn `Input, Label, Checkbox, Card`.
- Produces (Task 5 kullanır):

```ts
export type KonsimentoBilgisi = {
  dosya: File | null;
  konsimentoNo: string;
  tasiyici: string;
  onaylandi: boolean;
  alacakliOnerisi: string | null; // acente ?? taşıyıcı; üst form alacaklıyı bir kez doldurur
};
export const BOS_KONSIMENTO: KonsimentoBilgisi = {
  dosya: null, konsimentoNo: "", tasiyici: "", onaylandi: false, alacakliOnerisi: null,
};
export default function KonsimentoAnalizAlani({
  deger, onDegisim, idOnEki,
}: { deger: KonsimentoBilgisi; onDegisim: (b: KonsimentoBilgisi) => void; idOnEki: string });
```

- `idOnEki` data-testid çakışmasını önler (`"talep"` / `"dogrudan"`).
- Davranış: dosya seçilince analiz çağrısı → düzenlenebilir alanlar + acente bilgi satırı + onay checkbox'ı. Alan/dosya değişince `onaylandi` sıfırlanır. Analiz hatasında elle giriş modu (alanlar boş, uyarı metni).

- [ ] **Step 1: Dosyayı oluştur**

```tsx
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

// Depo teminatı konşimentosu: dosya seçimi → Claude analizi → düzenlenebilir onay kartı.
// Onaylanmadan üst form gönderime izin vermez; alan değişince onay sıfırlanır
// (onay her zaman ekranda görünen son bilgiye aittir).

export type KonsimentoBilgisi = {
  dosya: File | null;
  konsimentoNo: string;
  tasiyici: string;
  onaylandi: boolean;
  alacakliOnerisi: string | null;
};

export const BOS_KONSIMENTO: KonsimentoBilgisi = {
  dosya: null,
  konsimentoNo: "",
  tasiyici: "",
  onaylandi: false,
  alacakliOnerisi: null,
};

type AnalizYaniti = {
  konsimentoNo: string | null;
  tasiyici: string | null;
  acenteAdi: string | null;
  acenteAdres: string | null;
  acenteBulundu: boolean;
};

type Asama = "bos" | "analiz" | "hazir" | "elle";

export default function KonsimentoAnalizAlani({
  deger,
  onDegisim,
  idOnEki,
}: {
  deger: KonsimentoBilgisi;
  onDegisim: (b: KonsimentoBilgisi) => void;
  idOnEki: string;
}) {
  const [asama, setAsama] = useState<Asama>("bos");
  const [analiz, setAnaliz] = useState<AnalizYaniti | null>(null);
  const [hataMesaji, setHataMesaji] = useState("");

  const dosyaSecildi = async (dosya: File | null) => {
    if (!dosya) {
      setAsama("bos");
      setAnaliz(null);
      onDegisim({ ...BOS_KONSIMENTO });
      return;
    }
    // Yeni dosya: önceki bilgiler ve onay geçersiz
    onDegisim({ dosya, konsimentoNo: "", tasiyici: "", onaylandi: false, alacakliOnerisi: null });
    setAsama("analiz");
    setHataMesaji("");
    try {
      const fd = new FormData();
      fd.set("konsimento", dosya);
      const res = await fetch("/api/portal/konsimento-analiz", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Analiz yapılamadı");
      const veri = (await res.json()) as AnalizYaniti;
      setAnaliz(veri);
      setAsama("hazir");
      onDegisim({
        dosya,
        konsimentoNo: veri.konsimentoNo ?? "",
        tasiyici: veri.tasiyici ?? "",
        onaylandi: false,
        alacakliOnerisi: veri.acenteAdi ?? veri.tasiyici ?? null,
      });
    } catch (e: any) {
      setAnaliz(null);
      setAsama("elle");
      setHataMesaji(e.message || "Analiz yapılamadı — bilgileri elle girin");
    }
  };

  const alanGuncelle = (kismi: Partial<KonsimentoBilgisi>) => {
    // Bilgi değişti — onay sıfırlanır
    onDegisim({ ...deger, ...kismi, onaylandi: false });
  };

  return (
    <div className="space-y-2">
      <Label>Konşimento (zorunlu — PDF)</Label>
      <Input
        type="file"
        accept="application/pdf"
        onChange={(e) => dosyaSecildi(e.target.files?.[0] ?? null)}
        data-testid={`input-${idOnEki}-konsimento`}
      />

      {asama === "analiz" && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid={`durum-${idOnEki}-analiz`}
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          Konşimento analiz ediliyor…
        </div>
      )}

      {(asama === "hazir" || asama === "elle") && (
        <Card className={asama === "elle" ? "border-amber-300" : "border-emerald-300"}>
          <CardContent className="pt-4 space-y-3">
            {asama === "elle" && (
              <p className="text-sm text-amber-700" data-testid={`uyari-${idOnEki}-elle`}>
                {hataMesaji} — bilgileri elle girin.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Konşimento No (zorunlu)</Label>
                <Input
                  value={deger.konsimentoNo}
                  onChange={(e) => alanGuncelle({ konsimentoNo: e.target.value })}
                  data-testid={`input-${idOnEki}-konsimento-no`}
                />
              </div>
              <div className="space-y-1">
                <Label>Taşıyıcı</Label>
                <Input
                  value={deger.tasiyici}
                  onChange={(e) => alanGuncelle({ tasiyici: e.target.value })}
                  data-testid={`input-${idOnEki}-tasiyici`}
                />
              </div>
            </div>

            {asama === "hazir" && (
              <div className="text-xs rounded-md border p-2 space-y-0.5">
                {analiz?.acenteBulundu ? (
                  <>
                    <div>
                      <span className="font-medium">Türkiye Ödeme Acentesi:</span>{" "}
                      {analiz.acenteAdi}
                    </div>
                    {analiz.acenteAdres && (
                      <div className="text-muted-foreground">{analiz.acenteAdres}</div>
                    )}
                    <div className="text-muted-foreground">
                      Alacaklı alanı bu acenteyle dolduruldu — gerekirse değiştirin.
                    </div>
                  </>
                ) : (
                  <div className="text-amber-700" data-testid={`uyari-${idOnEki}-acente-yok`}>
                    Konşimentoda Türkiye acentesi bulunamadı — alacaklı taşıyıcı olarak ayarlandı.
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id={`${idOnEki}-konsimento-onay`}
                checked={deger.onaylandi}
                onCheckedChange={(v) => onDegisim({ ...deger, onaylandi: v === true })}
                data-testid={`checkbox-${idOnEki}-konsimento-onay`}
              />
              <Label htmlFor={`${idOnEki}-konsimento-onay`} className="font-normal">
                Bilgiler doğru, onaylıyorum
              </Label>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Tip kontrolü + Vite derleme**

Run: `npm run check` → hatasız. Dev sunucu açıkken Vite 200 kontrolü.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/portal/KonsimentoAnalizAlani.tsx
git commit -m "feat(odemeler): KonsimentoAnalizAlani - dosya, analiz, duzenlenebilir onay karti

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Form entegrasyonları + muhasebe ekranı güncellemeleri

**Files:**
- Modify: `client/src/pages/portal/YeniTalepSayfasi.tsx`
- Modify: `client/src/pages/portal/DogrudanOdemeSayfasi.tsx`
- Modify: `client/src/pages/portal/GelenTaleplerSayfasi.tsx` (kolonlar + dialog)
- Modify: `client/src/pages/portal/DepoOdemeleriSayfasi.tsx` (kolonlar)

**Interfaces:**
- Consumes: `KonsimentoAnalizAlani`/`KonsimentoBilgisi`/`BOS_KONSIMENTO` (Task 4); Task 3 rota sözleşmesi (`konsimentoNo`/`tasiyici` gövde alanları, `konsimento` dosya alanı); `TalepDetay` artık `konsimentoNo`/`tasiyici` taşır (Task 1).
- Produces: Depo seçilince her iki formda analiz alanı; onaysız gönderim engeli; muhasebe tablolarında Konşimento No + Taşıyıcı kolonları; Öde dialogunda konşimento yükleme alanı YOK, bilgi satırı VAR.

- [ ] **Step 1: YeniTalepSayfasi.tsx entegrasyonu**

1. Import ekle:

```tsx
import KonsimentoAnalizAlani, { type KonsimentoBilgisi, BOS_KONSIMENTO } from "./KonsimentoAnalizAlani";
```

2. State ekle (`dosyalar` state'inin yanına):

```tsx
  const [konsimento, setKonsimento] = useState<KonsimentoBilgisi>({ ...BOS_KONSIMENTO });
```

3. Alacaklı otomatik dolumu — `konsimento` state güncellenirken uygula. `KonsimentoAnalizAlani`'nın `onDegisim`'ini şu sarmalayıcıyla ver (bileşen render'ında):

```tsx
  const konsimentoDegisti = (b: KonsimentoBilgisi) => {
    // Öneri yeni geldiyse ve alacaklı boşsa/önceki öneriyse otomatik doldur (elle yazılmışsa ezme)
    if (b.alacakliOnerisi && b.alacakliOnerisi !== konsimento.alacakliOnerisi) {
      if (!alacakli.trim() || alacakli === konsimento.alacakliOnerisi) {
        setAlacakli(b.alacakliOnerisi);
      }
    }
    setKonsimento(b);
  };
```

4. Form JSX'inde, ödeme tipi/masraf türü grid'inden SONRA (alacaklı satırından önce) alanı render et:

```tsx
            {odemeTipi === "depo_teminat" && (
              <KonsimentoAnalizAlani deger={konsimento} onDegisim={konsimentoDegisti} idOnEki="talep" />
            )}
```

5. `gonder` doğrulamasına (masraf türü kontrolünden sonra) ekle:

```tsx
    if (odemeTipi === "depo_teminat") {
      if (!konsimento.dosya) {
        toast({ title: "Depo teminatında konşimento zorunlu", variant: "destructive" });
        return;
      }
      if (!konsimento.konsimentoNo.trim()) {
        toast({ title: "Konşimento numarası zorunlu", variant: "destructive" });
        return;
      }
      if (!konsimento.onaylandi) {
        toast({ title: "Konşimento bilgilerini onaylayın", description: "\"Bilgiler doğru, onaylıyorum\" kutusunu işaretleyin.", variant: "destructive" });
        return;
      }
    }
```

6. FormData'ya ekle (`belgeler` append'lerinden sonra):

```tsx
      if (odemeTipi === "depo_teminat" && konsimento.dosya) {
        fd.set("konsimento", konsimento.dosya);
        fd.set("konsimentoNo", konsimento.konsimentoNo.trim());
        fd.set("tasiyici", konsimento.tasiyici.trim());
      }
```

7. Başarı sıfırlamasına ekle: `setKonsimento({ ...BOS_KONSIMENTO });` (formSayac artışı dosya inputunu zaten remount eder — `KonsimentoAnalizAlani`'yı da `key={formSayac}` ile remount et: render satırını `<KonsimentoAnalizAlani key={formSayac} ... />` yap).

- [ ] **Step 2: DogrudanOdemeSayfasi.tsx entegrasyonu**

Aynı desen: import + `konsimento` state + `konsimentoDegisti` sarmalayıcı + depo seçiliyken `<KonsimentoAnalizAlani key={formSayac} deger={konsimento} onDegisim={konsimentoDegisti} idOnEki="dogrudan" />` render + `gonder` doğrulaması + FormData alanları + sıfırlama. Fark: bu formda MEVCUT konşimento file input'u (`input-dogrudan-konsimento`) VAR — onu ve `konsimentoState`'ini KALDIR (dekont alanı kalır); dosya artık analiz alanından geliyor.

- [ ] **Step 3: GelenTaleplerSayfasi.tsx — kolonlar + dialog**

1. Tablo başlıklarına `Tür` kolonundan sonra ekle:

```tsx
                  <TableHead>Konşimento No</TableHead>
```

2. Satırlarda karşılık gelen hücre (Tür hücresinden sonra):

```tsx
                    <TableCell>
                      {t.konsimentoNo ? (
                        <div>
                          <div className="text-sm">{t.konsimentoNo}</div>
                          {t.tasiyici && (
                            <div className="text-xs text-muted-foreground">{t.tasiyici}</div>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    ...
```

3. Boş-durum satırındaki `colSpan`'ı 1 artır (10 → 11).
4. `OdemeDialog` içinde:
   - Konşimento yükleme alanını (Label "Konşimento Örneği" + Input `input-konsimento` + sarmalayıcı div + `konsimento` state + FormData `fd.set("konsimento", ...)` satırı) tamamen KALDIR.
   - Talep özet bloğuna (Tutar satırından sonra) bilgi satırı ekle:

```tsx
              {talep.konsimentoNo && (
                <div>
                  <span className="font-medium">Konşimento:</span> {talep.konsimentoNo}
                  {talep.tasiyici ? ` — ${talep.tasiyici}` : ""}
                </div>
              )}
```

- [ ] **Step 4: DepoOdemeleriSayfasi.tsx — kolonlar**

Depo tablosuna `Dosya No` kolonundan sonra `Konşimento No` başlığı + aynı hücre deseni (konsimentoNo + altında tasiyici); boş-durum `colSpan`'ı 1 artır (10 → 11).

- [ ] **Step 5: Tip kontrolü + Vite derleme**

Run: `npm run check` → hatasız; dört değişen dosya için Vite 200.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/portal/YeniTalepSayfasi.tsx client/src/pages/portal/DogrudanOdemeSayfasi.tsx client/src/pages/portal/GelenTaleplerSayfasi.tsx client/src/pages/portal/DepoOdemeleriSayfasi.tsx
git commit -m "feat(odemeler): konsimento analiz alani iki formda + muhasebe kolonlari, dialog sadelestirme

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: E2E doğrulama + temizlik + build

**Files:**
- Create (scratchpad): `e2e-faz16.js`
- Modify: yok (gerçek uygulama hatası bulunursa DÜZELTME — DONE_WITH_CONCERNS raporla)

- [ ] **Step 1: Playwright senaryosu (sahte konşimento PDF'i Task 2'de üretildi)**

Kontrol noktaları (her birinde ekran görüntüsü `faz16-NN-*.png`):

1. **Temsilci depo akışı:** login suleyman → Yeni Talep → tip "Depo Teminatı" → konşimento alanı görünür → `sahte-konsimento.pdf` seç → "analiz ediliyor" göstergesi → onay kartı belirir; Konşimento No `MEDUTEST12345` içerir; acente satırı görünür; alacaklı alanı otomatik doldu.
2. **Onaysız gönderim engeli:** beyanname seç, tutar `750`, gönder → "Konşimento bilgilerini onaylayın" toast'ı; kayıt oluşmadı.
3. **Onaylı gönderim:** onay checkbox → gönder → toast; Taleplerim'de satırda konşimento belge linki (`Konşimento:` etiketi).
4. **Alan değişince onay sıfırlanır:** yeni talep akışında dosya seçip analiz sonrası Konşimento No'yu değiştir → checkbox işaretsiz kaldığını assert et.
5. **Masraf regresyonu:** tip "Normal Masraf"ta konşimento alanı YOK; masraf talebi gönderilebiliyor.
6. **Muhasebe kolonları:** muhasebe login → Gelen Talepler'de "Konşimento No" kolonu ve MEDUTEST12345 değeri; Öde dialogunda konşimento YÜKLEME ALANININ OLMADIĞI (`input-konsimento` yok) ama özet satırında konşimento bilgisinin olduğu; dekontla öde.
7. **Depo sayfası:** kayıt Depo Ödemeleri'nde konşimento kolonuyla listelenir.
8. **Doğrudan Ödeme depo akışı:** muhasebe → Doğrudan Ödeme → depo tipi → analiz alanı (idOnEki `dogrudan`) → dosya → onay → dekont + kaydet → Gelen Talepler'de "Ödendi".
9. **API guard regresyonu:** çerezsiz analiz ucu 401 (fetch ile).
10. **Analiz hatası yolu:** `context.route` ile `/api/portal/konsimento-analiz` isteğini 502'ye zorla → dosya seçince kart "elle giriş" modunda (amber uyarı) açılır; elle numara girip onaylayınca gönderim çalışır.

- [ ] **Step 2: Temizlik + son kontroller**

```bash
node -e "
require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
p.query(\"DELETE FROM odeme_talepleri WHERE alacakli LIKE 'E2E %'\").then(r => { console.log('silinen:', r.rowCount); p.end(); });
"
```

Run: `npm run check` → hatasız. `npm run build` → `dist/` üretilir. Dev sunucu çalışır bırakılır.

- [ ] **Step 3: Rapor**

Kontrol noktası sonuçları + gerçek analiz çıktısı + ekran görüntüleri + temizlik sayısı + build çıktısı. Commit yok.
