# İhracat (EX) İçe Aktarma — Faz 1b Tasarım

**Tarih:** 2026-07-22
**Durum:** Onaylandı
**Önkoşul:** Faz 1a canlıda (commit `5a52289`) — `rejim` / `rejimKodu` / `kaynak` kolonları,
`dosya_no` nullable, `(dosya_no, rejim)` benzersizliği.

## 1. İhtiyaç

İhracat beyannameleri de masraf/ödeme taşıyacak. Liste, ithalat gibi ofisten **otomatik** yüklenecek
(Power Automate → token korumalı uç). Mevcut ayrıştırıcı yalnız `İthalat Raporu` sayfasını okuyor ve
ihracat raporunun düzeni farklı olduğu için bu dosyayı **reddediyor** (doğru davranış — sessiz değil).

## 2. Faz 1a'nın değerinin ölçülmüş kanıtı

Tam yıllık ihracat listesi (`EX 2026 TÜM LİSTE.xlsx`, 13.942 geçerli satır) canlı ithalat verisiyle
karşılaştırıldı:

**11.117 ithalat kaydının 10.911'i (%98) aynı dosya numarasını ihracat listesinde de taşıyor.**

| `26-00002` | İthalat | İhracat |
|---|---|---|
| Firma | BURTEK KAYIŞ MAKİNE | AKOĞLU OTOMOTİV |
| Beyanname | `26160100AN00000383` | `26341200EX00000017` |
| Temsilci | ÖZCAN | ÖMER |

İthalat ve ihracat **ayrı numara serileri** kullanıyor. Faz 1a olmasaydı bu dosyanın yüklenmesi
veritabanının %98'ini sessizce ezerdi ve log "başarılı" derdi. `(dosya_no, rejim)` kimliği bunu
yapısal olarak engelliyor.

## 3. Kaynak dosyanın ölçülmüş özellikleri

Sayfalar: `["Sheet1" (boş), "İhracat Raporu"]` — ithalat dosyasıyla aynı desen. 74 sütun.
Bu bir **özel rapor değil**, programın sabit standart çıktısı. Örnek dosya (1.452 satır) ve tam yıllık
dosya (13.942 satır) **birebir aynı düzende** doğrulandı.

| Ölçüm | Değer |
|---|---|
| Geçerli satır | 13.942 · **dosya içi tekrar: 0** |
| Dosya boyutu | 4,75 MB (uç sınırı 25 MB) |
| Ay dağılımı | 01:1950 · 02:2059 · 03:2037 · 04:2366 · 05:1799 · 06:2235 · 07:1402 |
| `GÇB TAR.` | 13.848 **Excel seri numarası** · 0 metin · 94 boş |
| `GİREN` | 8 kişi, boş yok: ÖMER 2163 · EMİN 2043 · EMİRCAN 2009 · CİHANGİR 1934 · HASAN 1899 · ÖZKAN 1443 · ORHAN 1363 · SULTAN 1088 |
| `REJİM` | 1000:10347 · 3151:1699 · 3153:710 · 2100:465 · 1040:356 · 2300:322 · 1023:30 · 2340:8 · 1021:1 · 3171:1 · 8100:1 · boş:2 |
| `GÇB NO` harfi | EX 13.848 · yok 93 · **DG 1** |
| Dosya no aralığı | `25-26330` .. `26-14174` (2025 dosyaları da var) |

## 4. Sütun eşlemesi

| Bizim alan | Sütun | Not |
|---|---|---|
| `dosyaNo` | `A` DOSYA NO | |
| `alici` | **`B` GONDEREN** | İhracatta bizim müşterimiz gönderendir — **kullanıcı kararı: ekranlarda her rejimde BİZİM MÜŞTERİ görünsün** |
| `gonderen` | **`C` ALICI** | yurtdışındaki taraf |
| `beyanNo` | `F` GÇB NO | |
| `beyanTarihi` | `G` GÇB TAR. | Excel seri numarası → `YYYY-MM-DD` |
| `koli` | `I` KOLİ | |
| `gumrukIdaresi` | `M` GÜMRÜK | |
| `fatBedeli` | **`R` CIF** | **kullanıcı kararı** — FOB değil |
| `doviz` | **`S`** | **başlıksız** — aşağıya bakınız |
| `kullanici` | **`Z` GİREN** | temsilci; `E MÜŞTERİ TEMSİLCİSİ` KULLANILMAZ (246 satırı boş) |
| `rejimKodu` | `AM` REJİM | ham gümrük kodu |
| `rejim` | — | sabit `"EX"` (kanaldan) |
| `kaynak` | — | sabit `"excel"` |

