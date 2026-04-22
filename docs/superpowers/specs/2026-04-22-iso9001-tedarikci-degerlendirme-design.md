# ISO 9001 Tedarikçi Değerlendirme Modül Tasarımı

**Tarih:** 2026-04-22
**Proje:** CNC Tracker — ISO 9001:2015 Faz 2
**Kapsam:** `/iso9001/tedarikci` — Onaylı tedarikçi listesi, yapılandırılabilir değerlendirme şablonu, dönemsel değerlendirme kaydı

---

## Özet

ISO 9001 modülünün "Tedarikçi Değerlendirme" kartı aktif hale getirilir. Onaylı tedarikçiler bir listede yönetilir. Her tedarikçi için yılda bir veya iki kez değerlendirme formu doldurulur. Değerlendirme kriterleri UI'dan yapılandırılabilir (Eğitim modülündeki şablon pattern'i). Değerlendirme sadece admin tarafından uygulama içinden doldurulur (public link yok). Tedarikçi listesinde olma = onaylı tedarikçi; onay durumu puana bağlı değil, düşük puan tedarikçi değiştirme kararı için girdi oluşturur.

---

## Veri Modeli

### `tedarikcilar` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| ad | text | ✓ |
| kategori | text | — (ör. "Hammadde", "Hizmet") |
| yetkiliAdi | text | — |
| telefon | text | — |
| email | text | — |
| aciklama | text | — |
| olusturmaTarihi | timestamp (otomatik) | — |

### `tedarikci_degerlendirme_kriterleri` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| kriter | text | ✓ |
| tip | text: "puan_1_5" / "acik_metin" | ✓ |
| sira | integer | ✓ |
| olusturmaTarihi | timestamp (otomatik) | — |

### `tedarikci_degerlendirmeler` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| tedarikciId | FK → tedarikcilar (cascade delete) | ✓ |
| tarih | text (YYYY-MM-DD) | ✓ |
| degerlendiren | text | — |
| notlar | text | — |
| olusturmaTarihi | timestamp (otomatik) | — |

### `tedarikci_degerlendirme_cevaplari` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| degerlendirmeId | FK → tedarikci_degerlendirmeler (cascade delete) | ✓ |
| kriterEid | FK → tedarikci_degerlendirme_kriterleri (cascade delete) | ✓ |
| puan | integer (1-5, nullable) | — (puan_1_5 tipi için) |
| cevap | text (nullable) | — (acik_metin tipi için) |
| olusturmaTarihi | timestamp (otomatik) | — |

---

## Route

```
/iso9001/tedarikci    ← Ana sayfa (korumalı, auth gerektirir)
```

Dashboard'daki "Tedarikçi Değerlendirme" ComingSoonCard bu route'a yönlendirilir.

---

## Sayfa Tasarımı (`/iso9001/tedarikci`)

### 2 Sekme

**Sekme 1: Tedarikçiler**

Tablo: Ad | Kategori | Yetkili | Telefon | Değerlendirme Sayısı | İşlemler

- Değerlendirme Sayısı: tedarikçiye ait toplam değerlendirme sayısı
- İşlemler: Düzenle, Sil
- Satıra tıklayınca accordion açılır:
  - Geçmiş değerlendirmeler tablosu: Tarih | Değerlendiren | Ort. Puan | İşlemler (Görüntüle, Sil)
  - Ort. Puan: o değerlendirmedeki tüm puan_1_5 kriterlerinin ortalaması (1 ondalık, acik_metin kriterler hariç)
  - "Yeni Değerlendirme" butonu
- "Yeni Tedarikçi" butonu (üst sağ)

**Sekme 2: Değerlendirme Şablonu**

- Mevcut kriterler sıralı liste: Sıra No | Kriter | Tip | İşlemler (Düzenle, Sil)
- Sırayı yukarı/aşağı taşı okları (sira alanı güncellenir)
- "Kriter Ekle" butonu

---

## Modallar

### Yeni Tedarikçi / Düzenle

- Ad (zorunlu)
- Kategori (text, opsiyonel)
- Yetkili Adı (text, opsiyonel)
- Telefon (text, opsiyonel)
- E-posta (text, opsiyonel)
- Açıklama (textarea, opsiyonel)

### Yeni Değerlendirme

- Tarih (date input, zorunlu)
- Değerlendiren (text, opsiyonel)
- Notlar (textarea, opsiyonel)
- Şablondaki kriterler sıra ile:
  - puan_1_5: 1-5 arası circular buton grubu
  - acik_metin: textarea
- Kaydet butonu (tarih boşsa disabled)

### Değerlendirme Görüntüle

- Readonly modal: tarih, değerlendiren, notlar
- Tüm kriterler + verilen cevaplar/puanlar
- Hesaplanan ortalama puan (puan_1_5 kriterler)

### Kriter Ekle / Düzenle (Değerlendirme Şablonu)

- Kriter metni (zorunlu)
- Tip: 1-5 Puan / Açık Metin (select, zorunlu)

---

## API Endpoints

| Method | Path | Açıklama |
|---|---|---|
| GET | /api/tedarikcilar | Tüm tedarikçiler (değerlendirme sayısıyla) |
| POST | /api/tedarikcilar | Yeni tedarikçi |
| PUT | /api/tedarikcilar/:id | Tedarikçi güncelle |
| DELETE | /api/tedarikcilar/:id | Tedarikçi sil |
| GET | /api/tedarikcilar/:id/degerlendirmeler | Tedarikçiye ait değerlendirmeler (ort. puanla) |
| POST | /api/tedarikcilar/:id/degerlendirmeler | Yeni değerlendirme + cevaplar |
| GET | /api/tedarikcilar/:id/degerlendirmeler/:degerlendirmeId | Tekil değerlendirme + cevaplar (görüntüle) |
| DELETE | /api/tedarikcilar/:id/degerlendirmeler/:degerlendirmeId | Değerlendirme sil |
| GET | /api/tedarikci-degerlendirme-kriterleri | Tüm şablon kriterleri (sıralı) |
| POST | /api/tedarikci-degerlendirme-kriterleri | Kriter ekle |
| PUT | /api/tedarikci-degerlendirme-kriterleri/:id | Kriter güncelle |
| DELETE | /api/tedarikci-degerlendirme-kriterleri/:id | Kriter sil |

---

## Dashboard İstatistikleri

`getIso9001Stats` fonksiyonuna eklenir:
- `tedarikciCount`: toplam tedarikçi sayısı
- `buYilDegerlendirmeCount`: mevcut yıl içindeki toplam değerlendirme sayısı (tüm tedarikçiler)

Dashboard kartı: "Tedarikçi: {tedarikciCount} | Bu Yıl: {buYilDegerlendirmeCount} değerlendirme"

---

## Teknik Notlar

- Dosya yükleme yok — bu modülde multer kullanılmaz
- Tüm rotalar korumalı — public route bypass gerekmez
- Frontend: React + TypeScript + shadcn/ui, mevcut ISO9001 sayfa pattern'i
- Backend: Express + Drizzle ORM, mevcut storage.ts pattern'i
- Ortalama puan hesabı: backend'de değerlendirme listesi endpoint'inde hesaplanır, frontend'e hazır gelir
- Dashboard kartı: ISO9001.tsx'teki "Tedarikçi Değerlendirme" ComingSoonCard → ActiveCard'a dönüştürülür
