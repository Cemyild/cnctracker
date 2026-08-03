import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { Request, Response, NextFunction, Express } from "express";
import { pool } from "./db";

const scryptAsync = promisify(scrypt);

// Şifre hash'i "salt:hash" formatında tek string olarak saklanır.
// bcrypt yerine Node yerleşik scrypt — yeni bağımlılık yok.
export async function hashSifre(sifre: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(sifre, salt, 64)) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

export async function dogrulaSifre(sifre: string, kayitliHash: string): Promise<boolean> {
  const [salt, hashHex] = kayitliHash.split(":");
  if (!salt || !hashHex) return false;
  const kayitli = Buffer.from(hashHex, "hex");
  const aday = (await scryptAsync(sifre, salt, 64)) as Buffer;
  return kayitli.length === aday.length && timingSafeEqual(kayitli, aday);
}

declare module "express-session" {
  interface SessionData {
    portalUserId?: string;
    portalRol?: string; // 'temsilci' | 'muhasebe' | 'operasyon' | 'admin'
  }
}

export function setupPortalSession(app: Express) {
  const PgStore = connectPgSimple(session);
  if (!process.env.SESSION_SECRET) {
    // Prod'da bilinen bir anahtar ile oturum imzalamak portal auth'unu anlamsız kılar.
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET zorunlu — production'da tanımlı olmalı");
    }
    console.warn("[portal] SESSION_SECRET tanımlı değil — geçici geliştirme anahtarı kullanılıyor.");
  }
  app.use(
    "/api/portal",
    session({
      store: new PgStore({
        pool,
        tableName: "portal_sessions",
        createTableIfMissing: true, // oturum tablosu ilk açılışta otomatik oluşur
      }),
      secret: process.env.SESSION_SECRET || "dev-portal-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 12, // 12 saat
      },
    }),
  );
}

export function requirePortal(req: Request, res: Response, next: NextFunction) {
  if (!req.session.portalUserId) {
    return res.status(401).json({ error: "Giriş gerekli" });
  }
  next();
}

// admin, muhasebenin gördüğü HER ŞEYİ görür (üstüne silme yetkisi) — bu yüzden
// muhasebe guard'ı admin'i de geçirir. Tersi geçerli DEĞİL: requireAdmin muhasebeyi almaz.
export function requireMuhasebe(req: Request, res: Response, next: NextFunction) {
  if (!req.session.portalUserId) {
    return res.status(401).json({ error: "Giriş gerekli" });
  }
  if (req.session.portalRol !== "muhasebe" && req.session.portalRol !== "admin") {
    return res.status(403).json({ error: "Yetkisiz" });
  }
  next();
}

// Kayıt SİLME uçları — yalnız admin. Silme geri alınamaz ve para kaydını yok eder.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.portalUserId) {
    return res.status(401).json({ error: "Giriş gerekli" });
  }
  if (req.session.portalRol !== "admin") {
    return res.status(403).json({ error: "Bu işlem için admin yetkisi gerekir" });
  }
  next();
}

export function requireOperasyon(req: Request, res: Response, next: NextFunction) {
  if (!req.session.portalUserId) {
    return res.status(401).json({ error: "Giriş gerekli" });
  }
  if (req.session.portalRol !== "operasyon") {
    return res.status(403).json({ error: "Yetkisiz" });
  }
  next();
}
