# Muhasebe Şube Masraf Detayı: Gruplu Tablo + Katlanır Kapanış Günleri — Tasarım

**Tarih:** 2026-07-21
**Durum:** Onaylandı (grup varsayılanı kullanıcıyla netleştirildi: kaynak ekranları aynala)
**Önkoşul:** Kasam tablo görünümü + Kapanışlarım katlanır gün canlıda (commit `a9f9ab0`); ortak gruplama
yardımcısı `masrafGruplama.ts` mevcut.

## 1. İhtiyaç

Muhasebe "Şube Masraf" ekranındaki **Detay** kartı hâlâ eski düz formatta:
- **Açık Hareketler:** avans ve masraflar düz satır; dosya no / beyanname no / firma yok, gruplama yok;
  boş açıklamalı avansta `—` görünüyor.
- **Kapanmış Günler:** her gün hep açık; tek satırlık özet (`{tarih} · Kapanış {tutar}`) + düz masraf listesi;
  günün avansları hiç gösterilmiyor (veri `k.avanslar` olarak geliyor ama render edilmiyor).

Operasyon tarafı (Kasam + Kapanışlarım) bu düzene geçti; muhasebe tarafı geride kaldı.

## 2. Kararlar

1. **Açık Hareketler → Kasam formatı:** yeşil avans bloğu + sütun başlıklı gruplu masraf tablosu;
   beyanname grupları **varsayılan KAPALI** (Kasam ile aynı — canlı liste derli toplu kalır).
2. **Kapanmış Günler → Kapanışlarım formatı:** gün **varsayılan KAPALI**, başlıkta tarih + dört özet değer;
   gün açılınca yeşil avans bloğu + gruplu tablo, beyanname grupları **varsayılan AÇIK** (Kapanışlarım ile aynı).
3. **"Geri Aç" iç içe buton OLMAZ:** başlık satırı flex kapsayıcıdır; solda katlama `<button>`, sağda
   **kardeş** Geri Aç butonu / "Geri Açıldı" rozeti. Geri Aç'a basmak günü açıp kapatmaz.
4. **Muhasebe silmez:** hiçbir masraf satırında Kaldır butonu yoktur (bugün de yok — korunur).
5. Ortak `masraflariGrupla` yardımcısı kullanılır (üçüncü tüketici); yeni gruplama kodu yazılmaz.
6. Backend / uç / şema **hiç değişmez**.

## 3. Açık Hareketler bölümü

Veri: `detay.acik.avanslar` + `detay.acik.masraflar` (mevcut). Ek olarak `beyannameler` query'si
(`["/api/portal/beyannameler"]` — Kasam ile aynı queryKey, cache paylaşılır) ve `Map<id, Beyanname>`.

- **Avanslar:** yeşil satır — `Avans · {tarih}{açıklama varsa ` · {açıklama}`}` + `+{tutar}` + dekont linki
  (varsa). **Boş açıklamada `—` GÖSTERİLMEZ** (bugünkü `?? "—"` kaldırılır). testid `row-avans-{id}`.
- **Masraflar:** sütun başlıkları bir kez (`Dosya No · Beyanname No · Firma · Tutar`), altında beyanname
  grupları. Grup başlığı: **Dosya No (bold)** → Beyanname No → Firma (truncate) → Tutar → chevron; satırın
  tamamı tıklanabilir. **Varsayılan KAPALI** — durum `Set<string> acikAcikGruplar` (sette olan AÇIK).
  - Grup açıkken satır: `{tür} · {alacaklı}` + belge linki (varsa) + `−{tutar}`. **Kaldır YOK.**
  - **Ofis Masrafları** grubu altta; satırda `Ofis` rozeti + `{tür} · {alacaklı}{açıklama varsa}`.
  - testid'ler: `group-acik-{beyannameId}`, `button-group-toggle-acik-{beyannameId}`, `group-acik-ofis`,
    `button-group-toggle-acik-ofis`, satırlar `row-masraf-{id}`.
- Hiç hareket yoksa "Açık hareket yok." mesajı KORUNUR.

## 4. Kapanmış Günler bölümü

Veri: `detay.kapanislar` (her biri `avanslar` + `masraflar` taşır — avanslar bugün render edilmiyor).

**Gün başlığı (flex satır, İKİ kardeş):**
- Sol: katlama `<button>` — chevron (`ChevronRight` kapalı / `ChevronDown` açık) + `{tarih} Kapanışı` +
  altında dört özet değer grid'i (Açılış / Avans / Masraf / Kapanış). testid `button-kapanis-toggle-{id}`.
