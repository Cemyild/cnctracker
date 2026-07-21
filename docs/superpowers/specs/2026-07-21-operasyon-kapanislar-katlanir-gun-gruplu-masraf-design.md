# Kapanışlarım: Katlanır Gün + Gruplu Masraf Tablosu — Tasarım

**Tarih:** 2026-07-21
**Durum:** Onaylandı (üç karar kullanıcıyla netleştirildi)
**Önkoşul:** Kasam açık hareketler tablo görünümü canlıda (commit `b3e4a0e`).

## 1. İhtiyaç

Kapanışlarım sayfası bugün her kapanış gününü **hep açık** gösteriyor ve masrafları düz liste olarak
sıralıyor (`tür · alacaklı · belge` + tutar). Dosya no / beyanname no / firma bilgisi yok, gruplama yok.
Kullanıcı Kasam'daki tablo düzeninin burada da olmasını istiyor: gün kapalı gelsin, tıklayınca o günün
masrafları Kasam formatında (sütun başlıkları + beyanname grupları) açılsın.

Ayrıca `k.avanslar` verisi API'den **zaten geliyor ama hiç render edilmiyor** — yalnız toplamı özet
satırında görünüyor.

## 2. Kararlar

1. **Gün varsayılan KAPALI.** Başlıkta tarih + "Geri Açıldı" rozeti + dört özet değer (Açılış / Avans /
   Masraf / Kapanış) kapalıyken de görünür. Satırın tamamı tıklanabilir.
