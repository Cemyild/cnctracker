# Ödemeler Portalı — Tasarım Dokümanı

**Tarih:** 2026-07-03
**Durum:** Onaylandı (kullanıcı ile bölüm bölüm doğrulandı)
**Faz:** 1 — Talep → Ödeme → Dekont akışı + depo teminat listesi ve basit iade işaretleme

## 1. Amaç ve Kapsam

Gümrük müşavirliği operasyonunda müşteri adına yapılan ödemelerin talep/onay akışını sisteme taşımak:

- **Müşteri temsilcisi** ödeme talebini (fatura vb. belgelerle) portaldan girer.
- **Muhasebe** gelen talepleri tek tabloda görür, ödemeyi yapar, dekontu yükler.
- **Depo teminatları** (konteyner teminat bedelleri) normal masraflardan farklıdır: ödeme
  sonrası ayrı bir listede takip edilir; işlem bitince ödenen taraftan geri talep edilir.
- **Dosyasız talep:** beyanname dosyası henüz açılmamış / Excel'e düşmemişse temsilci
  "Dosya yok" işaretleyip beyannamesiz talep gönderebilir (açıklama zorunlu olur).
  Ödeme yapıldıktan sonra beyannamesiz talepler temsilcinin ekranında **"Eşleşme
  Bekleyen Ödemeler"** listesinde görünür; temsilciden beyannameyle eşleştirmesi istenir.

Mevcut uygulama tamamen yönetim tarafıdır ve tek ortak şifreyle korunur; **hiçbir çalışan
görmemelidir**. Bu modül ise tüm çalışanların kullanacağı, kendi gerçek kullanıcı girişine
sahip ayrı bir portal alanıdır.

### Kapsam dışı (Faz 2)

- Depo iade sürecinin evrak detayları (hangi belgelerle geri talep edilir, dilekçe/yazı
  şablonları, iade yazışma takibi). Kullanıcıyla ayrı oturumda tasarlanacak.
- Beyanname Excel'inin otomatik gönderimi (zamanlanmış görev). Faz 1'de elle yükleme.
- E-posta/push bildirimleri. Faz 1'de portal içi rozet + otomatik yenileme yeterli.

## 2. Mimari Karar

**Seçilen yaklaşım:** Aynı React uygulaması içinde `/portal` rota ailesi.

- Portal rotaları, `/survey/:id` gibi, yönetim şifre kapısını (localStorage gate) atlar.
- Portalın kendi giriş ekranı vardır; oturum **sunucu tarafında** tutulur
  (`express-session`, çerez tabanlı — paket zaten kurulu).
- `/api/portal/*` rotaları oturum middleware'i ile korunur. Bu, uygulamadaki ilk gerçek
  sunucu taraflı yetki kontrolüdür; yönetim API'leri mevcut haliyle kalır.
- Tek deploy, tek kod tabanı, mevcut shadcn/ui bileşenleri yeniden kullanılır.

**Elenen alternatifler:** Ayrı mini uygulama/subdomain (build-deploy yükünü ikiye katlar);
tüm uygulamaya gerçek giriş (yönetim tarafı olduğu gibi kalacağından kapsamla çelişir).

## 3. Roller

| Rol | Görebildiği |
|---|---|
| `temsilci` | Yalnız kendi beyannameleri (Excel AV sütunu eşleşmesi) ve kendi talepleri |
| `muhasebe` | Tüm talepler, tüm beyannameler, depo ödemeleri takip tablosu |
| Yönetim (siz) | Mevcut yönetim panelindeki yeni "Ödemeler" sayfası: her şey + kullanıcı yönetimi + Excel yükleme |

Hesapları yönetim panelinden siz oluşturursunuz. Kendi kayıt olma yok.

## 4. Beyanname Beslemesi

Kaynak: `BEYANNAME LİSTESİ.xlsx`, sayfa **"İthalat Raporu"** (Sayfa1 boş olabilir).
Yönetim panelindeki Ödemeler sayfasından elle yüklenir (sık aralıklarla yüklenebilir).

| Excel sütunu | Başlık | Hedef alan |
|---|---|---|
| A | DOSYA NO | `dosyaNo` — **upsert anahtarı (unique)** |
| B | ALICI | `alici` (müşteri) |
| D | GONDEREN | `gonderen` |
| F | KOLİ | `koli` |
| I | GUM. | `gumrukIdaresi` |
| K | BEYAN TARİHİ | `beyanTarihi` — "DD.MM.YYYY" metni `YYYY-MM-DD`e çevrilir; "." veya boş → null |
| L | BEYAN NO | `beyanNo` (boş olabilir) |
| M | FAT.BEDELİ | `fatBedeli` |
| N | DÖVİZ | `doviz` |
| AV | KULLANICI | `kullanici` — temsilci filtre alanı (büyük harf Türkçe ad, örn. "SÜLEYMAN") |

