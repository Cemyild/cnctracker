# Tahsilat Aksiyon Merkezi — Tasarım

**Tarih:** 2026-07-02
**Durum:** Onaylandı (Yaklaşım A)

## 1. Problem ve Amaç

Mevcut Tahsilat Özet sekmesi veri gösteriyor ama karar verdirmiyor. Kullanıcının asıl sorusu:
**"Nakitim kimde donmuş, önce kimin kapısını çalayım?"**

Kullanıcının sözlü kuralları:
- Borcu olan ama **ödeyen ve kazandıran** firma sorun değildir → dokunma.
- **Ayda 1-2 küçük iş yapan, kazandırmayan ve ödemeyen** firma nakit tuzağıdır → hedef liste.
- Firma bazında gerçek gider verisi yoktur (hizmet sektörü, genel gider) → kâr tahsisi (oran orantı)
  YAPILMAZ; "kazandırıyor" ölçüsü **ciro + iş sıklığı**dır.

## 2. Kapsam

**Dahil:**
- Özet sekmesinin "Aksiyon Merkezi" olarak yeniden tasarımı (TahsilatOzet.tsx yeniden yazılır).
- Dashboard API'sine yeni sinyaller (ödeme oranı, YTD ciro, işlem sıklığı, önceki mizan deltaları, segment, neden cümlesi) — **mevcut alanlar aynen korunur (additive değişiklik)**.
- Müşteriler sekmesine yeni kolonlar (ödeme %, işlem/ay, segment, değişim).
- `tahsilat_ayarlari`'na 2 yeni eşik + Ayarlar UI'ına 2 alan.