2. **Açılan günde önce avanslar** (Kasam'daki yeşil blok formatı), sonra masraf tablosu. Avans detayının
   gösterilmesi yeni bir eklemedir (bugün yalnız toplam var) — mutabakat için değerli.
3. **Beyanname grupları KATLANABİLİR ama varsayılan AÇIK.** Chevron vardır, tıklanınca kapanır; sayfa
   açıldığında masraflar doğrudan görünür.
4. **Gruplama mantığı ortak yardımcıya çıkarılır** (`masrafGruplama.ts`); Kasam ve Kapanışlarım aynı
   fonksiyonu çağırır. Kasam'ın **görünümü ve davranışı değişmez** — yalnız aynı kod iki yerde durmaz.
5. Backend / uç / şema **hiç değişmez**.

## 3. Ortak gruplama yardımcısı (`client/src/pages/portal/masrafGruplama.ts`, yeni)

Kasam'daki mevcut `useMemo` içeriği buraya taşınır, davranışı birebir korunur:

```
export type MasrafGrubu = {
  beyannameId: string;
  beyanname: Beyanname | undefined;
  masraflar: OperasyonMasraf[];
  toplam: number;
};
export type GruplamaSonucu = {
  gruplar: MasrafGrubu[];
  ofisMasraflar: OperasyonMasraf[];
  ofisToplam: number;
};
export function masraflariGrupla(
  masraflar: OperasyonMasraf[],
  beyannameMap: Map<string, Beyanname>,
): GruplamaSonucu
```

Kurallar (mevcut Kasam davranışı): `dosyaYok === true` **veya** `beyannameId` boş → ofis grubuna; diğerleri
`beyannameId` bazında gruplanır; toplamlar `Math.round(x * 100) / 100`. Ekleme/çıkarma YOK.

`OperasyonKasaSayfasi.tsx` bu fonksiyonu çağıracak şekilde sadeleşir; render'ı ve testid'leri DEĞİŞMEZ.

## 4. Kapanışlarım sayfası (`OperasyonKapanislarSayfasi.tsx`)

**Veri:** mevcut `kapanislar` query'sine ek olarak `beyannameler` query'si (`["/api/portal/beyannameler"]`,
Kasam ile aynı queryKey → cache paylaşılır, ek ağ isteği yok) ve ondan `Map<id, Beyanname>`.

**Gün kartı (kapalı):**
- Tıklanabilir başlık: chevron (`ChevronRight` kapalı / `ChevronDown` açık) + `{tarih} Kapanışı` +
  "Geri Açıldı" rozeti (`durum === "geri_acildi"`).
- Dört özet değer başlıkta kalır (Açılış / Avans / Masraf / Kapanış) — mevcut grid korunur.
- testid: kart `kapanis-{id}` KORUNUR; yeni `button-kapanis-toggle-{id}`.

**Gün açıkken:**
1. **Avanslar** (`k.avanslar.length > 0` ise): "Avanslar" alt-başlığı + Kasam'daki yeşil satır formatı —
   `Avans · {tarih}{açıklama varsa ` · {açıklama}`}` + `+{tutar}` + dekont linki (varsa). Boş açıklamada
   `—` gösterilmez. testid `row-avans-{id}`.
2. **Masraf tablosu** (Kasam formatı birebir): sütun başlıkları **bir kez** (`Dosya No · Beyanname No ·
   Firma · Tutar`), altında beyanname grupları. Grup başlığı: **Dosya No (bold)** → Beyanname No → Firma
   (truncate) → Tutar → chevron. Grup satırının tamamı tıklanabilir.
   - **Varsayılan AÇIK:** durum `Set<string> kapaliGruplar` ile tutulur — sette OLMAYAN grup açıktır.
     (Kasam'daki `acikGruplar` mantığının TERSİ; oradan kopyalanmamalı.)
   - Grup açıkken masraf satırları: `{tür} · {alacaklı}` + belge linki (varsa) + `−{tutar}`.
     **Kaldır butonu YOKTUR** — kapanmış gün kilitlidir, silme uygulanamaz.
   - **Ofis Masrafları** grubu tablonun altında; satırlarda `Ofis` rozeti + açıklama (mevcut davranış).
   - testid'ler: `group-kapanis-{kapanisId}-{beyannameId}`, `button-group-toggle-{kapanisId}-{beyannameId}`,
     `group-kapanis-ofis-{kapanisId}`. (Kapanış kimliği öneke girer; aynı beyanname birden çok günde
     görünebileceğinden testid çakışması önlenir.)
3. Masraf yoksa "Masraf yok." mesajı KORUNUR.

Boş sayfada "Henüz kapanış yok." mesajı KORUNUR.

## 5. Kapsam / Kapsam dışı

**Değişen:** `client/src/pages/portal/masrafGruplama.ts` (yeni), `OperasyonKasaSayfasi.tsx` (yalnız gruplama
çağrısı yardımcıya taşınır — render/testid/davranış aynı), `OperasyonKapanislarSayfasi.tsx` (katlanır gün +
avans bloğu + gruplu masraf tablosu).

**Kapsam dışı:** backend / uç / şema · Kasam sayfasının görünümü · muhasebe Şube Masraf / Şube Raporu
ekranları · gün kapatma ve geri açma mantığı · kapanmış masrafın silinmesi (kilitli, uygulanamaz).

## 6. Doğrulama

- `npm run check` ve `npm run build` temiz. Yalnız istemci; `db:push` YOK.
- **DEV DB izolasyonu:** Playwright yazma testi öncesi hedef doğrulanır (dev Neon), aksi hâlde durulur.
- Korunan testid'ler: `kapanis-{id}`; Kasam tarafında `group-beyanname-{id}`, `button-group-toggle-{id}`,
  `group-ofis`, `row-masraf-{id}`, `button-masraf-kaldir-{id}`, `row-avans-{id}`, `text-bakiye`,
  `button-op-yeni-odeme`, `button-op-gunu-kapat`.
- Playwright (operasyon kullanıcısı, dev DB — en az 2 beyannameye masraf + 1 ofis masrafı + 1 avans içeren
  bir gün kapatılarak hazırlanır):
  (a) Kapanışlarım'da gün **kapalı** gelir; başlıkta dört özet değer + tarih görünür; masraf satırları görünmez.
  (b) Güne tıkla → açılır; avanslar yeşil blokta (boş açıklamada `—` yok), altında sütun başlıkları bir kez.
  (c) Beyanname grupları **açık gelir** (tıklamadan masraflar görünür); grup başlığında dosya no bold +
      beyan no + firma + tutar.
  (d) Bir gruba tıkla → **kapanır**; tekrar tıkla → açılır.
  (e) Açık satırlarda belge linki var, **Kaldır butonu YOK**.
  (f) Ofis Masrafları grubu görünür, `Ofis` rozetli.
  (g) Güne tekrar tıkla → gün kapanır.
  (h) **Kasam regresyonu:** Kasam açık hareketler görünümü ve davranışı bu değişiklikten sonra aynen çalışır
      (gruplar kapalı gelir, tıklayınca açılır, Kaldır çalışır) — ortak yardımcıya taşıma davranışı bozmadı.
- Test verileri dev DB'den ve `uploads/operasyon/` içinden temizlenir.
