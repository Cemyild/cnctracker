# Müşteri CRM Modülü — Tasarım ve Uygulama Planı

**Tarih:** 2026-08-26
**Durum:** Taslak uygulaması (Faz 1)

## 1. Problem

Personel bir müşteriyle iletişime geçmek istediğinde "bu firmanın ithalat işlerine kim bakıyor?",
"muhasebe faturayı kime göndereceğiz?", "adres neydi?" sorularının cevabı kimsenin
kafasında/telefonunda duruyor. Kurumsal hafıza yok; personel değişince bilgi kayboluyor.

## 2. Çözüm — kapsam

Müşteri bazlı, **departman kırılımlı iletişim rehberi** + hafif görüşme kaydı.

Personel akışı: CRM sayfasını aç → müşteriyi ara/seç → firma kartını ve departman
departman kimlerle iletişime geçileceğini gör → gerekirse görüşme kaydı düş.

### Kapsam içi (Faz 1)
- Müşteri kartı: adres, vergi dairesi/no, santral telefon, genel e-posta, web, notlar
- Departman bazlı iletişim kişileri (ad, görev, telefon, cep, e-posta, birincil işareti)
- Yönetilebilir departman listesi (İthalat / İhracat / Muhasebe / ... eklenebilir)
- Görüşme (etkileşim) kaydı + takip tarihi
- Tüm müşterilerde global kişi araması ("Rehber" sekmesi)

### Kapsam dışı (sonraki fazlar)
- Satış hunisi / fırsat (opportunity) takibi
- E-posta entegrasyonu, otomatik görüşme yakalama
- Portal (personel girişi) tarafına salt-okunur rehber — Faz 2 adayı

## 3. Kritik tasarım kararı: müşteri kaynağı

Sistemde **zaten** bir `musteriler` tablosu var (Tahsilat modülü, mizandan
`120-xx` hesap kodlarıyla otomatik doluyor). CRM için **paralel bir müşteri
listesi AÇILMAYACAK** — aynı tabloya bağlanılacak.

Gerekçe:
- Muhasebedeki gerçek cari listesi tek doğruluk kaynağı kalır
- CRM kişisi ile tahsilat bakiyesi/riski aynı müşteri kimliği üzerinden birleşir
- İki ayrı "müşteri" listesi kaçınılmaz olarak birbirinden ayrışır

Mizanda henüz görünmeyen (yeni) müşteri için CRM'den elle ekleme var; hesap kodu
boş bırakılırsa `CRM-xxxx` formatında geçici kod üretilir, mizan geldiğinde
gerçek kodla güncellenebilir.

## 4. Veri modeli

Tümü `shared/schema.ts` sonuna eklenir. FK kolon adları CLAUDE.md kuralı gereği
açık string olarak yazılır (`varchar("musteri_id")`), Drizzle'a türettirilmez.
Tarihler `text` + `YYYY-MM-DD`.

### `crm_departmanlar`
Departman kataloğu. Kod içine gömülü sabit liste değil — kullanıcı ekleyebilsin.

| kolon | tip | not |
|---|---|---|
| id | varchar PK | uuid |
| ad | text notNull | unique index |
| sira | integer | görüntüleme sırası |
| aktif | boolean | pasif = yeni kişi atanamaz, mevcutlar durur |

İlk çağrıda tablo boşsa varsayılanlar tohumlanır (lazy seed): İthalat, İhracat,
Muhasebe, Lojistik, Satın Alma, Depo, Yönetim.

### `crm_musteri_bilgileri` — müşteri kartı (musteriler ile 1-1)
| kolon | tip |
|---|---|
| id | varchar PK |
| musteriId | varchar FK → musteriler, cascade, **unique** |
| vergiDairesi, vergiNo | text |
| adres, ilce, il, postaKodu | text |
| telefon, faks, genelEmail, web | text |
| notlar | text |
| guncellenme | timestamp |

Ayrı tablo, `musteriler`'e kolon eklemek yerine: mizan içe aktarımı `musteriler`
satırlarını yazıyor; CRM alanlarını oraya koymak içe aktarımla çakışma riski taşır.

### `crm_kisiler` — departman bazlı kişiler
| kolon | tip | not |
|---|---|---|
| id | varchar PK | |
| musteriId | varchar FK → musteriler, cascade | notNull |
| departmanId | varchar FK → crm_departmanlar, **set null** | departman silinirse kişi kaybolmaz |
| adSoyad | text notNull | |
| unvan | text | görev/pozisyon |
| telefon, cepTelefon, email | text | |
| birincil | boolean | departmanın ana muhatabı |
| aktif | boolean | işten ayrılan kişi silinmez, pasifleşir |
| notlar | text | |

Index: `(musteriId)`, `(musteriId, departmanId)`.

