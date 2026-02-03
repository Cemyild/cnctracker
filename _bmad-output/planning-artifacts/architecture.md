---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-02-03T04:32:00Z'
inputDocuments: 
  - docs/index.md
  - docs/project-overview.md
  - docs/architecture-web.md
  - docs/architecture-backend.md
  - docs/integration-architecture.md
  - docs/data-models-backend.md
project_name: 'cnctracker'
user_name: 'Cem'
date: '2026-02-03T04:15:00Z'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- **Customs Tracking:** Bulk Excel upload, financial reporting by company, trend analysis.
- **Insurance Management:** Policy tracking (Mapfre, Ray) and automated accounting matching.
- **Payroll (Bordro):** 2025-2026 Turkish payroll calculation (Normal, Retired, Manager statuses), PDF parsing for source data.
- **Logistics/Nakliye:** Invoice tracking with N8N webhook integration for automated data entry.
- **AI Assistant:** Natural language query interface (Text-to-SQL) for multi-domain data analysis.

**Non-Functional Requirements:**
- **Data Integrity:** `rowHash` based deduplication for bulk uploads (Customs, Insurance).
- **Security:** Session-based authentication via Passport.js, Zod validation for all API inputs.
- **Performance:** Efficient handling of bulk data (Excel/PDF) and complex SQL queries for AI-driven analysis.
- **Accuracy:** Dynamic Turkish payroll logic updated for 2026 legal changes.

**Scale & Complexity:**
The project is a **Medium-to-High** complexity business application. While it follows a monolithic architecture, it manages diverse domains (Logistics, Insurance, HR, Customs) each with unique business rules and external integrations.

- Primary domain: Full-Stack Web App (B2B SaaS style)
- Complexity level: Medium-High
- Estimated architectural components: ~12-15 (Frontend Pages, Backend Storage/Routes, Shared logic, AI Services, Webhooks)

### Technical Constraints & Dependencies

- **Database:** PostgreSQL (Neon) via Drizzle ORM (Serverless constraint).
- **Frontend Stack:** React 18, Vite, Tailwind CSS, TanStack Query, Shadcn UI.
- **Backend Stack:** Node.js Express, Passport.js.
- **AI Dependencies:** OpenAI (GPT) and Anthropic (Claude) SDKs.
- **External Integration:** TCMB (FX rates), N8N (Logistics webhooks).

### Cross-Cutting Concerns Identified

- **Turkish Tax/Legal Logic:** Payroll calculations spanning multiple years (2025/2026) and sectors.
- **Document Processing:** Extraction of structured data from non-structured sources (Excel, PDF, JSON).
- **State Management:** Complex synchronization between server-side data and client-side visualization (Charts, Tables).
- **Data Consistency:** Cross-domain reporting (e.g., matching insurance payments to policies).

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Web Application (SaaS) based on project requirements analysis.

### Starter Options Considered

1. **Current Custom Foundation (Vite + React + Express + Drizzle):**
   - **Pros:** Already implemented, specifically tailored for Turkish business rules, integrated AI services (OpenAI/Anthropic SDKs).
   - **Cons:** Requires manual maintenance of shared logic and legal constants (e.g., bordro parameters).

2. **T3 Stack (Next.js, Tailwind, Prisma, tRPC):**
   - **Pros:** Type-safety end-to-end, highly opinionated toward production-readiness.
   - **Cons:** Migration cost would be high; current Express-based system handles custom webhooks (N8N) and large file processing (PDF/Excel) effectively.

### Selected Starter: Current Project Foundation

**Rationale for Selection:**
The current `cnctracker` foundation is robust and already incorporates modern 2026 best practices: Vite for fast frontend delivery, Express for flexible backend logic, and Drizzle/Neon for serverless PostgreSQL performance. It specifically supports the complex Turkish payroll (Bordro) and customs processing logic that a generic template would miss.

**Initialization Command:**
Not applicable (Existing project). Maintenance and extension should follow the established patterns in `client/`, `server/`, and `shared/`.

**Architectural Decisions Provided by Foundation:**

