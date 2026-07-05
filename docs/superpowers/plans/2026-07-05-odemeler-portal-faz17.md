# Ödemeler Portalı Faz 1.7 — Analiz Doğruluğu + Kayıtlı Ödeme Şirketleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Konşimento analizinde model `claude-sonnet-5`'e yükseltilir ve kullanıcının kırmızı/yeşil işaretli örneklerinden çıkan alan kurallarıyla sistem istemi yeniden yazılır; onaylanan depo alacaklıları `odeme_sirketleri` tablosuna kaydedilip iki formda alacaklı önerisi (datalist) olarak sunulur; gerçek örnek PDF'lerle regresyon doğrulaması yapılır.

**Architecture:** `server/konsimentoAnaliz.ts` yeni istem + model + `acenteKaynagi` alanıyla güncellenir. Yeni tablo + storage metodları + `GET /api/portal/odeme-sirketleri`; iki depo rotası başarı-sonrası best-effort upsert yapar. Frontend'de `KonsimentoAnalizAlani` kaynak satırı gösterir; iki formun alacaklı Input'una native `<datalist>` bağlanır.

**Tech Stack:** Mevcut yığın; `@anthropic-ai/sdk@0.110` kurulu. Model kimliği TAM OLARAK `claude-sonnet-5`.

**Spec:** [docs/superpowers/specs/2026-07-05-odemeler-portal-faz17-analiz-dogruluk-design.md](../specs/2026-07-05-odemeler-portal-faz17-analiz-dogruluk-design.md)

## Global Constraints

