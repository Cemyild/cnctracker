# Ödemeler Portalı Faz 1.11 — Firma Çoklu IBAN (alt-tablo) + Excel Şablonu

**Tarih:** 2026-07-06
**Durum:** Onaylandı (alt-tablo + etiketli seçim + çok-satır Excel + şablon + EUR kararları netleştirildi)
**Önkoşul:** Faz 1.10 canlıda (firma başına `ibanTry`/`ibanUsd` tek-kolon). Bu faz onu alt-tabloyla değiştirir.

## 1. İhtiyaç

Bazı ödeme yapılacak firmaların **aynı dövizde birden çok hesabı** var (özellikle
çok USD hesabı). F1.10'un döviz-başına-tek-kolon modeli bunu tutamıyor. Firma
başına IBAN **listesi** gerekli; her IBAN'ın döviz + numara + **etiket** (banka
adı/not) taşıması; ödeme anında temsilcinin doğru hesabı seçebilmesi; ve muhasebenin
Excel'le toplu yükleyebilmesi için **indirilebilir şablon**.

## 2. Kararlar

1. **Alt-tablo `firma_ibanlari`** (firma başına 0..N IBAN). F1.10 kolonları
   (`iban`/`ibanTry`/`ibanUsd`) **silinmez** (drizzle push drop tuzağı); artık
   yazılmaz, yalnız çocuk satır YOKKEN okuma-yedeği olarak sentezlenir (göç scripti
   gerekmez — F1.10'un "yıkıcı göç yok" felsefesi sürer). Prod'da 0 IBAN → etkisiz.
2. **Diller/dövizler:** `paraBirimi` ∈ {TRY, USD, EUR} (EUR de eklendi; tutar
   seçicisiyle aynı üçlü, tek-tip akış).
3. **Etiketli seçim:** ödeme anında firmanın seçili dövizdeki IBAN'ları: **1** ise
   otomatik dolar, **birden çok** ise etiketli dropdown'dan seçilir (seçilene kadar
   IBAN boş — yanlış hesaba gitmesin), **0** ise elle girilir.
4. **Excel:** her IBAN bir satır — `Firma Adı | Para Birimi | IBAN | Etiket |
   Vergi/TC No | Not`. Firma adına göre gruplanır. **"Şablon İndir"** butonu hazır
   `.xlsx` üretir.

## 3. Şema (`shared/schema.ts`)

Yeni tablo (mevcut `odemeSirketleri` kolonları aynen kalır):

```ts
export const firmaIbanlari = pgTable("firma_ibanlari", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firmaId: varchar("firma_id").notNull(),            // FK odeme_sirketleri.id (açık snake string)
  paraBirimi: text("para_birimi").notNull(),          // TRY | USD | EUR
  iban: text("iban").notNull(),
  etiket: text("etiket"),                             // banka adı / ayırt edici not
}, (t) => [
  index("IDX_firma_ibanlari_firma").on(t.firmaId),
]);
export const insertFirmaIbanSchema = createInsertSchema(firmaIbanlari).omit({ id: true });
export type InsertFirmaIban = z.infer<typeof insertFirmaIbanSchema>;
export type FirmaIban = typeof firmaIbanlari.$inferSelect;
```

`portalSessions`'tan önce tanımlanır (drizzle push sırası). FK kolon adı açık
`firma_id` string (CLAUDE.md kuralı). Tek `db:push` — yalnız tablo ekleme.

## 4. Yardımcılar (`client/src/pages/portal/portalUtils.ts`)

`OdemeSirketiDetay = OdemeSirketi & { ibanlar: FirmaIban[] }` (sunucu bu şekilde
döndürür). Yardımcılar:

```ts
// Firmanın seçili dövizdeki IBAN'ları (etiketli seçim/otomatik dolum için)
export function firmaIbanlariByPB(f: OdemeSirketiDetay, paraBirimi: string): FirmaIban[]
// Firmanın döviz özeti: [{ paraBirimi, adet }] (tablo/çip rozetleri için)
export function firmaIbanOzet(f: OdemeSirketiDetay): { paraBirimi: string; adet: number }[]
```

