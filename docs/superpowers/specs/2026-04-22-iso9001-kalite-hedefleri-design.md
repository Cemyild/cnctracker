# ISO 9001 Kalite Hedefleri & KPI Modül Tasarımı

**Tarih:** 2026-04-22
**Proje:** CNC Tracker — ISO 9001:2015 Faz 2
**Kapsam:** `/iso9001/hedefler` — Kalite hedefi tanımlama, periyodik ölçüm girişi, renk kodlu durum

---

## Özet

ISO 9001 modülünün "Kalite Hedefleri" kartı aktif hale getirilir. Her hedef için periyodik ölçüm girişi yapılır. Son ölçüm hedef değerle karşılaştırılarak renk kodlu durum (yeşil/sarı/kırmızı) gösterilir. Dashboard kartında toplam hedef sayısı ve kaç tanesinin hedefte olduğu gösterilir.

---

## Veri Modeli

### `kalite_hedefleri` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| baslik | text | ✓ |
| hedefDeger | numeric(10,2) | ✓ |
| olcumBirimi | text (ör. "%", "adet", "gün") | ✓ |
| yon | text: "yuksek_iyi" / "dusuk_iyi" | ✓ (default: yuksek_iyi) |
| sorumluKisi | text | ✓ |
| terminTarihi | text (YYYY-MM-DD) | ✓ |
| isoMaddesi | text (ör. "8.2.1") | — |
| periyot | text: Aylık / Çeyreklik / Yıllık | ✓ |
| durum | text: Aktif / Pasif | ✓ (default: Aktif) |
| olusturmaTarihi | timestamp (otomatik) | — |

### `kalite_olcumler` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| hedefId | FK → kalite_hedefleri (cascade delete) | ✓ |
| olcumTarihi | text (YYYY-MM-DD) | ✓ |
| gerceklesenDeger | numeric(10,2) | ✓ |
| notlar | text | — |
| olusturmaTarihi | timestamp (otomatik) | — |

---

## Renk Kodlaması

Son ölçümün `gerceklesenDeger` değeri `hedefDeger` ile karşılaştırılır:

**Yön: yuksek_iyi (yüksek değer iyi)**
- Yeşil: gerceklesenDeger >= hedefDeger
- Sarı: gerceklesenDeger >= hedefDeger * 0.8
- Kırmızı: gerceklesenDeger < hedefDeger * 0.8

**Yön: dusuk_iyi (düşük değer iyi)**
- Yeşil: gerceklesenDeger <= hedefDeger
- Sarı: gerceklesenDeger <= hedefDeger * 1.2
- Kırmızı: gerceklesenDeger > hedefDeger * 1.2

---

## Route

```
/iso9001/hedefler
```

Dashboard'daki "Kalite Hedefleri" kartı bu route'a yönlendirir.

---

## Sayfa Tasarımı (`/iso9001/hedefler`)

### İki Sekme

**Sekme 1: Hedefler**

Tablo: Başlık | ISO Maddesi | Periyot | Hedef | Son Ölçüm | Durum | İşlemler

- Durum: yeşil/sarı/kırmızı rozet (son ölçüme göre). Hiç ölçüm yoksa "Ölçüm Yok" gri rozet.
- İşlemler: Ölçüm Gir butonu, Düzenle butonu, Sil butonu.

**Sekme 2: Ölçümler**

Tüm ölçümler kronolojik (en yeni önce): Tarih | Hedef Başlığı | Hedef Değer | Gerçekleşen | Birim | Durum | Notlar

### Modallar

**Yeni Hedef / Düzenle:**
- Başlık (zorunlu)
- Hedef Değer (number input, zorunlu)
- Ölçüm Birimi (text, zorunlu, ör. "%")
- Yön (select: Yüksek iyi / Düşük iyi, zorunlu)
- Sorumlu Kişi (text, zorunlu)
- Termin Tarihi (date, zorunlu)
- ISO Maddesi (text, opsiyonel)
- Periyot (select: Aylık / Çeyreklik / Yıllık, zorunlu)
- Durum (select: Aktif / Pasif, zorunlu)

**Ölçüm Gir:**
- Hedef başlığı gösterilir (readonly)
- Ölçüm Tarihi (date, zorunlu, default: bugün)
- Gerçekleşen Değer (number, zorunlu)
- Notlar (textarea, opsiyonel)

---

## API Endpoints

| Method | Path | Açıklama |
|---|---|---|
| GET | /api/kalite-hedefleri | Liste (tüm hedefler + son ölçüm bilgisi) |
| POST | /api/kalite-hedefleri | Yeni hedef oluştur |
| PUT | /api/kalite-hedefleri/:id | Hedef güncelle |
| DELETE | /api/kalite-hedefleri/:id | Hedef sil (ölçümler cascade) |
| GET | /api/kalite-olcumler | Tüm ölçümler (hedef bilgisiyle) |
| POST | /api/kalite-olcumler | Yeni ölçüm ekle |
| DELETE | /api/kalite-olcumler/:id | Ölçüm sil |

---

## Dashboard İstatistikleri

`getIso9001Stats` fonksiyonuna eklenir:
- `hedefCount`: toplam aktif hedef sayısı
- `hedefYesilCount`: son ölçümü yeşil olan hedef sayısı

Dashboard kartı: "Hedef: {hedefCount} | Yeşil: {hedefYesilCount}"

---

## Teknik Notlar

- numeric(10,2) için drizzle-orm/pg-core'dan `numeric` import edilir
- JSON body (dosya yükleme yok) — express.json() middleware yeterli
- Mevcut pattern: React + shadcn/ui Tabs, useQuery/useMutation, tanstack-query
