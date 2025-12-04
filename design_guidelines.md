# CNC Dashboard Design Guidelines

## Design Approach: Enterprise Dashboard System

**Selected Framework:** Fluent Design System with modern SaaS dashboard patterns
**Rationale:** Data-heavy enterprise application requiring clear information hierarchy, efficient navigation, and professional polish. Drawing from Linear, Vercel Dashboard, and modern admin interfaces.

---

## Core Layout Structure

### Application Shell
- **Sidebar Navigation:** Fixed left sidebar, 260px wide on desktop, collapsible to 60px (icon-only)
- **Main Content Area:** Full height with max-w-7xl container, px-8 py-6
- **Header Bar:** Sticky top bar with breadcrumbs, search, user menu - h-16
- **Responsive:** Mobile uses slide-out drawer navigation (full overlay)

### Grid System
- **Stat Cards:** Grid layout - grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- **Data Cards:** Grid layout - grid-cols-1 lg:grid-cols-3
- **Spacing Units:** Consistent use of 4, 6, 8, 12 for gaps and padding

---

## Typography System

### Font Family
**Primary:** Inter via Google Fonts CDN
```
weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
```

### Hierarchy
- **Page Title:** text-2xl font-bold (Dashboard heading)
- **Card Title:** text-base font-semibold
- **Section Label:** text-sm font-medium uppercase tracking-wide
- **Stats Numbers:** text-3xl font-bold
- **Body Text:** text-sm font-normal
- **Secondary Text:** text-xs font-normal

---

## Spacing System

**Tailwind Units:** Primarily use 2, 4, 6, 8, 12, 16

### Component Spacing
- **Card Padding:** p-6
- **Card Gap:** gap-6 between cards
- **Section Margins:** mb-8 between major sections
- **Icon-Text Gap:** gap-2 for icon + label pairs
- **Content Padding:** px-8 py-6 for main content area

---

## Component Library

### Navigation Sidebar
- Logo at top (h-16 with p-4)
- Navigation items: h-10 with rounded-lg hover states
- Icons: 20px (Heroicons) positioned left
- Active state: subtle background treatment
- Section dividers with text-xs labels
- User profile at bottom with avatar (40px) + name + logout

### Stat Cards (Top Row - 4 Cards)
- Rounded corners (rounded-xl)
- Border treatment (border)
- Each card contains:
  - Icon in circle (48px diameter)
  - Large number (text-3xl font-bold)
  - Label text (text-sm)
  - Small trend indicator with percentage

### Data Cards (Bottom Row - 3 Cards)
- Header with title + "View All" link
- List of items (each with icon, title, subtitle, status badge)
- Each item has subtle hover state
- Max 5-6 visible items per card
- Footer action button

### Header Components
- Search input with icon (w-64 to w-96)
- Notification bell with badge
- User dropdown menu
- All aligned with items-center justify-between

### Status Badges
- Pill-shaped (rounded-full px-3 py-1)
- Small text (text-xs font-medium)
- Different semantic states (active, pending, completed, overdue)

---

## Background Treatment

### Animated Paths
- Use provided background-paths component
- Positioned absolute with inset-0
- Low opacity for subtlety (10-15%)
- Gradient background base layer
- Paths should not interfere with readability

---

## Icons

**Library:** Heroicons (outline style) via CDN
**Common Icons:**
- Dashboard: home
- Procedures: document-text
- Expenses: currency-dollar
- Payments: credit-card
- Reports: chart-bar
- Settings: cog-6-tooth
- User: user-circle
- Logout: arrow-right-on-rectangle
- Trend up/down: arrow-trending-up/down

---

## Interaction Patterns

### Navigation
- Hover states with subtle background
- Active page with visual indicator
- Smooth transitions (transition-colors duration-200)

### Cards
- Subtle hover elevation (transform hover:scale-[1.02])
- Clickable cards have cursor-pointer
- No aggressive shadows at rest

### Buttons
- Primary actions: rounded-lg with px-4 py-2
- Secondary actions: text links with hover underline
- Icon buttons: 40px square touch targets

---

## Images

**No hero images required** - this is a dashboard application focused on data display and navigation efficiency.

---

## Responsive Breakpoints

- **Mobile (< 768px):** Single column, hamburger menu, stacked cards
- **Tablet (768px - 1024px):** 2-column stat cards, collapsible sidebar
- **Desktop (> 1024px):** 4-column stats, full sidebar, 3-column data cards

---

## Accessibility

- Consistent focus states with ring-2 offset-2
- Proper ARIA labels on all interactive elements
- Keyboard navigation support throughout
- Semantic HTML structure (nav, main, header, section)
- Icon-only elements have aria-label attributes