---
title: 'Müşteri Memnuniyeti Anket Sistemi'
slug: 'musteri-memnuniyeti-anket-sistemi'
created: '2026-04-06T18:15:00Z'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React', 'Drizzle ORM', 'Express', 'Tailwind CSS', 'shadcn/ui']
files_to_modify: ['shared/schema.ts', 'server/storage.ts', 'server/routes.ts', 'client/src/App.tsx', 'client/src/pages/Anketler.tsx', 'client/src/pages/PublicSurvey.tsx']
code_patterns: ['Drizzle schema standard (pgTable)', 'IStorage pattern', 'React Function Components']
test_patterns: ['No formal test framework detected, manual acceptance testing']
---

# Tech-Spec: Müşteri Memnuniyeti Anket Sistemi

**Created:** 2026-04-06

## Overview

### Problem Statement

Şirketin müşterilerinden yapılandırılmış, profesyonel, ölçülebilir ve hızlı geri bildirimler (1-5 arası puanlanabilen) alabileceği esnek bir anket altyapısının eksikliği.

### Solution

Dinamik bir Anket Modeli (`Surveys`) ve Cevap Modeli (`SurveyResponses`) kurularak sisteme "Müşteri Memnuniyet Anketi"nin profesyonelleştirilmiş hali varsayılan şablon (seeder) olarak eklenecek. İç panelde "Anketler" sekmesinde yanıtlar ısı haritalı (heatmap) yeşil/sarı/kırmızı göstergelerle okunabilir hale getirilecek. Modal üzerinden her cevabın 100 üzerinden durumu incelenebilecek. Müşteriler, uygulamanın dışında çalışan güvenli ve kullanıcı dostu public bir sayfa üzerinden (`/survey/:id`) auth olmadan anketi doldurabilecek.

### Scope

**In Scope:**
- `Surveys` ve `SurveyResponses` veritabanı Drizzle ORM schema modellerinin oluşturulması.
- Uygulama çalışınca veya seeding yapıldığında örnek anketin varsayılan sorularıyla yaratılması.
- Müşterilerin göreceği `/survey/:id` public sayfasının minimalist tasarımı.
- Admin panelindeki "Anketler" sekmesinde liste (firma adı, toplam puan) ve yanıta tıklanınca açılacak modal arayüzünün yapılması (ilerleme çubuğu grafikli).
- Her sorunun puanının 100 üzerinden (1 -> 20, 5 -> 100) dönüştürülmesi ve anket ortalama skorunun otomatik hesaplanması.

**Out of Scope:**
- Anket dağıtımını otomatize etmek (Linkler manuel olarak kopyalanıp müşterilere ulaştırılacaktır).
- Doğrudan fatura/gümrük beyannamelerine çapraz veri entegrasyonu (başlangıç için her anket bağımsızdır).

## Context for Development

### Codebase Patterns

- **Drizzle ORM**: `shared/schema.ts` kullanılarak `pgTable` tanımları yapılıp, `IStorage` interface'i ile `server/storage.ts` üzerinde veri erişim metotları uygulanmaktadır.
- **RESTful API**: `server/routes.ts` üzerinden API rotaları dışa açılmaktadır.
- **Frontend Mimari**: `client/src/pages` altında her modül kendi .tsx dosyasına sahiptir. Yeni eklenecek "Anketler" modülü de buraya eklenecektir.
- **UI Kit**: Uygulama Tailwind CSS ve shadcn/ui üzerine kurulu görünüyor. Modal (Dialog) ve Tablo (Table) sistemleri kullanılacaktır.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `shared/schema.ts` | `surveys` ve `surveyResponses` tablolarının Drizzle konfigürasyonu. |
| `server/storage.ts` | `IStorage` arayüzünün genişletilmesi ve veritabanı okuma/yazma işlemleri. |
| `server/routes.ts` | `/api/surveys` ve `/api/surveys/submit` gibi endpoint kurulumları. |
| `client/src/App.tsx` | Yeni anket yönetim sayfası ile public form sayfasının rotalanması. |
| `client/src/pages/Anketler.tsx` | Admin panelindeki Anket ve sonuç listeleme sayfası (Yeni). |
| `client/src/pages/PublicSurvey.tsx` | Dışa açık müşteri anket doldurma formu (Auth-less / Yeni). |

### Technical Decisions

- **Auth-less Public Form**: Müşterinin form doldurma bariyerini düşürmek için form gönderimine kimlik doğrulaması koyulmayacak.
- **Pre-computed Scores**: Performansı artırmak için `totalScore` backend'de hesaplanıp Response kaydı içerisine (cache mantığıyla) kaydedilecek.

## Implementation Plan

### Tasks

(To be elaborated in next steps)

### Acceptance Criteria

- Örnek sorular başarılı şekilde database'e eklenmiş (seed) olmalı.
- Puanlama 1-5'ten 20-100'lük skora sorunsuz çevrilmeli.
- Müşteriler yetkilendirme (login) engeline takılmadan anketi onaylayabilmeli.
- Liste üzerindeki okuma kolaylığı renk (ısı) haritasıyla sağlanmalı.

## Additional Context

### Dependencies

(To be defined)

### Testing Strategy

(To be defined)

### Notes

(To be noted)
