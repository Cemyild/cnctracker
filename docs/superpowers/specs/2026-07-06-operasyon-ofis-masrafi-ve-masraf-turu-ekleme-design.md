# Operasyon Ofis Masrafı + Portal Formlarında Yeni Masraf Türü Ekleme — Tasarım

**Tarih:** 2026-07-06
**Durum:** Onaylandı (iki karar kullanıcıyla netleştirildi)
**Önkoşul:** Operasyon Kasası canlıda; masraf türleri (`masraf_turleri`) + üç masraf formu (Operasyon Kasam, Temsilci Yeni Talep, Muhasebe Doğrudan Ödeme) mevcut.

## 1. İhtiyaç

(a) Operasyon masrafı her zaman bir gümrük dosyasına bağlı olmayabilir — **ofis
masrafı** (kira, kırtasiye vb.) da olabilir. Formdaki belirsiz "Dosya yok" kutusu
"Ofis Masrafı" ile değiştirilir. (b) Masraf türü seçicide istenen tür yoksa,
kullanıcı **yeni tür ekleyebilmeli** (üç portal formunda da).

## 2. Kararlar

1. **"Dosya yok" → "Ofis Masrafı"** (operasyon Kasam formunda). İşaretlenince
   beyanname/dosya seçimi gizlenir, açıklama zorunlu. Ayrı kolon YOK — mevcut
   `operasyon_masraflar.dosyaYok` yeniden etiketlenir (operasyonda tek dosyasız-mod
   artık ofis masrafı → `dosyaYok=true` ⟺ ofis masrafı). Şema/`db:push` değişmez.
2. **Yeni masraf türü ekleme** üç formda da (operasyon+temsilci+muhasebe). Yeni uç
   `requirePortal` (her portal kullanıcısı). Eklenen tür paylaşılan `masraf_turleri`'ne
   kalıcı girer, tüm formlarda görünür. Aynı ad varsa çift kayıt açılmaz.
3. Masraf türü seçici **tek paylaşılan bileşene** (`MasrafTuruSecici`) çıkarılır;
   üç form bunu kullanır (davranış/testid'ler korunur, yalnız "+ Yeni tür" eklenir).

## 3. Ofis Masrafı (`OperasyonKasaSayfasi.tsx` + rapor etiketleri)

- Formdaki checkbox etiketi **"Ofis Masrafı — dosyaya bağlı değil, açıklama
  zorunlu"** olur; state adı `dosyaYok` KALIR (davranış aynı), testid `checkbox-op-ofis`
  olur (netlik için). İşaretliyken beyanname arama/seçimi
  gizli; açıklama zorunlu (mevcut doğrulama). Gönderimde `dosyaYok=true`,
  `beyannameId` gönderilmez (mevcut davranış).
- **Rapor etiketi:** `dosyaYok=true` masraf satırları operasyonun **açık hareketler**
  (Kasam), **Kapanışlarım** ve muhasebe **Şube Masraf** detay/kapanış listelerinde
  "**Ofis Masrafı**" rozeti/etiketiyle görünür (masraf türü + açıklamayla birlikte).
  `OperasyonMasraf` tipi `dosyaYok` alanını zaten taşır — ek veri gerekmez.
- Backend (`POST /api/portal/operasyon/masraf`) doğrulaması aynen: dosyasız modda
  açıklama zorunlu; belge her hâlükârda zorunlu. Değişiklik yalnız UI etiketi + rapor
  gösterimi (davranış aynı).

## 4. Yeni Masraf Türü Ekleme

**Uç** (`server/routes.ts`):
```
POST /api/portal/masraf-turleri   (requirePortal)
  gövde { ad }
  - ad boşsa 400.
  - Mevcut türlerde (aktif+pasif) ad (trim, case-insensitive tr) VARSA yeni kayıt
    AÇMAZ, mevcudu döndürür (çift kayıt önlenir).
  - Yoksa storage.createMasrafTuru({ ad: ad.trim(), sira: 0, aktif: true }) → döndürür.
```
Mevcut `POST /api/odemeler/masraf-turleri` (admin, auth'suz) korunur — bu ek uç
portal kullanıcıları içindir.

**Bileşen** (`client/src/pages/portal/MasrafTuruSecici.tsx`, yeni):
- Props: `{ value: string; onChange: (ad: string) => void; testId?: string }`.
- İçeride `useQuery<MasrafTuru[]>({ queryKey: ["/api/portal/masraf-turleri"] })`.
- shadcn `Select`: mevcut türler + en altta ayrılmış bir **"+ Yeni tür ekle"** öğesi
  (özel value `__yeni__`). Seçilince küçük `Dialog` açılır (tek `Input` + "Ekle").
- "Ekle" → `POST /api/portal/masraf-turleri {ad}` → başarıda listeyi invalidate +
  dönen türün adını `onChange` ile seç + dialog kapat. Boş ad → uyarı.
- Testid'ler: `select-<testId>` (trigger), `select-item-yeni-tur`, `input-yeni-tur-ad`,
  `button-yeni-tur-ekle`.

**Üç forma entegrasyon:** OperasyonKasaSayfasi, YeniTalepSayfasi, DogrudanOdemeSayfasi
içindeki masraf türü `<Select>` blokları `<MasrafTuruSecici value={masrafTuru}
onChange={setMasrafTuru} testId="..." />` ile değiştirilir. Bileşen `masrafTurleri`
query'sini içeride sahiplenir; formların mevcut `masrafTurleri` query'si (yalnız o
Select için kullanılıyorsa) KALIR — aynı queryKey, cache paylaşılır, işlevsel fark yok,
form değişikliği en aza iner (yalnız Select JSX'i bileşenle değişir). Mevcut masraf-türü testid'leri (`select-masraf-turu`,
`select-op-masraf-turu`, `select-dogrudan-masraf-turu`) korunur.

## 5. Kapsam / Kapsam Dışı

- Değişen/eklenen: `server/routes.ts` (yeni uç), `client/src/pages/portal/`:
  `MasrafTuruSecici.tsx` (yeni), `OperasyonKasaSayfasi.tsx` (Ofis Masrafı etiketi +
  seçici), `YeniTalepSayfasi.tsx` + `DogrudanOdemeSayfasi.tsx` (seçici),
  `OperasyonKapanislarSayfasi.tsx` + `OperasyonTakipSayfasi.tsx` (Ofis Masrafı rapor
  etiketi). Şema DEĞİŞMEZ (db:push yok).
- Kapsam dışı: masraf türü silme/düzenleme portal UI'ı (yönetim panelinde var);
  ofis masrafı için ayrı kolon; tür arama.

## 6. Doğrulama

- `npm run check` temiz.
- Uç duman testi (curl): portal kullanıcı → `POST /api/portal/masraf-turleri {ad:"ZZTest Tür"}` → 200 + kayıt; tekrar aynı ad → yeni kayıt AÇMAZ, aynısını döndürür; boş ad → 400. Test türü sonra sil (dev DB).
- Playwright: (a) operasyon Kasam'da "Ofis Masrafı" işaretle → beyanname gizlenir, açıklama zorunlu, kaydet → açık hareketlerde "Ofis Masrafı" etiketli satır; (b) bir formda masraf türü seçiciden "+ Yeni tür ekle" → dialog → yeni tür → listede + seçili gelir; (c) yeni tür diğer formda da görünür.
- `npm run build` temiz. DEV DB izolasyonu (test öncesi hedef doğrula).