`firmaIbanlariByPB`, `f.ibanlar`'ı `paraBirimi`'ne göre filtreler. (Sunucu, çocuk
satırı olmayan firmalar için `ibanlar`'ı eski kolonlardan sentezler — §5.)

## 5. Storage (`server/storage.ts`)

- `getOdemeSirketleri()` / `getOdemeSirketleriTumu()` → her firmaya `ibanlar: FirmaIban[]`
  ekler: firma id'leri için tek `inArray` sorgusuyla çocuk satırlar çekilip Map ile
  join edilir (N+1 yok). **Sentez-yedeği:** çocuk satırı olmayan firma için, eski
  `ibanTry`/`ibanUsd`/`iban` doluysa sanal `FirmaIban` girdileri üretilir
  (`ibanTry`||`iban`→TRY, `ibanUsd`→USD; etiket null). Böylece göç scripti gerekmez.
- `createOdemeSirketi(data: { ad; vergiNo?; notlar?; ibanlar?: {paraBirimi;iban;etiket?}[] })`
  → firma + çocuk IBAN satırlarını ekler; ad çakışırsa null.
- `updateOdemeSirketi(id, data + ibanlar?)` → firma alanlarını günceller; `ibanlar`
  verildiyse o firmanın TÜM çocuk satırlarını silip yeniden ekler (replace-all).
- `upsertOdemeSirketi(ad, { iban?, paraBirimi?, kaynak? })` → YENİ firmada firma +
  tek çocuk IBAN (iban doluysa) ekler; ÇAKIŞMADA yalnız sayaç+sonKullanim (çocuk
  IBAN eklenmez — muhasebe yönetir). Boş iban → yalnız firma.
- `bulkUpsertOdemeSirketleri(rows)` → satırları firma adına göre gruplar; her firma
  için firma upsert + o firmanın çocuk IBAN'larını ekler (muhasebe yetkili: mevcut
  firmada çocuk satırlar bu Excel'dekilerle DEĞİŞTİRİLİR). Vergi/Not ilk dolu satırdan.
- `firmaIbanlariExcelSablonu(): Buffer` → başlık satırı + bir örnek satır içeren
  `.xlsx` buffer'ı (`XLSX.utils.aoa_to_sheet` + `write`).

## 6. API (`server/routes.ts`)

- `GET /api/portal/odeme-sirketleri` (+ `/tumu`) → firmalar `ibanlar[]` ile döner.
- `POST` / `PUT /api/portal/odeme-sirketleri[/:id]` → gövde `{ad, vergiNo, notlar,
  ibanlar: [{paraBirimi, iban, etiket}], (PUT: aktif)}`; requireMuhasebe; 400/409/404.
- `POST /api/portal/odeme-sirketleri/excel` → çok-satır grupla + bulkUpsert.
  Sütunlar: A:ad B:paraBirimi C:iban D:etiket E:vergiNo F:not.
- `GET /api/portal/odeme-sirketleri/sablon` → requireMuhasebe;
  `firmaIbanlariExcelSablonu()` buffer'ını `Content-Disposition: attachment;
  filename="odeme-firmalari-sablon.xlsx"` ile indirir.
- Upsert çağrı yerleri (talepler/dogrudan-odeme): mevcut `{iban, paraBirimi, kaynak}`
  imzası korunur (§5 upsert davranışı çocuk-satır ekler).

## 7. Frontend — Yönetim Sayfası (`FirmalarSayfasi.tsx`)

- Firma dialog'unda tek IBAN alanları yerine **tekrarlanabilir IBAN satırları**:
  her satır [Para Birimi Select (TRY/USD/EUR) + IBAN Input + Etiket Input + "Kaldır"];
  altta **"+ IBAN Ekle"**. Form state `ibanlar: {paraBirimi, iban, etiket}[]`; kaydet
  hepsini gönderir. Boş IBAN'lı satırlar gönderimde elenir.
- Tablo IBAN kolonu: `firmaIbanOzet(f)` rozetleri ("USD ×2", "TRY ×1"); boşsa
  "IBAN yok" (`rozet-iban-yok-{id}`).
- Başlıkta **"Şablon İndir"** butonu (`button-firma-sablon`) → `/sablon` ucunu indirir.
- Testid'ler: `iban-satir-{i}`, `select-iban-pb-{i}`, `input-iban-no-{i}`,
  `input-iban-etiket-{i}`, `button-iban-ekle`, `button-iban-kaldir-{i}`,
  `button-firma-sablon`, mevcut `button-firma-ekle/kaydet/excel`, `row-firma-{id}`.

## 8. Frontend — Talep Formları (`YeniTalep` + `DogrudanOdeme`, simetrik)

- Firma tam eşleşince + `paraBirimi` seçiliyken `secenekler = firmaIbanlariByPB(tamFirma, paraBirimi)`:
  - **1** → IBAN otomatik dolar (mevcut `sonIbanOnerisi` kalıbı; elle yazılan ezilmez).
  - **>1** → alacaklı altında **etiketli seçim dropdown'u** (`select-firma-iban`),
    her seçenek `${etiket || "—"} · …${iban.slice(-4)}`; seçilince IBAN dolar +
    `sonIbanOnerisi` güncellenir. Seçilene kadar IBAN otomatik dolmaz.
  - **0** → elle giriş; dropdown yok.
  - Para birimi değişince yeniden hesaplanır; IBAN'sız/tek/çok durumlarına göre
    dropdown gösterilir/gizlenir, otomatik-dolan temizlenir.
- Benzer firma çipi etiketi: firma adı + `firmaIbanOzet` özeti ("· TRY, USD ×2")
  ya da "IBAN yok".

## 9. Kapsam / Kapsam Dışı

- Değişen dosyalar: `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`,
  `client/src/pages/portal/`: `portalUtils.ts`, `FirmalarSayfasi.tsx`,
  `YeniTalepSayfasi.tsx`, `DogrudanOdemeSayfasi.tsx`. Konşimento analizi + gümrük
  ana uygulaması DEĞİŞMEZ.
- Eski `iban`/`ibanTry`/`ibanUsd` kolonlarının kaldırılması: kapsam dışı (drop
  tuzağı; okuma-yedeği olarak sentezlenir). F1.10 `firmaIban`/`firmaParaBirimleri`
  yardımcıları yerini `firmaIbanlariByPB`/`firmaIbanOzet`'e bırakır (silinir/uyarlanır).
- IBAN doğrulama (TR IBAN format kontrolü), aynı IBAN'ın çift girilmesi engeli:
  kapsam dışı (Faz 2; şimdilik serbest metin).
- Firma-düzeyi `banka` alanı: artık IBAN-düzeyi `etiket` ile karşılanır; `banka`
  kolonu şemada kalır ama UI'dan kaldırılır (drop edilmez).

## 10. Doğrulama

- `npm run check` temiz.
- Storage duman testi: create(2 USD + 1 TRY iban) → getTumu firmayı 3 `ibanlar` ile
  döndürür; update ibanlar replace; upsert yeni firma tek çocuk iban; bulkUpsert
  3-satırlı firma gruplaması; sentez-yedeği (eski ibanTry dolu, çocuk yok → sanal TRY).
- Şablon ucu: `GET /sablon` 200 + xlsx buffer (başlık satırı doğru).
- `firmaIbanlariByPB`/`firmaIbanOzet` saf-fonksiyon senaryoları (0/1/çok, döviz filtre).
- Playwright: muhasebe firmaya 2 USD + 1 TRY IBAN ekler (etiketli) → tabloda "USD ×2 TRY ×1"; Şablon İndir çalışır; temsilci firmayı seçip USD iken **dropdown** çıkar (2 seçenek), TRY iken otomatik dolar, seçim IBAN'ı doldurur; Excel çok-satır import.
- `db:push` (yalnız firma_ibanlari tablosu) + `npm run build` temiz.