**Language & Runtime:**
- TypeScript 5.6+, Node.js 20+ (ESM).
- Strict type-checking across shared, client, and server layers.

**Styling Solution:**
- Tailwind CSS 3.4+ for utility-first styling.
- Shadcn UI for premium, accessible component foundation.

**Build Tooling:**
- Vite 5+ for frontend bundling and dev server (HMR).
- tsx/esbuild for backend execution.

**Testing Framework:**
- Currently minimal automated testing; Recommendation: Integrate **Vitest** for unit/logic tests and **Playwright** for E2E flows.

**Code Organization:**
- Feature-based frontend layout (`pages/`, `components/`).
- Layered backend abstraction (`routes.ts`, `storage.ts`).
- Unified schema and logic in `shared/`.

**Development Experience:**
- Hot reloading, integrated environment management (`.env`).
- Automated database schema pushes via `drizzle-kit`.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- **Data Persistence:** Use PostgreSQL (Neon) with Drizzle ORM (Confirmed established).
- **Authentication:** Passport.js session-based auth (Confirmed established).
- **Shared Logic:** Extract legal calculations (Bordro) to `shared/` for consistency (Confirmed established).

**Important Decisions (Shape Architecture):**
- **Validation:** End-to-end type safety using Zod schemas (`drizzle-zod`).
- **AI Integration:** Direct SDK integration (OpenAI/Anthropic) managed in `server/lib/`.
- **State Management:** TanStack Query for caching and server-state synchronization.

**Deferred Decisions (Post-MVP):**
- **Mobile App:** Potential React Native branch (Currently out of scope).
- **Multi-region DB:** Scaling Neon beyond single region (Not currently needed).

### Data Architecture
- **Database:** PostgreSQL on Neon (Serverless).
- **Schema Management:** Drizzle ORM (`shared/schema.ts`).
- **Migration Policy:** Agile schema evolution via `drizzle-kit push`.
- **Integrity Layer:** `rowHash` for avoiding duplicates in bulk imports.

### Authentication & Security
- **Providers:** Local Passport strategy.
- **Session Store:** `connect-pg-simple` using the PostgreSQL database.
- **Input Security:** Zod validation on every API endpoint.
- **Middleware:** Passport-managed session checks for protected routes.

### API & Communication Patterns
- **Protocol:** RESTful JSON API via Express.
- **Webhook Integration:** Dedicated receiver for N8N logistics pipelines.
- **Response Format:** Standardized JSON with error boundary handling.

### Frontend Architecture
- **Modern React:** Usage of functional components and hooks (React 18).
- **Routing:** Minimalist routing with `wouter`.
- **UI System:** Shadcn UI (Atomic) + Domain-specific charts/overviews (Composite).

### Infrastructure & Deployment
- **Hosting:** Hetzner Cloud (VPS).
- **Process Manager:** PM2 for zero-downtime restarts and monitoring.
- **Environment Management:** Multi-stage `.env` (dev, prod).

### Decision Impact Analysis

**Implementation Sequence:**
1. Maintain Schema (`shared/schema.ts`) as the single source of truth.
2. Extend `storage.ts` for new domain entities.
3. Build new Pages using the established Shadcn + TanStack Query pattern.

**Cross-Component Dependencies:**
Changes to `shared/schema.ts` must be followed by `db:push` and frontend query invalidation.
- **Legal Rules:** Updates to `shared/salaryCalculations.ts` must be manually verified against 2026 legal docs.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
6 areas where AI agents could make different choices: Naming, Structure, Formatting, Communication, Processing, and Legal Logic.

### Naming Patterns

**Database Naming Conventions:**
- **Tables:** snake_case, plural (e.g., `gumruk_verileri`, `calisanlar`).
- **Columns:** camelCase (e.g., `dosyaNo`, `faturaTarihi`) - *Note: Based on existing schema in shared/schema.ts.*
- **Primary Keys:** `id` (UUID).

**API Naming Conventions:**
- **Endpoints:** kebab-case, feature-prefixed (e.g., `/api/gumruk/upload`, `/api/nakliye/webhook-receiver`).
- **Methods:** Semantic HTTP verbs (GET for fetch, POST for create/process).

