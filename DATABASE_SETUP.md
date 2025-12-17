# Setting Up Local Database for CNC Tracker

## Option 1: Free Cloud Database (Recommended - Fastest)

### Using Neon (Free PostgreSQL)

1. Go to https://neon.tech
2. Sign up for a free account
3. Create a new project
4. Copy the connection string (it will look like: `postgresql://username:password@ep-xxx.region.aws.neon.tech/neondb`)
5. Create a `.env` file in the root directory:
   ```
   DATABASE_URL=your_connection_string_here
   PORT=5000
   NODE_ENV=development
   ```
6. Run database migrations: `npm run db:push`
7. Start the dev server: `npm run dev`

### Alternative: Supabase (Free PostgreSQL)

1. Go to https://supabase.com
2. Sign up and create a new project
3. Go to Settings → Database → Connection String → Node.js
4. Copy the connection string
5. Follow steps 5-7 from Neon instructions above

## Option 2: Local PostgreSQL Installation

### Install PostgreSQL on Windows

1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer (choose version 15 or 16)
3. During installation:
   - Set a password for the postgres user (remember this!)
   - Keep default port 5432
4. After installation, create a database:
   ```powershell
   # Connect to PostgreSQL
   psql -U postgres
   
   # Create database
   CREATE DATABASE cnctracker;
   
   # Exit
   \q
   ```
5. Create `.env` file:
   ```
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/cnctracker
   PORT=5000
   NODE_ENV=development
   ```
6. Run migrations: `npm run db:push`
7. Start server: `npm run dev`

## Option 3: Docker PostgreSQL

If you have Docker Desktop installed:

1. Run PostgreSQL container:
   ```powershell
   docker run --name cnctracker-db -e POSTGRES_PASSWORD=mypassword -e POSTGRES_DB=cnctracker -p 5432:5432 -d postgres:15
   ```

2. Create `.env` file:
   ```
   DATABASE_URL=postgresql://postgres:mypassword@localhost:5432/cnctracker
   PORT=5000
   NODE_ENV=development
   ```

3. Run migrations: `npm run db:push`
4. Start server: `npm run dev`

## After Setup

Once you have the database configured:

1. The database will be empty initially
2. Upload Excel files through the UI to populate data
3. The app will automatically create tables on first run via Drizzle ORM

## Removing Replit Dependencies

The following files can be safely removed:
- `.replit` (already exists but you can ignore or delete it)
- `replit.md` (documentation for Replit)

The Replit Vite plugins in the code are optional and won't affect local development.
