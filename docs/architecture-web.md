# Architecture - Web (Frontend)

This document describes the architectural design and patterns used in the React frontend application.

## Executive Summary
The frontend is a modern Single Page Application (SPA) built with React and Vite. It serves as the primary interface for tracking customs procedures, payroll, and logistics operations.

## Technology Stack
- **Framework:** React 18
- **Build Tool:** Vite
- **Styling:** Tailwind CSS + Shadcn UI
- **State Management:** TanStack Query (Server State), React Hook Form (Form State)
- **Routing:** Wouter
- **Charts:** Recharts

## Architecture Pattern
The frontend follows a **Feature-Based** component architecture:

- **Pages (`/pages`)**: The top-level components mapped to routes. They orchestrate the data fetching and layout for a specific module.
- **Components (`/components`)**: 
    - **UI Components**: Atomic, reusable elements (buttons, modals, inputs).
    - **Domain Components**: Composite elements representing business entities (AdvancedChart, FinancialOverview).
- **Core Strategy**: Separation of concerns between UI presentation and data fetching logic (using hooks and Query Client).

## Data Flow
1. User interacts with a Page component.
2. The component uses a custom TanStack Query hook to fetch data.
3. Data is passed down to Display components (e.g., Tables, Charts).
4. User actions (e.g., uploads) trigger Mutations.
5. Successful mutations invalidate relevant query keys, triggering an automatic UI refresh.

## Source Tree Highlights
- `src/App.tsx`: Central router and theme provider.
- `src/pages/Gumruk.tsx`: Most complex page, handling multi-tab analysis and Excel uploads.
- `src/components/AdvancedChart.tsx`: Shared analytics engine for visualizing business trends.

## Key Design Decisions
- **Tailwind CSS**: Chosen for rapid UI development and consistent design system.
- **Wouter**: Selected for its minimal footprint and ease of use compared to React Router.
- **Shadcn UI**: Provides a premium, high-quality component foundation that is fully customizable.
