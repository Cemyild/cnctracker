# ISO 9001 Eğitim Kayıtları Modül Tasarımı

**Tarih:** 2026-04-22
**Proje:** CNC Tracker — ISO 9001:2015 Faz 2
**Kapsam:** `/iso9001/egitimler` — Eğitim kaydı, personel yönetimi, değerlendirme anketi

---

## Özet

ISO 9001 modülünün "Eğitim Kayıtları" kartı aktif hale getirilir. ISO modülüne özel personel listesi tutulur. Her eğitime katılımcı eklenir. Opsiyonel sertifika yükleme desteklenir. Tek bir yapılandırılabilir değerlendirme şablonu tüm eğitimler için kullanılır; her eğitim için halka açık değerlendirme linki oluşturulur. Her personelin eğitim geçmişi ve değerlendirme durumu modal kartta görüntülenir.

---

## Veri Modeli

### `iso_personeller` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| ad | text | ✓ |
| pozisyon | text | — |
| departman | text | — |
| olusturmaTarihi | timestamp (otomatik) | — |

### `egitimler` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| baslik | text | ✓ |
| egitimTarihi | text (YYYY-MM-DD) | ✓ |
| sure | text (ör. "8 saat") | — |
| egitimci | text | — |
| aciklama | text | — |
| sertifikaDosyaYolu | text | — (opsiyonel PDF/resim) |
| olusturmaTarihi | timestamp (otomatik) | — |

### `egitim_katilimcilar` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| egitimId | FK → egitimler (cascade delete) | ✓ |
| personelId | FK → iso_personeller (cascade delete) | ✓ |
| olusturmaTarihi | timestamp (otomatik) | — |

### `egitim_degerlendirme_sorulari` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| soru | text | ✓ |
| tip | text: "puan_1_5" / "acik_metin" | ✓ |
| sira | integer | ✓ |
| olusturmaTarihi | timestamp (otomatik) | — |

### `egitim_degerlendirmeler` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| egitimId | FK → egitimler (cascade delete) | ✓ |
| katilimciAdi | text | ✓ |
| olusturmaTarihi | timestamp (otomatik) | — |

### `egitim_degerlendirme_cevaplari` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| degerlendirmeId | FK → egitim_degerlendirmeler (cascade delete) | ✓ |
| soruId | FK → egitim_degerlendirme_sorulari (cascade delete) | ✓ |
| puan | integer (1-5, nullable) | — (puan_1_5 tipi için) |
| cevap | text (nullable) | — (acik_metin tipi için) |
| olusturmaTarihi | timestamp (otomatik) | — |

---

## Route

```
/iso9001/egitimler          ← Ana sayfa (korumalı)
/egitim-degerlendirme/:id   ← Halka açık değerlendirme formu
```

Dashboard'daki "Eğitim Kayıtları" ComingSoonCard bu route'a yönlendirilir.

---

## Sayfa Tasarımı (`/iso9001/egitimler`)

### 3 Sekme

**Sekme 1: Eğitimler**

Tablo: Başlık | Tarih | Süre | Eğitimci | Katılımcı | Sertifika | İşlemler

- Katılımcı sayısı: "3 kişi" badge
- Sertifika: varsa indirme ikonu, yoksa —
- İşlemler: Değerlendirme Linki, Düzenle, Sil
- Satıra tıklayınca accordion açılır → katılımcı listesi + Katılımcı Ekle butonu
- Katılımcı satırında çıkar (×) butonu
- Accordion'da "X değerlendirme" gösterilir

**Sekme 2: Personeller**

Tablo: Ad | Pozisyon | Departman | Katıldığı Eğitim | İşlemler

- Katıldığı Eğitim: katıldığı eğitim sayısı
- İşlemler: Kart Görüntüle, Düzenle, Sil
- "Yeni Personel" butonu

**Sekme 3: Değerlendirme Şablonu**

- Mevcut sorular sıralı liste: sıra no | soru | tip | İşlemler (Düzenle, Sil)
- Sırayı yukarı/aşağı taşı okları
- "Soru Ekle" butonu

---

## Modallar

### Yeni Eğitim / Düzenle

