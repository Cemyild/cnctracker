# Yeni Ödeme Modalı: Genişlik + Ekran Uyumu + Taşma Koruması — Tasarım

**Tarih:** 2026-07-22
**Durum:** Onaylandı
**Önkoşul:** `BeyannameSecici` combobox canlıda (commit `8c03260`).

## 1. İhtiyaç

Operasyon şube kullanıcısının "Yeni Ödeme Kaydet" modalı (`client/src/pages/portal/YeniOdemeModal.tsx`)
`max-w-lg` (512px) ile kod tabanındaki **en dar** içerik modalı. Beyanname seçicinin placeholder metni
(68 karakter) tetikleyici butona sığmıyor ve kırpılıyor. Kullanıcı modalın genişletilmesini ve ekran
boyutuna uyum sağlamasını istedi.

İnceleme sırasında ikinci bir sorun çıktı: bu modal, kod tabanındaki **tek** içerik modalı ki
`max-h-[90vh] overflow-y-auto` taşımıyor. Diğerlerinin hepsinde var (`Anketler.tsx`, `Calisanlar.tsx`,
`Gumruk.tsx`, `ISO9001Anketler.tsx` …). Modal her "Ekle"de alta bir satır ekliyor (o oturumda eklenen
masraflar listesi), yani taşmaya en açık olan modal aynı zamanda korumasız olanı. Kısa ekranlı bir
dizüstünde birkaç masraf girildiğinde "Kapat" butonuna ulaşılamaz hale gelir.

## 2. Kararlar

1. **Genişlik `max-w-lg` → `max-w-2xl`** (512px → 672px). Kod tabanının en yaygın modal genişliği.
   Tetikleyicinin iç genişliği ~576px olur; 68 karakterlik metin (~476px) tek satıra sığar.
2. **`max-h-[90vh] overflow-y-auto` eklenir** — eksik olan taşma koruması. Diğer modallarla aynı kalıp.
3. **Sabit iki sütunlu form satırları `grid-cols-1 sm:grid-cols-2` olur** — 640px altında alt alta dizilir.
4. **İki `flex justify-between` satırında `min-w-0 truncate` + `shrink-0`** — uzun metnin kardeş butonu
   ekran dışına itmesi engellenir.
5. **Salt görsel.** Veri, doğrulama, kayıt akışı, `BeyannameSecici` ve diğer üç tüketici ekran değişmez.
   Backend/şema/uç yok.

## 3. Değişiklikler

Tek dosya: `client/src/pages/portal/YeniOdemeModal.tsx`.

| # | Konum | Bugün | Olacak |
|---|---|---|---|
| A | `DialogContent` (satır 108) | `max-w-lg` | `max-w-2xl max-h-[90vh] overflow-y-auto` |
| B | Tutar / Kime Ödendi satırı (141) | `grid grid-cols-2 gap-3` | `grid grid-cols-1 sm:grid-cols-2 gap-3` |
| C | IBAN / Belge satırı (149) | `grid grid-cols-2 gap-3` | `grid grid-cols-1 sm:grid-cols-2 gap-3` |
| D | Sabitlenmiş beyanname çubuğu (127-134) | metin `<div className="text-sm">`, buton çıplak | metne `min-w-0 truncate`, butona `shrink-0` |
| E | Eklenenler listesi satırı (163-169) | sol `<span>` çıplak, sağ `<span className="flex …">` | sol `<span>`'e `min-w-0 truncate`, sağ `<span>`'e `shrink-0` |

**D ve E'nin gerekçesi:** `flex justify-between` içindeki öğelerin `min-width` değeri varsayılan olarak
`auto`'dur — yani içeriğinden dar olamazlar ve uzun metin kardeşini dışarı iter. `min-w-0` bu kilidi açar
ve `truncate`'i çalışır hale getirir. Aynı sayfa ailesindeki Kasam/Kapanışlarım tablolarında bu çift zaten
kullanılıyor.

## 4. Kapsam dışı

`BeyannameSecici.tsx` (placeholder metni ve panel genişliği aynen kalır) · diğer üç tüketici ekran ·
`dialog.tsx` gibi shadcn primitifleri · başka modalların genişlikleri · masraf doğrulama/kayıt mantığı ·
backend/şema/uç · yeni npm paketi.

## 5. Kabul edilen sınır

Telefon genişliğinde (≈375px) placeholder metni tetikleyicide yine kırpılır. Bilgi kaybı değil: kutuya
basınca açılan panelde metin tam görünür. Modalın birincil kullanımı şube ofisinde masaüstüdür.

## 6. Doğrulama

- `npm run check` ve `npm run build` temiz. Yalnız istemci; `db:push` YOK.
- **DEV DB izolasyonu:** tarayıcı testi yazma yapıyorsa hedef doğrulanır (dev Neon), aksi hâlde durulur.
- **Korunan testid'ler:** `checkbox-op-ofis`, `select-op-beyanname`, `button-op-beyanname-degistir`,
  `op-masraf-turu`, `input-op-tutar`, `input-op-alacakli`, `input-op-iban`, `input-op-belge`,
  `input-op-aciklama`, `button-op-kaydet`, `button-op-yeni-odeme-kapat`, `eklenen-{id}`,
  `button-eklenen-kaldir-{id}`.
- Playwright (operasyon kullanıcısı, dev DB):
  (a) Masaüstü genişliğinde (1280px) modal 672px; **placeholder metni kırpılmadan tek satırda** görünüyor.
  (b) Form satırları masaüstünde **iki sütun**; 375px genişlikte **alt alta**.
  (c) Uzun müşteri adlı bir beyanname seçilince sabit çubukta metin kırpılıyor ve **"Değiştir" butonu
      görünür kalıyor** (tıklanabilir).
  (d) Uzun alacaklı adıyla masraf eklenince listede tutar ve **"Kaldır" butonu görünür kalıyor**.
  (e) Modal içeriği ekranı aşacak kadar uzayınca (birkaç masraf eklenerek) **modal kaydırılabiliyor** ve
      "Kapat" butonuna ulaşılabiliyor.
  (f) Regresyon: beyanname seç → masraf ekle → kayıt oluştu; "Ofis Masrafı" yolu, "Değiştir" ile beyanname
      değiştirme ve "Kaldır" çalışıyor.
- Test verileri dev DB'den ve `uploads/operasyon/` içinden temizlenir.
