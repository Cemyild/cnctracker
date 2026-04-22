# ISO 9001 Belge Arşivi Modül Tasarımı

**Tarih:** 2026-04-22
**Proje:** CNC Tracker — ISO 9001:2015 Faz 2
**Kapsam:** `/iso9001/belgeler` — Doküman yükleme, versiyon takibi, filtreleme

---

## Özet

ISO 9001 modülünün "Belge Arşivi" kartı aktif hale getirilir. Prosedür, talimat, form ve diğer ISO dokümanları iki seviyeli kategoride saklanır. Her belgenin birden fazla versiyonu olabilir; aktif versiyon işaretlenir, eskiler arşivde kalır. Gelişmiş filtre çubuğu ile arama yapılır.

---

## Veri Modeli

### `belgeler` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| baslik | text | ✓ |
| ana_kategori | text (enum: Prosedür / Talimat / Form / Diğer) | ✓ |
| alt_kategori | text (serbest metin, ör. "Satın Alma") | ✓ |
| aciklama | text | — |
| olusturma_tarihi | timestamp (otomatik) | — |

### `belge_versiyonlar` tablosu

| Alan | Tür | Zorunlu |
|---|---|---|
| id | varchar (uuid) | ✓ (otomatik) |
| belge_id | FK → belgeler (cascade delete) | ✓ |
| versiyon_no | text (ör. "v1.0", "v2.1") | ✓ |
| degisiklik_notu | text | — |
| dosya_yolu | text (PDF veya Word) | ✓ |
| is_aktif | boolean (default false) | ✓ |
| olusturma_tarihi | timestamp (otomatik) | — |

Bir belgenin en fazla bir versiyonu `is_aktif = true` olabilir. Yeni versiyon yüklendiğinde önceki aktif versiyon otomatik `false` yapılır.

---

## Route

```
/iso9001/belgeler
```

Dashboard'daki "Belge Arşivi" kartı bu route'a yönlendirir. Kart artık pasif değil, aktif olur.

---

## Sayfa Tasarımı

### Filtre Çubuğu (üst kısım)

- **Ana Kategori:** dropdown (Tümü / Prosedür / Talimat / Form / Diğer)
- **Alt Kategori:** serbest metin arama input
- **Durum:** dropdown (Tümü / Aktif / Arşiv)
- **Tarih Aralığı:** başlangıç ve bitiş date picker
- **Metin Arama:** belge başlığına göre

### Belge Listesi (tablo)

| Sütun | İçerik |
|---|---|
| Belge Adı | baslik |
| Kategori | ana_kategori > alt_kategori |
| Aktif Versiyon | aktif versiyon_no |
| Son Güncelleme | aktif versiyonun tarihi |
| İşlemler | Versiyonlar / Yeni Versiyon / Sil |

### Versiyonlar Paneli

Satıra tıklandığında veya "Versiyonlar" butonuyla açılır. Tüm versiyonlar listelenir:
- Aktif: yeşil rozet
- Arşiv: gri rozet
- Her versiyon indirilebilir

### Modallar

**Yeni Belge:**
- Başlık (zorunlu)
- Ana Kategori (dropdown, zorunlu)
- Alt Kategori (text input, zorunlu)
- Açıklama (textarea)
- İlk Versiyon No (default: "v1.0")
- Değişiklik Notu (textarea)
- Dosya Yükle (PDF/Word, zorunlu)

**Yeni Versiyon Yükle:**
- Versiyon No (zorunlu)
- Değişiklik Notu (textarea)
- Dosya Yükle (PDF/Word, zorunlu)
- Yüklenince otomatik aktif yapılır, önceki arşive düşer

---

## API Endpoints

| Method | Path | Açıklama |
|---|---|---|
| GET | /api/belgeler | Liste (filtre query params: kategori, altKategori, durum, baslangic, bitis, arama) |
| POST | /api/belgeler | Yeni belge + ilk versiyon (multipart/form-data) |
| DELETE | /api/belgeler/:id | Belge ve tüm versiyonlarını sil |
| GET | /api/belgeler/:id/versiyonlar | Belgeye ait tüm versiyonlar |
| POST | /api/belgeler/:id/versiyonlar | Yeni versiyon ekle (multipart/form-data) |

---

## Teknik Notlar

- Dosya yükleme: mevcut multer (diskStorage) pattern, `uploads/belgeler/` klasörüne
- Frontend: React + TypeScript + shadcn/ui, mevcut ISO9001 sayfa pattern'i
- Backend: Express + Drizzle ORM, mevcut storage.ts pattern'i
- Dashboard kartı: ISO9001.tsx'teki "Belge Arşivi" ComingSoonCard → ActiveCard'a dönüştürülür, stats olarak toplam belge sayısı gösterilir
