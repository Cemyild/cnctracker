# Operasyon Şube Atama + Şube Gider Raporu — Tasarım

**Tarih:** 2026-07-20
**Durum:** Onaylandı (dört karar kullanıcıyla netleştirildi)
**Önkoşul:** Operasyon Kasası canlıda (`operasyon_avanslar` / `operasyon_masraflar` / `operasyon_gun_kapanis`); Ofis Masrafı + yeni masraf türü ekleme canlıda (commit `ea26902`).

## 1. İhtiyaç

Operasyon (şube) kullanıcıları bugün hangi şubeye ait olduklarını taşımıyor. Şube
bilgisi olmadan şube masrafları (dosya, benzin vb.) raporlarda şubelere gider
olarak atanamıyor. Admin, operasyon kullanıcısı eklerken şubeyi seçmeli; masraflar
şubeye işlenmeli; muhasebe şube bazlı gider kırılımı alabilmeli. Bu özellik
**yalnız operasyon** rolü içindir — temsilci ve muhasebede yoktur.

## 2. Kararlar

1. **Şube bir etiket ve raporlama boyutudur, görünürlük filtresi DEĞİLDİR.**
   Operasyon kullanıcısı masraf eklerken TÜM beyannameleri görmeye devam eder
   (Operasyon Kasası spec §9'un bilinçli kararı: "şube tüm dosyalara ödeme
   yapabilir" — `routes.ts` `/api/portal/beyannameler`). Şube filtresi bu kararı
   tersine çevirmez.
2. **Şube masraf satırına SNAPSHOT olarak yazılır.** Kullanıcı ileride başka
   şubeye geçse bile geçmiş masraflar eski şubede kalır; kapanmış dönem raporları
   geriye dönük değişmez. Emsal: `salaryPlans.branch` ("planlama anındaki şube
   bilgisi (snapshot)").
3. **Operasyon rolünde şube ZORUNLUDUR.** Gerçek dünyada her şubede masraf giren
   tek bir kullanıcı vardır (1 şube = 1 operasyon kullanıcısı). Şubesiz kullanıcı
   raporda "Şube atanmamış" grubuna düşer ve kırılımı deler.
4. **İki ekran:** mevcut "Şube Masraf" şube-merkezli yeniden düzenlenir (günlük
   operasyon: avans, masraf, gün kapanış/devir) VE yeni "Şube Raporu" sekmesi
   eklenir (salt raporlama: tarih aralığı, kırılım, Excel).

**Geçmiş veri:** Canlıda gerçek operasyon masrafı YOKTUR (yalnız test kayıtları
girilmiş, temizlenmiştir). Bu nedenle geri-doldurma (backfill) adımı **yoktur**.

## 3. Veri modeli

Yeni tablo YOK. Şube değerleri mevcut sabit listeden gelir:
`shared/schema.ts` → `export const subeler = ["Bursa", "Gemlik",
"İstanbul - Erenköy", "İstanbul - İHL", "Muratbey", "Yönetim"]`. Bu liste
Çalışanlar (`calisanlar.sube`), Gümrük giderleri (`giderler.sube`), Araçlar
(`araclar.sube`) ve Dashboard tarafından zaten kullanılıyor — **aynı isim uzayında
kalmak**, ileride konsolidasyonu mümkün kılar ("Gemlik" ile "GEMLİK" iki ayrı şube
gibi görünmesin).

İki **eklemeli** kolon (drizzle push additive → silme sorusu çıkmaz):

| Tablo | Kolon | Tip | Anlam |
|---|---|---|---|
| `portal_kullanicilar` | `sube` | `text` (nullable) | Kullanıcının **güncel** şubesi. Yalnız `rol='operasyon'` için anlamlı; o rolde zorunlu. |
| `operasyon_masraflar` | `sube` | `text` (nullable) | Masraf kaydedilirken alınan **snapshot**. Geçmişi dondurur. |

Kolon nullable kalır (mevcut satırlar ve operasyon-dışı roller için); zorunluluk
uygulama katmanında (rol='operasyon' iken) uygulanır. DB seviyesinde NOT NULL
yapılması mevcut satırları kıracağı için tercih edilmez.

## 4. Admin kullanıcı formu (`client/src/pages/Odemeler.tsx`)

`KullaniciFormDialog` içinde rol Select'inin ALTINA Şube Select:

- **Yalnız `rol === "operasyon"` seçiliyken görünür.** Temsilci/muhasebe seçiliyken
  gizlidir (kullanıcı isteği: "Temsilcilerde bu özellik yok").
- Seçenekler `subeler` listesinden gelir. testid: `select-kullanici-sube`.
- **Zorunlu:** rol operasyon iken şube boşsa kaydet engellenir; istemcide uyarı
  toast'ı, sunucuda 400 döner (çift kapı).
- Rol operasyondan başka bir role çevrilirse `sube` null'a çekilir (temizlenir) —
  pasif operasyon kaydından artık şube taşınmaz.
- Kullanıcı listesi tablosuna **"Şube" kolonu** eklenir (operasyon dışı satırlarda
  boş görünür).

**TUZAK — sessiz alan düşmesi:** `PUT /api/odemeler/kullanicilar/:id` **açık alan
beyaz listesiyle** çalışır (yalnız `adSoyad`, `rol`, `avAdi`, `aktif`, `sifre`
kabul eder). `sube` bu listeye eklenmezse admin şubeyi seçer, form başarıyla
kaydeder, hata çıkmaz — ama alan **sessizce düşer**. Aynı sınıf hata F1.11'de
yaşandı (POST/PUT eski IBAN alanlarını storage'a iletmiyordu → firma eklenirken
0 IBAN). `sube` hem POST hem PUT yolunda açıkça iletilmelidir.

## 5. Yazma yolu — masrafa şube işleme

`POST /api/portal/operasyon/masraf` ucunda şube **sunucuda** oturum sahibinden
okunur (`ben.sube`) ve masraf satırına yazılır. **İstemciden gelmez** — tek kaynak
ve kullanıcı kendi şubesini değiştiremez.

- Kullanıcının şubesi yoksa `null` yazılır (rapor "Şube atanmamış" grubunda
  gösterir, gizlemez).
- **Avanslara şube eklenmez.** Avans para *girişidir*, gider değildir; gider
  raporunun konusu değildir. Canlı "Şube Bakiyeleri" gruplaması kullanıcının
  GÜNCEL şubesinden yapılır (bakiye anlık bir değerdir, geçmiş değil).
- Mevcut masraf doğrulaması (belge zorunlu, ofis masrafında açıklama zorunlu,
  dosyaYok/beyannameId mantığı) **değişmez**.

## 6. Ekran 1 — "Şube Masraf" şube-merkezli düzenleme

`client/src/pages/portal/OperasyonTakipSayfasi.tsx` (muhasebe, mevcut sekme).

Bugün: düz kullanıcı listesi ("Şube Bakiyeleri") + seçili kullanıcı Detay kartı.

Yeni: kullanıcılar **şube başlıkları altında gruplanır**.
- Şube başlığı + o şubenin **toplam bakiyesi** (altındaki kullanıcıların toplamı).
- Başlık altında mevcut kullanıcı satırı aynen (ad soyad, bugün harcanan, bakiye,
  "Avans Yükle", "Detay") — mevcut testid'ler (`sube-${id}`, `sube-bakiye-${id}`,
  `button-avans-${id}`, `button-detay-${id}`) KORUNUR.
- Şubesi olmayan kullanıcılar "Şube atanmamış" başlığı altında toplanır.
- Şubeler `subeler` listesindeki sırayla, listede olmayan şube adları sonda
  alfabetik gösterilir (veri kaybolmaz).
- **Kullanıcısı olmayan şube gösterilmez** — başlıklar `subeler` listesinden değil,
  mevcut operasyon kullanıcılarının şubelerinden türetilir (boş şube blokları
  ekranı şişirmesin). Aynı kural Şube Raporu için de geçerlidir: dönemde masrafı
  olmayan şube raporda görünmez.
- **Detay kartı aynen kalır** — açık hareketler, kapanmış günler, masraf/belge
  dökümü, "Geri Aç", devir mantığı değişmez.

Liste ucu `GET /api/portal/operasyon-takip` dönüşüne `sube` alanı eklenir
(kullanıcının güncel şubesi).

## 7. Ekran 2 — "Şube Raporu" (yeni sekme)

Yeni sayfa `client/src/pages/portal/SubeRaporuSayfasi.tsx`, rota `/portal/sube-raporu`,
`PortalSidebar` içindeki `MUHASEBE_MENU` dizisine eklenir ve `PortalApp` Switch'ine
muhasebe rolü altında bağlanır.

İçerik:
- **Tarih aralığı** (başlangıç/bitiş, `YYYY-MM-DD`). Varsayılan: içinde bulunulan
  ayın ilk günü → bugün. testid: `input-rapor-baslangic`, `input-rapor-bitis`.
- **Şube × masraf türü kırılımı:** her şube bir blok; blok başlığında şube adı +
  şube toplamı; blok içinde masraf türü satırları (tür adı, adet, tutar).
- **Genel toplam** en altta.
- **Excel indir** butonu (testid: `button-sube-rapor-excel`).
- Boş dönemde "Seçilen aralıkta masraf yok" mesajı.

**Rapor snapshot kolonundan (`operasyon_masraflar.sube`) okur**, kullanıcının
güncel şubesinden DEĞİL — geçmiş sabit kalır (Karar 2).

Boş değerler gizlenmez: `sube = null` → **"Şube atanmamış"**, `masrafTuru = null`
→ **"Belirtilmemiş"** grubunda görünür. Toplamlara dahildir (para kaybolmuş gibi
görünmemeli).

Tarih filtresi `operasyon_masraflar.tarih` (text `YYYY-MM-DD`) üzerinde string
karşılaştırmasıyla yapılır — `new Date(...)` KULLANILMAZ (kod tabanı konvansiyonu:
timezone kaymaları off-by-one hatalara yol açtı).

## 8. Uçlar

```
GET /api/portal/operasyon-takip/rapor/sube?baslangic=YYYY-MM-DD&bitis=YYYY-MM-DD
    (requireMuhasebe)
    Dönüş: {
      subeler: [{ sube: string, toplam: number,
                  turler: [{ masrafTuru: string, adet: number, tutar: number }] }],
      genelToplam: number
    }
    - baslangic/bitis eksik veya YYYY-MM-DD formatında değilse 400.
    - Sıralama: subeler[] tutar azalan; turler[] tutar azalan.

GET /api/portal/operasyon-takip/rapor/sube/excel?baslangic=&bitis=
    (requireMuhasebe)
    Aynı veriyi düz tablo olarak xlsx döndürür (kolonlar: Şube, Masraf Türü,
    Adet, Tutar). Content-Disposition ile indirilir; mevcut
    /api/portal/odeme-sirketleri/sablon kalıbı izlenir
    (istemci: window.location.href = "...").
```

**ROTA ÇAKIŞMASI — yapısal çözüm:** Mevcut `GET /api/portal/operasyon-takip/:operasyonId`
prefix'ten sonraki **tek segmenti** yakalar. Rapor ucu `/operasyon-takip/sube-raporu`
olsaydı Express bunu `operasyonId = "sube-raporu"` diye yorumlayabilir, rota kayıt
sırası bozulduğunda sessizce yanlış handler'a düşerdi. Bu yüzden **iki segmentli**
`/operasyon-takip/rapor/sube` seçilmiştir — `:operasyonId` iki segmenti eşleştiremez,
çakışma **yapısal olarak imkânsızdır** ve rota sırası disiplinine bağımlı değildir.

Ayrıca `POST /api/odemeler/kullanicilar` ve `PUT /api/odemeler/kullanicilar/:id`
gövde işlemesine `sube` eklenir (bkz. §4 tuzak notu). Rol whitelist'i değişmez.

## 9. Storage

`server/storage.ts`:
- `masrafKaydet(d)` imzasına `sube?: string | null` eklenir.
- `getOperasyonKullanicilar()` dönüşü `sube` alanını zaten taşır (tablo kolonu).
- Yeni: `getSubeGiderRaporu(baslangic, bitis)` → şube + masraf türü bazında
  gruplanmış toplamlar. Tek sorguda `GROUP BY sube, masraf_turu` ile döner;
  N+1 yapılmaz (kod tabanı konvansiyonu).

## 10. Kapsam / Kapsam dışı

**Değişen/eklenen:** `shared/schema.ts` (2 kolon), `server/storage.ts`
(masrafKaydet + getSubeGiderRaporu), `server/routes.ts` (kullanıcı POST/PUT `sube`,
masraf POST snapshot, 2 rapor ucu, operasyon-takip listesine `sube`),
`client/src/pages/Odemeler.tsx` (şube Select + liste kolonu),
`client/src/pages/portal/OperasyonTakipSayfasi.tsx` (şube gruplama),
`client/src/pages/portal/SubeRaporuSayfasi.tsx` (yeni),
`client/src/pages/portal/PortalSidebar.tsx` + `PortalApp.tsx` (menü + rota).

**Kapsam dışı:** beyanname şube filtresi (Karar 1) · şube başına ortak kasa
(bugün 1 şube = 1 kullanıcı) · ana panel Giderler/Dashboard entegrasyonu (sonraki
tur) · şube CRUD yönetim ekranı (sabit liste yeterli) · avanslara şube · operasyon
kullanıcısının masraf başına şube seçebilmesi · geçmiş veri geri-doldurma
(geçmiş yok) · şube bazlı yetkilendirme/izolasyon.

## 11. Doğrulama

- `npm run check` temiz; `npm run build` temiz.
- **DEV DB izolasyonu:** her yazma testinden önce `.env` hedefi doğrulanır
  (dev Neon), aksi hâlde durulur. Paralel oturum `.env`'i canlı prod tüneline
  çevirebiliyor.
- `db:push` **eklemeli** (2 kolon) — silme sorusu çıkmamalı. Canlıda kolonlar
  deploy sonrası ELLE doğrulanır (yeşil ≠ migration uygulandı).
- Uç duman testi: rol=operasyon + şube ile kullanıcı oluştur → GET'te `sube`
  görünür; PUT ile şube değiştir → kalıcı (sessiz düşme yok); rol temsilciye
  çevrilince `sube` null.
- Masraf snapshot: operasyon masraf ekler → satırda `sube` = kullanıcının şubesi;
  admin kullanıcının şubesini değiştirir → ESKİ masrafın `sube`'si DEĞİŞMEZ.
- Rapor: iki farklı şubede masraf → kırılım doğru gruplar/toplar; tarih aralığı
  dışı kayıt raporda yok; `sube`/`masrafTuru` null kayıtlar "Şube atanmamış" /
  "Belirtilmemiş" altında ve genel toplama dahil.
- Playwright: admin formunda şube Select yalnız operasyon rolünde görünür;
  Şube Masraf ekranı şube başlıkları altında gruplu; Şube Raporu sekmesi kırılım
  gösterir + Excel 200 döner.
- Test verileri dev DB'den temizlenir.
