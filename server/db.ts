import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// SSL: localhost ise kapalı (kendi VPS'imizde Postgres), uzak host ise açık
// ama esnek sertifika kontrolü (Neon ve diğer managed Postgres için).
const isLocal = /(@|host=)(localhost|127\.0\.0\.1|::1)/.test(process.env.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
