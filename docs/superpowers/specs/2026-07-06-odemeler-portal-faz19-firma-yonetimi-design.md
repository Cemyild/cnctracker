# Ödemeler Portalı Faz 1.9 — Ödeme Yapılacak Firmalar Yönetimi + Benzerlik Önerisi

**Tarih:** 2026-07-06
**Durum:** Onaylandı (yaklaşım A + 2 tasarım bölümü + benzerlik önerisi kararı kullanıcıyla netleştirildi)
**Önkoşul:** Faz 1.8 canlıda. `odeme_sirketleri` tablosu mevcut (yalnız `ad` + kullanım sayacı); depo onaylarında ve F1.8 çoklu-kalem gönderiminde alacaklı olarak birikiyor; temsilci tarafında native `<datalist>` ile öneri olarak çıkıyor.

## 1. Sorun / İhtiyaç

Muhasebe, ödeme yapılabilecek firmaları (IBAN vb. bilgileriyle) merkezî olarak
yönetmek istiyor: elle veya Excel ile girsin; temsilci talep açarken bu
firmalardan seçsin ve firmanın IBAN'ı otomatik gelsin. Konşimento analizinin
çıkardığı ad kayıtlı firmayla birebir tutmayabildiğinden, benzer kayıtlar öneri
olarak sunulmalı.

## 2. Kararlar (kullanıcıyla netleştirildi)

1. **Yaklaşım A:** Mevcut `odeme_sirketleri` tablosu genişletilir (yeni tablo/göç
   YOK — bu tablo zaten ödeme yapılacak firma listesidir). Temsilci tarafında
   native `<datalist>` korunur; ayrı Combobox eklenmez.
2. **Alanlar:** `ad` (unique, zorunlu) + `iban`, `banka`, `vergiNo`, `notlar`
   (hepsi opsiyonel) + `kaynak` (muhasebe | temsilci | depo).
3. **Temsilci/muhasebe IBAN otomasyonu:** Yalnız **tam eşleşmede** IBAN sessizce
   otomatik dolar. Benzer (ama tam olmayan) kayıtlar tıklanabilir öneri olarak
   listelenir; temsilci birini seçerse ad+IBAN dolar. Hiçbir IBAN insan onayı
   olmadan gelmez.
4. **Kaynak ayrımı:** Tek liste + IBAN'sız kayıtlar için "IBAN yok" rozeti;
   `kaynak` kolonu kimin girdiğini gösterir. Ayrı "onaylanan/bekleyen" sekmesi YOK.
