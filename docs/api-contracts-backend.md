# API Contracts - Backend

This document outlines the REST API endpoints provided by the backend server.

## Overview

- **Base URL:** `/api`
- **Authentication:** Passport.js (Local Strategy) session-based authentication.
- **Data Format:** JSON (Request/Response)

## Endpoints

### Vehicles (Araçlar)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/araclar` | List all vehicles. |
| `POST` | `/api/araclar` | Create a new vehicle. |
| `PUT` | `/api/araclar/:id` | Update an existing vehicle. |
| `DELETE` | `/api/araclar/:id` | Delete a vehicle. |

### Insurance (Sigorta)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/sigorta/policeler` | List insurance policies with filters (`sirket`, `ay`, `yil`). |
| `POST` | `/api/sigorta/policeler` | Create/upload insurance policies (supports array). |
| `DELETE` | `/api/sigorta/policeler` | Delete policies based on filters. |
| `GET` | `/api/sigorta/muhasebe` | List insurance accounting records. |
| `POST` | `/api/sigorta/muhasebe` | Upload insurance accounting records. |
| `PUT` | `/api/sigorta/muhasebe/:id/match` | Match an accounting record with a policy. |
| `GET` | `/api/sigorta/ozet/:yil` | Get yearly insurance summary. |

### Employees (Çalışanlar) & Payroll (Bordro)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/calisanlar` | List employees with filters (`ay`, `yil`, `toplam`). |
| `POST` | `/api/calisanlar` | Create/upload employees. |
| `PATCH` | `/api/calisanlar/:id` | Update employee details. |
| `DELETE` | `/api/calisanlar/:ay/:yil` | Delete all employee records for a specific month/year. |
| `POST` | `/api/bordro/upload` | Upload Payroll (PDF/Excel) and parse data. |
| `POST` | `/api/bordro/save` | Save parsed payroll data. |

### Transportation (Nakliye)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/nakliye` | List all transportation records. |
| `POST` | `/api/nakliye` | Create transportation records. |
| `PATCH` | `/api/nakliye/:id` | Update a transportation record. |
| `DELETE` | `/api/nakliye/:id` | Delete a transportation record. |
| `POST` | `/api/nakliye/webhook-receiver` | Automated receiver for N8N webhooks. |

### Customs (Gümrük)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/gumruk/veriler` | Get customs data for `ay` and `yil`. |
| `POST` | `/api/gumruk/upload` | Upload customs Excel file. |
| `GET` | `/api/gumruk/aylar` | List months that have customs data. |
| `GET` | `/api/gumruk/firmalar/:yil` | List unique companies for a year. |
| `GET` | `/api/gumruk/ozet/:yil` | Get monthly customs overview. |

### Expenses (Giderler)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/giderler` | List expenses with filters. |
| `POST` | `/api/giderler/upload` | Upload expenses Excel/PDF. |
| `DELETE` | `/api/giderler/:ay/:yil` | Delete expenses for a month/year. |

### AI Assistant (Chat)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/chat` | Natural language interface to query system data. |

## Webhooks

### N8N Webhook Receiver
- **Endpoint:** `POST /api/nakliye/webhook-receiver`
- **Source:** External N8N workflow
- **Purpose:** Automatically ingests transportation data extracted by AI from source documents.