Kurallar:

- Satırlar DOSYA NO üzerinden upsert edilir: mevcutsa güncellenir, yoksa eklenir.
  Böylece dosya no sabit kaldıkça geçmiş taleplerin beyanname bağı kırılmaz.
- Başlık doğrulaması: beklenen başlıklar bulunamazsa yükleme **reddedilir** ve eksik
  sütun adıyla hata döner. Sessiz sıfır-satır ithalatı yasak
  (gümrük modülündeki `fatura_tarihi` seri numarası dersinden).
- Tarih parse işlemi `new Date(...)` üzerinden YAPILMAZ (timezone off-by-one tuzağı);
  metin parçalama ile çevrilir.

## 5. Veri Modeli

Tümü [shared/schema.ts](../../../shared/schema.ts) konvansiyonlarıyla: id `varchar` uuid,
FK kolon adları açık snake_case string (`varchar("talep_eden_id")`), tarihler `YYYY-MM-DD`
text, insert şemaları `insert<Entity>Schema`.

### `portal_kullanicilar`

| Alan | Tip | Not |
|---|---|---|
| id | varchar uuid | PK |
| kullaniciAdi | text unique | giriş adı |
| sifreHash | text | `crypto.scrypt` (salt dahil) — yeni bağımlılık yok |
| adSoyad | text | görünen ad |
| rol | text | `temsilci` \| `muhasebe` |
| avAdi | text nullable | Excel AV eşleşmesi (temsilciler için) |
| aktif | boolean default true | ayrılan çalışan kapatılır, silinmez |
| olusturmaTarihi | timestamp | |

Mevcut iskelet `users` tablosuna dokunulmaz.

### `beyannameler`

Bölüm 4'teki alanlar + `id` (PK), `sonGuncelleme` (timestamp, her yüklemede tazelenir).
`dosyaNo` üzerinde unique index.

### `odeme_talepleri`

