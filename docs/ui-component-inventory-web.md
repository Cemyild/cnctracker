# UI Component Inventory - Web

This document provides an overview of the UI component library used in the frontend. The project uses a combination of custom domain-specific components and a standard UI library based on Radix UI and Tailwind CSS (Shadcn UI).

## Core UI Library (Shadcn UI)

Most atomic and layout components are located in `client/src/components/ui/`.

| Category | Components |
| :--- | :--- |
| **Layout** | `Sidebar`, `Card`, `Resizable`, `ScrollArea`, `Separator`, `Accordion` |
| **Forms** | `Button`, `Input`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Textarea`, `Form` |
| **Data Display** | `Table`, `Badge`, `Avatar`, `Chart`, `Carousel`, `Progress`, `Skeleton` |
| **Navigation** | `NavigationMenu`, `Pagination`, `Tabs`, `Breadcrumb`, `Menubar` |
| **Feedback** | `Alert`, `AlertDialog`, `Toast`, `Toaster`, `Tooltip` |
| **Overlays** | `Dialog`, `Popover`, `Sheet`, `Drawer`, `HoverCard`, `ContextMenu`, `Command` |
| **Specialized** | `Calendar`, `InputOTP` |

## Domain-Specific Components

Located in `client/src/components/`. These components implement business logic and complex UI patterns.

### Data Visualization
- **`AdvancedChart.tsx`**: A comprehensive charting component using Recharts. Supports multiple group-by options (month, employee, company, customs, issuer) and trend analysis.
- **`FinancialOverview.tsx`**: Provides a high-level summary of sales, expenses, and profitability metrics. Used in the Dashboard and Gümrük pages.

### Infrastructure & Interaction
- **`AIChat.tsx`**: An interactive chat interface that communicates with the `/api/chat` endpoint, allowing users to query data using natural language.
- **`AppSidebar.tsx`**: The main navigation sidebar for the application.
- **`ExcelUploadModal.tsx`**: A standardized modal for uploading Excel/PDF files, used across Gümrük, Nakliye, and Calisanlar modules.
- **`ThemeToggle.tsx`**: Switch between light and dark mode.

### Display Elements
- **`StatCard.tsx`**: A simple card for displaying key metrics (e.g., total sales, file count).
- **`ProcedureCard.tsx`**: Specialized card for displaying customs procedure details.
- **`BackgroundPaths.tsx`**: Aesthetic background animation component.

## Icons
The project uses **Lucide React** for all iconography.
