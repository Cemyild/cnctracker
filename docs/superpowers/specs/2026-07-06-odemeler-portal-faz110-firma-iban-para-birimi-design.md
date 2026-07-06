# Ödemeler Portalı Faz 1.10 — Firma IBAN Para Birimi (TRY + USD)

**Tarih:** 2026-07-06
**Durum:** Onaylandı (yaklaşım A + iki-döviz + 2 tasarım bölümü kullanıcıyla netleştirildi)
**Önkoşul:** Faz 1.9 canlıda (firma yönetimi + tek `iban` alanı + IBAN otomasyonu + benzerlik önerisi).

## 1. İhtiyaç

F1.9'da firmanın tek IBAN'ı vardı; para birimi tutulmuyordu. Bir firmaya farklı
dövizlerde ödeme yapılabildiğinden IBAN'ın para birimi de gerekli. Kullanıcı
kararı: firma başına **döviz-bazlı ayrı IBAN**, ama yalnız **TRY ve USD** (firma
EUR hesabı tutulmuyor; EUR ödeme olursa IBAN elle girilir).

## 2. Kararlar

1. **Yaklaşım A** (alt-tablo değil): para-birimi-anahtarlı kolonlar. Uygulama
   para birimi zaten sabit enum olduğundan normalize (child table) gereksiz.
2. **İki döviz kolonu:** `ibanTry`, `ibanUsd` (nullable). Mevcut `iban` kolonu
   **silinmez** (drizzle-kit push silme sorusu = CI kilidi tuzağı) ve TRY için
   **yedek** olarak okunur.
3. **Yıkıcı göç YOK:** F1.9'da girilmiş `iban` değerleri taşınmaz; okuma/otomatik-
   dolum katmanı TRY için `ibanTry ?? iban` kullanır. Muhasebe firmayı düzenleyince
   değer doğal olarak `ibanTry`'ye yazılır (`iban` giderek atıl kalır).
4. **Tutar para birimi seçicisi değişmez** (TRY/USD/EUR) — bu, tutarın dövizidir.
   Yalnız firma IBAN'ları TRY+USD ile sınırlı.

## 3. Şema (`shared/schema.ts`)

`odeme_sirketleri`'ne iki kolon (mevcut kolonlar aynen kalır — tek `db:push`, yalnız
ekleme, veri kaybı yok):

```ts
  ibanTry: text("iban_try"),
  ibanUsd: text("iban_usd"),
```

`OdemeSirketi` tipi bu alanları otomatik alır. Mevcut `iban` kolonu (F1.9) şemada
kalır; yeni yazımlar `iban`'a DEĞİL `ibanTry`/`ibanUsd`'ye gider.

## 4. Yardımcılar (`client/src/pages/portal/portalUtils.ts`)

Döviz→IBAN eşlemesi tek yerde (formlar + yönetim sayfası kullanır):

```ts
export function firmaIban(
  f: Pick<OdemeSirketi, "ibanTry" | "ibanUsd" | "iban">,
  paraBirimi: string,
): string | null {
  if (paraBirimi === "USD") return f.ibanUsd || null;
  if (paraBirimi === "EUR") return null;          // firma EUR hesabı tutmuyor
  return f.ibanTry || f.iban || null;             // TRY (+ eski iban yedeği)
}

export function firmaParaBirimleri(
  f: Pick<OdemeSirketi, "ibanTry" | "ibanUsd" | "iban">,
): string[] {
  const r: string[] = [];
  if (f.ibanTry || f.iban) r.push("TRY");
  if (f.ibanUsd) r.push("USD");
  return r;
}
```

## 5. Storage (`server/storage.ts`)

- `upsertOdemeSirketi(ad, opts?: { iban?: string | null; paraBirimi?: string; kaynak?: string })`
  — yeni firmada, talebin para birimine uyan kolona yazar: `paraBirimi==="USD"` →
  `ibanUsd`; `"TRY"` veya tanımsız → `ibanTry`; `"EUR"` → IBAN yazılmaz (yalnız
  ad+kaynak). **Çakışmada F1.9 kuralı aynen:** yalnız `kullanimSayisi`+`sonKullanim`;
  IBAN kolonları ASLA ezilmez.
- `createOdemeSirketi(data: { ad; ibanTry?; ibanUsd?; banka?; vergiNo?; notlar? })` —
  insert `ibanTry`/`ibanUsd` yazar; `iban` yazmaz. Ad çakışırsa `null`.
- `updateOdemeSirketi(id, data: Partial<{ ad; ibanTry; ibanUsd; banka; vergiNo; notlar; aktif }>)`
  — alan güncelleme; yoksa `null`.
