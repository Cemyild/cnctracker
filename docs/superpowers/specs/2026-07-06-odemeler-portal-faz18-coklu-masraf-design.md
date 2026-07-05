# Ödemeler Portalı Faz 1.8 — Yeni Talep Sayfasında Çoklu Masraf Girişi

**Tarih:** 2026-07-06
**Durum:** Onaylandı (yaklaşım A + 3 tasarım bölümü kullanıcı onaylı)
**Önkoşul:** Faz 1.7 canlıda (kayıtlı ödeme şirketleri + alan-kurallı konşimento analizi).

## 1. Sorun

Bir gümrük dosyası için genellikle birden fazla ödeme çıkar (ardiye + tahmil-tahliye +
depo teminatı…). Bugünkü Yeni Talep formu tek gönderimde tek masraf alır; temsilci
aynı dosyayı her masraf için baştan seçip formu yeniden doldurur.

## 2. Kararlar (kullanıcıyla netleştirildi)

1. **Muhasebe yapısı:** Kalemler muhasebeye bugünkü gibi **ayrı talep satırları**
   olarak düşer. Grup kavramı/etiketi YOK; veri modeli ve muhasebe ekranları
   değişmez. (Farklı alacaklılara ayrı ödemeler yapıldığı için doğal akış.)
2. **Depo kapsamı:** Listeye hem normal masraf hem **depo teminatı** kalemi
   eklenebilir. Depo kalemi eklenirken konşimento yükleme + AI analizi + onay
   akışı bugünkü gibi çalışır; onaylanmadan kalem eklenemez.
3. **Belgeler:** Her kalemin **kendi belgeleri** olur — kalem formundaki dosya
   seçimi o kalemle birlikte listeye girer ve o taleple gönderilir.
4. **Teknik yaklaşım (A):** Backend değişikliği YOK. Kalemler istemci state'inde
   birikir; Gönder'de mevcut `POST /api/portal/talepler` ucuna **sırayla** N istek
   atılır. (Toplu uç alternatifi reddedildi: dosya yazımları nedeniyle gerçek
   atomiklik zaten yok, multer'da dinamik alan adları karmaşık, doğrulama kopyası
   çıkar; kalemler iş açısından zaten bağımsız.)

## 3. Sayfa Yapısı (`client/src/pages/portal/YeniTalepSayfasi.tsx`)

Üç blok:

**Üst — sabit dosya:** Mevcut "Dosya yok" kutusu + beyanname arama/seçim + özet
aynen kalır. Kalem listesi doluyken (`kalemler.length > 0`) beyanname seçimi ve
"Dosya yok" kutusu **disabled** olur; yanında not: "Dosyayı değiştirmek için önce
listedeki kalemleri kaldırın." Dosyasız modda da aynı akış çalışır (dosya sabiti =
"yok"); ödenen dosyasız kalemler bugünkü gibi tek tek eşleştirme ister.

**Orta — kalem formu:** Mevcut alanların tamamı (ödeme tipi, masraf türü,
tutar + para birimi, depo seçiliyse `KonsimentoAnalizAlani`, alacaklı + datalist
önerisi, IBAN, açıklama, belgeler). "Talebi Gönder" butonu yerine **"Ekle"**
(`button-kalem-ekle`). Ekle doğrulamaları bugünkü gönderim doğrulamalarıyla aynı,
kalem bazında:
- tutar + alacaklı zorunlu,
- masraf tipinde masraf türü zorunlu,
- depo tipinde konşimento dosyası + numarası + onay kutusu zorunlu,
- dosyasız modda açıklama zorunlu (her kalemde).

