# Source Tree Analysis

This document provides an annotated view of the project's directory structure and the purpose of its various components.

## Project Overview

The project is organized as a **Multi-part Monolith**, with distinct directories for the frontend (`client/`) and backend (`server/`). Shared code, such as database schemas and business logic calculations, resides in the `shared/` directory.

## Annotated Directory Tree

```text
cnctracker/
├── client/                 # Frontend (React + Vite)
│   ├── public/             # Static assets (favicons, etc.)
│   └── src/
│       ├── components/     # UI Components
│       │   ├── ui/         # Atomic components (Shadcn UI)
│       │   └── ...         # Domain-specific components
│       ├── hooks/          # Custom React hooks
│       ├── lib/            # Utility functions and API clients
│       ├── pages/          # Route-based page components
│       ├── App.tsx         # Main App component & routing
│       ├── index.css       # Global styles (Tailwind)
│       └── main.tsx        # Application entry point
├── server/                 # Backend (Express + Node.js)
│   ├── lib/                # Internal server libraries (OpenAI, etc.)
│   ├── currency.ts         # Currency exchange rate logic
│   ├── db.ts               # Database connection and Drizzle init
│   ├── index.ts            # Server entry point and middleware
│   ├── routes.ts           # REST API route definitions
│   └── storage.ts          # Database interaction layer (IStorage)
├── shared/                 # Shared logic between Client and Server
│   ├── salaryCalculations.ts # Complex payroll & cost logic
│   └── schema.ts           # Drizzle database & Zod schemas
├── docs/                   # Project documentation (this folder)
├── scripts/                # Build and maintenance scripts
├── attached_assets/        # Source documents and sample data
├── drizzle/                # Drizzle migrations and metadata
├── .agent/                 # Agentic workflow configurations
└── _bmad/                  # BMM (Business Management Model) framework
```

## Critical Files & Entry Points

### Development Entry Points
- **Frontend:** `client/src/main.tsx`
- **Backend:** `server/index.ts`
- **Build Script:** `script/build.ts`

### Configuration Files
- **`package.json`**: Project dependencies and scripts.
- **`vite.config.ts`**: Frontend build and dev server configuration.
- **`tailwind.config.ts`**: Styling configuration.
- **`drizzle.config.ts`**: Database migration settings.
- **`.env`**: Environment variables (Database URL, API Keys).

### Business Logic
- **`shared/salaryCalculations.ts`**: Centralized logic for Turkish payroll calculations (2025/2026 rates).
- **`server/storage.ts`**: Implementation of data persistence and retrieval.
- **`server/routes.ts`**: API orchestration and file processing (XLSX/PDF parse).

## Integration Points

- **Frontend to Backend:** The React app calls the Express API via JSON over HTTP.
- **Backend to Database:** Uses `drizzle-orm` to communicate with a Neon PostgreSQL instance.
- **External APIs:**
    - **OpenAI/Anthropic:** Used for natural language processing in the AI Assistant.
    - **TCMB (Currency):** Fetches exchange rates for expense calculations.
    - **N8N:** Receives automated data via webhooks for transportation tracking.