5. **Yeni firma kaydı kapsamı (F1.7'den değişiklik):** Bugün yalnız depo talebinde
   alacaklı upsert ediliyor. Artık temsilcinin **tüm taleplerinde** (masraf + depo)
   ve muhasebenin Doğrudan Ödeme'sinde girilen yeni firma listeye eklenir.

## 3. Şema (`shared/schema.ts`)

`odeme_sirketleri` genişler (mevcut kolonlar aynen kalır — tek `db:push`, veri
kaybı yok):

```ts
export const odemeSirketleri = pgTable("odeme_sirketleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ad: text("ad").notNull().unique(),
  iban: text("iban"),
  banka: text("banka"),
  vergiNo: text("vergi_no"),
  notlar: text("notlar"),          // "not" SQL rezerve kelimesi — "notlar" kullanılır
  kaynak: text("kaynak").notNull().default("muhasebe"), // muhasebe | temsilci | depo
  kullanimSayisi: integer("kullanim_sayisi").notNull().default(1),
  sonKullanim: timestamp("son_kullanim").defaultNow(),
  aktif: boolean("aktif").notNull().default(true),
});
```

`insertOdemeSirketiSchema` yeni alanları içerir (id + sonKullanim omit). Mevcut
satırlar push sonrası `iban=null`, `kaynak='muhasebe'` görünür — birkaç eski
depo kaydının yanlış etiketlenmesi bilinen küçük kabul (rozet eksik IBAN'ı yakalar).

## 4. Storage (`server/storage.ts`)

- `getOdemeSirketleri()` — genişler (tüm alanları döndürür; sıralama mevcut kalır:
  `kullanimSayisi` desc, `sonKullanim` desc; yalnız aktif; limit 100). Temsilci
  datalist'i bunu kullanır.
- `getOdemeSirketleriTumu()` — **yeni**; yönetim tablosu için limitsiz, `ad` asc,
  aktif + pasif dahil. Yönetim sayfası bunu kullanır. (İki ayrı tüketici: datalist
  kullanım-sıralı/aktif; yönetim ad-sıralı/tümü.)
- `createOdemeSirketi(data)` — muhasebe elle ekleme; `ad` çakışırsa `null`
  döndürür (route 409 verir).
- `updateOdemeSirketi(id, data)` — alan güncelleme + `aktif` toggle; yoksa `null`
  (route 404).
- `upsertOdemeSirketi(ad, opts?: { iban?: string | null; kaynak?: string })` —
  mevcut metot genişler. **Insert'te** iban+kaynak yazılır; **onConflictDoUpdate**
  yalnız `kullanimSayisi`+`sonKullanim` günceller — `iban/banka/vergiNo/kaynak`
  ASLA ezilmez (muhasebe IBAN'ı korunur).
- `bulkUpsertOdemeSirketleri(rows)` — Excel; muhasebe yetkili olduğundan
  **çakışmada alanları GÜNCELLER** (iban/banka/vergiNo/notlar dolu gelenlerle),
  `kaynak='muhasebe'`. `{eklendi, guncellendi, atlandi}` sayıları döner.

## 5. API (`server/routes.ts`)

- `GET /api/portal/odeme-sirketleri` — mevcut, `requirePortal` (iki rol), yeni
  alanlarla döner (datalist için kullanım-sıralı, limit 100).
- `GET /api/portal/odeme-sirketleri/tumu` — `requireMuhasebe`, yönetim tablosu
  için limitsiz, ad asc (aktif+pasif dahil).
- `POST /api/portal/odeme-sirketleri` — `requireMuhasebe`, elle ekleme; gövde
  `{ad, iban?, banka?, vergiNo?, notlar?}`; ad boşsa 400, çakışırsa 409.
- `PUT /api/portal/odeme-sirketleri/:id` — `requireMuhasebe`, alan güncelleme +
  `aktif`; yoksa 404.
- `POST /api/portal/odeme-sirketleri/excel` — `requireMuhasebe`, memory-multer
  (`uploadOdemeSirketExcel`), `XLSX.read`+`sheet_to_json({header:1})`, ilk satır
  başlık, bulk upsert; `{eklendi, guncellendi, atlandi}` döner. Excel başlıkları:
  **Firma Adı | IBAN | Banka | Vergi/TC No | Not** (A–E sütunları). `ad` boş satır
  atlanır.
- Upsert çağrı yerleri genişler: `POST /api/portal/talepler` (F1.8 çoklu-kalem;
  her kalem için) — **tüm odemeTipi'lerde** alacaklıyı upsert eder, iban (kalemin
  IBAN'ı) + kaynak (`depo_teminat` ise `'depo'`, değilse `'temsilci'`).
  `POST /api/portal/dogrudan-odeme` — kaynak `'muhasebe'`. Best-effort (talebi
  bozmaz), await edilmez.

## 6. Muhasebe Yönetim Sayfası (`FirmalarSayfasi.tsx`, yeni)

Muhasebe-only. Sidebar'a `Building2` ikonlu "Ödeme Firmaları" sekmesi
(`/portal/firmalar`), `MUHASEBE_MENU`'ye eklenir; `PortalApp.tsx`'te rota +
başlık + role-guard'lı `<Route>`.

- Arama kutusu (ad/IBAN/vergi no filtreler).
- Tablo: **Ad | IBAN (boşsa "IBAN yok" rozeti) | Banka | Vergi No | Kaynak |
  Kullanım | Aktif | İşlemler**. `getOdemeSirketleriTumu()` verisi, ad asc.
- "Elle Ekle" → dialog: ad (zorunlu), iban/banka/vergiNo/notlar (opsiyonel);
  kaydet → POST → liste invalidate.
- Satırda "Düzenle" (aynı dialog, mevcut değerlerle — IBAN tamamlama) → PUT.
- Satırda "Pasifleştir/Aktifleştir" → PUT `{aktif}`.
- "Excel Yükle" → gizli file input → POST excel → "N eklendi, M güncellendi, K
  atlandı" toast → liste invalidate.
- Testid'ler: `link-portal-firmalar`, `button-firma-ekle`, `button-firma-excel`,
  `input-firma-ad`, `input-firma-iban`, `input-firma-banka`, `input-firma-vergino`,
  `input-firma-notlar`, `button-firma-kaydet`, `row-firma-{id}`,
  `button-firma-duzenle-{id}`, `button-firma-aktif-{id}`, `rozet-iban-yok-{id}`.

## 7. Talep Formu Entegrasyonu (`YeniTalepSayfasi.tsx` + `DogrudanOdemeSayfasi.tsx`)

**Saf yardımcılar (`portalUtils.ts`):**
- `firmaNormalize(s)`: Türkçe küçült (`toLocaleLowerCase("tr")`), hukuki ek temizle
  (A.Ş./AŞ/A.S., LTD, ŞTİ/STI, LTD.ŞTİ), noktalama→boşluk, boşluk sıkıştır.
- `firmaBenzerlik(a, b)`: normalize kelime kümeleri üzerinde Jaccard (0–1).
- `tamEslesme(girilen, firmalar)`: `firmaNormalize` eşit firma veya `null`.
- `benzerFirmalar(girilen, firmalar, {esik=0.34, adet=3})`: eşik üstü, benzerlik
  desc, tam eşleşenler hariç en fazla `adet` firma.

**Her iki formda davranış** (ikisi de aynı alacaklı+iban+datalist+
`sonAlacakliOnerisi`+`konsimentoDegisti` kalıbına sahip):
- Alacaklı değeri değişince veya konşimento önerisi gelince:
  - `tam = tamEslesme(alacakli, firmalar)`; `tam?.iban` varsa IBAN alanına
    otomatik dolar — mevcut alacaklı ref kalıbıyla eşleşen `sonIbanOnerisi` ref'i:
    IBAN boşsa veya hâlâ önceki öneriyse doldur (elle yazılmış IBAN ezilmez).
  - Türetilmiş `oneriler = tam ? [] : benzerFirmalar(alacakli, firmalar)`.
- Alacaklı alanının altında `oneriler.length > 0` iken "Benzer kayıtlı firmalar:"
  satırı + tıklanabilir çipler; her çip firma adı + kısa IBAN önizlemesi (son 4
  hane) ya da "IBAN yok". Çip tıklaması: `setAlacakli(firma.ad)` +
  `setIban(firma.iban ?? "")` + ref'leri günceller.
- Hiç benzer yoksa: bugünkü serbest metin davranışı; IBAN boş.
- Native `<datalist>` korunur (yazarken tarayıcı önerisi); çipler onu tamamlar.
- Testid'ler: `benzer-firmalar-talep` / `benzer-firmalar-dogrudan` (konteyner),
  `cip-firma-{i}` (çipler).

## 8. Kapsam Sınırı / Kapsam Dışı

- Değişen dosyalar: `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`,
  `client/src/pages/portal/`: `portalUtils.ts`, `FirmalarSayfasi.tsx` (yeni),
  `PortalSidebar.tsx`, `PortalApp.tsx`, `YeniTalepSayfasi.tsx`,
  `DogrudanOdemeSayfasi.tsx`. Gümrük/muhasebe ana uygulaması, `KonsimentoAnalizAlani`
  dokunulmaz.
- `KonsimentoAnalizAlani` kendi acente önerisini (`alacakliOnerisi`) üretmeye
  devam eder; benzerlik eşleştirmesi talep formunda, o öneri alacaklıya düştükten
  sonra çalışır (bileşen değişmez).
- Excel şablonu indirme, firma silme (hard delete), birleştirme (merge), fuzzy
  eşik ayarı UI'ı: kapsam dışı (gerekirse sonra).
- `ad` case-sensitive unique kalır (F1.7 notu); normalize yalnız eşleştirmede
  kullanılır, saklama değişmez.

## 9. Doğrulama

- `npm run check` temiz.
- Benzerlik yardımcıları: saf-fonksiyon senaryoları (lokal node script) —
  "ASAV LOJİSTİK" vs "ASAV LOJISTIK HIZMETLERI A.Ş." → yüksek benzerlik + tam
  eşleşme değil; "ASAV" vs "DE-KA GÜMRÜK" → düşük/eşik altı; tam eşleşme
  normalize ile ("asav lojistik a.ş." == "ASAV LOJİSTİK AŞ").
- Playwright E2E (lokal, gerçek dev sunucu): muhasebe elle firma ekler (IBAN'lı)
  → yönetim listesinde görünür; Excel yükler → özet toast + satırlar; temsilci
  YeniTalep'te tam firma seçince IBAN otomatik dolar; ADP.pdf konşimento akışında
  "ASAV" varyantı → benzer çip görünür → tıkla → alacaklı+IBAN dolar; yeni firma
  adı yazıp gönderince muhasebe yönetim listesinde `kaynak=temsilci` ile belirir.
  Test verisi sonda temizlenir.
- `npm run build` temiz.