**Code Naming Conventions:**
- **Components:** PascalCase (e.g., `FinancialOverview.tsx`).
- **Files:** PascalCase for components, camelCase for hooks/utilities.
- **Variables/Functions:** camelCase (e.g., `calculateAnnualCost`).

### Structure Patterns

**Project Organization:**
- **Frontend:** Feature-based pages in `client/src/pages/`, atomic components in `client/src/components/ui/`.
- **Backend:** Centralized routes in `server/routes.ts`, storage abstraction in `server/storage.ts`.
- **Shared:** Critical business logic and schema in `shared/`.

### Format Patterns

**API Response Formats:**
- Direct JSON response for success.
- 4xx/5xx status codes with `{ message: string }` for errors.
- Dates: ISO 8601 strings in API; "DD.MM.YYYY" for Turkish UI display.

**Data Exchange Formats:**
- JSON field naming: camelCase (matching database columns and Zod schemas).

### Process Patterns

**Error Handling Patterns:**
- **Backend:** Zod validation at the route level; try-catch blocks in storage/service methods.
- **Frontend:** `useToast` for user notifications; ErrorBoundary for component-level crashes.

**Loading State Patterns:**
- **Frontend:** TanStack Query `isLoading` status with Skeleton or Spinner overlays.

### Legal Consistency Patterns (Bordro)
- **Calculation Source:** MUST reference `shared/salaryCalculations.ts` or `shared/salaryCalculations2026.ts`.
- **Version Control:** Legal parameters MUST be updated annually in the `shared/` directory.

### Enforcement Guidelines

**All AI Agents MUST:**
- Read `shared/schema.ts` before creating any database-related objects.
- Use `queryClient.invalidateQueries` after successful mutations to ensure UI sync.
- Follow the Turkish localization standards for labels and formatting.

### Pattern Examples

**Good Examples:**
- `const [data] = await db.select().from(gumrukVerileri).where(...);` (Clean Drizzle usage).
- `export const FinancialChart = ({ data }: Props) => { ... }` (Prop-driven component).

**Anti-Patterns:**
- Inline SQL strings (Always use Drizzle).
- Client-side only calculations for critical financial data (Use `shared/`).

## Project Structure & Boundaries

### Complete Project Directory Structure

```
cnctracker/
├── client/                 # React Frontend (Vite)
│   ├── src/
│   │   ├── components/     # UI & Domain components
│   │   ├── hooks/          # Data fetching (TanStack Query)
│   │   ├── lib/            # Frontend utilities
│   │   ├── pages/          # Business module pages
│   │   ├── App.tsx         # Root router
│   │   └── main.tsx        # Entry point
│   └── index.html
├── server/                 # Express Backend
│   ├── lib/                # External services (AI, FX)
│   ├── index.ts            # Server entry point
│   ├── routes.ts           # REST & Webhook endpoints
│   └── storage.ts          # Database repository (Drizzle implementation)
├── shared/                 # Shared logic (Single-source-of-truth)
│   ├── schema.ts           # Drizzle schema & Zod types
│   └── salaryCalculations.ts # 2025/2026 Payroll logic
├── docs/                   # System documentation
├── _bmad/                  # Agentic workflow definitions
├── drizzle.config.ts       # Database configuration
├── package.json            # Project dependencies
├── tailwind.config.ts      # CSS design system
└── tsconfig.json           # TypeScript configuration
```

### Architectural Boundaries

**API Boundaries:**
- The `/api/*` prefix separates standard REST actions from asset serving.
- Dedicated `/api/nakliye/webhook-receiver` for high-volume inbound logistics data.

**Component Boundaries:**
- **Atomic Components:** Reusable UI elements (Shadcn) in `client/src/components/ui/`.
- **Domain Components:** Business-specific visualizations in `client/src/components/`.
- **Page Components:** Module-specific orchestrators in `client/src/pages/`.

**Service Boundaries:**
- **Storage Layer:** Abstracted `IStorage` interface in `server/storage.ts` protects logic from DB changes.
- **AI Service:** Dedicated functions in `server/lib/openai.ts` isolate LLM complexities.