`Q` FOB ve `T` NAKLİYECİ **saklanmaz** — yalnız `S`'yi konumlandıran çapa olarak doğrulanır.

## 5. Başlıksız `S` sütunu — konumdan oku, içerikten doğrula

Kullanıcı raporu değiştiremiyor: *"S sütunu hep boş gelecek, rapor bu şekilde geliyor, sen yüklenirken
anla."* Bu yüzden ada göre okuma imkânsız. İki katmanlı koruma:

1. **Komşu çapa.** `S`'nin iki yanı başlıklı: `R = "CIF"` ve `T = "NAKLİYECİ"`. İkisi de katı başlık
   doğrulamasına dahildir. Sütun düzeni kayarsa **önce bu ikisi patlar**, `S` sessizce kayamaz.
2. **İçerik doğrulaması.** Boş olmayan `S` değerleri `/^[A-Z]{2,3}$/` desenine uymalıdır. Ölçüm:
   13.942/13.942 uyuyor (CHF, EUR, GBP, NOK, RUB, TL, USD). **Uyum oranı %95'in altına düşerse yükleme
   REDDEDİLİR** — sütun kaymışsa sayı/metin karışımı gelir ve oran çöker. Tek tük bozuk hücre yüklemeyi
   durdurmaz; sistematik kayma durdurur.

`AF` sütununun başlığı da yok (miktar cinsi) ama o alan saklanmıyor — yok sayılır.

## 6. Excel seri numarasından tarihe

`GÇB TAR.` sayı olarak geliyor (`46205`). Dönüşüm **saf aritmetikle** yapılır — epoch `1899-12-30`,
gün eklenir, `YYYY-MM-DD` elle biçimlendirilir. **`new Date(...)` ile ayrıştırma veya yerel saat
kullanılmaz** (zaman dilimi kayması bu projede off-by-one hatalara yol açtı, commit `c897dff`).
Doğrulanan örnek: `46205 → 2026-07-02`, `46212 → 2026-07-09`.

Sayı değilse (boş veya metin) `null` yazılır. Metin `DD.MM.YYYY` gelirse mevcut `parseBeyanTarihi`
kullanılır — kaynak ileride biçim değiştirirse iki yol da çalışsın diye.

## 7. Uç

**Yeni uç: `POST /api/ingest/beyanname-ex`** — mevcut `/api/ingest/beyanname` **hiç değişmez**, çalışan
ithalat akışı sıfır risk alır. Kullanıcı Power Automate akışını kopyalayıp yalnız URL sonunu değiştirir.
Aynı token koruması (`x-ingest-token`), aynı ham binary gövde, aynı 25 MB sınırı, aynı
`otomatik_yukleme_log` kaydı (`tip = "beyanname-ex"` → ithalat ve ihracat yüklemeleri logda ayrı görünür).

## 8. Faz 1a'dan taşınan iki düzeltme

Parser bu fazda zaten açılıyor; Faz 1a'nın final incelemesinde ertelenen iki madde burada kapatılır:

1. **Sessiz `rejimKodu` kaybı gözlemlenebilir olur.** `AU`/`AM` başlığı eşleşmediğinde bugün hiçbir iz
   kalmıyor; yükleme "başarılı" dönüyor. Ayrıştırıcı, kodu okuyamadığında bunu döndürür ve uç
   `otomatik_yukleme_log` mesajına ekler (ör. `"729 satır (36 yeni, 693 güncellendi) — UYARI: rejim kodu
   sütunu okunamadı"`). Yükleme **bloklanmaz** (Faz 1a spec kararı korunur), yalnız görünür olur.
