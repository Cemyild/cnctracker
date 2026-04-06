title: 'Finansal Analiz ve Operasyonel Takip Modülü (Şube, Araç, Poliçe)'
slug: 'finansal-analiz-operasyonel-takip'
created: '2026-02-03T03:50:00Z'
status: 'in-progress'
stepsCompleted: [1, 2]
tech_stack: ['React', 'Drizzle ORM', 'PostgreSQL', 'Tailwind CSS', 'Recharts', 'date-fns']
files_to_modify: ['server/storage.ts', 'server/routes.ts', 'client/src/pages/Raporlar.tsx', 'shared/schema.ts']
code_patterns: [
  'Aylık/Yıllık filtreleme', 
  'Aggregation logic (SQL sum/count)', 
  'shadcn/ui Dashboard pattern',
  'TC-based Branch Mapping'
]
test_patterns: ['Manual UI verification', 'API data accuracy checks', 'Policy expiry date mock testing']
---

# Tech-Spec: Finansal Analiz ve Operasyonel Takip Modülü

**Created:** 2026-02-03

## Overview

### Problem Statement

Uygulama mevcut durumda Gümrük, Sigorta, Nakliye ve Personel verilerini topluyor ancak bu veriler arasındaki çapraz bağlar yeterince kurulmuş değil. İş operasyonlarının karlılığını şube bazında görememek, araçların masraf/kazanç dengesini takip edememek ve sigorta poliçelerinin bitiş tarihlerini proaktif olarak yönetememek stratejik bir eksiklik yaratıyor.

### Solution

Veri tabanındaki mevcut tabloları (gumruk_verileri, calisanlar, araclar, nakliye_verileri, sigorta_policeleri) birleştirerek üç ana odak noktasında analiz panelleri oluşturulacaktır:
1. **Şube Bazlı Kârlılık Dashboard'u**: Gümrük idareleri ve şirket şubelerine göre gelir/gider analizi.
2. **Araç Masraf ve Sigorta Takibi**: Plaka bazında sigorta/kasko masraflarının ve bitiş tarihlerinin takibi.
3. **Poliçe Takip & Hatırlatıcı**: Araçların ve diğer poliçelerin bitiş tarihlerine göre otomatik uyarı ve takvim paneli.

### Scope

**In Scope:**
- Backend: Şube bazlı veri birleştirme (aggregation) için yeni IStorage metodları.
- Backend: Poliçe bitiş tarihlerine göre "yaklaşanlar" endpoint'i.
- Frontend: `Raporlar` sayfasının zenginleştirilmesi veya yeni alt modüllerin oluşturulması.
- Frontend: `recharts` ile kârlılık grafiklerinin eklenmesi.
- Frontend: Yaklaşan poliçeler için görsel uyarı kartları.

**Out of Scope:**
- Otomatik e-posta veya SMS bildirimi (Şimdilik sadece UI üzerinden takip).
- GPS veya canlı araç takibi.
- Yeni bir veri giriş formu (Mevcut Excel import süreçleri kullanılacak).

## Context for Development

### Codebase Patterns

- **Data Fetching**: TanStack Query (`useQuery`) kullanımı.
- **Backend Storage**: Drizzle ORM tabanlı `storage.ts` üzerinde transactional veya complex SQL query'leri. `IStorage` arayüzü takip edilmelidir.
- **Styling**: Tailwind CSS ve Shadcn UI bileşenleri.
- **Calculations**: `shared/salaryCalculations.ts` gibi merkezi hesaplama mantığı kullanılmalı.
- **Tarih Formatı**: Veritabanında `YYYY-MM-DD` (ISO string) olarak tutulan tarihler `date-fns` ile işlenecek.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `shared/schema.ts` | Tablo yapıları ve `subeler` listesi. |
| `server/storage.ts` | Veri tabanı sorgularının yazılacağı ana yer. |
| `server/routes.ts` | Endpoint tanımları ve veri eşleştirme (branch mapping) mantığı. |
| `client/src/pages/Nakliye.tsx` | Mevcut konteyner/müşteri ayıklama mantığı (örnek alınacak). |
| `client/src/pages/Tools.tsx` | Bitiş tarihi yaklaşan araçların görsel uyarı mantığı. |

### Technical Decisions

- **Branch Attribution**: Gümrük işlem verileri (`gumruk_verileri`), işlemi yapan çalışanın (`giris_elemani`) T.C. Kimlik No'su veya adı üzerinden `calisanlar` tablosundaki `sube` alanı ile eşleştirilecektir.
- **Vehicle Costs**: Araç verimliliği paneli, araçlara ait sigorta ve kasko giderlerini (`araclar` ve `sigorta_policeleri` üzerinden) konsolide ederek sunacaktır.
- **Unified Reminder Dashboard**: Hem araçların sigortası hem de sistemdeki genel poliçeler tek bir "Hatırlatıcı" panelinde toplanacaktır.

## Implementation Plan

### Tasks

1.  **[Database]** `shared/schema.ts` dosyasına gümrük verileri için `sube` alanı eklenmesi (isteğe bağlı, aggregation ile çözülebilir) veya yeni aggregasyon mantığının kurulması.
2.  **[Backend]** `IStorage` arayüzüne `getBranchProfitability`, `getVehicleExpenses` ve `getUpcomingPolicies` metodlarının eklenmesi.
3.  **[Backend]** `storage.ts` içinde bu metodların SQL veya Drizzle ile implementasyonu.
4.  **[Backend]** `routes.ts` üzerinde yeni API endpoint'lerinin (`/api/raporlar/...`) oluşturulması.
5.  **[Frontend]** `Raporlar.tsx` sayfasının `Tabs` yapısı ile bölmelere (Şube, Araç, Poliçe) ayrılması.
6.  **[Frontend]** Şube Kârlılığı: Recharts Pie ve Bar chart ile gelir/gider dağılımı.
7.  **[Frontend]** Araç Masraf Takibi: Plaka bazlı harcama listesi ve toplam maliyet raporu.
8.  **[Frontend]** Poliçe Takip: Dashboard üstünde "Acil" ikonu ve yaklaşanlar listesi.

### Acceptance Criteria

- **Doğruluk**: Şube kârı = (O şubeye bağlı gümrük gelirleri) - (O şubeye bağlı personel maliyeti) - (Şubeye atanmış genel giderler).
- **Doğruluk**: Araç raporu = Plakaya bağlı sigorta + kasko masraflarının toplamı.
- **Görsel Uyarı**: Sigorta bitişine <30 gün kalan araçlar hem araçlar listesinde hem de ana raporda kırmızı vurgu ile görülmeli.

## Additional Context

### Dependencies

- Recharts (Grafikler için)
- Date-fns (Tarih hesaplamaları için)

### Testing Strategy

- Excel'den yüklenen örnek verilerle kârlılık rakamlarının manuel cross-check yapılması.
- Poliçe tarihlerinin değiştirilerek "yaklaşanlar" listesine düşüp düşmediğinin kontrolü.

### Notes

- Veri setinde şube ismi eşleşmelerine (Bursa, Gemlik vb.) titizlikle dikkat edilmelidir.
