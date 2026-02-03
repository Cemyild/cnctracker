# Architecture - Backend

This document describes the architectural design and patterns used in the Express backend server.

## Executive Summary
The backend is a Node.js Express server that provides a RESTful API for the frontend. It manages data persistence, authentication, file processing (XLSX, PDF), and integrates with AI services.

## Technology Stack
- **Runtime:** Node.js
- **Framework:** Express
- **Database:** PostgreSQL (hosted on Neon)
- **ORM:** Drizzle ORM
- **Authentication:** Passport.js
- **Validation:** Zod
- **External:** OpenAI & Anthropic SDKs

## Architecture Pattern
The backend uses a **Layered Pattern** with an **Internal Repository** abstraction:

- **Routing Layer (`routes.ts`)**: Defines HTTP endpoints, validates incoming requests using Zod, and handles file uploads.
- **Service/Logic Layer**: Orchestrates complex flows like PDF parsing or AI query processing.
- **Storage Layer (`storage.ts`)**: Abstracted via an `IStorage` interface. The `DatabaseStorage` class implements this interface using Drizzle ORM to perform SQL operations.
- **Shared Layer (`/shared`)**: Shared type definitions and business logic between frontend and backend.

## Data Persistence
- **Drizzle ORM:** Provides a type-safe way to interact with PostgreSQL.
- **Migrations:** Managed via `drizzle-kit push`, allowing for agile schema evolution.
- **Schema:** Defined in `shared/schema.ts`, using a single-source-of-truth approach for database tables and application types.

## Specialized Components
- **File Processing:** Multer handles memory-storage uploads. `xlsx` and `pdf-parse` are used to extract data from customs and payroll documents.
- **AI Integration:** A dedicated set of functions in `server/lib/openai.ts` handles the communication with LLMs, including context preparation and response formatting.
- **Currency Engine:** `server/currency.ts` manages exchange rate lookups from TCMB.

## Security
- **Passport.js:** Implements persistent session-based authentication.
- **Zod:** Ensures all data coming into the server matches expected schemas, preventing injection and corruption.
- **Environment Variables:** Critical secrets (API keys, DB strings) are managed via `.env`.
