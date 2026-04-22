# ISO 9001:2015 Entegre Modül Tasarımı

**Tarih:** 2026-04-22  
**Proje:** CNC Tracker  
**Kapsam:** ISO 9001:2015 Kalite Yönetim Sistemi dijitalleştirme modülü

---

## Özet

Sol menüdeki "ISO9001-2015" sekmesi altında, ISO 9001:2015 standardının tüm bölümlerini kapsayan entegre bir modül oluşturulacak. Mevcut Anketler sayfası bu modülün içine taşınacak. Modül kart tabanlı dashboard ile gezinilecek, her bölüm ayrı route'a sahip olacak. Geliştirme aşamalı yapılacak: Faz 1'de 3 kritik bölüm, Faz 2'de kalan 5 bölüm.

---

## Mimari

### Route Yapısı

```
/iso9001                      → Ana dashboard (8 kart)
/iso9001/anketler             → Anketler (Müşteri + Çalışan sekmeleri)
/iso9001/duf                  → Düzeltici Faaliyet
/iso9001/tetkik               → İç Tetkik
/iso9001/belgeler             → Belge Arşivi          [Faz 2]
/iso9001/hedefler             → Kalite Hedefleri & KPI [Faz 2]
/iso9001/egitim               → Eğitim Kayıtları       [Faz 2]
/iso9001/tedarikci            → Tedarikçi Değerlendirme [Faz 2]
/iso9001/yonetim              → Yönetim Gözden Geçirme  [Faz 2]
```

**Geriye dönük uyumluluk:** `/anketler` route'u `/iso9001/anketler`'e redirect edilir.

### Sol Menü

"ISO9001-2015" tek bir link olarak kalır (`/iso9001`). Alt menü açılmaz; gezinme dashboard kartları üzerinden yapılır.

### Rol Yönetimi

Mevcut tek şifre sistemi (`cnc2024`) devam eder. Rol yönetimi Faz 2'ye bırakılır.

---

## Faz 1 Kapsamı

### 1. Ana Dashboard (`/iso9001`)

8 karttan oluşan grid layout:

| Kart | Özet Bilgi | Durum |
|---|---|---|
| Anketler | Müşteri anket sayısı + Çalışan anket sayısı | Aktif |
| DÜF | Açık / Gecikmiş / Kapalı sayısı | Aktif |
| İç Tetkik | Son tetkik tarihi + Planlanmış sayısı | Aktif |
| Belge Arşivi | — | Yakında (pasif) |
| Kalite Hedefleri | — | Yakında (pasif) |
| Eğitim Kayıtları | — | Yakında (pasif) |
| Tedarikçi Değerlendirme | — | Yakında (pasif) |
| Yönetim Gözden Geçirme | — | Yakında (pasif) |

Pasif kartlar gri görünümde, tıklanamaz, "Yakında" etiketi gösterir.

---

### 2. Anketler (`/iso9001/anketler`)

Mevcut Anketler sayfası bu route'a taşınır. İki sekme eklenir:

**Sekmeler:** `Müşteri Memnuniyet Anketleri` | `Çalışan Memnuniyet Anketleri`

Her iki sekme aynı anket motorunu kullanır. DB'ye `type` alanı eklenir:
- `musteri` — müşteri memnuniyet anketleri
- `calisanlar` — çalışan memnuniyet anketleri

Mevcut tüm anketler `musteri` türüne taşınır.

Her sekmedeki işlevler: anket listesi, yeni anket oluştur, link paylaş, sonuç görüntüle.

---

### 3. Düzeltici Faaliyet - DÜF (`/iso9001/duf`)

**Veri Modeli:**

| Alan | Tür | Zorunlu |
|---|---|---|
| Başlık | text | ✓ |
| Uygunsuzluk Kaynağı | enum: İç Tetkik / Müşteri Şikayeti / Proses / Diğer | ✓ |
| Açıklama | textarea | ✓ |
| Sorumlu Kişi | text | ✓ |
| Hedef Kapanış Tarihi | date | ✓ |
| Durum | enum: Açık / Devam Ediyor / Kapalı | ✓ |
| Kök Neden Analizi | textarea | — |
| Alınan Aksiyon | textarea | — |
| Dosya Eki | file (PDF/Word) | — |
| Oluşturulma Tarihi | timestamp (otomatik) | — |

**Liste görünümü:** Tablo, durum renk kodlu (kırmızı=Açık, sarı=Devam, yeşil=Kapalı). Hedef tarihi geçmiş ve durum kapalı değilse turuncu uyarı.

**CRUD:** Listeleme, oluşturma (modal/form), düzenleme, silme.

---

### 4. İç Tetkik (`/iso9001/tetkik`)

İki sekme: `Tetkik Planları` | `Bulgular`

**Tetkik Planları veri modeli:**

| Alan | Tür | Zorunlu |
|---|---|---|
| Tetkik Adı | text | ✓ |
| Planlanan Tarih | date | ✓ |
| Tetkik Edilen Bölüm/Süreç | text | ✓ |
| Baş Tetkikçi | text | ✓ |
| Durum | enum: Planlandı / Tamamlandı / İptal | ✓ |
| Dosya Eki (plan/rapor) | file (PDF) | — |

**Bulgular veri modeli:**

| Alan | Tür | Zorunlu |
|---|---|---|
| Bağlı Tetkik | FK → Tetkik Planı | ✓ |
| Bulgu Türü | enum: Uygunsuzluk / Gözlem / İyileştirme Fırsatı | ✓ |
| Bulgu Açıklaması | textarea | ✓ |
| İlgili ISO Maddesi | text (ör. "8.4.1") | — |
| Durum | enum: Açık / Kapalı | ✓ |

**CRUD:** Her sekme için bağımsız listeleme, oluşturma, düzenleme, silme.

---

## Faz 2 Kapsamı (Sonraki Aşama)

Aşağıdaki bölümler Faz 1 tamamlandıktan sonra aynı mimari desenle eklenir:

- **Belge Arşivi:** Prosedür, talimat, form dokümanlarının yüklenmesi ve versiyonlanması
- **Kalite Hedefleri & KPI:** Hedef tanımlama, periyodik ölçüm girişi, trend grafiği
- **Eğitim Kayıtları:** Personel bazlı eğitim takibi, sertifika yükleme
- **Tedarikçi Değerlendirme:** Tedarikçi puanlama formu, onay durumu
- **Yönetim Gözden Geçirme:** Toplantı tutanağı, alınan kararların takibi

---

## Teknik Notlar

- **Frontend:** React + TypeScript, mevcut proje yapısı ve UI kütüphanesi (shadcn/ui) kullanılır
- **Backend:** Mevcut Express + Drizzle ORM yapısı kullanılır, her bölüm için yeni tablo ve API endpoint'leri eklenir
- **Dosya yükleme:** Mevcut projede varsa aynı mekanizma kullanılır, yoksa sunucu tarafında multer ile eklenir
- **Veri izolasyonu:** Her ISO bölümünün tablosu bağımsızdır; bölümler arası ilişki sadece DÜF ↔ İç Tetkik (bulgu kaynağı) arasındadır
