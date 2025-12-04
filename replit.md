# CNC Customs Management Dashboard

## Overview

This is a full-stack web application for managing customs (Gümrük) operations in Turkey. The system allows users to upload Excel files containing customs data, view and analyze that data through an interactive dashboard, and track procedures, expenses, and payments. The application is designed as an enterprise-grade dashboard with support for multiple modules including customs (Gümrük), insurance (Sigorta), transportation (Nakliye), and reports (Raporlar).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework:** React 18+ with TypeScript using Vite as the build tool

**UI Component System:** 
- Radix UI primitives for accessible, unstyled components
- shadcn/ui component library (New York style variant)
- Tailwind CSS for styling with custom design tokens
- Framer Motion for animations (background paths, transitions)

**State Management:**
- TanStack Query (React Query) for server state management
- React hooks for local component state
- No global state management library (relies on server state and URL-based routing)

**Routing:** Wouter (lightweight client-side routing library)

**Design System:**
- Based on Fluent Design System with modern SaaS dashboard patterns
- Enterprise dashboard layout with fixed sidebar navigation (260px wide, collapsible to 60px)
- Responsive design with mobile drawer navigation
- Dark mode support with theme toggle
- Custom color tokens defined in CSS variables (HSL format)
- Typography using Inter font family from Google Fonts

**Key UI Patterns:**
- Card-based layouts for data visualization
- Table components for displaying customs records
- Modal dialogs for Excel file uploads
- Stat cards with color-coded variants (green, blue, yellow, gray)
- Animated background paths for visual interest

### Backend Architecture

**Framework:** Express.js with TypeScript

**Runtime:** Node.js with ES modules

**API Design:**
- RESTful endpoints under `/api` prefix
- File upload handling with Multer (memory storage)
- Excel file processing using XLSX library
- Row-level deduplication using MD5 hashes

**Key Endpoints:**
- `GET /api/gumruk/:ay/:yil` - Fetch customs data for specific month/year
- `GET /api/gumruk/aylar` - Get list of available months with data
- `POST /api/upload/:ay/:yil` - Upload Excel file with customs data

**Data Processing:**
- Excel files are parsed row-by-row
- Each row is hashed to prevent duplicates
- Bulk insert operations using Drizzle ORM
- Month/year-based data partitioning

### Database Layer

**ORM:** Drizzle ORM with PostgreSQL dialect

**Database Provider:** Neon serverless PostgreSQL with WebSocket support

**Schema Design:**
- `users` table - User authentication (currently minimal implementation)
- `gumruk_verileri` table - Customs data with compound unique index on (ay, yil, rowHash)

**Customs Data Model:**
- Month (ay) and year (yil) for temporal partitioning
- Transaction type (tip): H, T, A, B, @ or empty
- File numbers, company names, customs office (gumruk)
- Registration dates and numbers (tescil)
- Invoice details (fatura) with currency information
- Financial amounts: base price (mal_bedeli), discount (top_iskonto), VAT (top_kdv_tutar), total (top_fatura_tutar)
- Employee tracking: who created invoice, who entered data
- Row hash for deduplication

**Migration Strategy:**
- Drizzle Kit for schema migrations
- Schema-first approach with TypeScript definitions in `shared/schema.ts`

### Build System

**Development:**
- Vite dev server with HMR over custom path (`/vite-hmr`)
- TSX for running TypeScript directly in development
- Custom middleware mode integration with Express

**Production:**
- esbuild for server bundling with selective dependency bundling (allowlist approach)
- Vite for client bundling
- Single-file CJS output for server
- Static file serving from `dist/public`

**Bundle Optimization:**
- Key dependencies bundled to reduce syscalls and improve cold start times
- Allowlist includes: database drivers, authentication, email, payment processing, AI integrations
- External dependencies for lighter packages

### Code Organization

**Monorepo Structure:**
- `/client` - React frontend application
- `/server` - Express backend application
- `/shared` - Shared TypeScript types and schemas
- `/attached_assets` - Static assets and reusable components

**Path Aliases:**
- `@/` - Client source directory
- `@shared/` - Shared schemas and types
- `@assets/` - Attached assets directory

**Type Safety:**
- End-to-end type safety using Zod for runtime validation
- Drizzle-zod integration for schema validation
- Shared types between client and server via `/shared` directory

### Development Tooling

**TypeScript Configuration:**
- Incremental compilation enabled
- Strict mode enabled
- Module resolution: bundler (Vite-compatible)
- Path aliases for clean imports

**Code Quality:**
- Type checking with `tsc --noEmit`
- ESM-first approach throughout the stack

## External Dependencies

### Database
- **Neon PostgreSQL:** Serverless PostgreSQL database with WebSocket support for connection pooling
- **Drizzle ORM:** Type-safe database queries and migrations

### UI Framework
- **Radix UI:** Comprehensive set of accessible, unstyled React components (20+ component primitives)
- **shadcn/ui:** Pre-built component patterns on top of Radix
- **Tailwind CSS:** Utility-first CSS framework
- **Framer Motion:** Animation library for React

### Data Management
- **TanStack Query:** Server state management and caching
- **XLSX:** Excel file parsing and manipulation
- **Zod:** Runtime type validation and schema definition

### Development Tools
- **Vite:** Frontend build tool and dev server
- **esbuild:** Fast JavaScript/TypeScript bundler for production builds
- **TypeScript:** Static type checking
- **Wouter:** Lightweight routing solution

### Server Dependencies
- **Express.js:** Web application framework
- **Multer:** Multipart form data handling for file uploads
- **ws:** WebSocket library (required by Neon)

### Future Integrations (Referenced in Build Config)
The build configuration includes provisions for:
- AI integrations (OpenAI, Google Generative AI)
- Payment processing (Stripe)
- Email services (Nodemailer)
- Authentication (Passport.js with local strategy)
- Session management (express-session with PostgreSQL store)
- Rate limiting (express-rate-limit)