- `bulkUpsertOdemeSirketleri(rows: { ad; ibanTry?; ibanUsd?; banka?; vergiNo?; notlar? }[])`
  — çakışmada dolu gelen döviz IBAN'larını + diğer alanları GÜNCELLER (muhasebe
  yetkili); yeni ekler.
- `getOdemeSirketleri`/`getOdemeSirketleriTumu` — `select()` yeni kolonları otomatik
  döndürür (imza/sıra değişmez).

## 6. API (`server/routes.ts`)

- `POST`/`PUT /api/portal/odeme-sirketleri[/:id]` gövdesi: `ibanTry`, `ibanUsd`
  (tekil `iban` yerine), + banka/vergiNo/notlar/(PUT: aktif). requireMuhasebe.
- `POST /api/portal/odeme-sirketleri/excel` — yeni sütun düzeni:
  **A: Firma Adı | B: IBAN TRY | C: IBAN USD | D: Banka | E: Vergi/TC No | F: Not**.
- Upsert çağrı yerleri (`POST /talepler`, `POST /dogrudan-odeme`): mevcut `iban`
  ile birlikte talebin `paraBirimi`'ni de geçir:
  `storage.upsertOdemeSirketi(alacakliStr, { iban, paraBirimi, kaynak })`.

## 7. Frontend — Yönetim Sayfası (`FirmalarSayfasi.tsx`)

- Tablo **IBAN** kolonu → `firmaParaBirimleri(f)` rozetleri ("TRY", "USD"); dizi
  boşsa "IBAN yok" rozeti (`rozet-iban-yok-{id}`).
- Dialog → tek IBAN alanı yerine **iki alan**: "IBAN (TRY)" (`input-firma-iban-try`)
  ve "IBAN (USD)" (`input-firma-iban-usd`). Düzenlemede TRY alanı `ibanTry ?? iban`
  ile önden dolar (kaydedince `ibanTry`'ye yazılır). Form state `iban` yerine
  `ibanTry`+`ibanUsd` taşır; POST/PUT gövdesi bu iki alanı gönderir.

## 8. Frontend — Talep Formları (`YeniTalepSayfasi.tsx` + `DogrudanOdemeSayfasi.tsx`)

- IBAN otomasyon `useEffect` bağımlılığı `[tamFirma, paraBirimi]`. Otomatik IBAN =
  `firmaIban(tamFirma, paraBirimi)`:
  - IBAN varsa ve (kutu boş veya hâlâ `sonIbanOnerisi.current`) → doldur.
  - IBAN yoksa ve kutu hâlâ otomatik-dolan değerse → temizle (yanlış dövizin/eski
    firmanın IBAN'ı kalmasın). Elle yazılan ASLA ezilmez.
- Para birimi değişince (eşleşmiş firma varken) o dövizin IBAN'ı gelir / yoksa
  temizlenir — aynı effect.
- `firmaSec(f)` (çip tıklama): `setAlacakli(f.ad)` + IBAN = `firmaIban(f, paraBirimi)`.
- Benzer firma çipi etiketi: `${f.ad} · ${firmaParaBirimleri(f).join(", ") || "IBAN yok"}`.

## 9. Kapsam / Kapsam Dışı

- Değişen dosyalar: `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`,
  `client/src/pages/portal/`: `portalUtils.ts`, `FirmalarSayfasi.tsx`,
  `YeniTalepSayfasi.tsx`, `DogrudanOdemeSayfasi.tsx`. Konşimento analizi + muhasebe
  ana uygulaması + tahsilat vb. DEĞİŞMEZ.
- EUR firma IBAN'ı, ikiden çok döviz, banka'nın döviz-bazlı ayrışması: kapsam dışı
  (`banka` firma-düzeyinde tek alan kalır).
- Eski `iban` kolonunun tümüyle kaldırılması: kapsam dışı (drop-prompt tuzağı;
  yedek olarak kalır).

## 10. Doğrulama

- `npm run check` temiz.
- `firmaIban`/`firmaParaBirimleri` saf-fonksiyon senaryoları: USD→ibanUsd; TRY→
  ibanTry, ibanTry yoksa eski `iban` yedeği; EUR→null; firmaParaBirimleri doğru
  liste.
- Storage duman testi: create(ibanTry+ibanUsd) → getTumu doğrular; upsert
  paraBirimi='USD' yeni firmada ibanUsd yazar, TRY ibanTry; çakışmada IBAN ezilmez.
- Playwright: muhasebe firma ekler (IBAN TRY + USD) → tabloda "TRY USD" rozetleri;
  temsilci YeniTalep'te firmayı seçip para birimi TRY iken TRY IBAN dolar, USD'ye
  çevirince USD IBAN gelir, EUR'ya çevirince temizlenir; benzer çipte döviz etiketi.
- `db:push` (yalnız iki kolon ekleme) + `npm run build` temiz.
