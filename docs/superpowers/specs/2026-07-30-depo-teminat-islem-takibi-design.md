# Depo Teminatı — İşlem Bitiş Takibi (tasarım)

Tarih: 2026-07-30 · Durum: onaylandı (kullanıcı), uygulanıyor

## Problem

Depo teminatı ödendikten sonra sistem doğrudan "İade Bekleniyor" diyor ve muhasebe
istediği an "İade Alındı"ya çekiyor. Gerçekte arada bir aşama var: **teminat, gümrük
işlemi bitmeden geri istenemez.** İşlemin bittiğini yalnız temsilci bilir; muhasebe
bilmez ve bu yüzden iade talebi ya gecikir ya unutulur.

## Karar: mevcut `iadeDurumu` alanı genişletilir

Yeni tablo veya ayrı `islemDurumu` kolonu YOK — akış doğrusal olduğu için tek alan yeter:

```
ödendi → beklemede ──────────→ islem_tamam ─────────→ iade_edildi
         "İşlem Devam Ediyor"   "İade Talep           "İade Alındı"
         (sistem yazar)          Edilebilir"          (muhasebe)
                                (temsilci işaretler)
```

`beklemede` etiketi "İade Bekleniyor" → **"İşlem Devam Ediyor"** olarak yeniden
anlamlandırılır. Veri göçü gerekmez: mevcut `beklemede` satırları zaten "işlem sürüyor"
anlamındadır.

**Yeni kolonlar** (`odeme_talepleri`):
- `islem_bitis_tarihi` text YYYY-MM-DD — temsilcinin işaretlediği gün
- `islem_bitiren_id` varchar FK → portal_kullanicilar — muhasebe kime soracağını bilsin

## API

`PUT /api/portal/talepler/:id/islem-durumu` (requirePortal), gövde `{ tamamlandi: boolean }`

Guard'lar (hepsi sunucuda, istemciye güvenilmez):
- `odemeTipi !== 'depo_teminat'` → 400
- `durum !== 'odendi'` → 400 (ödenmemiş teminatın işlemi takip edilmez)
- `iadeDurumu === 'iade_edildi'` → 409 (muhasebe kapatmış, temsilci geri alamaz)
- temsilci yalnız KENDİ talebini işaretler (`talepEdenId === ben.id`); muhasebe her talebi

`tamamlandi=true` → `islem_tamam` + bitiş tarihi/kullanıcı damgası
`tamamlandi=false` → `beklemede` + damgalar null (yanlış tık geri alınır)

## Temsilci — Taleplerim

1. **"Devam Eden İşlemler (N)" kartı** sayfanın en üstünde (Eşleşme Bekleyenler kalıbı):
   dosya no · konşimento · tutar · **gün sayacı** · `[✓ İşlem Tamamlandı]`.
   Eşik renkleri: <15 gün nötr · 15–30 amber · >30 rose.
2. **Günde bir açılır pencere**: o gün ilk girişte, açık teminat varsa. Satır başına
   `[Bitti]` / `[Devam ediyor]`. "Devam ediyor" sunucuya YAZMAZ, o günlük susturur.
   Gösterim takibi `localStorage: portal_depo_hatirlatma_<kullaniciId>` = son gösterim YMD.
   Sunucuda hatırlatma tablosu YOK.
3. `islem_tamam` satırlarında **"Geri Al"** — muhasebe iade kaydı girene kadar açık.

## Muhasebe — Depo Ödemeleri

1. **"İade Talep Edilebilir (N)" vurgu kartı** tablonun üstünde: temsilci adı + işlem
   bitiş tarihi + doğrudan `[İade Kaydı]`.
2. **Sidebar rozeti semantiği değişir.** Mevcut rozet "son görülenden beri değişiklik"
   sayar (okununca sıfırlanır — bir *okundu bildirimi*). İstenen ise "iade talep
   edilebilir N iş var" — bir *iş yükü sayacı*, sayfaya bakmakla kaybolmamalı.
   Yeni hesap: `depo = max(okunmamış değişiklik, islem_tamam sayısı)`.
   Bildirim altyapısının geri kalanı (tarayıcı bildirimi, sekme başlığı) DEĞİŞMEZ —
   `iadeDurumu` imzaya dahil olduğundan temsilci işaretlediğinde masaüstü bildirimi
   kendiliğinden gider.

## Yan iş — UI tutarlılığı

- `SayfaBasligi`'nın kullanılmayan `sag` slotuna varsayılan `GunKutusu` konur → temsilci
  ve muhasebenin tüm ekranlarında üstte tarih. Kasam kendi başlığını elle kurduğu için
  çift görünmez.
- **Belge indirmeleri her yerde buton** (metin link değil): Taleplerim tablosu ve
  `BelgeLinkleri`'nin kompakt olmayan dalı `[⬇ Belge]` butonlarına çevrilir.

## Kapsam dışı (bilinçli)

- E-posta/SMS hatırlatma yok — portal içi yeterli.
- Kısmi iade tutarı / demuraj kesintisi zaten mevcut İade Kaydı dialogunda; dokunulmaz.
- İşlem bitiş tarihi için geriye dönük düzenleme yok (yanlışsa Geri Al + yeniden işaretle).