| Alan | Tip | Not |
|---|---|---|
| id | varchar uuid | PK |
| beyannameId | varchar FK → beyannameler, **nullable** | `varchar("beyanname_id")`; dosyasız talepte null, sonradan eşleştirilir |
| talepEdenId | varchar FK → portal_kullanicilar | oturumdan damgalanır |
| odemeTipi | text | `masraf` \| `depo_teminat` |
| masrafTuru | text | `masraf_turleri` tablosundan seçilen ad (aşağıya bakın) |
| tutar | decimal(18,2) | |
| paraBirimi | text | TRY \| USD \| EUR |
| alacakli | text | kime ödenecek (firma adı) |
| iban | text nullable | |
| aciklama | text nullable | |
| durum | text | `bekliyor` \| `odendi` |
| talepTarihi | text YYYY-MM-DD | |
| odemeTarihi | text nullable | ödendi anında damgalanır |
| odeyenId | varchar FK nullable | ödeyen muhasebeci |
| iadeDurumu | text nullable | sadece depo: `beklemede` \| `iade_edildi` (Faz 2'de genişler) |
| iadeTutari | decimal nullable | kısmi iade / demuraj kesintisi kaydı |
| iadeTarihi | text nullable | |
| iadeNotu | text nullable | |

Aynı beyannameye birden fazla talep açılabilir (masraf + depo teminatı gerçek senaryo) —
engellenmez. İade alanları şimdilik bu tabloda nullable tutulur; Faz 2 çoklu evrak kaydı
gerektirirse ayrı tabloya taşınır (YAGNI).

### `masraf_turleri`

| Alan | Tip | Not |
|---|---|---|
| id | varchar uuid | PK |
| ad | text unique | örn. Ardiye, Liman, Demuraj, Tahmil-Tahliye |
| aktif | boolean default true | kapatılan tür formda görünmez, eski kayıtlar bozulmaz |
| sira | integer | dropdown sıralaması |

Başlangıç kayıtları ilk kurulumda eklenir; liste yönetim panelindeki Ödemeler
sayfasından düzenlenir. `odeme_talepleri.masrafTuru` bu tablodaki `ad` değerini
metin olarak taşır (FK değil — tür adı değişse de geçmiş kayıt olduğu gibi kalır).

### `odeme_belgeleri`

| Alan | Tip | Not |
|---|---|---|
| id | varchar uuid | PK |
| talepId | varchar FK → odeme_talepleri | `varchar("talep_id")` |
| belgeTipi | text | `fatura` (temsilci) \| `dekont` \| `konsimento` (muhasebe) |
| filename, filepath | text | `uploads/odemeler/` altında, mevcut multer diskStorage deseni |
| yukleyenId | varchar FK | |
| yuklemeTarihi | timestamp | |

## 6. Ekranlar

### Portal — Giriş (`/portal`)

Kullanıcı adı + şifre. Başarılı girişte role göre yönlendirme. Pasif (`aktif=false`)
hesaplar giremez.

### Portal — Temsilci (`/portal/taleplerim`)

- Üstte **Yeni Ödeme Talebi** formu:
  1. Beyanname seçimi — arama kutulu dropdown, yalnız kendi (`avAdi`) beyannameleri;
     seçilince müşteri, dosya no, beyan no, gümrük idaresi otomatik gösterilir.
     **"Dosya yok"** işaretlenirse beyanname seçimi atlanır ve açıklama zorunlu olur
     (muhasebe işi tanıyabilsin diye).
  2. Ödeme tipi (Normal masraf / Depo teminatı), masraf türü, tutar + para birimi,
     kime ödenecek, IBAN (opsiyonel), açıklama, belge yükleme (çoklu dosya).
- Ortada **Eşleşme Bekleyen Ödemeler** listesi: ödenmiş (`durum=odendi`) ama
  beyannamesiz (`beyannameId=null`) talepler. Temsilci arama kutulu seçiciden
  beyanname seçip eşleştirir; eşleşen kayıt listeden düşer. Bekleyen dosyasız
  talepler normal tabloda "Dosyasız" rozetiyle görünür.
- Altta **kendi taleplerinin tablosu**: durum rozeti (Bekliyor/Ödendi), belgeler,
  muhasebenin yüklediği dekont buradan indirilir.

### Portal — Muhasebe (`/portal/muhasebe`)

İki sekme:

1. **Gelen Talepler** — tüm temsilcilerin talepleri: temsilci, müşteri, dosya no, tür,
   tutar, tarih, belgeler. Talep detayında yüklenen faturalar görülür; "Ödendi" işlemi
   dekont yüklemeyi zorunlu kılar. Depo teminatında dekont + **konşimento örneği**
   birlikte yüklenir.
2. **Depo Ödemeleri** — yalnız `depo_teminat` kayıtları: ödeme tarihi, kaç gündür açık,
   iade durumu, iade tutarı/notu. "İade Edildi" işaretleme buradan yapılır.

Bekleyen talep sayısı sekme başlığında rozetle görünür; tablolar TanStack Query
`refetchInterval` (30 sn) ile kendini yeniler.

### Yönetim paneli — Ödemeler sayfası (mevcut uygulamada, şifre kapısı arkasında)

- Beyanname Excel yükleme (sürükle-bırak, sonuç özeti: kaç yeni / kaç güncellendi /
  kaç eşleşmeyen kullanıcı).
- Tüm taleplerin ve depo takibinin salt izleme görünümü.
- **Kullanıcı yönetimi:** hesap aç, şifre sıfırla, rol ve avAdi atama, aktif/pasif.
- **Masraf türü yönetimi:** dropdown listesine tür ekle/kapat/sırala.
- AV adı hiçbir kullanıcıya eşleşmeyen beyannameler burada "eşleşmeyen" olarak
  listelenir — kayıp iş görünür kalır.

App.tsx'te portal rotaları public-route listesine (şifre kapısı bypass), yönetim sayfası
`pageTitles` + `<Switch>`'e eklenir.

## 7. API

Rotalar [server/routes.ts](../../../server/routes.ts)'e, veri erişimi
[server/storage.ts](../../../server/storage.ts) `IStorage` + `DatabaseStorage`'a.

### Portal (oturum korumalı: girişsiz 401, yanlış rol 403)

| Rota | Kim | İş |
|---|---|---|
| `POST /api/portal/login` | herkes | kullaniciAdi+şifre → oturum çerezi |
| `POST /api/portal/logout` | oturumlu | oturumu kapatır |
| `GET /api/portal/me` | oturumlu | kimlik + rol |
| `GET /api/portal/beyannameler` | oturumlu | temsilci: yalnız `avAdi` eşleşenler (**filtre sunucuda**); muhasebe: hepsi |
| `POST /api/portal/talepler` | temsilci | multipart (fatura ekleri); `talepEdenId` oturumdan; `beyannameId` opsiyonel (dosyasız talep — o zaman açıklama zorunlu) |
| `GET /api/portal/talepler` | oturumlu | temsilci: kendininkiler; muhasebe: hepsi |
| `PUT /api/portal/talepler/:id/beyanname` | talep sahibi veya muhasebe | dosyasız talebe beyanname eşleştirme; yalnız `beyannameId=null` iken; temsilci yalnız kendi `avAdi` beyannamesini seçebilir |
| `POST /api/portal/talepler/:id/odeme` | muhasebe | multipart (dekont + varsa konşimento); durum→`odendi`, `odemeTarihi`+`odeyenId` damgalanır |
| `PUT /api/portal/talepler/:id/iade` | muhasebe | iade kaydı (durum, tutar, tarih, not) |

### Yönetim (mevcut yönetim API'leri gibi, portal oturumu gerektirmez)

| Rota | İş |
|---|---|
| `POST /api/odemeler/beyanname-excel` | Excel upsert (multer, başlık doğrulamalı) |
| `GET/POST/PUT /api/odemeler/kullanicilar` | hesap yönetimi (şifre değişiminde yeniden hash) |
| `GET/POST/PUT /api/odemeler/masraf-turleri` | masraf türü listesi yönetimi |
| `GET /api/odemeler/ozet` | izleme sayfası verisi (talepler + depo + eşleşmeyen beyannameler) |

Portal tarafı masraf türlerini `GET /api/portal/masraf-turleri` (yalnız aktif olanlar)
ile çeker.

Kurallar: PUT/PATCH miss → `404 {error:"Bulunamadı"}`; liste sorgularında N+1 yerine
`inArray` / iki-sorgu+Map deseni; rol ve kimlik **her zaman** sunucu oturumundan okunur,
istemci parametresine güvenilmez.

## 8. Güvenlik

- Şifreler `crypto.scrypt` ile hash'lenir (salt'lı); düz metin saklanmaz, loglanmaz.
- Oturum çerezi `httpOnly`; `express-session` secret'ı `SESSION_SECRET` ortam
  değişkeninden gelir (.env'e ve sunucu ortamına eklenir; yoksa uygulama uyarı verir).
- Kullanıcı listeleyen hiçbir API yanıtında `sifreHash` alanı dönmez.
- `/api/portal/*` dışındaki hiçbir rota değişmez — yönetim tarafının mevcut
  (bilinçli) güvenlik modeli bu işin kapsamı dışında.
- Yüklenen dosyalar rastgele adla `uploads/odemeler/` altına yazılır; statik `/uploads`
  servisi mevcut davranışıyla kalır.
- Portal kullanıcıları Excel yükleme ve kullanıcı yönetimi API'lerine erişemez
  (bunlar yönetim panelindedir).

## 9. Hata Durumları

- Excel başlıkları uyuşmazsa: yükleme reddedilir, eksik sütun adı söylenir.
- `beyanTarihi` "." veya boş: null yazılır; formda "beyan tarihi yok" görünür.
- AV adı eşleşmeyen beyanname: temsilcilerde görünmez, yönetim izlemede "eşleşmeyen"
  listesinde görünür.
- Ödendi işlemi dekont dosyası olmadan kabul edilmez (400).
- Pasif kullanıcı girişi: 401 + "Hesap kapalı" mesajı.
- Dosyasız talepte açıklama boşsa 400 ("Dosyasız talepte açıklama zorunlu").
- Eşleştirmede: talep zaten eşleşmişse 400; temsilci başkasının `avAdi` beyannamesini
  seçerse 403; başkasının talebini eşleştirmeye çalışan temsilci 403.

## 10. Doğrulama

Test altyapısı yok; `npm run check` (tsc) tek otomatik kapı. Elle uçtan uca senaryo:

1. Yönetim panelinden Excel yükle → satır sayısı/upsert özeti doğru mu?
2. Temsilci hesabı aç (avAdi="SÜLEYMAN") → girişte yalnız kendi beyannamelerini görüyor mu?
3. Talep oluştur (fatura ekiyle) → temsilci tablosunda "Bekliyor" düştü mü?
4. Muhasebe hesabıyla ikinci tarayıcı profilinde gir → talep listede mi, fatura açılıyor mu?
5. Dekont yükleyip "Ödendi" yap → temsilci tarafında durum ve dekont linki güncellendi mi?
6. Depo teminatı talebi → ödeme sonrası Depo Ödemeleri sekmesine düştü mü, iade
   işaretleme çalışıyor mu?
7. Yetki: temsilci başka temsilcinin talebini API'den çekebiliyor mu (403/filtre)?
   Girişsiz `/api/portal/talepler` 401 dönüyor mu?
8. Dosyasız akış: "Dosya yok" ile talep gönder (açıklamasız reddedilmeli) → muhasebe
   öder → talep temsilcide "Eşleşme Bekleyen Ödemeler"e düştü mü → beyanname eşleştir →
   listeden düşüp normal tabloda dosya no'suyla görünüyor mu?

## 11. Uygulama Sırası (özet)

Şema → storage → routes (auth middleware dahil) → portal sayfaları → yönetim sayfası →
App.tsx kablolama → `npm run check` → elle doğrulama. Ayrıntılı adım planı
writing-plans ile ayrı dokümanda çıkarılacak.
