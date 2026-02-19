---
stepsCompleted: [1]
inputDocuments: ['e:\\CEM APPS\\cnctracker\\mizan 08022026.xlsx']
session_topic: 'Müşteri Risk Skoru ve Uyuyan Müşteri Tespiti Analizi'
session_goals: 'Borç/alacak tarihlerini kullanarak riskli müşterileri belirlemek, "uyuyan" (hareketsiz) hesapları yönetmek ve tahsilat takibini bu verilere göre önceliklendirmek.'
selected_approach: 'Stratejik & Derin - Morphological Analysis (Parametrik Matris)'
techniques_used: ['Morphological Analysis']
ideas_generated: []
context_file: ''
---

# Beyin Fırtınası Oturum Sonuçları

**Kolaylaştırıcı:** Cem
**Tarih:** 2026-02-08

## Oturum Özeti

**Konu:** `mizan 08022026.xlsx` dosyasındaki verilerin (Müşteri borç/alacak bakiyeleri ve son işlem tarihleri) kullanılarak iş değerine dönüştürülmesi.
**Hedefler:** 
- Son Borç (Fatura) ve Son Alacak (Ödeme) tarihlerini kullanarak müşteri bazlı nakit akışı ve risk analizi yapmak.
- Tahsilat süreçlerini otomatize etmek veya önceliklendirmek için veri modelleri oluşturmak.
- Gecikmiş ödemeleri ve "uyuyan" (hareketsiz) müşterileri tespit etmek.

### Bağlam Rehberliği

Mizan dosyasındaki L (Son Borç Tarihi) ve M (Son Alacak Tarihi) sütunları, ticari ilişkinin ritmini gösteren kritik metriklerdir. H sütunundaki borç bakiyesi ile birlikte bu veriler, otomatik bir risk skorlama sistemi için temel oluşturur.

## Üretilen Fikirler (Divergence)

### 1. Kademeli Renk Kodu ve Uyarı Sistemi (Escalation)
- **Kriter:** Gecikme Günü = `Bugün` - `Son Alacak Tarihi` (veya bakiye varsa `Son Borç Tarihi`).
- **Kademeler:**
  - 0-10 Gün: Mavi/Yeşil (Normal Süreç)
  - 11-20 Gün: **SARI** ("Bakiye kontrolü hatırlatması")
  - 21-30 Gün: **TURUNCU** (%50 Sertleşen uyarı dili)
  - 31+ Gün: **KIRMIZI** ("Tahsilat Durdurma/Yasal Takip Öncesi Son Uyarı")

### 2. Filtreleme ve Persona Kuralları
- **H Sütunu Filtresi:** Sadece borç bakiyesi > 0 olanlar analize dahil edilir.
- **Zombi Takibi:** L (Son Borç) tarihi yeni, M (Son Alacak) tarihi eski ise sistem "Sürekli mal alıyor ama ödeme yapmıyor" uyarısı verir.
- **Hareketsizlik Teşhisi:** Hem L hem M tarihi 60+ gün ise bakiye "Donuk Alacak" olarak işaretlenir.

## Rafine Edilen Model (Convergence)

### 1. Risk Skorlama Algoritması (Excel Mantığı)
- **Ana Parametre:** `Gecikme = Bugün - Makbuz(Son Alacak) Tarihi`
- **Excel Formülü Önerisi:** `=EĞER(H2>0; BUGÜN()-M2; 0)` (H sütununda bakiye varsa, M sütunundaki son ödeme tarihinden bugüne geçen günleri hesaplar).
- **Renk Skalası (Koşullu Biçimlendirme):**
    - **SARI:** 10 - 20 Gün arası
    - **TURUNCU:** 21 - 30 Gün arası
    - **KIRMIZI:** 31+ Gün

### 2. Kritik Müşteri Segmentleri (Aksiyon Odaklı)
- **"Zombi" Hesaplar:** `Bakiye > 0` ve `Son Borç (L) > Son Alacak (M)`. 
    - *Mantık:* Mal alımı devam ediyor ama son ödeme faturadan daha eski.
- **"Donuk" Hesaplar:** `Bakiye > 0` ve `Gecikme > 60`.
    - *Mantık:* Unutulmuş veya sorunlu alacaklar.

## Uygulama Yol Haritası (Sonuç)
1. **Veri Hazırlama:** `mizan 08022026.xlsx` dosyasındaki H, L ve M sütunlarının tarih formatına uygunluğu kontrol edilmeli.
2. **Kural Motoru:** Uygulama içinde bu 10'ar günlük periyotları hesaplayan bir fonksiyon yazılmalı.
3. **Görselleştirme:** Analiz sayfasında, müşteri listesinin yanında bu renk kodlarını içeren bir "Risk Durumu" sütunu eklenmeli.

---
**Oturum Özeti:** Cem ile mizan verilerini kullanarak kademeli (10 gün periyotlu), renk kodlu (Sarı-Turuncu-Kırmızı) ve bakiye odaklı bir risk takip sistemi tasarlandı.