2. **`rejimKodu`'nun NULL ile ezilmesi engellenir.** `upsertBeyannameler`'ın `set` bloğunda
   `rejimKodu: sql\`excluded.rejim_kodu\`` var; başlığı bozuk bir dosya, mevcut dolu kodları NULL'a
   çeviriyor. `coalesce(excluded.rejim_kodu, beyannameler.rejim_kodu)` ile eski değer korunur.

## 9. Kapsam dışı

Arayüzde IM/EX/TR seçimi ve filtreleme (**Faz 2**) · manuel transit ekleme (**Faz 2**) · `upsertBeyannameler`'ın
TR dalı ve `NULLS LAST` sıralaması (**Faz 2**, taşınan M2/M3) · rejim kırılımlı raporlar · mevcut ithalat
ucunun adresi veya davranışı · `gumruk_verileri` tablosu.

## 10. Deploy sonrası operasyon (kod değil, bu fazın parçası)

1. **Tam 2026 listesinin yüklenmesi** — `EX 2026 TÜM LİSTE.xlsx` (13.942 satır) yeni uçtan gönderilir.
   Beklenen: 13.942 yeni kayıt, **hiçbir ithalat kaydı etkilenmez**. Yükleme öncesi/sonrası
   `select rejim, count(*) from beyannameler group by 1` karşılaştırılır: `IM` sayısı **değişmemeli**.
2. **Sekiz ihracat temsilcisine portal hesabı** — `ÖZKAN · ORHAN · ÖMER · HASAN · SULTAN · CİHANGİR ·
   EMİN · EMİRCAN`, rol `temsilci`, `avAdi` = GİREN adı. Yapılmazsa ihracat dosyalarını yalnız muhasebe
   ve şube görür.
3. **Power Automate'e ikinci akış** — kullanıcı mevcut akışı kopyalayıp URL'yi `/api/ingest/beyanname-ex`
   yapar.

## 11. Doğrulama

- `npm run check` ve `npm run build` temiz. **Şema değişikliği YOK** → `db:push` bu fazda risk taşımaz.
- **DEV DB izolasyonu:** yazma testi öncesi hedef doğrulanır (dev Neon), aksi hâlde durulur.
- **Gerçek dosyayla** (`EX 2026 TÜM LİSTE.xlsx`) dev DB'ye yükleme:
  (a) 13.942 satır kabul edilir, `rejim='EX'`, `kaynak='excel'`.
  (b) **İthalat kayıtları etkilenmez** — yükleme öncesi/sonrası `rejim='IM'` sayısı aynı. Çakışan
      10.911 numaranın her biri iki satır olarak yan yana durur.
  (c) `alici` alanında **bizim müşterimiz** var (ör. `26-00002` → AKOĞLU OTOMOTİV), `gonderen`'de
      yurtdışı taraf.
  (d) `fatBedeli` = CIF sütunu (FOB ile farklı olan bir satırda kontrol edilir).
  (e) `doviz` dolu ve yalnız beklenen kodlardan (CHF/EUR/GBP/NOK/RUB/TL/USD).
  (f) `beyanTarihi` doğru çevrilmiş — bilinen bir satırda `46205 → 2026-07-02`; 94 boş satırda `null`.
  (g) `kullanici` = GİREN adı; 8 ismin dağılımı Excel'deki sayılarla birebir.
  (h) `rejimKodu` dolu; dağılım Excel'in `AM` sütunuyla birebir.
  (i) **Aynı dosya iki kez yüklenir** → ikinci seferde `eklenen: 0`, satır sayısı değişmez (idempotent).
- **Hata yolları:** ithalat dosyası EX ucuna gönderilirse başlık doğrulaması **reddeder**; boş dosya
  "veri satırı bulunamadı" ile reddedilir; `S` sütunu kaydırılmış bir dosya içerik doğrulamasıyla reddedilir.
- **Regresyon:** mevcut ithalat ucu (`/api/ingest/beyanname`) gerçek ithalat dosyasıyla hâlâ çalışır ve
  `rejim='IM'` yazar.
- Test verileri dev DB'den temizlenir.
