---
stepsCompleted: [1]
inputDocuments: 
  - docs/project-overview.md
  - _bmad-output/planning-artifacts/architecture.md
  - docs/ui-component-inventory-web.md
  - turkey_payroll_2026.md
---

# cnctracker - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for cnctracker, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Customs Management - Bulk Excel upload for customs data.
FR2: Customs Management - Financial reporting by company.
FR3: Customs Management - Trend analysis and charts for customs procedures.
FR4: Insurance Management - Policy tracking for Mapfre, Ray etc.
FR5: Insurance Management - Automated matching of accounting records against active policies.
FR6: Payroll & HR - Automated Turkish payroll calculations for 2025.
FR7: Payroll & HR - Automated Turkish payroll calculations for 2026 based on official legal parameters.
FR8: Payroll & HR - Parsing official Bordro PDF files to extract salary information and social security costs.
FR9: Transportation & Logistics - Invoice tracking and operational data management.
FR10: Transportation & Logistics - N8N webhook integration for automated data entry from processed documents.
FR11: AI Assistant - Natural language interface for database querying and Text-to-SQL generation.
FR12: AI Assistant - Generative AI summaries and calculations based on multi-domain data.
FR13: User Management - Session-based authentication via Passport.js.

### NonFunctional Requirements

NFR1: Data Integrity - `rowHash` based deduplication for bulk uploads.
NFR2: Security - Session-based authentication via Passport.js.
NFR3: Security - Zod validation for all API inputs.
NFR4: Performance - Efficient handling of bulk data (Excel/PDF).
NFR5: Performance - Optimization of complex SQL queries for AI analysis.
NFR6: Accuracy - Dynamic Turkish payroll logic updated for annual legal changes.
NFR7: Scalability - Neon (serverless PostgreSQL) for database scaling.
NFR8: Reliability - Error boundary handling in API and UI.

### Additional Requirements

- **Starter Foundation**: Existing project foundation (Vite + React + Express + Drizzle).
- **Core Stack**: React 18, Vite 5+, Tailwind 3.4+, TanStack Query, Shadcn UI.
- **Backend Stack**: Node.js 20+ (ESM), Express, Drizzle ORM, Neon PostgreSQL.
- **AI Integration**: OpenAI and Anthropic SDK integration managed in `server/lib/`.
- **External Integrations**: TCMB (FX rates), N8N (Logistics webhooks).
- **Architecture Principle**: Clean separation between `client/`, `server/`, and `shared/`.
- **Legal Reliability**: MUST use `shared/salaryCalculations.ts` for all payroll math.
- **UX pattern**: "AdvancedChart.tsx" with group-by options and trend analysis.
- **UX pattern**: "AIChat.tsx" for the AI interface.
- **UX pattern**: Standardized "ExcelUploadModal.tsx" for all modules.
- **UX pattern**: Theme support (Dark/Light mode).

### FR Coverage Map

FR1: Epic 2 - Gümrük verileri toplu Excel yükleme
FR2: Epic 2 - Şirket bazlı finansal raporlama
FR3: Epic 2 - Gümrük trend analizi ve grafikleri
FR4: Epic 3 - Sigorta poliçe takibi
FR5: Epic 3 - Muhasebe kayıtları otomatik eşleştirme
FR6: Epic 4 - 2025 Bordro hesaplamaları
FR7: Epic 4 - 2026 Bordro hesaplamaları (Yasal parametreler)
FR8: Epic 4 - Bordro PDF parse sistemi
FR9: Epic 5 - Nakliye fatura ve operasyon takibi
FR10: Epic 5 - N8N webhook entegrasyonu
FR11: Epic 6 - Doğal dille veritabanı sorgulama (Chat)
FR12: Epic 6 - AI tabanlı özet ve hesaplamalar
FR13: Epic 1 - Passport.js oturum yönetimi ve giriş sistemi

## Epic List

### Epic 1: Temel Altyapı ve Kimlik Doğrulama
Kullanıcıların sisteme güvenli giriş yapabilmesi ve temel uygulama iskeletinin (Layout, Sidebar, Auth context) stabil çalışması.
**FRs covered:** FR13, NFR2, NFR3.

### Epic 2: Gümrük İşlemleri ve Finansal Raporlama
Gümrük verilerinin Excel üzerinden sisteme aktarılması, şirket bazlı özetler ve performans grafiklerinin izlenmesi.
**FRs covered:** FR1, FR2, FR3, NFR1, NFR4.

### Epic 3: Sigorta Takibi ve Muhasebe Eşleştirme
Farklı acentelerden gelen poliçelerin yönetimi ve muhasebe kayıtlarıyla doğruluğunun otomatik kontrol edilmesi.
**FRs covered:** FR4, FR5, NFR8.

### Epic 4: 2026 Bordro ve İK Yönetimi
2025 ve özellikle 2026 yasal parametrelerine uygun maaş hesaplama motoru ve PDF'den veri çekme sistemi.
**FRs covered:** FR6, FR7, FR8, NFR6.

### Epic 5: Nakliye Takibi ve Otomasyon
Nakliye faturalarının takibi ve N8N üzerinden gelen verilerin otomatik işlenmesi.
**FRs covered:** FR9, FR10.

### Epic 6: Yapay Zeka Destekli Analiz (AI Assistant)
Kullanıcıların tüm veritabanı üzerinde doğal dille sorgu yapabilmesi ve AI destekli rapor özetleri alabilmesi.
**FRs covered:** FR11, FR12, NFR5.
