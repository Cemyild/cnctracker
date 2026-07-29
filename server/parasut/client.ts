import { storage } from "../storage";

const BASE = "https://api.parasut.com";
const FIRMA = process.env.PARASUT_FIRMA_NO || "";

/** Kimlik bilgileri tam mı? Değilse entegrasyon fail-closed davranır. */
export function parasutAktifMi(): boolean {
  return Boolean(
    process.env.PARASUT_CLIENT_ID &&
    process.env.PARASUT_CLIENT_SECRET &&
    FIRMA,
  );
}

// --- Throttle: 10 istek / 10 saniye (Paraşüt limiti) ---
const PENCERE_MS = 10_000;
const LIMIT = 10;
let damgalar: number[] = [];

async function throttleBekle(): Promise<void> {
  for (;;) {
    const simdi = Date.now();
    damgalar = damgalar.filter((d) => simdi - d < PENCERE_MS);
    if (damgalar.length < LIMIT) {
      damgalar.push(simdi);
      return;
    }
    const enEski = damgalar[0];
    await new Promise((r) => setTimeout(r, PENCERE_MS - (simdi - enEski) + 50));
  }
}

// --- Token yönetimi: TEK YAZICI ---
// refresh_token rotasyonlu; eşzamanlı yenileme zinciri koparır.
// Bu yüzden yenileme tek bir promise üzerinden serileştirilir.
let yenilemePromise: Promise<string> | null = null;

async function tokenAl(): Promise<string> {
  const kayit = await storage.getParasutToken();

  // 60 saniye pay bırak
  if (kayit && kayit.accessToken && kayit.expiresAt.getTime() - Date.now() > 60_000) {
    return kayit.accessToken;
  }

  if (yenilemePromise) return yenilemePromise;

  yenilemePromise = (async () => {
    try {
      const refreshToken = kayit?.refreshToken || process.env.PARASUT_BOOTSTRAP_REFRESH_TOKEN;
      if (!refreshToken) {
        throw new Error(
          "Paraşüt refresh_token yok. .env'ye PARASUT_BOOTSTRAP_REFRESH_TOKEN " +
          "koyun veya authorization_code akışını tekrarlayın.",
        );
      }

      const form = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.PARASUT_CLIENT_ID!,
        client_secret: process.env.PARASUT_CLIENT_SECRET!,
        refresh_token: refreshToken,
      });

      const r = await fetch(`${BASE}/oauth/token`, { method: "POST", body: form });
      if (!r.ok) {
        const metin = await r.text();
        throw new Error(`Paraşüt token yenileme başarısız (${r.status}): ${metin.slice(0, 200)}`);
      }
      const j = (await r.json()) as {
        access_token: string; refresh_token: string; expires_in: number;
      };

      await storage.upsertParasutToken({
        accessToken: j.access_token,
        refreshToken: j.refresh_token, // ROTASYON: yeni refresh_token mutlaka yazılır
        expiresAt: new Date(Date.now() + j.expires_in * 1000),
      });

      return j.access_token;
    } finally {
      yenilemePromise = null;
    }
  })();

  return yenilemePromise;
}

/**
 * Paraşüt v4 isteği. `yol` firma numarasından SONRAKİ kısımdır:
 *   parasutIstek("/purchase_bills", { query: { "page[size]": "25" } })
 * 401 alınırsa token bir kez yenilenip tekrar denenir.
 */
export async function parasutIstek<T = any>(
  yol: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  if (!parasutAktifMi()) {
    throw new Error("Paraşüt kimlik bilgileri eksik (.env)");
  }

  const calistir = async (token: string): Promise<Response> => {
    await throttleBekle();
    const qs = opts.query ? "?" + new URLSearchParams(opts.query).toString() : "";
    return fetch(`${BASE}/v4/${FIRMA}${yol}${qs}`, {
      method: opts.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  };

  let token = await tokenAl();
  let r = await calistir(token);

  if (r.status === 401) {
    // Token geçersiz — kaydı süresi dolmuş işaretleyip yenile
    const mevcut = await storage.getParasutToken();
    await storage.upsertParasutToken({
      accessToken: "",
      refreshToken: mevcut?.refreshToken || process.env.PARASUT_BOOTSTRAP_REFRESH_TOKEN || "",
      expiresAt: new Date(0),
    });
    token = await tokenAl();
    r = await calistir(token);
  }

  if (r.status === 429) {
    await new Promise((res) => setTimeout(res, 11_000));
    r = await calistir(await tokenAl());
  }

  if (!r.ok) {
    const metin = await r.text();
    throw new Error(`Paraşüt ${opts.method || "GET"} ${yol} → ${r.status}: ${metin.slice(0, 300)}`);
  }

  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

/**
 * JSON:API cevabını düzleştirir: `included` dizisini (tip, id) ile
 * indeksleyip `relationships` referanslarını çözülebilir hale getirir.
 */
export function jsonApiCoz(cevap: any): { veri: any[]; iliskili: Map<string, any> } {
  const iliskili = new Map<string, any>();
  for (const i of cevap?.included || []) {
    iliskili.set(`${i.type}:${i.id}`, i);
  }
  const veri = Array.isArray(cevap?.data) ? cevap.data : cevap?.data ? [cevap.data] : [];
  return { veri, iliskili };
}

/** İlişki id'sini çözer: iliskiId(kayit, "supplier") → "12345" | undefined */
export function iliskiId(kayit: any, ad: string): string | undefined {
  return kayit?.relationships?.[ad]?.data?.id;
}
