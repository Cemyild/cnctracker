# ISO 9001 Yönetim Gözden Geçirme Modül Tasarımı

**Tarih:** 2026-04-22
**Proje:** CNC Tracker — ISO 9001:2015 Faz 2
**Kapsam:** `/iso9001/yonetim` — Toplantı tutanağı, otomatik ISO özeti, aksiyon takibi

---

## Özet

ISO 9001 modülünün "Yönetim Gözden Geçirme" kartı aktif hale getirilir. Her toplantı için tutanak oluşturulur: tarih, katılımcılar, gündem, serbest metin giriş alanları ve alınan aksiyonlar. Toplantı formunda anlık ISO özeti (DÜF/hedef/eğitim/tedarikçi sayıları) otomatik çekilir, DB'ye kaydedilmez. Her toplantıdan çıkan aksiyonlar merkezi bir listede sorumlu + hedef tarih + durum ile takip edilir. Gecikmiş aksiyon tespiti frontend'de yapılır (hedef tarih < bugün AND durum açık).

---

## Veri Modeli

### `yonetim_gozden_gecirmeler` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| tarih | text (YYYY-MM-DD) | ✓ |
| katilimcilar | text | — (serbest metin) |
| gundem | text | — (textarea) |
| musteriSikayetleri | text | — (serbest metin) |
| tedarikciPerformansi | text | — (serbest metin) |
| urunUygunsuzluk | text | — (serbest metin) |
| oncekiKararDurum | text | — (önceki kararların durumu) |
| sonuclar | text | — (genel sonuçlar/notlar) |
| olusturmaTarihi | timestamp (otomatik) | — |

### `yonetim_aksiyonlar` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| toplantıId (DB: `toplanti_id`) | FK → yonetim_gozden_gecirmeler (cascade delete) | ✓ |
| aksiyon | text | ✓ |
| sorumlu | text | ✓ |
| hedefTarih | text (YYYY-MM-DD) | — |
| durum | text: "acik" / "kapali" | ✓ (default: "acik") |
| olusturmaTarihi | timestamp (otomatik) | — |

**Not:** Otomatik ISO özeti (DÜF/hedef/eğitim/tedarikçi sayıları) toplantı formu açılırken `/api/iso9001/stats` endpoint'inden anlık çekilir. Bu veriler DB'ye kaydedilmez; her görüntülemede güncel durum gösterilir.

---

## Route

```
/iso9001/yonetim    ← Ana sayfa (korumalı, auth gerektirir)
```

Dashboard'daki "Yönetim Gözden Geçirme" ComingSoonCard bu route'a yönlendirilir.

---

## Sayfa Tasarımı (`/iso9001/yonetim`)

### 2 Sekme

**Sekme 1: Toplantılar**

Tablo: Tarih | Katılımcılar | Aksiyon Sayısı | İşlemler (Düzenle, Sil)

- Aksiyon Sayısı: toplantıya ait toplam aksiyon sayısı
- Satıra tıklayınca accordion açılır:
  - **ISO Özeti** (anlık, readonly): DÜF Açık | Hedef Yeşil/Toplam | Eğitim Sayısı | Tedarikçi Değerlendirme Bu Yıl
  - **Serbest Metin Alanları** (readonly görünüm): Müşteri Şikayetleri, Tedarikçi Performansı, Ürün Uygunsuzluk, Önceki Karar Durumu, Sonuçlar
  - **Aksiyonlar alt tablosu**: Aksiyon | Sorumlu | Hedef Tarih | Durum (badge) | Durum Toggle butonu
  - Gecikmiş aksiyon: kırmızı "Gecikmiş" badge (hedef tarih < bugün AND durum = "acik")
- "Yeni Toplantı" butonu (üst sağ)

**Sekme 2: Aksiyonlar**

Tablo: Aksiyon | Sorumlu | Hedef Tarih | Toplantı Tarihi | Durum | İşlemler (Durum Toggle)

- Durum filtresi: Tümü / Açık / Kapalı / Gecikmiş
- Durum badge renkleri: Açık → sarı, Kapalı → yeşil, Gecikmiş → kırmızı
- Durum toggle: Açık → Kapalı, Kapalı → Açık

---

## Modallar

### Yeni Toplantı / Düzenle Modalı

**Bölüm 1 — Temel Bilgiler:**
- Tarih (date input, zorunlu)
- Katılımcılar (textarea, opsiyonel)
- Gündem (textarea, opsiyonel)

**Bölüm 2 — ISO Özeti (readonly, anlık):**
- DÜF: {dufAcik} açık, {dufKapali} kapalı
- Kalite Hedefleri: {hedefYesilCount}/{hedefCount} yeşil
- Eğitim: {egitimCount} eğitim, {toplamKatilimciCount} katılım
- Tedarikçi: {tedarikciCount} tedarikçi, {buYilDegerlendirmeCount} bu yıl değerlendirme

**Bölüm 3 — Giriş Verileri (serbest metin):**
- Müşteri Şikayetleri (textarea)
- Tedarikçi Performansı (textarea)
- Ürün Uygunsuzluk (textarea)
- Önceki Karar Durumu (textarea)

**Bölüm 4 — Sonuçlar:**
- Sonuçlar/Notlar (textarea)

**Bölüm 5 — Aksiyonlar:**
- Mevcut aksiyonlar listesi (düzenle modunda)
- "Aksiyon Ekle" satırı: Aksiyon metni * | Sorumlu * | Hedef Tarih | Ekle butonu

---

## API Endpoints

| Method | Path | Açıklama |
|---|---|---|
| GET | /api/yonetim-toplantilari | Tüm toplantılar (aksiyon sayısıyla, tarih desc) |
| POST | /api/yonetim-toplantilari | Yeni toplantı |
| PUT | /api/yonetim-toplantilari/:id | Toplantı güncelle |
| DELETE | /api/yonetim-toplantilari/:id | Toplantı sil (aksiyonlar cascade) |
| GET | /api/yonetim-toplantilari/:id | Toplantı detayı + aksiyonlar |
| GET | /api/yonetim-aksiyonlar | Tüm aksiyonlar (toplantı tarihi join, tarih desc) |
| POST | /api/yonetim-aksiyonlar | Aksiyon ekle |
| PUT | /api/yonetim-aksiyonlar/:id | Aksiyon güncelle (durum veya alanlar) |
| DELETE | /api/yonetim-aksiyonlar/:id | Aksiyon sil |

---

## Dashboard İstatistikleri

`getIso9001Stats` fonksiyonuna eklenir:
- `sonToplantıTarihi`: en son toplantının tarihi (null ise hiç toplantı yok)
- `acikAksiyon`: durum = "acik" olan toplam aksiyon sayısı

Dashboard kartı: "Son Toplantı: {sonToplantıTarihi ?? '—'} | Açık Aksiyon: {acikAksiyon}"

---

## Teknik Notlar

- Dosya yükleme yok — multer kullanılmaz
- Tüm rotalar korumalı — public route bypass gerekmez
- Gecikmiş aksiyon hesabı frontend'de yapılır: `hedefTarih < today && durum === "acik"`
- ISO özeti `/api/iso9001/stats` endpoint'i kullanılır (zaten mevcut, tedarikciCount ve buYilDegerlendirmeCount eklendi)
- Frontend: React + TypeScript + shadcn/ui, mevcut ISO9001 sayfa pattern'i
- Backend: Express + Drizzle ORM, mevcut storage.ts pattern'i
- Dashboard kartı: ISO9001.tsx'teki "Yönetim Gözden Geçirme" ComingSoonCard → ActiveCard'a dönüştürülür
