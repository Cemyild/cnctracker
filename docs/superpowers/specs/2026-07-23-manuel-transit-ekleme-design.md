# Manuel Transit Ekleme (Faz 2B) — Tasarım

**Tarih:** 2026-07-23
**Durum:** Onaylandı
**Önkoşul:** Faz 1a/1b + 2A canlıda. `beyannameler` tablosu transit için hazır: `dosya_no` nullable,
`rejim` (`IM`|`EX`|`TR`), `kaynak` (`excel`|`manuel`), `beyan_no` üzerinde kısmi unique indeks
(`WHERE rejim='TR'`). `BeyannameSecici`'de Transit sekmesi mevcut ama liste boş (canlıda 0 TR satırı).

## 1. İhtiyaç

Transit (TR) beyannameleri sistemde yok ve otomatik gelmiyor (bazen işi dışarıdan biri yapıyor).
Masrafı giren kullanıcı transiti **elle** ekleyecek — dosya no olmadan, beyanname no + firma (+ gümrük) ile.
Bu, sistemdeki **ilk TR satırını** yaratır.

## 2. Kararlar (kullanıcı onayı)

1. **Kim ekler:** masraf giren herkes — operasyon, muhasebe, temsilci (`requirePortal`). Eklenen transit
   ortak listeye girer, herkes seçebilir (Faz 1 "ortak liste" kararıyla tutarlı).
2. **Mükerrer beyan_no:** hata verme — mevcut transiti döndür ve seçtir (masraf-türü ekleme kalıbı,
   `routes.ts:4859`). Firma adı farklı girilmişse önemsiz; aynı beyanname.
3. **Alanlar:** beyanname no (zorunlu) + firma/alıcı (zorunlu) + gümrük idaresi (opsiyonel — forma dahil,
   boş bırakılabilir).
4. **Emsal:** `MasrafTuruSecici`'nin "+ Yeni tür ekle" akışı birebir model. Combobox içi ekleme + mükerrerde
   mevcudu döndürme.

## 3. Backend

### 3.1 Uç

**`POST /api/portal/transit`** (`requirePortal`). Gövde: `{ beyanNo, alici, gumrukIdaresi? }`.

- `beyanNo` ve `alici` trim'lenir; boşsa `400 "Beyanname no ve firma zorunlu"`.
- `gumrukIdaresi` opsiyonel; boş → `null`.
- Mantık `storage.createManuelTransit`'e devredilir; dönen `Beyanname` (yeni veya mevcut) `res.json` ile
  döner. İstemci `yeni.id` ile seçer.

### 3.2 `storage.createManuelTransit`

`IStorage` arayüzüne + `DatabaseStorage`'a yeni fonksiyon:

```
createManuelTransit(girdi: { beyanNo: string; alici: string; gumrukIdaresi: string | null }): Promise<Beyanname>
```

Adımlar:
1. Mevcut kontrol: `rejim='TR' AND beyan_no=girdi.beyanNo` olan satır var mı → **varsa aynen döndür**
   (yeni kayıt açma).
2. Yoksa insert: `{ dosyaNo: null, alici, gonderen: null, gumrukIdaresi, beyanNo, kullanici: null,
   rejim: 'TR', kaynak: 'manuel' }` — diğer alanlar şema varsayılanı/null.
3. **Yarış koruması:** insert `unique_violation` (kısmi indeks `beyannameler_tr_beyan_no_idx`) fırlatırsa,
   1. adımı tekrarlayıp mevcut satırı döndür (iki kullanıcı aynı anda eklerse ikincisi mevcudu alır).

`upsertBeyannameler` **kullanılmaz** — tek satır, kendi mükerrer kontrolüyle. Bu yüzden M2 (upsert TR dalı)
gerekmiyor: TR hiçbir zaman batch upsert yolundan geçmez.

### 3.3 M3 — sıralama (`getBeyannameler`)

