# Project Overview

`cnctracker` is a comprehensive business management and tracking application designed for a company specializing in customs procedures, logistics, and insurance services.

## Core Purpose

The application centralizes diverse business data streams—from customs declarations and payroll files to insurance policies and logistics invoices—into a single, AI-powered platform for analysis and reporting.

## Key Modules

### 1. Customs Management (Gümrük)
Tracks customs procedures and provides detailed financial analysis, including company-level summaries and trend charts. Supports bulk data ingestion via Excel files.

### 2. Insurance Tracking (Sigorta)
Manages insurance policies and accounting records for agencies (e.g., Mapfre, Ray Sigorta). Features an automated matching logic to verify accounting entries against active policies.

### 3. Payroll & HR (Çalışanlar)
Automates Turkish payroll calculations (2025-2026) and maintains employee records. Supports parsing of official Bordro PDF files to extract salary information and social security costs.

### 4. Transportation & Logistics (Nakliye)
Tracks logistics invoices and operations. Integrates with N8N webhooks for automated data entry from processed documents.

### 5. AI Assistant
A natural language interface that allows users to query the entire database, ask for summaries, or perform calculations using generative AI.

## Technical Architecture Summary

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React, Vite, Tailwind CSS, TanStack Query |
| **Backend** | Node.js, Express, Passport.js |
| **Database** | PostgreSQL (Neon), Drizzle ORM |
| **Integrations** | OpenAI, Anthropic, N8N, TCMB |

## Key Documentation

- [**Architecture (Web)**](./architecture-web.md)
- [**Architecture (Backend)**](./architecture-backend.md)
- [**API Contracts**](./api-contracts-backend.md)
- [**Data Models**](./data-models-backend.md)
- [**Source Tree Analysis**](./source-tree-analysis.md)
- [**Development Guide**](./development-guide.md)
- [**Deployment Guide**](./deployment-guide.md)