- Model kimliği `claude-sonnet-5` (tarih eki YOK); timeout 30_000 ms; maxRetries 1; PDF `document` bloğu text'ten önce; `output_config.format` json_schema (nesnelerde `additionalProperties:false`+`required`, nullable'lar `anyOf`).
- İstem kuralları spec §2'den BİREBİR: yasak bloklar (Shipper/Exporter, Consignee/Importer, Notify Party/Address — Türk A.Ş. olsa bile), izinli bloklar (Port Agent, Carrier's Agent(s)/Endorsements, Port of Discharge Agent, Destination Agent, Delivery Agent, "For delivery ... please apply to", belge altı vergi no'lu acente bloğu), Türkiye adresi şart, A.Ş./LTD sinyal-ama-şart-değil, numara disiplini (B/L-SWB etiketli; Booking/Carrier's Ref/Export Ref/OTI-NVOCC/konteyner yasak; karakter karakter; şüphede null), UYDURMA yasağı.
- Yanıt sözleşmesi genişler: `{konsimentoNo, tasiyici, acenteAdi, acenteAdres, acenteBulundu, acenteKaynagi}`.
- Upsert best-effort: hata talebi BOZMAZ (try/catch + console.warn).
- Mevcut testid'ler ve davranışlar korunur (onay akışı, bayat-yanıt koruması, masraf akışı).
- `KONŞİMENTO ÖRNEKLERİ/` klasörü repoya girmez (gitignore'da); E2E lokal diskten okur.
- Test altyapısı yok — `npm run check` + curl + Playwright/node scriptleri (scratchpad: `C:\Users\cem\AppData\Local\Temp\claude\e--CEM-APPS-cnctracker\f8e48f44-2295-45d2-af94-f819937c735a\scratchpad`).
- `git add` açık yollarla; **`git push` YOK** (push = canlı deploy; kullanıcı kararı). Türkçe kaynak dosyaları Edit/Write araçlarıyla.
- Commit mesajları repo stili + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Dev sunucu port 5000; restart: `powershell -Command "$c = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id ($c.OwningProcess | Select-Object -Unique) -Force }"` + arka planda `npm run dev`.
- Lokal test kullanıcıları: `suleyman`/1234, `muhasebe`/1234. Test alacaklıları `E2E ` önekli, iş sonunda temizlenir (odeme_sirketleri test kayıtları dahil).

---

### Task 1: Kayıtlı ödeme şirketleri — şema + storage + rotalar

**Files:**
- Modify: `shared/schema.ts` (dosya sonuna, `portalSessions` tanımından ÖNCE)
- Modify: `server/storage.ts` (import + IStorage imzaları + DatabaseStorage implementasyonları)
- Modify: `server/routes.ts` (GET rotası + iki depo rotasında upsert çağrısı)

**Interfaces:**
- Produces:
  - Tablo `odemeSirketleri` → `odeme_sirketleri`; tipler `OdemeSirketi`/`InsertOdemeSirketi`; zod `insertOdemeSirketiSchema`.
  - `storage.upsertOdemeSirketi(ad: string): Promise<void>` — trim'li ad; varsa `kullanimSayisi++` + `sonKullanim=now`, yoksa ekle.
  - `storage.getOdemeSirketleri(): Promise<OdemeSirketi[]>` — aktif, `kullanimSayisi` desc sonra `sonKullanim` desc, limit 100.
  - `GET /api/portal/odeme-sirketleri` — requirePortal, `[{id, ad}]` benzeri tam kayıt listesi döner.

- [ ] **Step 1: Şema**

`shared/schema.ts` — `portalSessions` tablosu tanımının HEMEN ÜSTÜNE ekle:

```ts
// Onaylanan depo alacaklıları — analiz yanlışsa temsilci öneri listesinden seçer.
export const odemeSirketleri = pgTable("odeme_sirketleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ad: text("ad").notNull().unique(),
  kullanimSayisi: integer("kullanim_sayisi").notNull().default(1),
  sonKullanim: timestamp("son_kullanim").defaultNow(),
  aktif: boolean("aktif").notNull().default(true),
});

export const insertOdemeSirketiSchema = createInsertSchema(odemeSirketleri).omit({
  id: true,
  sonKullanim: true,
});
export type InsertOdemeSirketi = z.infer<typeof insertOdemeSirketiSchema>;
export type OdemeSirketi = typeof odemeSirketleri.$inferSelect;
```

- [ ] **Step 2: Storage**

`server/storage.ts`:

1. `@shared/schema` importuna ekle: `odemeSirketleri, type OdemeSirketi, type InsertOdemeSirketi,`
2. `IStorage` arayüzüne (Ödemeler Portalı bölümünün sonuna):

```ts
  upsertOdemeSirketi(ad: string): Promise<void>;
  getOdemeSirketleri(): Promise<OdemeSirketi[]>;
```

3. `DatabaseStorage` sınıfına (Ödemeler Portalı implementasyonlarının sonuna):

```ts
  async upsertOdemeSirketi(ad: string): Promise<void> {
    const temiz = ad.trim();
    if (!temiz) return;
    await db
      .insert(odemeSirketleri)
      .values({ ad: temiz })
      .onConflictDoUpdate({
        target: odemeSirketleri.ad,
        set: {
          kullanimSayisi: sql`${odemeSirketleri.kullanimSayisi} + 1`,
          sonKullanim: sql`now()`,
        },
      });
  }

  async getOdemeSirketleri(): Promise<OdemeSirketi[]> {
    return db
      .select()
      .from(odemeSirketleri)
      .where(eq(odemeSirketleri.aktif, true))
      .orderBy(desc(odemeSirketleri.kullanimSayisi), desc(odemeSirketleri.sonKullanim))
      .limit(100);
  }
```

- [ ] **Step 3: Rotalar**

`server/routes.ts`:

1. `GET /api/portal/masraf-turleri` rotasının yanına:

```ts
  // Kayıtlı ödeme şirketleri — alacaklı alanı öneri listesi (depo onaylarından birikir)
  app.get("/api/portal/odeme-sirketleri", requirePortal, async (_req, res) => {
    try {
      res.json(await storage.getOdemeSirketleri());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
```

2. `POST /api/portal/talepler` içinde, `res.json(talep);` satırından HEMEN ÖNCE:

```ts
      // Onaylanan depo alacaklısını öneri listesine kaydet (best-effort — talebi bozmaz)
      if (odemeTipi === "depo_teminat") {
        storage.upsertOdemeSirketi(alacakliStr).catch((e) =>
          console.warn(`[odeme-sirketleri] upsert hatası: ${e.message}`),
        );
      }
```

3. `POST /api/portal/dogrudan-odeme` içinde `res.json(talep);` öncesine aynı blok (oradaki alacaklı değişkeni de `alacakliStr`).

- [ ] **Step 4: Doğrulama**

`npm run check` → hatasız. `npm run db:push` (soru sorarsa ÇÖZ, `--force`'a başvurmadan önce ne sorduğunu raporla — beklenen: sorusuz tablo ekleme). Dev sunucuyu yeniden başlat; curl:

```bash
curl -s -c "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/login -H "Content-Type: application/json" -d '{"kullaniciAdi":"suleyman","sifre":"1234"}' > /dev/null
curl -s -b "$TEMP/pc.txt" http://localhost:5000/api/portal/odeme-sirketleri
# Beklenen: [] (boş liste)
# Depo talebi oluştur (BEYAN_ID beyanname listesinden; sahte-konsimento.pdf scratchpad'de):
SCRATCH="C:/Users/cem/AppData/Local/Temp/claude/e--CEM-APPS-cnctracker/f8e48f44-2295-45d2-af94-f819937c735a/scratchpad"
curl -s -b "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/talepler \
  -F "beyannameId=BEYAN_ID" -F "odemeTipi=depo_teminat" -F "tutar=100" -F "alacakli=E2E Sirket AS" \
  -F "konsimentoNo=TEST1" -F "konsimento=@$SCRATCH/sahte-konsimento.pdf"
curl -s -b "$TEMP/pc.txt" http://localhost:5000/api/portal/odeme-sirketleri
# Beklenen: [{"ad":"E2E Sirket AS","kullanimSayisi":1,...}]
# Aynı alacaklıyla ikinci talep → kullanimSayisi 2 olmalı.
```

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts server/storage.ts server/routes.ts
git commit -m "feat(odemeler): kayitli odeme sirketleri - upsert + oneri listesi rotasi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Analiz servisi — model yükseltme + alan-kurallı istem + acenteKaynagi

**Files:**
- Modify: `server/konsimentoAnaliz.ts` (istem, şema, tip, model, timeout)
- Modify: `server/routes.ts` (`/api/portal/konsimento-analiz` yanıtına `acenteKaynagi`)

**Interfaces:**
- Produces: `KonsimentoAnalizSonucu`'na `acenteKaynagi: string | null` eklenir; rota yanıtı `{konsimentoNo, tasiyici, acenteAdi, acenteAdres, acenteBulundu, acenteKaynagi}` olur (Task 3 frontend'i kullanır).

- [ ] **Step 1: konsimentoAnaliz.ts güncelle**

1. Tip:

```ts
export type KonsimentoAnalizSonucu = {
  konsimentoNo: string | null;
  tasiyici: string | null;
  turkiyeAcentesi: { ad: string; adres: string | null } | null;
  acenteKaynagi: string | null;
};
```

2. `SISTEM_ISTEMI` sabitini TAMAMEN şu içerikle değiştir:

```ts
const SISTEM_ISTEMI = `Sen bir gümrük operasyon uzmanısın. Sana bir konşimento (Bill of Lading / Sea Waybill) PDF'i verilecek. Belge taranmış veya düşük kaliteli olabilir — görüntüden dikkatle oku. Üç bilgi çıkaracaksın:

1. konsimentoNo — Konşimento numarası:
- YALNIZ şu etiketli kutudan oku: "B/L No", "B/L NO.", "B/L Number", "Bill of Lading No", "Sea Waybill No", "SWB-No".
- ŞUNLARI ASLA KONŞİMENTO NUMARASI OLARAK ALMA: "Booking Number", "Booking Ref", "Carrier's Reference", "Export References", "Shipper's Ref", "OTI/NVOCC Number", fatura/kontrat numaraları ve konteyner numaraları (konteyner numarası 4 harf + 7 rakam biçimindedir).
- Numarayı KARAKTER KARAKTER aynen aktar; O ile 0, I ile 1, B ile 8 karışmalarına dikkat et. Doğru etiketi bulamıyorsan veya net okuyamıyorsan null döndür.

2. tasiyici — Taşıyıcı hat (carrier): belge başlığında/logosunda veya "Carrier:" etiketinde yazan denizcilik firması.

3. turkiyeAcentesi ve acenteKaynagi — Türkiye'deki ödeme/teslim acentesi:
- Acenteyi YALNIZ şu etiketli bloklardan al: "Port Agent", "Carrier's Agent(s)", "Carrier's Agents Endorsements", "Port of Discharge Agent", "Destination Agent", "Delivery Agent", "For delivery of (this) goods please apply to", veya belgenin alt/kenar bölgesindeki acente iletişim bloğu (vergi numarası / TAX ID / MERSIS ve telefon bilgisi içeren Türkiye adresli firma).
- ŞU BLOKLARDAN ASLA ACENTE ALMA: "Shipper" / "Exporter", "Consignee" / "Importer", "Notify Party" / "Notify Address". Bu bloklardaki firmalar müşteridir; Türkiye adresli ve A.Ş./LTD uzantılı olsalar BİLE ödeme acentesi DEĞİLDİR.
- Acente Türkiye adresli olmalıdır. Adında A.Ş. / LTD. / ŞTİ. uzantısı olması güveni artırır ama şart değildir (yabancı kökenli isimli firmaların İstanbul/Türkiye ofisleri de geçerli acentedir).
- acenteKaynagi alanına acenteyi aldığın blok etiketini aynen yaz (örn. "Destination Agent", "Port Agent", "For delivery of this goods please apply to"). İzinli blokların hiçbirinde Türkiye adresli firma yoksa turkiyeAcentesi ve acenteKaynagi null olmalı.

GENEL KURAL: Yalnız belgede YAZAN bilgiyi aktar. ASLA tahmin etme, tamamlama veya uydurma. Emin olmadığın her alanı null bırak.`;
```

3. `CIKTI_SEMASI`'na `acenteKaynagi` ekle (properties'e aşağıdaki blok + `required` dizisine `"acenteKaynagi"`):