**Hariç (dokunulmaz):**
- Mizan yükleme akışı (MizanYukleModal, upload/save endpoint'leri, parser).
- Trend, Eşleştirme, Arşiv sekmeleri.
- Mevcut `riskProfili` pattern mantığı (YAVAS_ODEYICI vb. rozetler çalışmaya devam eder).
- Para birimi işleme (USD satırlar mevcut davranışla aynen işlenir).

## 3. Firma Başına Sinyaller

Her mizan anlık görüntüsü için, firma başına:

| Sinyal | Kaynak | Hesap | Yeni? |
|---|---|---|---|
| Net bakiye | mizan | mevcut `netBakiye()` | hayır |
| **Ödeme oranı** | mizan | `alacak ÷ borc` (yıl içi ödenen ÷ faturalanan); `borc = 0` ise `null` | evet |
| Gecikme (gün) | mizan | mizan tarihi − son alacak tarihi (`gecikme()`) | hayır |
| İş aktivitesi açığı | mizan | son borç − son alacak (`isAktivitesiAcigi()`) | hayır |
| **YTD ciro (KDV hariç)** | gümrük | `SUM(mal_bedeli)`, 1 Ocak → mizan tarihi, eşleşen ünvanlar toplamı | evet |
| **İşlem sıklığı** | gümrük | YTD fatura adedi ÷ geçen ay sayısı (mizan tarihine kadar) | evet |
| **Borç değişimi** | önceki mizan | `netBakiye(t) − netBakiye(t−1)` | evet |
| **Dönem ödemesi** | önceki mizan | `alacak(t) − alacak(t−1)` — iki mizan arasında fiilen ödenen | evet |
| **Dönem faturası** | önceki mizan | `borc(t) − borc(t−1)` | evet |

- "Önceki mizan": aynı yıl içinde, mizan tarihinden küçük en yakın tarihli yükleme.
  Farklı yıldansa delta alanları `null` (mizan yıl başında sıfırlanır; dosyalarda DEVİR=0 doğrulandı).
- Gümrük eşleşmesi olmayan firma: ciro yerine mizan `borc` toplamı hacim göstergesi olarak
  kullanılır ve firma **"eşleşmemiş" rozeti** alır (UI'da görünür, segment yine hesaplanır).

## 4. Segment Kuralları

İki eksen, eşikler `tahsilat_ayarlari`'ndan:

- **Kazandırıyor** = YTD ciro ≥ `ciroEsik` (yeni ayar, varsayılan **500.000 TL**).
  Eşleşmemiş firmada YTD ciro yerine mizan `borc` toplamına bakılır.
- **Ödüyor** = ödeme oranı ≥ `odemeOraniEsik` (yeni ayar, varsayılan **%60**)
  **VE** gecikme ≤ `eskiOdemeEsik` (mevcut ayar, 30 gün).
  Ödeme oranı `null` ise (borc=0) yalnız gecikme koşuluna bakılır.
- Net bakiye ≤ 0 → otomatik SAGLIKLI (tahsilat konusu değil).

| Segment | Koşul | Renk |
|---|---|---|
| `SAGLIKLI` | bakiye ≤ 0 VEYA (kazandırıyor + ödüyor) | 🟢 yeşil |
| `BUYUK_RISK` | kazandırıyor + ödemiyor | 🟠 turuncu |
| `KUCUK_NOTR` | kazandırmıyor + ödüyor | ⚪ gri |
| `NAKIT_TUZAGI` | kazandırmıyor + ödemiyor (+ bakiye > 0) | 🔴 kırmızı |

**Neden cümlesi:** her firma için saf fonksiyonla üretilen düz Türkçe gerekçe, `" · "` ile
birleşik parçalar. Örnek: *"5 aydır ödeme yok · ödeme oranı %8 · yılda 3 iş · borç büyüyor ▲ 120K"*.
Parça kuralları: hiç ödeme yoksa "hiç ödeme yapmamış"; gecikme ≥ 30 gün ise "X aydır/gündür ödeme yok";
ödeme oranı < eşik ise "ödeme oranı %X"; iş sıklığı düşükse "yılda N iş"; delta pozitifse
"borç büyüyor ▲ X"; eşleşmemişse "gümrük eşleşmesi yok".

## 5. Ekran Kurgusu

### Özet sekmesi (yeniden tasarım)

1. **Üst şerit — 4 KPI kartı** (Dashboard görsel sistemindeki accent-bar stil):
   - Dışarıdaki nakit (net borçlu firmaların bakiye toplamı)
   - Nakit tuzağındaki tutar (🔴 segment toplamı)
   - Büyük riskteki tutar (🟠 segment toplamı)
   - Önceki mizana göre değişim ▲▼ (toplam net alacak farkı; önceki yoksa "—")
2. **Orta — segment matrisi:** 2×2 kutu; her kutuda firma sayısı + toplam borç.
   Kutuya tıklama alttaki listeyi o segmente filtreler (state client-side).
3. **Alt — "Aranacaklar" tablosu:** varsayılan filtre 🔴+🟠, borç tutarına göre azalan.
   Kolonlar: Firma · Borç · Ödeme oranı · Son ödeme (kaç gün önce) · Yılda iş ·
   Değişim ▲▼ · Neden. Satıra tıklayınca mevcut `MusteriDrillDown` detayı açılır.

### Müşteriler sekmesi

Mevcut tabloya eklenen kolonlar: Ödeme % · İşlem/ay · Segment rozeti · Değişim ▲▼.
Mevcut kolonlar ve `riskProfili` rozetleri korunur.

## 6. Teknik Değişiklikler

### shared/tahsilatHesaplari.ts (ek, mevcut fonksiyonlar değişmez)
- `odemeOrani(borc, alacak): number | null`
- `firmaSegmenti(p): TahsilatSegment` — `"SAGLIKLI" | "BUYUK_RISK" | "KUCUK_NOTR" | "NAKIT_TUZAGI"`
- `nedenCumlesi(p): string`
- `SEGMENT_LABEL`, `SEGMENT_COLOR` sabitleri

### server/storage.ts
- `getGumrukFirmaFaturaAggregate`: mevcut `son90`/`yillik` (top_fatura_tutar, KDV dahil,
  kayan pencere) **aynen kalır** — VIP rozeti ve bakiye-fatura açığı bunlara kalibre.
  Aynı sorguya ek kolonlar: `ytdCiro` (`SUM(mal_bedeli)`, yıl başı → refTarih) ve
  `ytdIslemSayisi` (`COUNT(*)`, aynı pencere). Dönüş tipi genişletilir.
- Önceki mizan bakiyeleri: mevcut `getMizanYuklemeleri()` + `getEnSonBakiyelerByMizan(prevId)`
  ile iki sorgu + Map join (N+1 yok). Yeni storage metodu gerekmez; gerekirse
  `getOncekiMizan(mizanTarihi, yil)` helper'ı eklenebilir.

### server/routes.ts — `/api/tahsilat/dashboard`
- Yanıta firma başına ek alanlar: `odemeOrani`, `ytdCiro`, `islemAyOrt`, `ytdIslemSayisi`,
  `segment`, `neden`, `eslesmemis`, `delta: { netBakiye, donemOdeme, donemFatura } | null`.
- `ozet`'e ek: `nakitTuzagiSayisi/Toplam`, `buyukRiskSayisi/Toplam`, `oncekiMizanTarihi`,
  `toplamNetAlacakDelta`, `segmentDagilim`.
- Mevcut alanların hiçbiri kaldırılmaz/yeniden adlandırılmaz.

### shared/schema.ts + db:push
- `tahsilat_ayarlari`'na: `ciroEsik` → `decimal("ciro_esik", 18,2)` default `"500000"`,
  `odemeOraniEsik` → `integer("odeme_orani_esik")` default `60`.
  (FK kuralı gereği kolon adları explicit snake_case string.)

### client
- `TahsilatOzet.tsx`: yeniden yazım (KPI şeridi + matris + Aranacaklar).
- `MusteriListesi.tsx`: yeni kolonlar (additive).
- `RiskEsikleriModal.tsx` (mevcut ayarlar penceresi): 2 yeni alan.

## 7. Kenar Durumlar

- `borc = 0` → ödeme oranı `null`; UI'da "—" gösterilir; segment yalnız gecikmeyle.
- `alacak = 0`, `borc > 0` → ödeme oranı %0, neden: "hiç ödeme yapmamış".
- Önceki mizan yok veya farklı yıldan → `delta = null`, KPI'da "—".
- Aynı firmanın önceki mizanda satırı yoksa → o firma için `delta = null`.
- Geçen ay sayısı: mizan tarihinin ay numarası (örn. 02.07.2026 → 7 ay; kesirli
  hassasiyet gereksiz). İşlem/ay = ytdIslemSayisi ÷ ayNo.
- Gümrükte birden çok ünvana eşleşen müşteri: ciro ve işlem adedi ünvanlar üzerinden toplanır
  (mevcut `gumrukFirmaUnvanlari` döngüsüyle aynı desen).

## 8. Doğrulama

- `npm run check` (tek kalite kapısı; test runner yok).
- Manuel: dev server'da `mizan 08022026.xlsx` ve `MİZAN 02072026.xlsx` yüklenir;
  - SUMİRİKO (borc 14,6M / alacak 12,39M) → ödeme oranı ≈ %85 beklenir;
  - Şubat→Temmuz deltaları dolu, farklı yıl senaryosunda `null`;
  - "hiç ödeme yapmamış" firmalar (ALACAK=0) Aranacaklar'ın üstünde;
  - Mevcut sekmeler (Trend/Eşleştirme/Arşiv) regresyonsuz.

## 9. Riskler

- Dashboard yanıt şekli değişikliği → additive tutularak sıfırlanır; TS tipleri iki tarafta güncellenir.
- `to_date` tabanlı SQL pencereleri mevcut sorguda kanıtlanmış desen; YTD kolonları aynı deseni kullanır.
- Eşik varsayılanları (500K / %60) ilk kullanımda kaba kalabilir → Ayarlar'dan düzeltilebilir; kural motoru kodda sabitlenmez.
