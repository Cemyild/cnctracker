# Operasyon Kasası: Belge Esnekliği + Avans Dekontu + beyan_no Araması — Tasarım

**Tarih:** 2026-07-20
**Durum:** Onaylandı (bir karar kullanıcıyla netleştirildi: avans dekontu OPSİYONEL)
**Önkoşul:** Operasyon Kasası + Ofis Masrafı + Şube Atama canlıda (commit `08ad61d`).

## 1. İhtiyaç — gerçek veriden çıktı

Erenköy şubesinin paylaştığı 3 günlük gerçek kayıt (`şube masraflar/erenköy/*.xlsx`, 111 masraf satırı)
incelendiğinde sistemin üç noktada gerçek iş akışıyla uyuşmadığı görüldü:

| Bulgu | Sayı |
|---|---|
| 3 iş gününde masraf satırı | 111 (~37/gün) |
| Bunun "DOSYA" ücreti olan (20-30 TL, ayrı fişi YOK) | 98 satır (%88) |
| Şubenin çalıştığı farklı gümrük | 5 (ERENKÖY 48, DERİNCE 22, DİLOVASI 21, SAW 6, GEBZE 4) |
| Dosyaya bağlı satırların ihracat (EX) olanı | 80 / 101 |

1. **Belge zorunluluğu hacimle çelişiyor.** `operasyon_masraflar.belge_dosya` NOT NULL — her masrafa
   belge şart. Günde ~37 satırın 88'i 20-30 TL'lik dosya ücreti ve doğası gereği ayrı fişi yok.
   Kullanıcı sistemi bırakıp Excel'e döner.
2. **Avans dekontu tutulmuyor.** Erenköy kaydında avans satırı adıyla geçiyor
   ("BAYRAM AKSOY AVANS 10.000") ama banka dekontu sistemde saklanmıyor.
3. **Erenköy farklı bir anahtar kullanıyor.** Excel'de `167929` yazıyor; bizdeki karşılığı
   `dosya_no = 26-10557`, `beyan_no = 26341200IM00167929`. Yani şubenin yazdığı numara
   `beyan_no`'nun son 8 hanesi. Bugün arama yalnız `dosya_no` + `alici` üzerinde çalıştığı için
   Murat aradığını bulamıyor.

## 2. Kararlar

1. **Avans dekontu OPSİYONEL.** Zorunlu yapılırsa elden nakit verilen avanslarda muhasebe tıkanır
   (bir şey uydurup yüklemek zorunda kalır). Dekontsuz avans geçerlidir.
2. **Belge zorunluluğu masraf türü bazında.** `masraf_turleri.belge_zorunlu` bayrağı,
   **varsayılan `true`** — mevcut hiçbir türün davranışı değişmez, sistem bugünkü gibi çalışmaya
   devam eder. Yönetici yalnız DOSYA gibi türleri `false`'a çeker.
3. **Belge opsiyonel olduğunda alan gizlenmez**, "opsiyonel" olarak görünür kalır — fiş varsa yine
   yüklenebilir.
