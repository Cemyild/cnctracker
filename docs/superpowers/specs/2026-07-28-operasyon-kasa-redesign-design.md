# Operasyon Kasa Ekranları — UI Redesign Tasarımı

**Tarih:** 2026-07-28
**Durum:** Onaylandı (mockup v6, kullanıcı onayı)
**Tür:** Görsel redesign (yalnız istemci sunumu + küçük bir özet-verisi eklentisi). Veri modeli, iş kuralları ve mevcut işlevler DEĞİŞMEZ.

## 1. İhtiyaç

Operasyon Kasası'nın üç ekranı (Kasam, Kapanışlarım, muhasebe Şube Masraf) ham/temel shadcn görünümünde: düz kartlar, hizasız gri tablolar, zayıf tipografi. Kullanıcı "profesyonel finans dashboard" seviyesi istiyor (referans: Expensely / Savexa tarzı SaaS panelleri). Mockup iterasyonuyla (v1→v6, visual companion) tasarım dili oturtuldu ve onaylandı.

**Kapsam:** Yalnız **3 operasyon kasa ekranı**. Diğer portal ekranları (Talepler, Firmalar, Doğrudan Ödeme…) ve ana uygulama bu iş kapsamı DIŞINDA — beğenilirse aynı dil sonra yayılır.

## 2. Tasarım dili (üç ekranda ortak)

**Renk — disiplin kuralı:** Tek accent ailesi + zengin nötr. "Gökkuşağı" yok.
- Accent: indigo `#4f46e5` (+ tonları `#3730a3`, `#818cf8`, `#c7d2fe`).
- Nötr: ink `#101828`, sub `#475467`, faint `#98a1b0`, line `#eaecf0`, bg `#f9fafb`, card `#fff`.
- Semantik: pozitif/gelen `#12b76a` (yeşil), negatif/masraf `#f04438` (kırmızı) — YALNIZ tutar/yön için.
- **Rejim renkleri** (anlamlı kategori kodu): İthalat=indigo `#4f46e5`, İhracat=teal `#0d9488`, Transit=mor `#7c3aed`, Ofis=turuncu `#c4600a` (beyannamesiz olduğu için kasıtlı istisna). Her biri soft-bg + koyu-text rozet.
- **Grafik YOK.** Operasyon/şube kullanıcıları veri girip gün kapatır, analiz etmez (kullanıcı kararı). Trend/donut kaldırıldı.

**Tipografi:** Inter. Sayılar `font-variant-numeric: tabular-nums` (hizalı). Hiyerarşi: KPI değer ~25px/700, başlık 20px/700, kart başlık 14–15px/600, label 12.5px/500 (sub), alt 11px/400 (faint). Sıkı `letter-spacing` (-.02em) büyük sayı/başlıklarda.

**Spacing & yüzey:** Kart `border-radius:14px`, `padding:16–18px`, ince kenarlık (line) + yumuşak gölge `0 1px 2px rgba(16,24,40,.05)`. Kartlar arası `gap:16px`. Bol iç nefes.

## 3. Ortak bileşenler

### 3.1 Başlık şeridi (header)
- Sol: ekran adı ("Kasam") + alt satır bağlam (şube adı, ör. "İstanbul – İHL şubesi").
- Sağ: **sabit gün kutusu** — takvim ikonu + `23 Temmuz 2026` + alt `Çarşamba · bugün açık`; yanında kullanıcı avatarı (baş-harf, soft-indigo daire). Gün bilgisi **her zaman** görünür (kullanıcı isteği).

### 3.2 KPI kartları (4 adet)
İkon kutusu (soft-indigo, 38px) + label + büyük tabular değer + alt-bilgi çipi. Etiketler:
1. **Güncel Bakiye** — türetilmiş kasa bakiyesi; çip "devrediyor".
2. **Gelen Avans** (eski "Açık Avans") — açık avans toplamı; değer yeşil.
3. **Güncel Masraflar** (eski "Açık Masraf") — açık masraf toplamı; değer kırmızı; çip "N dosya/kalem".
4. **Son Devir** (eski "Kapanan Gün") — ÖZEL kart: `kapanan gün → devir günü` (iki tarih + ok) + **devreden tutar** (son kapanışın kapanış bakiyesi = bugünün açılışı) + alt "önceki gün açılışı".

### 3.3 Aksiyon barı (Kasam'a özel; Şube Masraf/Kapanışlarım'da farklı — §4)
KPI'ların altında, listenin üstünde: **+ Yeni Ödeme Kaydet** (primary indigo buton, artı ikon) solda · **Günü Kapat** (ghost/outline buton, kilit ikon) sağda.

### 3.4 Masraf tablosu (gruplu, genişleyen)
Gerçek sütunlu tablo — başlık satırı ile grup satırı **aynı grid şablonu** (hizalama için):

| Sütun | İçerik |
|---|---|
| Tarih | grubun en erken masraf tarihi (dd/mm, tabular, bold) |
| Dosya No | `beyanname.dosyaNo` (transit/ofis → "—") |
| Tür | rejim rozeti: İthalat/İhracat/Transit/Ofis (renk-kodlu) |
| Beyanname No | `beyanname.beyanNo` tam (tabular); transit → kısmi no; ofis → "beyannamesiz" |
| Firma | baş-harf avatar (rejim rengi) + `beyanname.alici` (truncate, `title` ile tam) |
| Tutar | grup toplamı (kırmızı, tabular) + çok kalemli ise **kalem-sayısı rozeti** (ör. ³) |
| (chevron) | grup açık/kapalı oku |