```ts
    acenteKaynagi: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Acentenin alındığı blok etiketi (izinli listeden); acente yoksa null",
    },
```

4. Model ve timeout: `new Anthropic({ maxRetries: 1, timeout: 30_000 })` ve `model: "claude-sonnet-5"` (yorumları da güncelle).

- [ ] **Step 2: Rota yanıtı**

`/api/portal/konsimento-analiz` handler'ındaki `res.json({...})` bloğuna ekle:

```ts
          acenteKaynagi: sonuc.acenteKaynagi,
```

- [ ] **Step 3: Doğrulama — gerçek örnekle**

`npm run check` → hatasız. Dev sunucuyu yeniden başlat; ADP örneğiyle canlı test:

```bash
curl -s -b "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/konsimento-analiz \
  -F "konsimento=@e:/CEM APPS/cnctracker/KONŞİMENTO ÖRNEKLERİ/ADP.pdf"
# Beklenen: konsimentoNo "DGSSE260400154", acenteAdi "ASAV LOJISTIK..." içerir,
# acenteKaynagi dolu, acenteAdi "A-PLAS" İÇERMEZ.
```

Gerçek çıktıyı rapora aynen yaz. (Tam 5-dosya regresyonu Task 4'te.)

- [ ] **Step 4: Commit**

```bash
git add server/konsimentoAnaliz.ts server/routes.ts
git commit -m "feat(odemeler): analiz sonnet-5'e yukseltildi + alan-kuralli istem + acenteKaynagi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — kaynak satırı + alacaklı öneri listesi (datalist)

**Files:**
- Modify: `client/src/pages/portal/KonsimentoAnalizAlani.tsx`
- Modify: `client/src/pages/portal/YeniTalepSayfasi.tsx`
- Modify: `client/src/pages/portal/DogrudanOdemeSayfasi.tsx`

**Interfaces:**
- Consumes: Task 2 yanıtındaki `acenteKaynagi`; Task 1 `GET /api/portal/odeme-sirketleri`.
- Produces: davranış — bilgi satırında kaynak; alacaklı Input'unda öneri listesi. Mevcut testid'ler değişmez.

- [ ] **Step 1: KonsimentoAnalizAlani — kaynak satırı**

1. `AnalizYaniti` tipine ekle: `acenteKaynagi: string | null;`
2. Acente bulundu bloğunda, acente adı satırının ALTINA ekle:

```tsx
                    {analiz.acenteKaynagi && (
                      <div className="text-muted-foreground" data-testid={`kaynak-${idOnEki}-acente`}>
                        Kaynak: {analiz.acenteKaynagi}
                      </div>
                    )}
```

- [ ] **Step 2: İki formda alacaklı datalist**

Her iki dosyada (YeniTalepSayfasi, DogrudanOdemeSayfasi):

1. Import: `import type { Beyanname, MasrafTuru, OdemeSirketi } from "@shared/schema";` (mevcut type importuna `OdemeSirketi` ekle).
2. Sorgu ekle (masrafTurleri sorgusunun yanına):

```tsx
  const { data: odemeSirketleri = [] } = useQuery<OdemeSirketi[]>({
    queryKey: ["/api/portal/odeme-sirketleri"],
  });
```

3. Alacaklı `Input`'una `list` attribute + hemen ardından datalist (idOnEki formuna göre `talep`/`dogrudan` — YeniTalep'te `alacakli-onerileri-talep`, DogrudanOdeme'de `alacakli-onerileri-dogrudan`):

```tsx
                <Input
                  placeholder="Firma adı"
                  value={alacakli}
                  onChange={(e) => setAlacakli(e.target.value)}
                  list="alacakli-onerileri-talep"
                  data-testid="input-alacakli"
                />
                <datalist id="alacakli-onerileri-talep">
                  {odemeSirketleri.map((s) => (
                    <option key={s.id} value={s.ad} />
                  ))}
                </datalist>
```

(DogrudanOdeme'de mevcut testid `input-dogrudan-alacakli` aynen kalır; yalnız `list` + datalist eklenir.)

- [ ] **Step 3: Doğrulama**

`npm run check` → hatasız; üç dosya için Vite 200. Talep başarıyla gönderildikten sonra `odeme-sirketleri` sorgusunun tazelenmesi için iki formun başarı bloğuna ekle:

```tsx
      queryClient.invalidateQueries({ queryKey: ["/api/portal/odeme-sirketleri"] });
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/portal/KonsimentoAnalizAlani.tsx client/src/pages/portal/YeniTalepSayfasi.tsx client/src/pages/portal/DogrudanOdemeSayfasi.tsx
git commit -m "feat(odemeler): acente kaynak satiri + alacakli oneri listesi (datalist)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Gerçek örnek regresyonu + E2E + temizlik

**Files:**
- Create (scratchpad): `konsimento-regresyon.js`, `e2e-faz17.js`
- Modify: yok (gerçek uygulama hatası → DONE_WITH_CONCERNS)

- [ ] **Step 1: Regresyon scripti — 5 gerçek PDF**

Scratchpad'de `konsimento-regresyon.js`: login (suleyman) → her işaretsiz PDF'i `POST /api/portal/konsimento-analiz`'e gönder → sonuçları beklenenlerle karşılaştır:

| Dosya | konsimentoNo (birebir) | acenteAdi içermeli | acenteAdi İÇERMEMELİ |
|---|---|---|---|
| ADP.pdf | DGSSE260400154 | ASAV | A-PLAS |
| AKKON.pdf | AKKNBO26029624 | AKKON DEN | ENYTEKS |
| NINGBO.pdf | GYSE2604083 | VOLANTIS | A-PLAS |
| AWOT.pdf | ASCAN2640213 | SAVINO | A-PLAS, EGLV149602535221(booking no konsimentoNo'da olmamalı) |
| 4.pdf | (bilinmiyor — çıktı rapor edilir) | | |

Dosya yolu: `e:/CEM APPS/cnctracker/KONŞİMENTO ÖRNEKLERİ/`. Her sonucun TAM çıktısı rapora yazılır. Kabul: 4/4 bilinen örnek geçer. Bir örnek başarısızsa: isteme küçük rötuş İZİNLİ DEĞİL (kod değişikliği yok) — başarısızlığı tam çıktıyla DONE_WITH_CONCERNS raporla (controller istem rötuşuna karar verir).

- [ ] **Step 2: UI E2E (Playwright)**

`e2e-faz17.js`: (1) temsilci depo akışı — ADP.pdf yükle → onay kartında konsimentoNo `DGSSE260400154`, acente ASAV, "Kaynak:" satırı görünür → alacaklı otomatik ASAV dolu → onayla+gönder (`E2E ` önekli değil — gerçek acente adı kaydedilecek; sonda temizlenecek şekilde tutar 1 yap ve talebi sonda sil); (2) İKİNCİ talep akışında alacaklı input'una "ASA" yaz → datalist önerisinin DOM'da olduğunu assert et (`datalist option[value*="ASAV"]`); (3) masraf regresyonu (konşimento alanı yok, gönderilebiliyor).

- [ ] **Step 3: Temizlik + build**

Test taleplerini ve test ödeme şirketlerini sil:

```bash
node -e "
require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
(async () => {
  const t = await p.query(\"DELETE FROM odeme_talepleri WHERE tutar = '1.00' OR alacakli LIKE 'E2E %'\");
  const s = await p.query(\"DELETE FROM odeme_sirketleri\");
  console.log('talep:', t.rowCount, 'sirket:', s.rowCount);
  p.end();
})();
"
```

(Lokal DB — odeme_sirketleri tamamen temizlenir; canlıda gerçek kayıtlar kullanıcı onaylarından birikecek.)

`npm run check` + `npm run build` → temiz. Dev sunucu açık bırakılır. Commit yok.

- [ ] **Step 4: Rapor**

Dosya başına analiz çıktıları (4.pdf dahil — kullanıcı doğrulayacak), UI kontrol sonuçları, temizlik sayıları, build kuyruğu.