4. **Bayrağı sunucu kendisi okur** (tür adından `masraf_turleri`'ne bakarak), istemciden gelen
   bilgiye güvenmez. Tür bulunamazsa **belge zorunlu** sayılır (güvenli varsayılan).
5. **beyan_no araması istemci tarafında** yapılır — sunucu değişmez.

## 3. Veri modeli

Üç kolon eklenir, iki kısıt gevşetilir:

| Tablo | Değişiklik | Not |
|---|---|---|
| `operasyon_avanslar` | `belge_dosya text` (nullable) EKLE | dekont yolu |
| `operasyon_avanslar` | `belge_adi text` (nullable) EKLE | dekont özgün adı |
| `masraf_turleri` | `belge_zorunlu boolean NOT NULL DEFAULT true` EKLE | mevcut türler etkilenmez |
| `operasyon_masraflar` | `belge_dosya`: **NOT NULL → nullable** | kısıt gevşetme |
| `operasyon_masraflar` | `belge_adi`: **NOT NULL → nullable** | kısıt gevşetme |

**DB RİSK NOTU — bu faz "eklemeli" DEĞİL.** Önceki fazların "additive → risksiz" rahatlığı burada
geçerli değil. `ALTER COLUMN DROP NOT NULL` kısıtı gevşetir; veri silmez, tablo düşürmez ve
`drizzle-kit push` bunun için onay sorusu üretmez. Yine de deploy sonrası kolonların gerçekten
`is_nullable = YES` olduğu **canlıda elle doğrulanır** (yeşil ≠ migration uygulandı).

## 4. Avans dekontu

**Uç:** `POST /api/portal/operasyon-takip/:operasyonId/avans` (`requireMuhasebe`) JSON'dan
**multipart**'a çevrilir; mevcut `uploadOperasyonBelge` multer yazıcısı `.single("dekont")` ile
kullanılır (masraf belgesiyle aynı `uploads/operasyon/` dizini). Dosya adı `fixUploadFilename` ile
düzeltilir (multer Latin-1 mojibake'i — Türkçe dosya adları için zorunlu).

- `dekont` alanı **opsiyonel**: gelmezse `belgeDosya`/`belgeAdi` null yazılır.
- `tutar`/`aciklama` doğrulaması aynen korunur. Doğrulama hatasında yüklenmiş dosya silinir
  (masraf ucundaki `sil()` kalıbı).
- `storage.avansYukle(d)` imzasına `belgeDosya: string | null; belgeAdi: string | null` eklenir.

**İstemci:** muhasebe "Avans Yükle" dialog'una dosya seçici (`input-avans-dekont`); gönderim
`FormData` ile yapılır.

**Görünürlük — avans satırlarının ZATEN render edildiği iki yer:**
- `OperasyonKasaSayfasi.tsx` (operasyonun açık hareketleri)
- `OperasyonTakipSayfasi.tsx` (muhasebe detayındaki açık avanslar)

Her ikisinde de `belgeDosya` doluysa masraf satırlarındaki gibi `· [dekont]` linki gösterilir
(`"/" + belgeDosya.replace(/^\/+/, "")`, `target="_blank"`). Dekontsuz avansta link çıkmaz.

**Kapsam dışı:** `OperasyonKapanislarSayfasi` avansı yalnız **toplam** olarak gösterir (satır satır
değil), bu yüzden orada değişiklik yoktur. Muhasebenin kapanmış gün dökümüne avans satırı eklemek
de bu turun kapsamı dışındadır.

## 5. Masraf türü bazında belge zorunluluğu

**Yönetim ekranı** (`client/src/pages/Odemeler.tsx` → `MasrafTurleri` bileşeni): her tür satırına
"Belge zorunlu" anahtarı (`switch-belge-zorunlu-<id>`), `aktif` anahtarıyla aynı kalıpta.

**TUZAK — sessiz alan düşmesi.** `PUT /api/odemeler/masraf-turleri/:id` **elle yazılmış beyaz liste**
kullanır (`{ ad, aktif, sira }`). `belgeZorunlu` bu listeye açıkça eklenmezse yönetici anahtarı
çevirir, istek 200 döner, hiçbir hata çıkmaz — ama **değer sessizce düşer**. Aynı sınıf hata bu
projede iki kez yaşandı (F1.11 IBAN alanları; şube atama PUT'u). Beyaz liste açıkça genişletilmelidir.

**Masraf kaydetme** (`POST /api/portal/operasyon/masraf`): sunucu, gövdeden gelen `masrafTuru` adına
karşılık gelen türü `masraf_turleri`'nde arar (trim + `toLocaleLowerCase("tr")` ile eşleştirme) ve
`belgeZorunlu` değerini okur.

- `belgeZorunlu = true` **veya tür bulunamadı/boş** → belge zorunlu, yoksa **400 "Belge (fiş/fatura)
  zorunlu"** (bugünkü mesaj korunur).
- `belgeZorunlu = false` → belge opsiyonel; gelmezse `belgeDosya`/`belgeAdi` null yazılır.

Diğer doğrulamalar (tutar, alacaklı, ofis masrafında açıklama zorunlu, `dosyaYok`/`beyannameId`
dalları) **değişmez**.

**İstemci** (`OperasyonKasaSayfasi.tsx`): seçili türün `belgeZorunlu` değerine göre belge alanının
etiketi "Belge (fiş/fatura)" ↔ "Belge (fiş/fatura) — opsiyonel" olarak değişir ve istemci tarafı
zorunluluk kontrolü buna uyar. Bayrak, formun zaten çektiği masraf türü listesinden okunur.

**Belgesiz masraf gösterimi:** masraf satırlarındaki `[belge]` linki bugün zaten `belgeDosya` doluysa
çıkıyor; belgesiz masrafta link olmaz. Ayrı bir "belgesiz" rozeti EKLENMEZ (YAGNI).

## 6. beyan_no ile beyanname araması

`OperasyonKasaSayfasi.tsx` içindeki `filtreliBeyannameler` useMemo'suna `beyanNo` alanı eklenir:

```
b.dosyaNo … || (b.alici ?? "") … || (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q)
```

`Beyanname.beyanNo` alanı şemada mevcuttur (`beyan_no text`, nullable). Erenköy'ün yazdığı `167929`,
`26341200IM00167929` içinde geçtiği için `includes` yeterlidir — ek ayrıştırma/normalizasyon YOK.

Seçim listesindeki her seçeneğin etiketine `beyan_no` eklenir ki kullanıcı doğru dosyayı seçtiğini
doğrulayabilsin (bugünkü etiket + `· beyanNo`; beyanNo boşsa etiket bugünkü gibi kalır).

Sunucu tarafı **değişmez** — arama istemcide yapılıyor, `/api/portal/beyannameler` zaten tüm listeyi
döndürüyor.

## 7. Kapsam / Kapsam dışı

**Değişen:** `shared/schema.ts` (3 kolon + 2 kısıt gevşetme), `server/storage.ts`
(`avansYukle` + `masrafKaydet` imzaları, `updateMasrafTuru`), `server/routes.ts` (avans ucu multipart,
masraf ucu bayrak kontrolü, masraf türü PUT beyaz listesi), `client/src/pages/Odemeler.tsx`
(belge zorunlu anahtarı), `client/src/pages/portal/OperasyonKasaSayfasi.tsx` (belge opsiyonelliği +
beyan_no araması + avans dekont linki), `client/src/pages/portal/OperasyonTakipSayfasi.tsx`
(avans dekont linki + Avans Yükle dialog dosya seçici).

**Kapsam dışı:** Excel ile toplu masraf yükleme (sonraki tur) · masrafa gümrük boyutu ·
EX (ihracat) beyannamelerinin sisteme aktarılması · temsilci/muhasebe talep formlarındaki belge
kuralları · belgesiz masraflar için ayrı rozet veya rapor · kapanmış gün dökümüne avans satırı ·
`masrafSil`'in diskteki yetim belgeyi silmemesi (önceden var olan davranış).

## 8. Doğrulama

- `npm run check` ve `npm run build` temiz.
- **DEV DB izolasyonu:** her yazma testinden önce hedef doğrulanır (dev Neon), aksi hâlde durulur.
- `db:push` sonrası **dev ve canlıda** doğrulanır: `operasyon_avanslar.belge_dosya`/`belge_adi` VAR,
  `masraf_turleri.belge_zorunlu` VAR ve varsayılanı `true`, `operasyon_masraflar.belge_dosya`/
  `belge_adi` artık `is_nullable = YES`.
- **Geriye uyum:** mevcut masraf türlerinin hepsi `belge_zorunlu = true` gelir → belge davranışı
  bugünküyle birebir aynı kalır (regresyon testi).
- Uç duman testi: dekontsuz avans 200 + `belgeDosya` null; dekontlu avans 200 + dosya diske yazıldı;
  `belgeZorunlu=true` türde belgesiz masraf **400**; `belgeZorunlu=false` türde belgesiz masraf **200**;
  masraf türü PUT ile `belgeZorunlu` değiştirilince **kalıcı** (sessiz düşme yok).
- Playwright: yönetimde belge-zorunlu anahtarı; Kasam'da `belgeZorunlu=false` türde belge alanının
  opsiyonel görünmesi ve belgesiz kaydın geçmesi; beyanname aramasında `167929` yazınca doğru
  dosyanın bulunması; avans dekont linkinin iki ekranda görünmesi.
- Test verileri dev DB'den ve `uploads/operasyon/` içinden temizlenir.