**Genişleme:** Bir beyannamede birden çok masraf varsa grup satırı tıklanınca alt kalemler açılır. Alt kalem satırı **ana grid'e hizalı**: Tarih(sütun 1) · masraf türü(Tür sütunu, 3) · tutar(Tutar sütunu, 6) · **belge indirme ikon-butonu**(en sağ, 7). Belge yoksa buton yok. Belge bir **ikon buton** (indir simgesi), yazı link değil.

**Ofis grubu:** beyannamesiz masraflar tek grupta ("Ofis" rejim rozeti, "beyannamesiz" beyan-no).

Altta küçük **lejant:** İthalat=IM · İhracat=EX · Transit=TR/serbest · Ofis=beyannamesiz.

## 4. Ekran-özel farklar

Üçü de aynı tasarım dilini (§2–§3) ve ortak masraf tablosunu kullanır. Farklar:

- **Kasam** (rol: operasyon) — §3'ün tamamı: header + **4 KPI** + aksiyon barı (Yeni Ödeme + Günü Kapat) + **Açık Hareketler** (gelen avanslar bloğu + gruplu masraf tablosu). Alt masraflarda "Kaldır" mevcut işlev korunur.
- **Kapanışlarım** (rol: operasyon) — header + **Kapanmış Günler** (KPI ve aksiyon barı YOK — bu ekran salt kapanış geçmişi): katlanır gün başlıkları (Açılış/Avans/Masraf/Kapanış özeti), açılınca aynı gruplu tablo (varsayılan AÇIK — mevcut kural). "Geri Aç" YOK (o muhasebede).
- **Şube Masraf** (rol: muhasebe) — şube listesi/seçimi + seçili şubenin **Detay** kartı: seçili şubenin **4 KPI'ı** (Kasam ile aynı set, o şubeye ait) + Açık Hareketler (aynı tablo) + Kapanmış Günler (katlanır). **Avans Yükle** (tarih seçicili) ve **Geri Aç** butonları korunur. Muhasebe **açık avansı silebilir** (mevcut "Kaldır"; kapanmış avans kilitli). Bu ekranda "Günü Kapat" YOK (gün kapatmayı operasyon yapar).

Mevcut varsayılan aç/kapa kuralları KORUNUR: Açık Hareketler grupları varsayılan kapalı; Kapanmış gün içi gruplar varsayılan açık ([[project_operasyon_kasasi]] "ters varsayılan" notu).

## 5. Etiket değişiklikleri (üç ekranda tutarlı)

| Eski | Yeni |
|---|---|
| Açık Avans | **Gelen Avans** |
| Açık Masraf | **Güncel Masraflar** |
| Kapanan Gün / (yok) | **Son Devir** (kapanan→devir gün + devreden tutar) |

Avans satırındaki mevcut "Gelen Avans · dd/mm" metni bu dille uyumlu.

## 6. Backend etkisi (minimum)

- **Son Devir kartı** için: Kasam özet endpoint'i (`/api/portal/operasyon/ozet`) şu an son kapanışı döndürmüyor. Eklenecek alan: en son kapanan günün `{gunTarihi, kapanisBakiye, sonrakiGun}` özeti (tek ek sorgu — `getKapanislar`'ın ilk kaydı ya da hafif bir `getSonKapanis`). Muhasebe Şube Masraf detay endpoint'i kapanışları zaten döndürüyor (türetilebilir).
- **Rejim etiketi** (İthalat/İhracat/Transit): `beyanname.rejim` (IM/EX/TR/AN) zaten var; istemcide eşlenir (IM→İthalat, EX→İhracat, TR→Transit, AN→Antrepo). Yeni alan YOK.
- Başka backend/şema değişikliği YOK.

## 7. Korunacak işlevsellik (kritik — [[feedback_preserve_functionality]])

Redesign yalnız sunum katmanıdır. Şunlar birebir korunur: gruplama (`masraflariGrupla`), gün kapanış/devir mantığı, avans yükleme (tarih seçici), avans/masraf silme yetkileri (operasyon masraf; muhasebe açık avans), Geri Aç, belge linkleri, TR/ofis/rejim ayrımı, tarih formatı (YYYY-MM-DD → dd/mm, `new Date` PARSE YOK), 10sn polling, iki-katman auth. Grid `min-w-0` taşma kuralları korunur.

## 8. Kapsam dışı

Diğer portal ekranları · ana uygulama · yeni grafik/analitik · yeni veri alanı (Son Devir özeti hariç) · masraf türü tablosu değişikliği · mobil-özel yeniden düzen (responsive korunur ama ayrı optimize edilmez) · "küçük dokunuşlar" (kullanıcı sonraya bıraktı).

## 9. Doğrulama

- Üç ekran da aynı tasarım dilini üretir; renk paleti tek accent + nötr + rejim/semantik (gökkuşağı yok).
- `npm run check` temiz.
- Her ekranda mevcut işlevler çalışır: masraf ekle/sil, avans yükle/sil, gün kapat, geri aç, grup aç/kapa, belge indir.
- Tablo hizalaması: başlık, grup satırı ve açılan alt kalemler aynı sütun ızgarasına oturur (kayma yok).
- "Son Devir" kartı gerçek son kapanış verisiyle doğru tarih/tutar gösterir; kapanış yoksa boş/"—" durumu.
- Etiketler üç ekranda tutarlı: Gelen Avans / Güncel Masraflar / Son Devir.
- Tarih gösterimi `new Date` parse etmeden dd/mm ([[project_operasyon_kasasi]]).