İki dalda da (`kullanici` filtreli ve filtresiz) `orderBy(desc(beyannameler.dosyaNo))` →
`ORDER BY dosya_no DESC NULLS LAST, beyan_no DESC`. Transit satırları (null `dosya_no`) listenin **sonuna**
gider; kendi aralarında `beyan_no`'ya göre sıralı. Aksi hâlde Postgres `DESC` varsayılanı `NULLS FIRST`'tür
ve transitler listenin başını (ve seçicideki ilk 100'ü) kaplardı.

## 4. İstemci — `BeyannameSecici` Transit sekmesinde inline ekleme

Transit sekmesi seçiliyken, `CommandList`'in altında **"➕ Yeni transit ekle"** öğesi. Tıklayınca panel
içeriği **inline forma** geçer (liste gizlenir): beyan no + firma + gümrük inputları + **[Ekle] [Vazgeç]**.

- **Neden inline form, ayrı Dialog değil:** `BeyannameSecici` bazı ekranlarda (`YeniOdemeModal`) zaten bir
  Dialog içinde ve Popover taşıyor. Ayrı Dialog → **Dialog > Popover > Dialog** iç içe geçişi → Radix odak
  karışması (bu projede Dialog-içi-Popover sorunu yaşandı). Inline form aynı Popover içinde kalır, riski
  atlar.
- Beyan no ve firma zorunlu (boşsa Ekle pasif); gümrük opsiyonel.
- **Ekle:** `POST /api/portal/transit` → yanıt `yeni`. `queryClient.invalidateQueries(["/api/portal/beyannameler"])`
  ile tüm tüketicilerin listesi tazelenir; `onChange(yeni.id)` ile seçilir; panel kapanır; form sıfırlanır.
- **Kısa "seçili ama liste tazelenmedi" penceresi:** POST yanıtı seçimi hemen tetikler, invalidate arkadan
  listeyi doldurur. Tüketici `secili`'yi kendi query'sinden bulur (o da tazelenir). Birkaç yüz ms.
- **`Props` imzası DEĞİŞMEZ** — transit ekleme bileşenin iç davranışı. 4 tüketici ekran otomatik kazanır.
- Panel kapanınca form durumu ve rejim şeridi sıfırlanır (mevcut `acKapa` deseni genişler).
- Türkçe: `toLocaleLowerCase("tr")` korunur (form aramayı etkilemez); `new Date(...)` yok.

## 5. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `server/storage.ts` | `createManuelTransit` (arayüz + impl) + `getBeyannameler` NULLS LAST (2 dal) |
| `server/routes.ts` | `POST /api/portal/transit` |
| `client/src/pages/portal/BeyannameSecici.tsx` | Transit inline ekleme formu + state |

**Şema değişikliği YOK** — `db:push` çalışmaz. `shared/schema.ts` dokunulmaz (tablo hazır).

## 6. Geri-alınabilirlik — kalıcı kapanış

Bu fazın oluşturduğu **ilk TR satırı** (test verisi dahil) `dosya_no NOT NULL` kısıtının geri konmasını
kalıcı olarak imkânsız kılar (null satır varken `NOT NULL` eklenemez). Faz 1a'dan beri planlı ve kabul
edilmiş eşik. Deploy notunda tekrar vurgulanır; canlıda ilk gerçek transit eklenene kadar pencere teknik
olarak açık kalır ama pratikte bu faz onu kapatmak için var.

## 7. Kapsam dışı

Transit **düzenleme/silme** (yalnız ekle + seç) · rejim kırılımlı raporlar · sunucu-tarafı arama (I2,
backlog) · transit için ayrı yönetim ekranı · transit'e masraf/belge dışında alan (net kg, tarih vb.).

## 8. Doğrulama

- `npm run check` ve `npm run build` temiz. Şema yok → `db:push` YOK.
- **DEV DB izolasyonu:** transit ekleme DB'ye yazar; yazma öncesi hedef doğrulanır (dev Neon), aksi hâlde durulur.
- **Kalıcı dev test seti:** `optest`/`muhasebe`/`suleyman`, `Test1234!`, `POST /api/portal/login`.
- Uç testleri (dev DB):
  (a) `POST /api/portal/transit {beyanNo:'TR-E2E-1', alici:'TRANSIT FIRMA', gumrukIdaresi:'HALKALI'}` →
      `rejim='TR'`, `kaynak='manuel'`, `dosya_no=null` bir satır döner.
  (b) **Aynı beyanNo tekrar** → yeni satır AÇILMAZ, **mevcut** satır döner (id aynı); toplam TR sayısı artmaz.
  (c) Farklı beyanNo → ikinci TR satırı; iki satır.
  (d) `beyanNo` veya `alici` boş → `400`.
- Playwright (Kasam `optest` + Doğrudan Ödeme `muhasebe`):
  (e) Seçici → **Transit** sekmesi → "➕ Yeni transit ekle" → inline form açılır.
  (f) Beyan no + firma + gümrük gir → **Ekle** → panel kapanır, tetikleyicide yeni transit **seçili**
      (`{beyanNo} — {firma}`, `dosyaNo` null olduğu için kimlik `beyanNo`).
  (g) Boş form → Ekle pasif; Vazgeç → forma girmeden listeye döner.
  (h) Eklenen transit **Transit sekmesinde `TR` etiketiyle** görünür; masraf kaydı bu transite bağlanabiliyor
      (uçtan uca: transit seç → masraf ekle → HTTP 2xx).
- **M3 sıralama:** transit eklendikten sonra "Hepsi" listesinde transit satırları **sonda** (başta değil);
  `getBeyannameler` yanıtında null `dosya_no`'lar en sonda.
- **Regresyon:** IM/EX seçici davranışı bozulmadı; rejim şeridi + etiket (Faz 2A) çalışıyor; `Props` imzası
  aynı (grep ile doğrula).
- Test verileri dev DB'den temizlenir (`beyan_no LIKE 'TR-E2E%'`).