### `crm_gorusmeler` — etkileşim kaydı
| kolon | tip |
|---|---|
| id | varchar PK |
| musteriId | varchar FK → musteriler, cascade |
| kisiId | varchar FK → crm_kisiler, set null |
| tarih | text YYYY-MM-DD |
| tip | text: telefon / email / ziyaret / toplanti / diger |
| konu | text notNull |
| notlar | text |
| personel | text — görüşmeyi yapan |
| takipTarihi | text, nullable |
| takipTamamlandi | boolean |

## 5. API — `/api/crm/*`

Rotalar ince, DB mantığı `server/storage.ts` içinde (proje kuralı).
PUT/PATCH uçları storage dönüşünü null kontrol edip `404 {error:"Bulunamadı"}` verir.

| method | yol | iş |
|---|---|---|
| GET | /api/crm/musteriler | liste + kişi sayısı + kart var mı + son görüşme (tek sorgu, N+1 yok) |
| POST | /api/crm/musteriler | elle yeni müşteri (hesap kodu boşsa CRM-xxxx üretir) |
| GET | /api/crm/musteriler/:id | detay: musteri + bilgi + kişiler(departman adıyla) + görüşmeler |
| PUT | /api/crm/musteriler/:id/bilgi | kartı upsert |
| GET/POST/PUT/DELETE | /api/crm/departmanlar[/:id] | katalog yönetimi |
| POST/PUT/DELETE | /api/crm/kisiler[/:id] | kişi CRUD |
| POST/PUT/DELETE | /api/crm/gorusmeler[/:id] | görüşme CRUD |
| GET | /api/crm/rehber | tüm müşterilerdeki kişilerin düz listesi (global arama) |
| GET | /api/crm/stats | müşteri/kişi/kart/bekleyen takip sayıları |

**N+1 önleme:** liste ucu `musteriler` üzerinde `crm_kisiler` ve `crm_gorusmeler`
için ayrı birer GROUP BY sorgusu çalıştırıp Map ile birleştirir — satır başına
sorgu yok.

## 6. UI — `client/src/pages/CRM.tsx`, rota `/crm`

