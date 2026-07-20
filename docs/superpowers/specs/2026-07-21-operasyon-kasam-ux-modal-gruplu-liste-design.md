# Operasyon Kasam UX: Kalıcı Beyanname Modalı + Gruplu Açık Hareketler — Tasarım

**Tarih:** 2026-07-21
**Durum:** Onaylandı (gruplama + kayıt zamanı + iki netleştirme kullanıcıyla karara bağlandı)
**Önkoşul:** Operasyon Kasası + Ofis Masrafı + Şube Atama + belge esnekliği canlıda (commit `d760936`).

## 1. İhtiyaç

Erenköy şubesinin gerçek verisi: bir gümrük dosyasına (beyanname) **birden çok masraf** düşüyor
(DOSYA ücreti + ardiye + damga…). Bugün operasyon kullanıcısı her masraf için beyannameyi **yeniden
seçmek** zorunda; temsilci tarafında ise beyanname bir kez seçilip birden çok kalem eklenebiliyor.
Ayrıca Kasam landing'i büyük bir formla açılıyor ve açık hareketler listesi masraf türü + alacaklıdan
başka bilgi göstermiyor (dosya/beyanname no yok, aynı dosyanın masrafları dağınık).

Bu, projenin amacına (Excel'den kurtulup **hızlı form girişi**) hizmet eden bir UX yenilemesidir.

## 2. Kararlar

1. **Kalıcı beyanname + anlık kayıt.** Masraf formu bir modala taşınır. Beyanname bir kez seçilir,
   sabitlenir; her "Ekle" **anında POST eder** (mevcut mimari: her masraf anlık kayıt + kendi belgesi),
   masraf alanları sıfırlanır, **beyanname sabit kalır**. "Listeye atsın" davranışı = anında kayıt.
   (Temsilcideki biriktir-sonra-gönder değil; operasyon masrafı zaten anlık.)
2. **Açık hareketler beyannameye göre gruplanır**, TEK TİP açılır grup — tek/çok masraf ayrımı YOK.
3. **Landing'den form kalkar**; yerine "Yeni Ödeme Kaydet" butonu gelir. Bakiye kartları + açık
   hareketler + Günü Kapat kalır.
4. **Yalnız istemci** değişir — backend, şema, uçlar, `db:push` HİÇ dokunulmaz.
5. Modal ayrı bir bileşene (`YeniOdemeModal.tsx`) çıkarılır (kod düzeni; işlevsellik aynı).

## 3. Landing ekranı (`OperasyonKasaSayfasi.tsx`)

- Üç bakiye kartı (Güncel Bakiye / Açık Avans / Açık Masraf) **aynen kalır** (`text-bakiye` korunur).
- Form kartı KALKAR. Yerine belirgin **"Yeni Ödeme Kaydet"** butonu (testid `button-op-yeni-odeme`)
  → `YeniOdemeModal`'ı açar.
- **Günü Kapat** butonu + dialog'u aynen kalır (`button-op-gunu-kapat`, `button-op-kapat-onay`).
- Açık Hareketler kartı gruplu hâle gelir (bkz. §5).

## 4. Yeni Ödeme modalı (`YeniOdemeModal.tsx`, yeni)

Props: `{ open: boolean; onClose: () => void }`. İçeride kendi query'lerini (`beyannameler`,
`masrafTurleri`, `odemeSirketleri`) sahiplenir; kaydettikçe `["/api/portal/operasyon/ozet"]` ve
`["/api/portal/odeme-sirketleri"]` invalidate eder (mevcut `tazele` davranışı).

**Akış:**
1. Modal açılınca üstte **beyanname seçimi**: arama kutusu (`input-op-arama`, dosya no / beyan no /
   müşteri) + Select (`select-op-beyanname`) VEYA **Ofis Masrafı** kutusu (`checkbox-op-ofis`).
   Arama ve seçenek etiketi bugünküyle aynı (`{dosyaNo} — {alici} · {beyanNo}`), `.slice(0,100)` sınırı korunur.
2. Beyanname seçilince (veya Ofis Masrafı işaretlenince) **sabitlenir**: üstte seçili beyanname
   (dosya no + müşteri) + **"Değiştir"** (testid `button-op-beyanname-degistir`) gösterilir; arama/Select gizlenir.
