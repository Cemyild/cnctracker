# Ödemeler Portalı Faz 1.5 — Tasarım Dokümanı

**Tarih:** 2026-07-05
**Durum:** Onaylandı (kullanıcı ile bölüm bölüm doğrulandı)
**Önkoşul:** Faz 1 canlıda ([2026-07-03-odemeler-portal-design.md](2026-07-03-odemeler-portal-design.md)); portal `https://cncgumruk.space/portal` (HTTPS aktif — bildirim API'leri kullanılabilir).

## 1. Amaç ve Kapsam

Faz 1'in tek-sayfa portal yerleşimini çok-sayfalı, sidebar'lı bir uygulamaya dönüştürmek ve
canlı bilgilendirme eklemek:

1. **Portal sidebar'ı** — yönetim panelindekiyle aynı görsel dilde, role göre menü;
   altta kullanıcı kartı (ad soyad + rol) ve Çıkış.
2. **Ayrı sayfalar** — Taleplerim ve Depo Ödemeleri kendi rotalarına taşınır.
3. **Canlı güncelleme + rozet + bildirim** — 10 sn polling, sidebar'da kırmızı
   "yeni değişiklik" rozetleri, sekme arka plandayken tarayıcı bildirimi,
   sekme başlığında sayaç.
4. **Doğrudan Ödeme** — muhasebe, temsilci talebi olmadan tek adımda ödeme kaydı girer.

### Kapsam dışı (Faz 2)

- Web Push (sayfa tamamen kapalıyken bildirim — service worker + VAPID).
- Çalışanın kendi şifresini değiştirmesi.
- Depo iadesinin evrak/dilekçe süreci (Faz 2 ana konusu).

## 2. Yerleşim ve Rotalar

**PortalSidebar** (yeni bileşen, `client/src/pages/portal/PortalSidebar.tsx`):
shadcn Sidebar altyapısı, yönetim `AppSidebar`'ına DOKUNULMAZ (işlevselliği koru).
Üstte logo + "Ödemeler Portalı"; ortada role göre menü; altta kullanıcı kartı
(adSoyad + "Müşteri Temsilcisi"/"Muhasebe") ve Çıkış düğmesi.

İçerik alanı üstünde ince başlık çubuğu: SidebarTrigger + aktif sayfa adı.
PortalApp, SidebarProvider ile kabuk olur; sayfalar wouter alt rotalarıyla render edilir.

| Rol | Menü | Rota | İçerik |
|---|---|---|---|
| temsilci | Yeni Talep | `/portal/yeni-talep` | Faz 1 talep formu (aynen) |
| temsilci | Taleplerim 🔴 | `/portal/taleplerim` | Eşleşme Bekleyenler kartı + tablo |
| muhasebe | Gelen Talepler 🔴 | `/portal/gelen-talepler` | Talep tablosu + Öde dialogu |
| muhasebe | Depo Ödemeleri 🔴 | `/portal/depo` | İade takip tablosu + İade dialogu |
| muhasebe | Doğrudan Ödeme | `/portal/dogrudan-odeme` | Yeni form (§4) |

- `/portal` kökü role göre yönlendirir: temsilci → `/portal/yeni-talep`,
  muhasebe → `/portal/gelen-talepler`. Bilinmeyen alt rota da aynı yönlendirmeye düşer.
- Giriş ekranı değişmez; girişsiz her portal rotası login'i gösterir.
- Mevcut `TemsilciPanel` → `YeniTalepSayfasi` + `TaleplerimSayfasi`;
  `MuhasebePanel` → `GelenTaleplerSayfasi` + `DepoOdemeleriSayfasi` olarak bölünür.
  Dialoglar (Öde/İade, key-remount davranışıyla) ve tüm işlev birebir korunur.
- App.tsx'te `/portal` tek Route kalır; alt rotalar PortalApp içinde çözülür
  (wouter `Switch` nested). Bypass koşulu değişmez (`startsWith("/portal")`).

## 3. Canlı Güncelleme, Rozetler, Bildirim

**Polling:** `GET /api/portal/talepler` sorgusunun `refetchInterval`'ı 30 sn → **10 sn**.
Rozetler bu veriden türetilir; yeni endpoint yok. Sorgu, sayfalar arası paylaşılsın diye
PortalApp düzeyinde tek `useQuery` ile çekilir (tüm sayfalar ve sidebar aynı cache'i okur).

**Değişiklik imzası:** localStorage anahtarı `portal_gorulen_<kullaniciId>`:

```json
{
  "taleplerim":     { "<talepId>": "<durum|iadeDurumu|belgeSayisi>" , ... },
  "gelenTalepler":  { ... },
  "depo":           { ... }
}
```

Her yenilemede sayfa başına fark hesaplanır:

- **taleplerim** (temsilci): imzadaki değere göre durumu/iade durumu/belge sayısı değişen
  VEYA imzada olmayan (yeni) talepler → rozet sayısı.
- **gelenTalepler** (muhasebe): imzada olmayan yeni talepler.
- **depo** (muhasebe): `odemeTipi=depo_teminat` olup imzaya göre yeni iade-bekleyene
  düşen veya iade durumu değişen kayıtlar.

Sayfa AKTİFKEN (rota eşleşiyor ve sekme öndeyse) o sayfanın imzası her veride güncellenir
→ rozet 0. Sayfa aktif değilken imza dondurulur, fark birikir. İlk kullanımda (imza yok)
mevcut durum baz alınır, rozet gösterilmez.

**Sidebar rozeti:** fark > 0 olan menü öğesinde kırmızı `Badge` (destructive variant)
ile sayı. Sekme başlığı: toplam fark > 0 iken `(n) Ödemeler Portalı`, yoksa düz başlık.

**Tarayıcı bildirimi:** Girişten sonra bir kez `Notification.requestPermission()`.
`document.hidden` iken yeni fark oluşursa bildirim:

- temsilciye: `Talebiniz ödendi: <dosyaNo veya alacaklı> — <tutar>`
- muhasebeye: `Yeni ödeme talebi: <temsilci adı> — <tutar>` (birden çoksa `<n> yeni talep`)

Bildirime tıklama: `window.focus()` + temsilcide `/portal/taleplerim`, muhasebede
`/portal/gelen-talepler` rotasına `navigate` (depo değişikliğiyse `/portal/depo`).
İzin reddedilmişse veya
`"Notification" in window` değilse sessizce atlanır. Aynı fark için bildirim bir kez
gösterilir (gösterilen id'ler oturum içi Set'te tutulur).

## 4. Doğrudan Ödeme (muhasebe)

**Rota:** `POST /api/portal/dogrudan-odeme` — `requireMuhasebe`, multipart.

Alanlar: `beyannameId` (opsiyonel — muhasebe TÜM beyannameleri görür), `odemeTipi`
(masraf|depo_teminat), `masrafTuru` (masrafta zorunlu; depoda sabit "Depo Teminatı"),
`tutar` (parseTutar ile), `paraBirimi`, `alacakli` (zorunlu), `iban`, `aciklama`
(beyannamesizse zorunlu — temsilci formuyla aynı kural), dosyalar: `dekont` (ZORUNLU, 1),
`konsimento` (ops., 1).

Davranış: kayıt tek adımda `durum="odendi"` olarak oluşur; `talepEdenId` VE `odeyenId`
= giriş yapan muhasebeci; `talepTarihi` = `odemeTarihi` = bugün; `odemeTipi=depo_teminat`
ise `iadeDurumu="beklemede"` (iade takibine düşer). Dekont `belgeTipi="dekont"`,
konşimento `"konsimento"` olarak `odeme_belgeleri`ne yazılır. Doğrulama hatalarında
yüklenen dosyalar silinir (yetim dosya temizliği deseni).

Görünürlük: temsilci ekranlarında görünmez (talepEden muhasebeci olduğundan mevcut
filtre zaten dışarıda bırakır); muhasebe Gelen Talepler + Depo sayfalarında ve yönetim
İzleme'de görünür.

**Form sayfası** (`/portal/dogrudan-odeme`): temsilci Yeni Talep formunun muhasebe
uyarlaması — beyanname aramasında tüm liste, "Dosya yok" seçeneği, dekont + (depoda)
konşimento alanları formda. Başarıda toast + form sıfırlanır.

## 5. Hata Durumları

- Polling hatası: son başarılı veri ekranda kalır (TanStack default); rozetler değişmez.
- localStorage silinmiş/bozuk: imza yeniden baz alınır (bir tur rozet yok), JSON parse
  hatası sessizce sıfırlamayla çözülür.
- Bildirim izni yok/reddedilmiş/eski tarayıcı: yalnız rozet + sekme başlığı çalışır.
- Doğrudan ödemede dekont eksik → 400 "Dekont dosyası zorunlu"; beyannamesiz + açıklamasız
  → 400 "Dosyasız talepte açıklama zorunlu".

## 6. Doğrulama

`npm run check` + Playwright E2E genişletmesi:

1. Sidebar: her iki rolde menü öğeleri, kullanıcı kartı, Çıkış çalışıyor; rota geçişleri.
2. Temsilci talep açar → muhasebe context'inde ≤10 sn içinde Gelen Talepler rozeti
   belirir → sayfaya girince sıfırlanır.
3. Muhasebe öder → temsilci context'inde Taleplerim rozeti belirir; sekme başlığı `(1)`.
4. Bildirim: `context.grantPermissions(["notifications"])` ile izin verilip arka plan
   sekmesinde bildirim tetiklenmesi doğrulanır (Playwright'ta Notification çağrısı
   page.evaluate + event ile gözlemlenebilir; en azından bildirim fonksiyonunun çağrıldığı
   assert edilir).
5. Doğrudan Ödeme: beyannameli + dosyasız varyantları, dekontsuz 400, depo teminatının
   Depo sayfasına düşmesi.
6. Regresyon: Faz 1 akışları (talep→öde→iade→eşleştir) sidebar'lı yerleşimde aynen çalışır.

## 7. Uygulama Sırası (özet)

Backend doğrudan-ödeme rotası → PortalSidebar + kabuk/rota yapısı → sayfa bölme
(Temsilci/Muhasebe) → Doğrudan Ödeme sayfası → rozet/bildirim motoru
(`useTalepBildirimleri` hook'u) → E2E doğrulama. Ayrıntılı plan writing-plans ile.
