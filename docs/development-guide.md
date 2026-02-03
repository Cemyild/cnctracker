# Development Guide

This guide provides instructions for setting up the local development environment and working on the project.

## Prerequisites

- **Node.js:** v20.x or later.
- **npm:** v10.x or later.
- **Database:** Access to a PostgreSQL database (designed for Neon).

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd cnctracker
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root directory and add the following:
    ```env
    DATABASE_URL=your_postgresql_connection_string
    OPENAI_API_KEY=your_openai_key
    ANTHROPIC_API_KEY=your_anthropic_key
    ```
    See `.env.example` for more configuration options.

4.  **Database Migration:**
    Push the schema to your database:
    ```bash
    npm run db:push
    ```

5.  **Start Development Server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5000`.

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the backend and frontend in development mode. |
| `npm run build` | Builds the frontend and backend for production. |
| `npm run start` | Runs the production build. |
| `npm run check` | Runs TypeScript type checks. |
| `npm run db:push` | Pushes Drizzle schema changes to the database. |

## Development Patterns

### Database Changes
1.  Modify `shared/schema.ts`.
2.  Run `npm run db:push` to sync with your local/dev database.
3.  Update `server/storage.ts` to implement any new data access logic.

### Creating New Pages
1.  Add a new file in `client/src/pages/`.
2.  Register the route in `client/src/App.tsx`.
3.  Add the page title to the `pageTitles` map in `App.tsx` for the header display.

### Working with Shared Logic
If you modify `shared/salaryCalculations.ts`, ensure that you run `npm run check` to verify that both frontend and backend are still compatible with the changes.