- Sağ: `durum === "geri_acildi"` → **Geri Açıldı** rozeti; `durum === "kapali"` → **Geri Aç** butonu
  (testid `button-geri-ac-{id}` KORUNUR, `geriAc(k.id)` çağrısı aynen). Bu buton katlama butonunun
  **İÇİNDE DEĞİL**, kardeşidir.
- Kart testid `takip-kapanis-{id}` KORUNUR.

**Gün açıkken:**
1. **Avanslar** (varsa): yeşil blok, Açık Hareketler'deki formatın aynısı (boş açıklamada `—` yok, dekont linki).
2. **Masraf tablosu:** sütun başlıkları + beyanname grupları, **varsayılan AÇIK** — durum
   `Set<string> kapaliKapanisGruplar` (**sette olan KAPALI**; `const acik = !kapaliKapanisGruplar.has(anahtar)`).
   Grup anahtarı `${k.id}-${beyannameId}`, ofis için `${k.id}-__ofis__`.
   - testid'ler: `group-kapanis-{kapanisId}-{beyannameId}`, `button-group-toggle-{kapanisId}-{beyannameId}`,
     `group-kapanis-ofis-{kapanisId}`, `button-group-toggle-ofis-{kapanisId}`.
   - **Kaldır YOK**, belge linkleri korunur.
3. Masraf yoksa "Masraf yok." gösterilir.

Hiç kapanış yoksa "Kapanış yok." mesajı KORUNUR.

**İki ters grup semantiği aynı dosyada:** `acikAcikGruplar` (sette olan **AÇIK**, varsayılan kapalı) ve
`kapaliKapanisGruplar` (sette olan **KAPALI**, varsayılan açık). İsimleri kasıtlı olarak ayrıştırılmıştır;
biri diğerinin yerine kullanılmamalıdır.

## 5. Kapsam / Kapsam dışı

**Değişen:** yalnız `client/src/pages/portal/OperasyonTakipSayfasi.tsx` (Detay kartının içi + `beyannameler`
query'si + grup/gün state'leri).

**Kapsam dışı:** Şube Bakiyeleri bölümü ve şube gruplaması · Avans Yükle dialog'u ve dekont akışı ·
`geriAc` sunucu mantığı · Kasam / Kapanışlarım sayfaları · `masrafGruplama.ts` (olduğu gibi kullanılır) ·
muhasebeye masraf silme yetkisi verme · backend/şema/uç.

## 6. Doğrulama

- `npm run check` ve `npm run build` temiz. Yalnız istemci; `db:push` YOK.
- **DEV DB izolasyonu:** Playwright yazma testi öncesi hedef doğrulanır (dev Neon), aksi hâlde durulur.
- **Korunan testid'ler:** `grup-sube-{şube}`, `grup-sube-toplam-{şube}`, `sube-{id}`, `sube-bakiye-{id}`,
  `button-avans-{id}`, `button-detay-{id}`, `takip-kapanis-{id}`, `button-geri-ac-{id}`,
  `input-avans-tutar`, `input-avans-aciklama`, `input-avans-dekont`, `button-avans-gonder`.
- Playwright (muhasebe kullanıcısı, dev DB — bir operasyon kullanıcısına avans + iki beyannameye masraf +
  bir ofis masrafı girilip **gün kapatılarak**, ayrıca kapanış sonrası bir açık masraf daha eklenerek hazırlanır):
  (a) Detay → **Açık Hareketler**: avans yeşil satır (boş açıklamada `—` YOK), sütun başlıkları bir kez,
      beyanname grubu **KAPALI** gelir; tıkla → açılır; **Kaldır YOK**.
  (b) **Kapanmış Günler**: gün **KAPALI** gelir; başlıkta tarih + dört özet değer; sağda **Geri Aç** butonu.
  (c) Gün başlığına tıkla → açılır; avanslar yeşil blokta; masraf grupları **AÇIK** gelir.
  (d) Bir gruba tıkla → kapanır; tekrar tıkla → açılır.
  (e) **Geri Aç'a tıkla → gün geri açılır** (kayıtlar açık hareketlere döner) ve bu tıklama **günü
      katlamaz/açmaz** (iç içe buton yok kanıtı).
  (f) Ofis Masrafları grubu görünür, `Ofis` rozetli.
  (g) Regresyon: Şube Bakiyeleri gruplaması, Avans Yükle dialog'u (dekont dahil) bozulmamış.
- Test verileri dev DB'den ve `uploads/operasyon/` içinden temizlenir.
