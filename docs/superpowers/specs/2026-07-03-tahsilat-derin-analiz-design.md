# Tahsilat Derin Analiz (Rapor + Ritim + Yaşlandırma) — Tasarım

**Tarih:** 2026-07-03
**Durum:** Onaylandı (kullanıcı: "1'i ekle, sonra 2, sonra da 3")
**Ön koşul:** Kullanıcı mizanları HAFTALIK indiriyor ve geçmiş haftalar için de geriye dönük yüklüyor.

## Amaç

Aksiyon Merkezi tek mizanlık fotoğrafı okumayı çözdü. Haftalık mizan serisiyle üç zaman
ufku eklenir: geçen hafta ne oldu (Rapor), davranış bozuluyor mu (Ritim Alarmı),
para ne kadar süredir dönmüyor (Yaşlandırma).

## 1. Haftalık Değişim Raporu

Dashboard yanıtına additive `rapor` alanı (önceki aynı-yıl mizan yoksa `null`):

```
rapor: {
  oncekiMizanTarihi, gunSayisi,               // dönem uzunluğu
  toplamTahsilatTL/Usd,                        // Σ max(0, donemOdeme), döviz ayrımlı
  toplamYeniFaturaTL/Usd,                      // Σ max(0, donemFatura)
  netDegisimTL,                                // = toplamNetAlacakDelta
  enCokOdeyen: ilk 5 (donemOdeme desc, >0),    // {musteriId, ad, doviz, tutar}
  borcuBuyuyen: ilk 5 (deltaNetBakiye desc, >0),
  hicOdemeyen: { sayi, toplamTL, ilk10 },      // netBakiye>0 && donemOdeme===0
  bozulanlar / duzelenler,                     // segment geçişleri {ad, eski, yeni, netBakiye}
}
```

**Önceki segment yaklaşıklığı:** önceki mizanın oran/gecikme/bakiyesi + **şimdiki**
`kazandiriyor` değeri ile `firmaSegmenti` çalıştırılır (ciro yıl içinde yavaş değişir;
haftalık pencerede değer ekseni sabit kabul edilir — spec'e bilinçli yaklaşıklık olarak
kaydedildi). Kötüleşme sırası: SAGLIKLI(0) < KUCUK_NOTR(1) < BUYUK_RISK(2) < NAKIT_TUZAGI(3).

**UI:** Yeni "Rapor" sekmesi (Özet ile Müşteriler arası). Başlıkta dönem
(`11/05 → 02/07 · 52 gün`), 4 mini KPI (Tahsilat, Yeni Fatura, Net Değişim,
Tahsilat/Fatura %), iki kolon liste (En Çok Ödeyen 5 | Borcu Büyüyen 5),
Hiç Ödemeyenler tablosu (ilk 10 + toplam sayı/tutar), Bozulanlar/Düzelenler
(eski→yeni segment pill'leri). Önceki mizan yoksa boş durum mesajı.

## 2. Ödeme Ritmi + Bozulma Alarmı

**Veri:** Yılın tüm mizan bakiye satırları tek sorguyla
(`getMizanBakiyeSerisiByYil`): mizan_bakiye ⋈ mizan_yuklemeleri, mizanTarihi asc.
Firma başına `sonAlacakTarihi` serisindeki **farklı değerler = gerçek ödeme tarihleri**
(kesin gün; haftalık snapshot arası birden çok ödeme son tarihe indirgenir — kabul).

**Saf fonksiyon** (`shared/tahsilatHesaplari.ts`):
```
odemeRitmi(odemeTarihleri: string[], refTarih: string):
  { ortalamaAralik: number | null; sonOdemeGun: number; alarm: boolean }
```
- `ortalamaAralik`: ardışık ödeme tarihleri arası gün ortalaması; **≥3 farklı ödeme**
  yoksa `null` (ritim öğrenilmemiş).
- `alarm`: `ortalamaAralik !== null && sonOdemeGun > 2 × ortalamaAralik && sonOdemeGun > 14`
  (taban 14 gün — haftalık ödeyen firmada tek hafta gecikme alarm üretmesin).

**Endpoint:** `GET /api/tahsilat/analiz` → en yeni (veya `?mizanId=`) mizanın yılı için:
```
{ mizanTarihi, alarmlar: [{ musteriId, ad, hesapKodu, doviz, netBakiye,
   ortalamaAralik, sonOdemeGun, odemeSayisi }] }   // yalnız netBakiye>0, alarm=true
```

**UI:** Trend sekmesi genişler — mevcut toplam eğrilerin altına "🔔 Ritmi Bozulanlar"
tablosu (Firma, Ort. aralık "9 günde bir", Son ödeme "25g önce", Ödeme sayısı, Bakiye);
satır tıklaması `MusteriDrillDown` açar. Alarm yoksa/veri azsa açıklayıcı boş durum.

## 3. Dönmeyen Nakit Yaşlandırması

**Karar:** Yaş = mizandaki kesin `gecikme` (son ödeme tarihinden bugüne gün) —
seri gerekmez, ilk mizandan itibaren çalışır. ("Bakiye hiç azalmadı" serisel incelik
YAGNI — gecikme klasik alacak yaşlandırması ile aynı bilgiyi verir.)

Dashboard `ozet`'e additive alan:
```
yasDagilimi: [{ aralik: "0-30" | "31-60" | "61-90" | "90+",
                tl, usd, sayi }]        // yalnız netBakiye>0; gecikme 9999 → "90+"
```

**UI:** Özet sekmesinde KPI şeridi ile segment matrisi arasına yatay **stacked bar**
(yeşil→kırmızı), üstünde başlık "Dışarıdaki nakit ne kadar süredir dönmüyor?";
her dilimde tutar (₺, kısa format) + altında lejant (aralık · firma sayısı · +$ eki).
Dilim genişliği TL tutar oranı; USD tutarlar lejantta ayrı gösterilir, bara karışmaz.

## Teknik yerleşim

- `shared/tahsilatHesaplari.ts`: `odemeRitmi` (+ gerekirse yaş bucket helper'ı) — saf, iki taraf kullanır.
- `server/storage.ts`: `getMizanBakiyeSerisiByYil(yil): Promise<(MizanBakiye & { mizanTarihi: string })[]>`.
- `server/routes.ts`: dashboard'a `rapor` + `ozet.yasDagilimi` (additive); yeni `GET /api/tahsilat/analiz`.
- client: `HaftalikRapor.tsx` (yeni), `TahsilatOzet.tsx` (yaş barı), `TahsilatTrend.tsx` (alarm listesi), `Tahsilat.tsx` (Rapor sekmesi).

## Kenar durumlar

- Önceki aynı-yıl mizan yok → `rapor: null`, UI boş durum. Delta zaten `null`.
- Ödeme sayısı < 3 → ritim `null`, alarm asla üretilmez; alarm listesi bu firmaları saymaz.
- `donemOdeme` negatifse (düzeltme/iade kaydı) tahsilat toplamına katılmaz (`max(0,…)`).
- USD hesaplar: rapor toplamlarında ayrı alan; listelerde `doviz` ile $ formatı; yaş barında lejant.
- Geçmiş haftalık mizanlar geriye dönük yüklendikçe rapor/ritim kendiliğinden güçlenir — kod değişikliği gerekmez.

## Doğrulama

`npm run check` + dev server'da: rapor alanı iki ardışık mizanla dolu; SUMİRİKO
dönem ödemesi raporda "En Çok Ödeyen" listesinde; analiz endpoint'i ≥3 ödemeli
firmalarda ortalamaAralik üretiyor; yasDagilimi toplamı = TL dışarıdaki nakit.