Sayfa üstü sekme şeridi (Tahsilat.tsx'teki inset alt çizgi deseniyle aynı):

1. **Müşteriler** — iki kolonlu master-detail
   - Sol: aranabilir müşteri listesi (Türkçe duyarsız arama, `toLocaleLowerCase("tr")`),
     her satırda kişi sayısı rozeti
   - Sağ: seçili müşteri için üç alt sekme
     - *Firma Bilgileri*: kart formu (kaydet = upsert)
     - *İletişim Kişileri*: departmana göre gruplu kartlar, satır içi ekle/düzenle/sil
     - *Görüşmeler*: tarihe göre ters sıralı kayıt listesi + ekleme modalı
2. **Rehber** — tüm müşterilerin kişileri tek düz tabloda; ada/firmaya/departmana/
   telefona/e-postaya göre arama. "Kim bu numaradan aradı?" sorusunun cevabı.
3. **Departmanlar** — katalog yönetimi

Türkçe arama `toLocaleLowerCase("tr")` ile yapılır (I/İ tuzağı). Tarihler
`new Date()` üzerinden GEÇİRİLMEDEN `dd.mm.yyyy` biçimlenir (timezone off-by-one).

## 7. Uygulama sırası

1. `shared/schema.ts` — 4 tablo + insert şemaları + tipler
2. `server/storage.ts` — IStorage arayüzü + DatabaseStorage uygulaması
3. `server/routes.ts` — `/api/crm/*` blok
4. `client/src/pages/CRM.tsx` — sayfa
5. `client/src/App.tsx` — import, `pageTitles`, `<Route>`
6. `client/src/components/AppSidebar.tsx` — "Müşteri CRM" menü öğesi
7. `npm run check` — tek kalite kapısı
8. `npm run db:push` deploy hattında çalışır (GitHub Actions)

## 8. Riskler

| risk | önlem |
|---|---|
| `musteriler.hesapKodu` unique + notNull; elle eklemede çakışma | boşsa `CRM-xxxx` üret, çakışırsa 409 döndür |
| Departman silinince kişiler yetim kalır | FK `set null`, UI "Departmansız" grubunda gösterir |
| Şema dışı tablo bırakmak CI `db:push`'unu kilitler (bilinen tuzak) | 4 tablonun tamamı şemada tanımlı, elle SQL yok |
| Mizan içe aktarımıyla çakışma | CRM alanları ayrı tabloda, `musteriler` kolonlarına dokunulmaz |

---

# Faz 2 — Firma Bilgi Formu (herkese açık link)

**Tarih:** 2026-08-26

## Problem

Firmanın iletişim bilgilerini personel telefonla toplayıp elle giriyor. Yavaş,
eksik kalıyor ve güncellenmiyor. ISO 9001 anketlerinde olduğu gibi firmaya bir
bağlantı gönderilip kendi bilgilerini girmesi istenebilmeli.

## Akış

1. Personel CRM'de firmayı seçer → **Bilgi Formu** → bağlantı üretir
2. Bağlantı firmaya e-posta ile gider (`/firma-bilgi/<token>`)
3. Firma açar: şirket bilgilerini kontrol/düzeltir, departman departman kişi ekler
4. Gönderir → veri o müşterinin CRM kartına ve kişilerine **otomatik** işlenir

## Veri modeli

### `crm_form_linkleri`
Müşteri başına TEK satır (`musteri_id` unique). "Yenile" aynı satırın token'ını
değiştirir → daha önce gönderilmiş bağlantı kendiliğinden geçersizleşir.

| kolon | not |
|---|---|
| musteriId | FK → musteriler, cascade, **unique** |
| token | unique, `randomBytes(24).toString("base64url")` |
| aktif | kapatılabilir |
| kullanimSayisi, sonKullanim | kaç kez dolduruldu |

### `crm_form_yanitlari`
Her gönderimin **ham payload'u** (`ham` jsonb) + uygulama sayaçları. Uygulama
kuralları veri kaybını önlese de "firma tam olarak ne gönderdi" sorusunun
cevabı burada durur.

## Uygulama kuralları — en kritik kısım

Düz üzerine-yazma tehlikelidir: firma formu ikinci kez doldurursa ya da bir
çalışan yarım doldurursa özenle girilmiş veri silinir. İki koruma:

1. **Boş gelen alan mevcut veriyi EZMEZ.** Yalnız dolu alanlar yazılır
   (`crmDolu()` tek uygulama noktası). Yarım form kayıp yaratmaz.
2. **Kişi SİLİNMEZ.** Aynı müşteri + aynı departman + aynı isim gelirse
   güncellenir (mükerrer açılmaz), yoksa eklenir. Eşleştirme Türkçe duyarsız
   (`toLocaleLowerCase("tr")`), mevcut kişiler tek sorguda çekilip JS tarafında
   eşleştirilir — satır başına sorgu yok.

Ayrıca: formdan gelen `departmanId` katalogda yoksa `null`a düşer; kart ve kişi
alanları **beyaz listeyle** sınırlıdır, gövdeden gelen başka anahtar tabloya
ulaşamaz; gönderilen kişi sayısı 50 ile sınırlıdır.

## Uçlar

| method | yol | kimlik |
|---|---|---|
| GET/POST/PUT | /api/crm/musteriler/:id/form | panel (link getir / üret-yenile / aç-kapat) |
| GET | /api/crm/form/:token | **açık** — form verisi |
| POST | /api/crm/form/:token | **açık** — gönderim |

`/api/crm/form/*` uçları kimlik doğrulamasızdır (anket uçlarıyla aynı model);
erişimi token ve `aktif` bayrağı sınırlar.

## Gizlilik kararı

Açık form firmanın **şirket bilgilerini** ön doldurur (adres, vergi, santral —
düzeltebilsinler diye) ama **mevcut iletişim kişilerini DÖNDÜRMEZ**. Bağlantı
yanlış ele geçerse personel isim/telefonları sızmasın.

## UI

- Açık sayfa: `client/src/pages/PublicCrmForm.tsx`, rota `/firma-bilgi/:token`.
  Yönetici şifre kapısı atlanır (App.tsx bypass listesine eklendi).

  **Form departman odaklıdır.** İlk sürümde "Kişi Ekle" ile satır satır kişi
  ekleniyor, her satırda departman seçici ve ünvan kutusu vardı; firma için
  yorucuydu. Artık katalogdaki **her departman için hazır bir alan** basılır
  (Ad Soyad / E-posta / Telefon / Cep), firma yalnız kendisine uyanları
  doldurur. Departman seçici ve ünvan kutusu formdan kaldırıldı — ünvan
  alanı veritabanında ve panelde duruyor, sadece firma girmiyor.

  Sonuç: form **katalogdan sürülür**. Panelden yeni departman eklendiğinde
  (örn. "Diğer", "Gümrükleme") formda kendiliğinden yeni bir alan belirir;
  pasife alınan departman formdan düşer. Sunucu tarafında değişiklik
  gerekmedi — API sözleşmesi zaten "her kişi kendi departmanId'sini taşır"
  biçimindeydi. Departman başına tek kişi girilir; bir departmana ikinci
  kişi gerekirse panelden eklenir.
- Panel: `client/src/components/crm/FormLinkModal.tsx` — bağlantı üret/kopyala/
  aç/yenile/kapat + gelen gönderimlerin geçmişi.
