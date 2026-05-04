# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

Internal back-office for a Turkish customs brokerage. Originally a gümrük (customs) Excel-import tracker; it has grown into a multi-module dashboard. Modules in [client/src/pages/](client/src/pages/): Gümrük, Sigorta (insurance), Nakliye (transport), Tahsilat (collections), Çalışanlar (payroll, with TR 2025/2026 calculators in [shared/salaryCalculations.ts](shared/salaryCalculations.ts)), Araçlar/Tools, plus an `ISO9001*` family covering surveys, document archive, quality goals, training, supplier evaluation, management review, maintenance, corrective actions (DÜF), and internal audits. UI strings, table/column names, and route segments are intentionally Turkish — keep that convention when adding new code.

## Commands

| Task | Command |
|---|---|
| Dev server (single port, API + Vite middleware on **5000**) | `npm run dev` — equivalent to `tsx server/index.ts` with `NODE_ENV=development` |
| Dev with auto-restart | `node start-dev.js` |
| Type check | `npm run check` (`tsc`, no emit) |
| Push schema to DB (no migrations workflow) | `npm run db:push` |
| Production build | `npm run build` → runs [script/build.ts](script/build.ts): Vite client → `dist/public`, esbuild server → `dist/index.cjs` |
| Run production | `npm start` (`node dist/index.cjs`) |

There is **no test runner, no linter, and no formatter** wired up. `npm run check` is the only quality gate. Do not invent test commands.

`DATABASE_URL` is required to start anything (including `db:push`); see [.env.example](.env.example). The DB is Neon serverless Postgres over WebSocket (see [server/db.ts](server/db.ts)).

## Architecture

**Monorepo with three TS roots, one `tsconfig.json`:**
- [client/](client/) — React 18 + Vite root (`root: ./client` in [vite.config.ts](vite.config.ts)), wouter routing, TanStack Query, shadcn/ui on Radix, Tailwind.
- [server/](server/) — Express in ESM, run via `tsx` in dev. The HTTP server is constructed in [server/index.ts](server/index.ts) and `setupVite` mounts Vite as middleware so dev runs on a single port.
- [shared/](shared/) — Drizzle schema ([shared/schema.ts](shared/schema.ts)) and pure utilities. Imported on both sides via the `@shared/*` path alias.

**Path aliases** (defined in both [vite.config.ts](vite.config.ts) and [tsconfig.json](tsconfig.json) — keep them in sync): `@/*` → `client/src/*`, `@shared/*` → `shared/*`, `@assets/*` → `attached_assets/*`.

**API layer.** All routes live in a single ~3k-line file [server/routes.ts](server/routes.ts) registered via `registerRoutes(httpServer, app)`. Data access is funneled through the `IStorage` interface + `DatabaseStorage` implementation in [server/storage.ts](server/storage.ts) — keep new endpoints thin and put DB logic in storage. Drizzle queries use `eq`, `and`, `inArray`, `sql` from `drizzle-orm`.

**Auth.** There is no backend auth — every API route is unauthenticated by design. Access control is a frontend-only password gate in [client/src/App.tsx](client/src/App.tsx) (`cnctracker_admin_auth` in localStorage). Public routes that bypass the gate: `/survey/:id` and `/egitim-degerlendirme/:id`. When adding new pages, add them to `pageTitles` and the `<Switch>` in [client/src/App.tsx](client/src/App.tsx).

**Database conventions** (these are non-obvious — follow them):
- Schema additions go in [shared/schema.ts](shared/schema.ts), then storage interface + impl in [server/storage.ts](server/storage.ts), then routes, then page, then App.tsx wiring.
- Insert Zod schemas use the prefix `insert<Entity>Schema` (e.g., `insertYonetimAksiyonSchema`).
- **Foreign-key column names: avoid Turkish characters in TS field names but pass the snake_case column name as an explicit string.** Example: TS field `toplantiId` → `pgTable` column `varchar("toplanti_id")`. Don't let Drizzle auto-derive these.
- All date fields are stored as `text` in `YYYY-MM-DD` format. Format dates for display as `dd/mm/yyyy` **without** routing through `new Date(...)` — timezone shifts have caused off-by-one bugs (commit `c897dff`).
- N+1 prevention: prefer `inArray(...)` or a two-query + Map join pattern (see `getAksiyonlar`-style code in [server/storage.ts](server/storage.ts)) over per-row lookups.
- PUT/PATCH endpoints must null-check the storage return and `return res.status(404).json({ error: "Bulunamadı" })` on miss.
- `gumruk_verileri` deduplicates Excel re-imports via an MD5 `row_hash` and a compound unique index on `(ay, yil, rowHash)`. When adding similar import flows, reuse this pattern via `createRowHash` in [server/routes.ts](server/routes.ts).
- ISO 9001 dashboard summary is **not** persisted — it is recomputed live by `/api/iso9001/stats` on every load.

**Migrations.** [drizzle.config.ts](drizzle.config.ts) is configured for `drizzle-kit push`. There is one historical SQL file in [migrations/](migrations/) but the working flow is `db:push`, not generated migrations. Don't create migration files unless explicitly asked.

**File uploads.** Per-feature `multer.diskStorage` writers in [server/routes.ts](server/routes.ts) (`uploadRuhsat`, `uploadDuf`, `uploadTetkik`, `uploadBelge`, `uploadEgitim`) write under `uploads/<feature>/`. The directory is served statically at `/uploads`. `uploads/` is **not** in `.gitignore` but contents are not committed in practice — don't commit user-uploaded files.

**Production bundling.** [script/build.ts](script/build.ts) bundles the server to a single CJS file with esbuild. The `allowlist` is empty, so all dependencies are external — `node_modules` must be present at runtime. Static client assets ship at `dist/public` and are served by [server/static.ts](server/static.ts) when `NODE_ENV=production`.

**Deploy.** Pushes to the configured branch trigger GitHub Actions → `db:push` → `build` → `pm2 restart`. `git push` is effectively a deploy — assume that and behave accordingly.

## Reference docs in repo

[replit.md](replit.md) has the deepest architectural overview (some Replit-specific notes are stale but the data model and module list are accurate). [design_guidelines.md](design_guidelines.md) defines the Fluent-inspired layout/typography tokens used by the shadcn/ui setup. [DATABASE_SETUP.md](DATABASE_SETUP.md) and [QUICK_START.md](QUICK_START.md) cover first-time bring-up.
