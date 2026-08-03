import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { setupPortalSession } from "./portalAuth";

const app = express();
const httpServer = createServer(app);

// gzip — HER ŞEYDEN ÖNCE. Sıkıştırma yokken istemci bundle'ı 3.2 MB HAM iniyordu
// (ölçüldü: Content-Encoding başlığı yok, Content-Length 3.300.192) ve portal ilk
// açılışta saniyelerce boş duruyordu. Beyanname listesi de 26 bin satır / ~6.7 MB JSON.
// Metin gövdeler ~%75-90 sıkışır; ölçülen sunucu süreleri (4-16ms) zaten hızlıydı,
// darboğaz TRANSFERDİ. Statik dosyalar da bu middleware'den geçer (serveStatic sonra gelir).
app.use(compression());

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

// Ödemeler Portalı oturumları — middleware yalnız /api/portal/* yollarına takılır
setupPortalSession(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });

  // İzin sistemi: resmi tatilleri seed et (idempotent)
  storage.seedResmiTatiller()
    .then((r) => {
      if (r.inserted > 0) log(`✓ ${r.inserted} resmi tatil eklendi.`, "izin-seed");
    })
    .catch((e) => log(`Resmi tatil seed hatası: ${e.message}`, "izin-seed"));

  // Ödemeler Portalı: masraf türlerini seed et (idempotent)
  storage.seedMasrafTurleri()
    .catch((e) => log(`Masraf türü seed hatası: ${e.message}`, "odemeler-seed"));
})();