**Data Boundaries:**
- **Schema:** Defined exclusively in `shared/schema.ts` to prevent desync between Frontend/Backend.

### Requirements to Structure Mapping

**Feature/Epic Mapping:**
- **Customs (Gümrük):** `client/src/pages/Gumruk.tsx`, `server/storage.ts` (gumruk_verileri).
- **Insurance (Sigorta):** `client/src/pages/Sigorta.tsx`, `server/storage.ts` (sigorta_policeleri).
- **Payroll (Bordro):** `client/src/pages/Calisanlar.tsx`, `shared/salaryCalculations.ts`.
- **Logistics (Nakliye):** `client/src/pages/Nakliye.tsx`, `server/routes.ts` (webhook receiver).
- **AI Assistant:** `server/lib/openai.ts`, `client/src/components/ChatAssistant.tsx`.

**Cross-Cutting Concerns:**
- **Legal Rules:** `shared/salaryCalculations.ts` serves both calculations and UI previews.
- **Data Deduplication:** `server/storage.ts` (using `rowHash` checks).

### Integration Points

**Internal Communication:**
- **Query Flow:** Page → Hook (`src/hooks/`) → API (`server/routes.ts`) → Storage (`server/storage.ts`).
- **Mutation Flow:** Page → Mutation Hook → API → Schema Validation (Zod) → Database.

**External Integrations:**
- **Neon DB:** Direct Drizzle connection from the Express backend.
- **OpenAI/Anthropic:** SDK calls from `server/lib/`.
- **N8N:** Inbound HTTP POST webhooks to `/api/nakliye/webhook-receiver`.
- **TCMB:** Scraping/fetching exchange rates in `server/currency.ts`.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
High. Technology choices (Vite, Express, Drizzle, Neon) are well-integrated and optimized for a serverless-friendly PostgreSQL environment.

**Pattern Consistency:**
Verified. The implementation patterns (Atomic/Domain UI, Abstracted Storage) directly support the core architectural goals of type safety and business logic centralization.

**Structure Alignment:**
Confirmed. The directory structure cleanly separates client, server, and shared concerns, enabling precise code updates and minimizing regression risks.

### Requirements Coverage Validation ✅

**Epic/Feature Coverage:**
- **Customs/Insurance:** Full support through bulk data processing and `rowHash` deduplication.
- **Bordro:** Centralized 2026 legal logic in `shared/` ensures consistency across platforms.
- **Logistics:** N8N webhook integration is architecturally isolated for stability.
- **AI Assistant:** Managed via specialized lib service with direct LLM integration.

**Functional Requirements Coverage:**
All core modules (Bordro, Sigorta, Gumruk, Nakliye) have dedicated storage methods and UI routes defined.

**Non-Functional Requirements Coverage:**
Security (Passport.js), Performance (Vite/Neon), and Accuracy (Shared legal logic) are integrated as foundational elements.

### Implementation Readiness Validation ✅

**Decision Completeness:**
All critical paths (Auth, DB, State, AI) are documented with specific version targets (validated for 2026 readiness).

**Structure Completeness:**
The complete directory tree is mapped to specific business requirements.

**Pattern Completeness:**
Naming conventions, error handling, and loading state patterns are clearly defined.

### Gap Analysis Results

**Critical Gaps:**
None found. The architecture is robust and ready for implementation.

**Important Gaps:**
- **Testing:** Minimal unit/E2E test infrastructure. Recommendation: Integrate Vitest/Playwright.

**Nice-to-Have Gaps:**
- **Monitoring:** Sentry or equivalent for production error tracking.

### Architecture Completeness Checklist

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**
- Single source of truth for legal calculations in `shared/`.
- Robust data integrity layer with `rowHash`.
- Modern, high-performance tech stack (Vite + Drizzle).

**Areas for Future Enhancement:**
- Automated E2E testing for complex Bordro tables.

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented.
- Use implementation patterns consistently across all components.
- Respect project structure and boundaries.
- Refer to this document for all architectural questions.

**First Implementation Priority:**
Verification of 2026 Bordro parameters in `shared/salaryCalculations2026.ts` against the latest legal docs.