3. Masraf formu: Masraf Türü (`MasrafTuruSecici`, `op-masraf-turu`), Tutar (`input-op-tutar`),
   Kime Ödendi (`input-op-alacakli` + `odemeSirketleri` datalist), IBAN (`input-op-iban`),
   Belge (`input-op-belge`, etiketi türün `belgeZorunlu`'suna göre "ZORUNLU" ↔ "opsiyonel"),
   Açıklama (`input-op-aciklama`). **"Ekle"** butonu (testid `button-op-kaydet` KORUNUR).
4. **Ekle → anında POST** `/api/portal/operasyon/masraf` (mevcut FormData gönderimi birebir):
   başarıda **yalnız masraf alanları sıfırlanır** (masrafTuru, tutar, alacakli, iban, aciklama, belge +
   dosya input remount); **beyannameId / dosyaYok SABİT kalır**. Masraf, modal içi "bu oturumda
   eklenenler" listesine ve (invalidate sonrası) landing açık hareketlerine düşer.
5. **Hata (POST 400):** masraf eklenmez, toast gösterilir, **form değerleri KORUNUR** (yeniden dene),
   beyanname sabit kalır. (Dekont düzeltmesindeki "hata yolunda koru" ilkesi.)
6. **"Değiştir":** beyanname sabitlemesini açar, arama/Select'e döner. Oturum listesi (eklenenler) korunur.
7. Modal kapatma (`button-op-yeni-odeme-kapat` / overlay / ESC): tüm form + oturum listesi sıfırlanır.

**Modal içi oturum listesi:** bu modal oturumunda eklenen masraflar (id + tür + alacaklı + tutar)
kompakt gösterilir; her birinde **Kaldır** (mevcut `DELETE /api/portal/operasyon/masraf/:id`, anlık
kayıt olduğu için silme de gerçek). Bu liste yalnız kolaylık; kapsam gerçeği landing açık hareketlerdir.

**Doğrulama (istemci, sunucuyla aynı):** belgeZorunlu türde belge zorunlu; tutar + alacaklı zorunlu;
Ofis Masrafı'nda açıklama zorunlu; beyanname yoksa ve Ofis Masrafı değilse uyarı. Bugünkü `kaydet`
doğrulamaları birebir taşınır.

## 5. Açık hareketler — beyannameye göre gruplu (`OperasyonKasaSayfasi.tsx`)

Veri: masraf yalnız `beyannameId` taşır. İstemci, zaten yüklü `beyannameler`'den bir
`Map<id, Beyanname>` kurar (`getBeyannameById`); dosya no / beyan no / müşteri (alici) oradan gelir.
**Backend/uç değişmez.**

Sıra:
- **Avanslar** üstte düz yeşil satır (tarih + açıklama + dekont linki) — DEĞİŞMEZ (`row-avans-{id}`).
- **Masraflar beyannameye göre gruplanır** (`beyannameId` bazında). Her grup TEK TİP **açılır satır**
  (tek veya çok masraf fark etmez):
  - **Başlık (kapalı):** en solda açılma oku + **toplam tutar**, ardından **dosya no · beyan no ·
    firma (müşteri/alici)**. Satırın TAMAMI tıklanabilir; ok veya herhangi bir yere basınca açılır.
    testid `group-beyanname-{beyannameId}`, tıklama hedefi `button-group-toggle-{beyannameId}`.
  - **Açık (dropdown):** o beyannamenin masraf satırları — masraf türü · alacaklı · tutar · belge
    linki (varsa) · **Kaldır** (`button-masraf-kaldir-{id}` KORUNUR). İşlevsellik korunur (belge/Kaldır
    kaybolmaz — yalnız türü+tutarı değil, mevcut tüm eylemler açık satırda durur).
- **Ofis masrafları** (`dosyaYok=true`, beyanname yok) → kendi **"Ofis Masrafları"** açılır grubu; başlık
  toplam + "Ofis Masrafları"; açık satırlarda tür + açıklama + tutar + belge + Kaldır.
  testid `group-ofis`.
- Boş durumda "Açık hareket yok." mesajı korunur.

Grupların varsayılanı **kapalı**; state istemcide (`Set<string>` açık grup id'leri). Tutar
gösterimi/toplamı `formatPara` ile, `Math.round(x*100)/100` birikim güvenliğiyle.

## 6. Kapsam / Kapsam dışı

**Değişen:** `client/src/pages/portal/OperasyonKasaSayfasi.tsx` (form → buton+modal çağrısı; liste →
gruplu/açılır), `client/src/pages/portal/YeniOdemeModal.tsx` (yeni — kalıcı-beyanname masraf modalı).

**Kapsam dışı:** backend / şema / uçlar / `db:push` (hiç dokunulmaz) · temsilci ve muhasebe formları ·
Kapanışlarım / Şube Masraf / Şube Raporu ekranları · gün kapatma mantığı · avans görünümü/ekleme ·
masrafa gümrük boyutu · Excel toplu **yükleme** (kullanıcı kararı: sistem Excel'den kurtulmak için,
yalnız çıktı yönünde Excel var).

## 7. Doğrulama

- `npm run check` ve `npm run build` temiz. Yalnız istemci değiştiği için `db:push` YOK.
- **DEV DB izolasyonu:** Playwright yazma testleri öncesi hedef doğrulanır (dev Neon), aksi hâlde durulur.
- Mevcut testid'ler korunur (`text-bakiye`, `select-op-beyanname`, `input-op-arama`, `input-op-tutar`,
  `input-op-alacakli`, `input-op-iban`, `input-op-belge`, `input-op-aciklama`, `checkbox-op-ofis`,
  `op-masraf-turu`, `button-op-kaydet`, `button-op-gunu-kapat`, `button-op-kapat-onay`,
  `button-masraf-kaldir-{id}`, `row-avans-{id}`). Yeni: `button-op-yeni-odeme`,
  `button-op-beyanname-degistir`, `group-beyanname-{id}`, `button-group-toggle-{id}`, `group-ofis`.
- Playwright (operasyon kullanıcısı, dev DB):
  (a) "Yeni Ödeme Kaydet" → modal açılır; beyanname seç → sabitlenir ("Değiştir" görünür).
  (b) Aynı beyannameye **3 masraf** ekle (belge-opsiyonel türle) → her Ekle sonrası masraf alanları
      sıfır, **beyanname sabit**; modal oturum listesinde 3 satır.
  (c) Kapat → landing açık hareketlerde o beyanname için **açılır grup**, toplam = 3 masrafın toplamı;
      başlıkta dosya no + beyan no + müşteri.
  (d) Gruba tıkla → 3 masraf açılır (tür + alacaklı + tutar + Kaldır); birini **Kaldır** → grup 2'ye düşer,
      toplam güncellenir.
  (e) Ofis Masrafı ile bir masraf → "Ofis Masrafları" grubunda görünür.
  (f) beyan_no ile arama hâlâ çalışır; belgeZorunlu türde belge zorunluluğu hâlâ 400/uyarı verir.
  (g) Regresyon: Günü Kapat akışı bozulmamış; bakiye kartları doğru.
- Test verileri dev DB'den ve `uploads/operasyon/` içinden temizlenir.
