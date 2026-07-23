# Beyanname Rejim Filtresi + Otomatik Yükleme Rozeti (Faz 2A) — Tasarım

**Tarih:** 2026-07-23
**Durum:** Onaylandı
**Önkoşul:** Faz 1a + 1b canlıda (`5a52289`, `8dc9028`). `beyannameler.rejim` (`IM`|`EX`|`TR`) dolu;
canlıda IM 11.122, EX 13.948, TR 0. `BeyannameSecici` combobox 4 masraf ekranında ortak.

## 1. İhtiyaç

Masraf/ödeme girerken beyanname seçicide artık iki kanal karışık geliyor (11k ithalat + 14k ihracat).
Kullanıcı rejime göre süzemiyor ve — daha kritik — aynı dosya numarası iki rejimde birden görünebildiği
için (`26-00002` hem BURTEK ithalatı hem AKOĞLU ihracatı) hangisinin hangisi olduğunu ayırt edemiyor.

Ayrıca ihracat otomatik yüklemeleri (`beyanname-ex`) loga yazılıyor ama **hiçbir ekranda görünmüyor**
(Faz 1b'nin taşıdığı I1). Akış bozulursa sessizce eskir.

## 2. Kapsam kararı

Faz 2 iki bağımsız alt-sisteme ayrıldı. Bu spec yalnız **(A)**'yı kapsar:

- **(A) — bu spec:** rejim filtresi + rozet düzeltmesi. Saf istemci, düşük risk, geri alınabilir.
- **(B) — ayrı spec:** manuel transit ekleme + M2/M3. İlk TR satırını yaratır, Faz 1a'nın
  geri-alınabilirlik penceresini kalıcı kapatır. Sonraya bırakıldı.

**Sunucu-tarafı arama (I2) YAPILMIYOR.** Kullanıcı canlıda seçicinin akıcı olduğunu teyit etti; 25k
satırın istemciye inmesi bugün sorun değil. YAGNI — backlog'a not olarak kalır, ihtiyaç çıkarsa ele alınır.
Rejim filtresi zaten ağ yükünü değiştirmez (tüm liste yine iner), yalnız gösterilen listeyi daraltır.

## 3. Rejim şeridi (`BeyannameSecici`)

Açılır panelde, arama kutusunun **altına** 4'lü şerit: **Hepsi · İthalat · İhracat · Transit**.

- **Varsayılan Hepsi** — mevcut davranış korunur.
- Seçilen rejim, metin aramasına **EK** filtre olarak uygulanır (rejim VE metin). 100 satır sınırı bu
  daraltılmış liste üzerinde işler.
- Şerit değerleri iç kod ↔ etiket: `hepsi`→"Hepsi", `IM`→"İthalat", `EX`→"İhracat", `TR`→"Transit".
- **Transit sekmesi şu an boş liste + "Beyanname bulunamadı" gösterir** (canlıda 0 TR satırı). Faz 2B
  ile kendiliğinden dolar; şeride bir daha dokunulmaz.

### 3.1 Satır içi rejim etiketi (şeridin en kritik parçası)

"Hepsi" seçiliyken aynı dosya numarası iki satır olarak görünebilir. Ayırt edilebilmesi için **her satıra**
küçük bir rejim etiketi eklenir: `IM`→**İTH**, `EX`→**İHR**, `TR`→**TR**. Etiket, satırdaki kimlik
(dosya no / beyan no) ile aynı hizada, soluk bir rozet olarak durur. Etiket olmadan "Hepsi" görünümü
belirsizdir — bu, filtrenin görünmeyen ama asıl faydasıdır.

### 3.2 Durum ve etkileşim

- Rejim seçimi `BeyannameSecici` içinde yerel state (`rejimFiltre: "hepsi" | "IM" | "EX" | "TR"`).
- **Panel her açılışta "Hepsi"ye döner** (arama da her açılışta sıfırlanıyor — tutarlı).
- **Seçili beyanname rejim değişince korunur** — `value` yalnız yeni bir satır seçilince değişir. Rejim
  şeridi yalnız listeyi filtreler, seçimi bozmaz.
- Filtre Türkçe-doğru arama ile birlikte çalışır (`toLocaleLowerCase("tr")`, `shouldFilter={false}`
  kararı korunur). Rejim karşılaştırması `b.rejim === rejimFiltre` (basit eşitlik, locale sorunu yok).

### 3.3 Veri

`Beyanname` tipinde `rejim: string` var (Faz 1a) ve `/api/portal/beyannameler` tüm kolonları döndürüyor —
`b.rejim` istemcide **hazır**. Sunucu ve `Props` imzası **değişmez**; 4 tüketici ekran şeridi otomatik
kazanır. `null`/beklenmedik rejim değeri savunması: `b.rejim ?? "IM"` (şema `NOT NULL DEFAULT 'IM'`, ama
istemci savunmacı davranır).

## 4. Otomatik yükleme rozeti (I1)

`client/src/components/OtomatikYuklemeRozeti.tsx`:

- Prop tipi `tip: "mizan" | "beyanname"` → **`"mizan" | "beyanname" | "beyanname-ex"`**.
- Yeni opsiyonel prop `baslik?: string` — iki beyanname rozetini ayırt etmek için. Verilmezse mevcut
  görünüm korunur (mizan rozeti etkilenmez).
- `data-testid` zaten `oto-yukleme-${tip}` → `beyanname-ex` için `oto-yukleme-beyanname-ex` olur, çakışmaz.
- Log ucu `/api/otomatik-yukleme/log?tip=beyanname-ex` **zaten çalışıyor** — sunucu `tip`'i serbest string
  alıp `getOtomatikYuklemeLoglar(tip, limit)` ile süzüyor (Faz 1b'de EX logları bu yolla yazıldı).
  **Sunucu değişmez.**

`client/src/pages/Odemeler.tsx` (satır ~442): mevcut `<OtomatikYuklemeRozeti tip="beyanname" />`'ye
`baslik="İthalat"` eklenir; yanına `<OtomatikYuklemeRozeti tip="beyanname-ex" baslik="İhracat" />` konur.
İki rozet yan yana / alt alta (mevcut düzene uygun sarmalayıcı).

## 5. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `client/src/pages/portal/BeyannameSecici.tsx` | Rejim şeridi + satır etiketi + `rejimFiltre` state |
| `client/src/components/OtomatikYuklemeRozeti.tsx` | Prop tipi genişler + `baslik` prop |
| `client/src/pages/Odemeler.tsx` | İkinci rozet (`beyanname-ex`) + başlıklar |

**Şema/uç/sunucu HİÇ değişmez.** `db:push` yok. `Props` imzası (BeyannameSecici) değişmez.

## 6. Kapsam dışı

Sunucu-tarafı arama (I2, backlog) · manuel transit ekleme (Faz 2B) · `upsertBeyannameler` TR dalı (M2,
Faz 2B) · `getBeyannameler` `NULLS LAST` (M3, Faz 2B — TR satırı olmadan etkisiz) · rejim kırılımlı
raporlar · rozetin görünürlük/yetki kuralları (mevcut `Odemeler` sayfası kimindeyse odur).

## 7. Doğrulama

- `npm run check` ve `npm run build` temiz. Yalnız istemci; `db:push` YOK.
- **DEV DB izolasyonu:** tarayıcı testi yazma yaparsa hedef doğrulanır. (Bu faz çoğunlukla salt-okuma;
  masraf kaydı denenirse dev Neon şart.)
- **Kalıcı dev test seti:** `optest`/`muhasebe`/`suleyman`, `Test1234!`. Dev DB'de yeterli EX satırı
  yoksa çakışma senaryosu için birkaç `rejim='EX'` satırı eklenir (test sonrası silinir).
- Playwright (dört ekranda da geçerli, kritik olanlar Kasam + Doğrudan Ödeme):
  (a) Seçici açılınca şerit görünür, "Hepsi" seçili, tüm liste geliyor (mevcut davranış).
  (b) "İhracat" → yalnız `rejim='EX'` satırlar; "İthalat" → yalnız `IM`; "Transit" → boş + "bulunamadı".
  (c) **Aynı dosya no iki rejimde** (dev'de bir IM + bir EX aynı `dosya_no` ile) → "Hepsi"de iki satır,
      her biri doğru etiketle (İTH / İHR); "İthalat" seçince yalnız İTH satırı kalır.
  (d) Rejim + metin **birlikte** süzüyor (İhracat + alıcı adının parçası).
  (e) Türkçe I/İ araması rejim filtresiyle birlikte bozulmadan çalışıyor.
  (f) Bir beyanname seç → şeridi değiştir → **seçim korunuyor** (tetikleyicide aynı kayıt).
  (g) Panel kapan-aç → şerit "Hepsi"ye dönmüş, arama temiz.
  (h) 100 üstü sonuçta sınır uyarısı hâlâ çalışıyor (rejim daraltınca daha az tetikleniyor).
- Rozet: Ödemeler sayfasında **iki rozet** görünür — "İthalat" son ithalat yüklemesini, "İhracat" son
  `beyanname-ex` yüklemesini (canlıda `Ihracat_Raporu_..._03-38.xlsx`, 225 satır) gösterir. Testid'ler
  `oto-yukleme-beyanname` ve `oto-yukleme-beyanname-ex` ayrı.
- **Regresyon:** mizan rozeti (Tahsilat sayfası) `baslik` prop'u olmadan aynen çalışıyor.