- Başlık (zorunlu)
- Eğitim Tarihi (date, zorunlu)
- Süre (text, opsiyonel, ör. "8 saat")
- Eğitimci (text, opsiyonel)
- Açıklama (textarea, opsiyonel)
- Sertifika Yükle (file input PDF/resim, opsiyonel)

### Katılımcı Ekle

- iso_personeller listesinden çoklu seçim
- Zaten eklenmiş personeller disabled/gri gösterilir

### Yeni Personel / Düzenle

- Ad (zorunlu)
- Pozisyon (opsiyonel)
- Departman (opsiyonel)

### Personel Kart Modalı

- Personel adı, pozisyon, departman
- Özet: "Toplam X eğitim | X değerlendirme doldurdu"
- Eğitim geçmişi tablosu: Eğitim Adı | Tarih | Sertifika | Değerlendirme
  - Değerlendirme: "Dolduruldu" (yeşil rozet) / "Doldurulmadı" (gri rozet)

### Soru Ekle / Düzenle (Değerlendirme Şablonu)

- Soru metni (zorunlu)
- Tip: 1-5 Puan / Açık Metin (select, zorunlu)

---

## Halka Açık Değerlendirme Formu (`/egitim-degerlendirme/:id`)

- Eğitim adı başlıkta gösterilir (readonly)
- Katılımcı Adı (text input, zorunlu)
- Şablondaki sorular:
  - puan_1_5: 1-5 arası radio/button grubu
  - acik_metin: textarea
- Gönder butonu
- Gönderim sonrası teşekkür mesajı
- Giriş gerektirmez (public route)

---

## API Endpoints

| Method | Path | Açıklama |
|---|---|---|
| GET | /api/iso-personeller | Tüm personeller (katıldığı eğitim sayısıyla) |
| POST | /api/iso-personeller | Yeni personel |
| PUT | /api/iso-personeller/:id | Personel güncelle |
| DELETE | /api/iso-personeller/:id | Personel sil |
| GET | /api/iso-personeller/:id/kart | Personel + eğitim geçmişi + değerlendirme durumu |
| GET | /api/egitimler | Tüm eğitimler (katılımcı sayısı + değerlendirme sayısıyla) |
| POST | /api/egitimler | Yeni eğitim (multipart/form-data) |
| PUT | /api/egitimler/:id | Eğitim güncelle (multipart/form-data) |
| DELETE | /api/egitimler/:id | Eğitim sil |
| GET | /api/egitimler/:id/katilimcilar | Eğitime katılan personeller |
| POST | /api/egitimler/:id/katilimcilar | Katılımcı ekle (body: { personelIds: string[] }) |
| DELETE | /api/egitimler/:id/katilimcilar/:personelId | Katılımcı çıkar |
| GET | /api/degerlendirme-sorulari | Tüm şablon soruları (sıralı) |
| POST | /api/degerlendirme-sorulari | Soru ekle |
| PUT | /api/degerlendirme-sorulari/:id | Soru güncelle |
| DELETE | /api/degerlendirme-sorulari/:id | Soru sil |
| GET | /api/egitim-degerlendirme/:egitimId | Public: eğitim bilgisi + şablon sorular |
| POST | /api/egitim-degerlendirme | Public: değerlendirme gönder |
| GET | /api/egitimler/:id/degerlendirmeler | Eğitime ait değerlendirme sonuçları |

---

## Dashboard İstatistikleri

`getIso9001Stats` fonksiyonuna eklenir:
- `egitimCount`: toplam eğitim sayısı
- `toplamKatilimciCount`: tüm eğitimlerdeki toplam katılımcı sayısı (unique katılım sayısı)

Dashboard kartı: "Eğitim: {egitimCount} | Katılımcı: {toplamKatilimciCount}"

---

## Teknik Notlar

- Dosya yükleme: mevcut multer diskStorage pattern, `uploads/egitimler/` klasörüne
- Değerlendirme formu public route — App.tsx'te auth wrapper dışında tanımlanır (mevcut anket slug pattern'i gibi)
- Frontend: React + TypeScript + shadcn/ui, mevcut ISO9001 sayfa pattern'i
- Backend: Express + Drizzle ORM, mevcut storage.ts pattern'i
- Dashboard kartı: ISO9001.tsx'teki "Eğitim Kayıtları" ComingSoonCard → ActiveCard'a dönüştürülür