Ekle başarılı olunca: kalem listeye eklenir; kalem formu sıfırlanır (dosya bloğuna
dokunulmaz); `formSayac` artar (konşimento alanı + dosya input'ları temiz remount);
`sonAlacakliOnerisi` ref'i sıfırlanır.

**Alt — kalem listesi + gönderim:** Her kalem bir satır (`row-kalem-{i}`):
tip etiketi, masraf türü, tutar + para birimi, alacaklı, belge adedi, depo ise
konşimento no, durum göstergesi. Satırda **"Kaldır"** (`button-kalem-kaldir-{i}`,
yalnız gönderilmemiş kalemlerde). Kalem düzenleme YOK — kaldır + yeniden ekle
(YAGNI; istenirse Faz 2). Liste altında: kalem sayısı + **para birimi bazında
toplamlar** + **"Tümünü Muhasebeye Gönder"** (`button-toplu-gonder`, liste boşken
disabled). Tek kalemlik işte de akış aynı: Ekle → Gönder.

### Kalem veri modeli (yalnız istemci state)

```ts
type Kalem = {
  odemeTipi: "masraf" | "depo_teminat";
  masrafTuru: string;            // masraf tipinde dolu
  tutar: string;
  paraBirimi: string;
  alacakli: string;
  iban: string;
  aciklama: string;
  belgeler: File[];              // FileList'ten kopyalanır (input remount'a dayanıklı)
  konsimento: { dosya: File; konsimentoNo: string; tasiyici: string } | null;
  durum: "bekliyor" | "gonderiliyor" | "gonderildi" | "hata";
  hataMesaji?: string;
};
```

## 4. Gönderim Mekaniği ve Kısmi Hata

Gönder'e basınca `durum !== "gonderildi"` kalemler **seri** olarak (for-await)
mevcut uca gönderilir; her kalem bugünkü FormData kurulumunun aynısıyla gider
(beyannameId yalnız dosyalı modda; konşimento alanları depo kaleminde). Satır
durumları canlı güncellenir: `gonderiliyor` → `gonderildi` ✓ / `hata` ✗ + mesaj.

- **Hepsi başarılı:** toast "N talep muhasebeye gönderildi"; liste, dosya seçimi
  ve form tamamen sıfırlanır; `/api/portal/talepler` ve
  `/api/portal/odeme-sirketleri` invalidate edilir.
- **Kısmi hata:** başarılı kalemler listede soluk + ✓ kalır (Kaldır butonu
  gizlenir, tekrar gönderilmez — çift talep imkânsız); hatalılar kırmızı + hata
  mesajıyla kalır; buton **"Kalanları Tekrar Gönder"** olur ve yalnız
  bekleyen/hatalı kalemleri dener. Invalidate kısmi durumda da yapılır (gidenler
  Taleplerim'e düşer).
- **Eklenmemiş form koruması:** kalem formunda anlamlı veri varken (tutar VEYA
  alacaklı dolu) Gönder'e basılırsa gönderim BAŞLAMAZ; toast: "Formda eklenmemiş
  kalem var — önce Ekle'ye basın ya da formu temizleyin."
- Gönderim sırasında Ekle/Kaldır/Gönder butonları disabled (yarış yok).
- Liste yalnız tarayıcı hafızasında; sayfa yenilenirse gönderilmemiş kalemler
  kaybolur (bilinçli sınır — taslak saklama Faz 2 adayı).

## 5. Kapsam Sınırı

- Değişen tek dosya: `client/src/pages/portal/YeniTalepSayfasi.tsx` (kalem listesi
  aynı dosyada küçük iç bileşen olabilir).
- Backend, muhasebe sayfaları, `DogrudanOdemeSayfasi`, `KonsimentoAnalizAlani`
  DEĞİŞMEZ. Şirket upsert'i ve öneri listesi mevcut rota üzerinden aynen çalışır.
- Mevcut testid'ler korunur; yeniler: `button-kalem-ekle`, `list-kalemler`,
  `row-kalem-{i}`, `button-kalem-kaldir-{i}`, `button-toplu-gonder`.

## 6. Doğrulama

- `npm run check` temiz.
- Playwright E2E (lokal, gerçek dev sunucu): (a) 2 masraf + 1 depo kalemi
  (ADP.pdf ile analiz+onay) ekle → listede 3 satır + doğru toplamlar → dosya
  seçiminin kilitlendiğini gör → Gönder → Taleplerim'de 3 talep; (b) Kaldır akışı
  (2 ekle, 1 kaldır, listede 1 kalır); (c) eklenmemiş-form uyarısı (form dolu +
  Gönder → uyarı toast, istek atılmaz); (d) masraf regresyonu (tek kalem
  Ekle → Gönder çalışır). Test verileri sonda temizlenir (tutar 1 kalıbı).

## 7. Hata Durumları / Kapsam Dışı

- Ağ kopması ortada: kalan kalemler `hata` durumuna düşer, "Kalanları Tekrar
  Gönder" ile devam edilir; çift gönderim durum makinesiyle engelli.
- Kalem düzenleme, taslak saklama, grup etiketi, toplu uç: kapsam dışı (Faz 2
  adayları).
- `DogrudanOdemeSayfasi` bilinçli olarak tekli kalır (muhasebe kendi ödemesini
  tek tek girer; ihtiyaç doğarsa ayrı faz).
