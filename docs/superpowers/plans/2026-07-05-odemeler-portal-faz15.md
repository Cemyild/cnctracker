# Ödemeler Portalı Faz 1.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portala rol-bazlı sidebar + ayrı sayfalar, 10 sn canlı yenileme üstüne kırmızı değişiklik rozetleri ve tarayıcı bildirimleri, muhasebeye talepsiz "Doğrudan Ödeme" girişi.

**Architecture:** Faz 1'in tek-sayfa panelleri (`TemsilciPanel`/`MuhasebePanel`) sayfa dosyalarına bölünür; `PortalApp` SidebarProvider'lı kabuk olur ve talepler sorgusunu tek noktadan 10 sn aralıkla çeker; `useTalepBildirimleri` hook'u localStorage imzalarıyla farkları sayar (rozet + sekme başlığı + Notification). Backend'e tek yeni rota eklenir: `POST /api/portal/dogrudan-odeme`.

**Tech Stack:** Mevcut yığın (Express + Drizzle, React 18 + wouter + TanStack Query + shadcn/ui). Yeni bağımlılık YOK.

**Spec:** [docs/superpowers/specs/2026-07-05-odemeler-portal-faz15-design.md](../specs/2026-07-05-odemeler-portal-faz15-design.md)

## Global Constraints

- UI metinleri Türkçe; tarih gösterimi yalnız `portalUtils.formatTarih` (yeni `new Date(string)` parse YOK).
- Yönetim panelinin `AppSidebar`/`App.tsx` düzeni bozulmaz; App.tsx'te tek değişiklik `/portal` rotasının `"/portal/:rest*"` olması. Bypass koşulu (`startsWith("/portal")`) zaten alt yolları kapsıyor — dokunma.
- Mevcut işlev BİREBİR korunur: Öde/İade dialogları key-remount davranışıyla, eşleştirme, dosyasız talep, tüm data-testid'ler taşındıkları yerde aynen kalır.
- Rol/kimlik sunucuda oturumdan okunur; doğrudan ödeme `requireMuhasebe` arkasında.
- Hata mesajı deseni: raw fetch + `(await res.json()).error || "..."` (apiRequest'in ham gövde sızdırma tuzağı — Faz 1 kararı).
- Yetim dosya temizliği: upload rotalarında her erken 4xx dönüşünde ve catch'te yüklenen dosyalar silinir.
- Test altyapısı yok — `npm run check` + curl + Playwright (scratchpad'de kurulu: `C:\Users\cem\AppData\Local\Temp\claude\e--CEM-APPS-cnctracker\f8e48f44-2295-45d2-af94-f819937c735a\scratchpad`). Test komutu icat etme.
- `git add` açık yollarla; **`git push` YOK** (push = canlıya deploy; kullanıcı kararı). `uploads/` commit edilmez.
- Türkçe kaynak dosyaları PowerShell Set-Content ile yazılmaz — Edit/Write araçları.
- Commit mesajları repo stilinde + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Dev sunucu: port 5000; yeniden başlatma: önce `powershell -Command "$c = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id ($c.OwningProcess | Select-Object -Unique) -Force }"`, sonra arka planda `npm run dev`.
- Lokal test kullanıcıları: `suleyman`/1234 (temsilci, SÜLEYMAN), `muhasebe`/1234 (muhasebe). Lokal DB canlıdan AYRIDIR — test verisi serbest, ama `alacakli` değerlerine `E2E ` öneki koy ve işin sonunda temizle.

---

### Task 1: Backend — `POST /api/portal/dogrudan-odeme`

**Files:**
- Modify: `server/routes.ts` (PUT `/api/portal/talepler/:id/beyanname` rotasının hemen ALTINA, "YÖNETİM PANELİ EK ROTALAR" bölümünden önce)

**Interfaces:**
- Consumes: `requireMuhasebe` (portalAuth), `portalKullanici(req)`, `bugunYmd()`, `parseTutar()` (registerRoutes içi helper'lar), `uploadOdemeBelge` multer, `storage.getBeyanname/createOdemeTalep/createOdemeBelge`, `fixUploadFilename`.
- Produces: `POST /api/portal/dogrudan-odeme` — multipart alanlar: `beyannameId` (ops.), `odemeTipi`, `masrafTuru`, `tutar`, `paraBirimi`, `alacakli`, `iban`, `aciklama`; dosyalar: `dekont` (ZORUNLU, 1), `konsimento` (ops., 1). Yanıt: oluşturulan `OdemeTalep` (durum=`odendi`). Task 5'teki form bu sözleşmeyi kullanır.

- [ ] **Step 1: Rotayı ekle**

```ts
  // Muhasebe: talepsiz DOĞRUDAN ödeme kaydı — tek adımda "odendi" oluşur.
  // Dekont zorunlu; beyanname opsiyonel (muhasebe tüm listeyi görür, avAdi kontrolü yok);
  // beyannamesizse açıklama zorunlu (temsilci dosyasız talep kuralıyla aynı).
  app.post(
    "/api/portal/dogrudan-odeme",
    requireMuhasebe,
    uploadOdemeBelge.fields([
      { name: "dekont", maxCount: 1 },
      { name: "konsimento", maxCount: 1 },
    ]),
    async (req, res) => {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const yuklenenleriSil = () => {
        for (const f of [...(files?.dekont ?? []), ...(files?.konsimento ?? [])]) {
          fs.unlink(f.path, () => {});
        }
      };
      try {
        const ben = await portalKullanici(req);
        if (!ben) {
          yuklenenleriSil();
          return res.status(401).json({ error: "Giriş gerekli" });
        }
        const { beyannameId, odemeTipi, masrafTuru, tutar, paraBirimi, alacakli, iban, aciklama } = req.body || {};

        const beyannameIdStr = String(beyannameId ?? "").trim();
        let beyanname: Beyanname | undefined;
        if (beyannameIdStr) {
          beyanname = await storage.getBeyanname(beyannameIdStr);
          if (!beyanname) {
            yuklenenleriSil();
            return res.status(400).json({ error: "Beyanname bulunamadı" });
          }
        } else if (!String(aciklama ?? "").trim()) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Dosyasız talepte açıklama zorunlu" });
        }
        if (!["masraf", "depo_teminat"].includes(String(odemeTipi))) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Geçersiz ödeme tipi" });
        }
        const tutarNum = parseTutar(tutar);
        if (tutarNum == null || tutarNum <= 0) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Geçersiz tutar" });
        }
        const alacakliStr = String(alacakli ?? "").trim();
        if (!alacakliStr) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Alacaklı (kime ödenecek) zorunlu" });
        }
        const masrafTuruStr =
          odemeTipi === "depo_teminat" ? "Depo Teminatı" : String(masrafTuru ?? "").trim();
        if (!masrafTuruStr) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Masraf türü zorunlu" });
        }
        const dekont = files?.dekont?.[0];
        if (!dekont) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Dekont dosyası zorunlu" });
        }

        const bugun = bugunYmd();
        const talep = await storage.createOdemeTalep({
          beyannameId: beyanname?.id ?? null,
          talepEdenId: ben.id,
          odemeTipi: String(odemeTipi),
          masrafTuru: masrafTuruStr,
          tutar: String(tutarNum),
          paraBirimi: ["TRY", "USD", "EUR"].includes(String(paraBirimi)) ? String(paraBirimi) : "TRY",
          alacakli: alacakliStr,
          iban: iban ? String(iban).trim() : null,
          aciklama: aciklama ? String(aciklama) : null,
          durum: "odendi",
          talepTarihi: bugun,
          odemeTarihi: bugun,
          odeyenId: ben.id,
          iadeDurumu: odemeTipi === "depo_teminat" ? "beklemede" : null,
        });
        await storage.createOdemeBelge({
          talepId: talep.id,
          belgeTipi: "dekont",
          filename: fixUploadFilename(dekont.originalname),
          filepath: dekont.path.replace(/\\/g, "/"),
          yukleyenId: ben.id,
        });
        const konsimento = files?.konsimento?.[0];
        if (konsimento) {
          await storage.createOdemeBelge({
            talepId: talep.id,
            belgeTipi: "konsimento",
            filename: fixUploadFilename(konsimento.originalname),
            filepath: konsimento.path.replace(/\\/g, "/"),
            yukleyenId: ben.id,
          });
        }
        res.json(talep);
      } catch (e: any) {
        yuklenenleriSil();
        res.status(400).json({ error: e.message });
      }
    },
  );
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: hatasız.

- [ ] **Step 3: curl doğrulaması**

Dev sunucuyu yeniden başlat (Global Constraints'teki komutlar). Sonra:

```bash
# muhasebe login
curl -s -c "$TEMP/mc.txt" -X POST http://localhost:5000/api/portal/login \
  -H "Content-Type: application/json" -d '{"kullaniciAdi":"muhasebe","sifre":"1234"}'
echo "dekont" > "$TEMP/d.pdf"

# 1) dekontsuz → 400
curl -s -b "$TEMP/mc.txt" -X POST http://localhost:5000/api/portal/dogrudan-odeme \
  -F "odemeTipi=masraf" -F "masrafTuru=Ardiye" -F "tutar=100" -F "alacakli=E2E X" -F "aciklama=t"
# Beklenen: {"error":"Dekont dosyası zorunlu"}

# 2) beyannamesiz + açıklamasız → 400 (dekont eklense bile)
curl -s -b "$TEMP/mc.txt" -X POST http://localhost:5000/api/portal/dogrudan-odeme \
  -F "odemeTipi=masraf" -F "masrafTuru=Ardiye" -F "tutar=100" -F "alacakli=E2E X" -F "dekont=@$TEMP/d.pdf"
# Beklenen: {"error":"Dosyasız talepte açıklama zorunlu"}

# 3) geçerli dosyasız masraf → odendi
curl -s -b "$TEMP/mc.txt" -X POST http://localhost:5000/api/portal/dogrudan-odeme \
  -F "odemeTipi=masraf" -F "masrafTuru=Ardiye" -F "tutar=1.250,75" -F "alacakli=E2E Dogrudan AS" \
  -F "aciklama=dogrudan test" -F "dekont=@$TEMP/d.pdf"
# Beklenen: "durum":"odendi","tutar":"1250.75","odemeTarihi" dolu, "beyannameId":null

# 4) depo teminatı + konşimento → iade takibine düşer
curl -s -b "$TEMP/mc.txt" -X POST http://localhost:5000/api/portal/dogrudan-odeme \
  -F "odemeTipi=depo_teminat" -F "tutar=3000" -F "alacakli=E2E Depo Dogrudan" \
  -F "aciklama=depo dogrudan" -F "dekont=@$TEMP/d.pdf" -F "konsimento=@$TEMP/d.pdf"
# Beklenen: "masrafTuru":"Depo Teminatı","iadeDurumu":"beklemede","durum":"odendi"

# 5) temsilci deneyince → 403
curl -s -c "$TEMP/pc.txt" -X POST http://localhost:5000/api/portal/login \
  -H "Content-Type: application/json" -d '{"kullaniciAdi":"suleyman","sifre":"1234"}' > /dev/null
curl -s -o /dev/null -w "%{http_code}" -b "$TEMP/pc.txt" -X POST \
  http://localhost:5000/api/portal/dogrudan-odeme -F "odemeTipi=masraf"
# Beklenen: 403

# 6) temsilci talep listesinde doğrudan kayıtlar GÖRÜNMEZ
curl -s -b "$TEMP/pc.txt" http://localhost:5000/api/portal/talepler | grep -c "E2E Dogrudan" || echo "0 - dogru"
# Beklenen: 0 - dogru
```

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(odemeler): muhasebe dogrudan odeme rotasi - tek adimda odendi kaydi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Bildirim motoru — `useTalepBildirimleri` hook'u + paylaşılan `BelgeLinkleri`

**Files:**
- Create: `client/src/pages/portal/useTalepBildirimleri.ts`
- Create: `client/src/pages/portal/BelgeLinkleri.tsx`

**Interfaces:**
- Consumes: `TalepDetay`, `formatPara`, `BELGE_ETIKET`, `belgeUrl` (portalUtils), `PortalMe` (PortalApp).
- Produces (Task 4/6 kullanır):
  - `useTalepBildirimleri(me: PortalMe, talepler: TalepDetay[], aktifSayfa: SayfaAnahtari | null): Rozetler`
  - `export type SayfaAnahtari = "taleplerim" | "gelenTalepler" | "depo"`
  - `export type Rozetler = Record<SayfaAnahtari, number>`
  - `BelgeLinkleri({ talep }: { talep: TalepDetay })` default export — MuhasebePanel'deki bileşenin birebir aynısı, paylaşılabilir dosyada.

- [ ] **Step 1: BelgeLinkleri.tsx oluştur**

`client/src/pages/portal/MuhasebePanel.tsx` içindeki `BelgeLinkleri` fonksiyonunu (satır ~26-43, `function BelgeLinkleri({ talep }: { talep: TalepDetay })` ile başlayan blok) OLDUĞU GİBİ yeni dosyaya taşı ve default export yap:

```tsx
import { type TalepDetay, BELGE_ETIKET, belgeUrl } from "./portalUtils";

export default function BelgeLinkleri({ talep }: { talep: TalepDetay }) {
  if (!talep.belgeler.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {talep.belgeler.map((b) => (
        <a
          key={b.id}
          href={belgeUrl(b)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary underline"
        >
          {BELGE_ETIKET[b.belgeTipi] ?? b.belgeTipi}: {b.filename}
        </a>
      ))}
    </div>
  );
}
```

(MuhasebePanel'deki kopya Task 4'te dosyayla birlikte silinecek — şimdilik ikisi de derlenir, çakışma yok.)

- [ ] **Step 2: useTalepBildirimleri.ts oluştur**

```ts
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { type TalepDetay, formatPara } from "./portalUtils";
import { type PortalMe } from "./PortalApp";

export type SayfaAnahtari = "taleplerim" | "gelenTalepler" | "depo";
export type Rozetler = Record<SayfaAnahtari, number>;

// talep başına durum imzası — bunlardan biri değişirse "değişiklik" sayılır
function talepImzasi(t: TalepDetay): string {
  return `${t.durum}|${t.iadeDurumu ?? ""}|${t.belgeler.length}|${t.beyannameId ?? ""}`;
}

type Imza = Record<string, string>; // talepId -> imza
type ImzaDeposu = Partial<Record<SayfaAnahtari, Imza>>;

function depoAnahtari(me: PortalMe) {
  return `portal_gorulen_${me.id}`;
}

function imzalariOku(me: PortalMe): ImzaDeposu {
  try {
    return JSON.parse(localStorage.getItem(depoAnahtari(me)) ?? "{}") as ImzaDeposu;
  } catch {
    return {}; // bozuk kayıt: yeniden baz alınır
  }
}

function imzalariYaz(me: PortalMe, d: ImzaDeposu) {
  try {
    localStorage.setItem(depoAnahtari(me), JSON.stringify(d));
  } catch {
    /* dolu storage vb. — rozetler bir sonraki turda yeniden hesaplanır */
  }
}

// Sayfanın izlediği talepler
function sayfaTalepleri(sayfa: SayfaAnahtari, talepler: TalepDetay[]): TalepDetay[] {
  if (sayfa === "depo") return talepler.filter((t) => t.odemeTipi === "depo_teminat");
  return talepler;
}

function guncelImza(liste: TalepDetay[]): Imza {
  const imza: Imza = {};
  for (const t of liste) imza[t.id] = talepImzasi(t);
  return imza;
}

// imzaya göre değişen/yeni talepler
function degisenler(imza: Imza | undefined, liste: TalepDetay[]): TalepDetay[] {
  if (!imza) return [];
  return liste.filter((t) => imza[t.id] === undefined || imza[t.id] !== talepImzasi(t));
}

function rolSayfalari(rol: PortalMe["rol"]): SayfaAnahtari[] {
  return rol === "muhasebe" ? ["gelenTalepler", "depo"] : ["taleplerim"];
}

const SAYFA_ROTASI: Record<SayfaAnahtari, string> = {
  taleplerim: "/portal/taleplerim",
  gelenTalepler: "/portal/gelen-talepler",
  depo: "/portal/depo",
};

function bildirimMetni(sayfa: SayfaAnahtari, degisen: TalepDetay[]): string {
  if (sayfa === "gelenTalepler") {
    if (degisen.length === 1) {
      const t = degisen[0];
      return `Yeni ödeme talebi: ${t.talepEdenAd} — ${formatPara(t.tutar, t.paraBirimi)}`;
    }
    return `${degisen.length} yeni ödeme talebi var`;
  }
  if (sayfa === "depo") {
    return degisen.length === 1
      ? `İade takibinde değişiklik: ${degisen[0].beyanname?.dosyaNo ?? degisen[0].alacakli}`
      : `İade takibinde ${degisen.length} değişiklik var`;
  }
  // taleplerim
  if (degisen.length === 1) {
    const t = degisen[0];
    const ref = t.beyanname?.dosyaNo ?? t.alacakli;
    return t.durum === "odendi"
      ? `Talebiniz ödendi: ${ref} — ${formatPara(t.tutar, t.paraBirimi)}`
      : `Talebinizde değişiklik: ${ref}`;
  }
  return `${degisen.length} talebinizde değişiklik var`;
}

const TEMEL_BASLIK = "Ödemeler Portalı";

/**
 * Rozet + sekme başlığı + tarayıcı bildirimi motoru.
 * - aktifSayfa: o an açık portal sayfası (rota eşleşmesi); sekme öndeyse imzası senkronlanır.
 * - Dönüş: sayfa başına "son görülenden beri değişiklik" sayıları.
 */
export function useTalepBildirimleri(
  me: PortalMe,
  talepler: TalepDetay[],
  aktifSayfa: SayfaAnahtari | null,
): Rozetler {
  const [, navigate] = useLocation();
  const bildirilenler = useRef<Set<string>>(new Set()); // "sayfa:talepId:imza" — aynı değişiklik bir kez bildirilir
  const sayfalar = rolSayfalari(me.rol);

  const imzalar = imzalariOku(me);

  // İlk kullanım bazlaması: imzası hiç olmayan sayfalar mevcut durumla başlar (rozet 0)
  useEffect(() => {
    if (!talepler.length && !sayfalar.some((s) => imzalariOku(me)[s])) return;
    const d = imzalariOku(me);
    let degisti = false;
    for (const s of sayfalar) {
      if (!d[s]) {
        d[s] = guncelImza(sayfaTalepleri(s, talepler));
        degisti = true;
      }
    }
    if (degisti) imzalariYaz(me, d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, talepler]);

  // Aktif sayfa + görünür sekme: imzayı senkronla (rozet sıfırlanır)
  useEffect(() => {
    const senkronla = () => {
      if (!aktifSayfa || document.visibilityState !== "visible") return;
      const d = imzalariOku(me);
      d[aktifSayfa] = guncelImza(sayfaTalepleri(aktifSayfa, talepler));
      imzalariYaz(me, d);
    };
    senkronla();
    document.addEventListener("visibilitychange", senkronla);
    return () => document.removeEventListener("visibilitychange", senkronla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, aktifSayfa, talepler]);

  // Rozetleri hesapla
  const rozetler: Rozetler = { taleplerim: 0, gelenTalepler: 0, depo: 0 };
  for (const s of sayfalar) {
    // aktif + görünür sayfanın rozeti her zaman 0 (senkron effect'i imzayı güncelliyor)
    if (s === aktifSayfa && typeof document !== "undefined" && document.visibilityState === "visible") continue;
    rozetler[s] = degisenler(imzalar[s], sayfaTalepleri(s, talepler)).length;
  }

  const toplam = sayfalar.reduce((a, s) => a + rozetler[s], 0);

  // Sekme başlığı sayacı
  useEffect(() => {
    document.title = toplam > 0 ? `(${toplam}) ${TEMEL_BASLIK}` : TEMEL_BASLIK;
    return () => {
      document.title = TEMEL_BASLIK;
    };
  }, [toplam]);

  // Tarayıcı bildirimi — yalnız sekme arka plandayken, değişiklik başına bir kez
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (!document.hidden) return;
    for (const s of sayfalar) {
      const yeni = degisenler(imzalar[s], sayfaTalepleri(s, talepler)).filter(
        (t) => !bildirilenler.current.has(`${s}:${t.id}:${talepImzasi(t)}`),
      );
      if (!yeni.length) continue;
      yeni.forEach((t) => bildirilenler.current.add(`${s}:${t.id}:${talepImzasi(t)}`));
      const n = new Notification(TEMEL_BASLIK, { body: bildirimMetni(s, yeni), tag: `portal-${s}` });
      n.onclick = () => {
        window.focus();
        navigate(SAYFA_ROTASI[s]);
        n.close();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talepler]);

  return rozetler;
}

/** Girişten sonra bir kez çağrılır — izin istenmemişse sorar. */
export function bildirimIzniIste() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: hatasız (hook henüz hiçbir yerde kullanılmıyor — sorun değil, Task 6 bağlayacak).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/portal/useTalepBildirimleri.ts client/src/pages/portal/BelgeLinkleri.tsx
git commit -m "feat(odemeler): rozet/bildirim motoru hook'u + paylasilan BelgeLinkleri

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Temsilci sayfaları — `YeniTalepSayfasi` + `TaleplerimSayfasi`

**Files:**
- Create: `client/src/pages/portal/YeniTalepSayfasi.tsx`
- Create: `client/src/pages/portal/TaleplerimSayfasi.tsx`
- Kaynak (bu görevde DEĞİŞTİRİLMEZ, Task 6'da silinecek): `client/src/pages/portal/TemsilciPanel.tsx`

**Interfaces:**
- Consumes: `TemsilciPanel.tsx`'in mevcut içeriği (form + `EslesmeBekleyenler` + Taleplerim tablosu), `BelgeLinkleri` (Task 2), `PortalMe`, portalUtils.
- Produces: `YeniTalepSayfasi({ me }: { me: PortalMe })` ve `TaleplerimSayfasi()` default exportları. Her ikisi de talepleri `useQuery<TalepDetay[]>({ queryKey: ["/api/portal/talepler"] })` ile **refetchInterval OLMADAN** okur (10 sn'lik itici sorgu Task 6'da PortalApp'e taşınır; aynı queryKey cache'i paylaşılır).

- [ ] **Step 1: YeniTalepSayfasi.tsx oluştur**

Mevcut `TemsilciPanel.tsx`'ten kopyalayarak kur — içerik birebir, yalnız kapsam daralır:

1. Dosyanın import bloğunu `TemsilciPanel.tsx`'ten kopyala; şunları ÇIKAR: `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` importu, `TIP_ETIKET, DURUM_ETIKET, IADE_ETIKET, BELGE_ETIKET, belgeUrl` (formda kullanılmıyor — portalUtils importunu `type TalepDetay, formatTarih, formatPara` olarak daralt), `Badge` importu.
2. `export default function YeniTalepSayfasi({ me }: { me: PortalMe })` tanımla; gövdesine `TemsilciPanel` fonksiyonunun İÇİNDEN şunları OLDUĞU GİBİ taşı:
   - üç `useQuery` çağrısı (beyannameler, masrafTurleri, talepler) — **talepler sorgusundan `refetchInterval: 30000` satırını SİL** (yorumuyla birlikte),
   - tüm form state'leri (`arama`…`gonderiliyor`), `filtreliBeyannameler`, `secili`, `gonder`,
   - return JSX'inden YALNIZ ilk `<Card>` bloğu ("Yeni Ödeme Talebi" formu) — dış `<div className="space-y-6">` sarmalayıcısını koru ama içinde yalnız form kartı kalsın.
   
   Not: `talepler` sorgusu formda kullanılmıyorsa (kontrol et — kullanılmıyor) o sorguyu da bu dosyadan ÇIKAR ve `TalepDetay` importunu kaldır.
3. `me` parametresi kullanılmıyor olsa da imzayı koru (PortalApp sözleşmesi).

- [ ] **Step 2: TaleplerimSayfasi.tsx oluştur**

1. Import bloğu: `TemsilciPanel.tsx`'ten kopyala; form-özel importları çıkar (`Textarea`, `Checkbox`, `Select*` KALIR — `EslesmeBekleyenler` kullanıyor; `Label` çıkar). `BelgeLinkleri`'ni Task 2 dosyasından import et: `import BelgeLinkleri from "./BelgeLinkleri";`
2. `EslesmeBekleyenler` fonksiyonunu (TemsilciPanel.tsx ~26-129. satırlar) OLDUĞU GİBİ bu dosyaya taşı.
3. `export default function TaleplerimSayfasi()`:

```tsx
export default function TaleplerimSayfasi() {
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({
    queryKey: ["/api/portal/beyannameler"],
  });
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
  });

  return (
    <div className="space-y-6">
      <EslesmeBekleyenler talepler={talepler} beyannameler={beyannameler} />
      {/* >>> TemsilciPanel.tsx return'ündeki "Taleplerim" Card bloğunu OLDUĞU GİBİ buraya taşı <<< */}
    </div>
  );
}
```

4. Taşınan Taleplerim tablosunda belge hücresindeki inline `<div className="flex flex-col gap-0.5">…</div>` bloğunu `<BelgeLinkleri talep={t} />` ile DEĞİŞTİRME — TemsilciPanel'deki tablo belgeleri zaten inline render ediyor; birebir korumak için inline bırak. (BelgeLinkleri yalnız muhasebe sayfalarında kullanılıyordu.)

- [ ] **Step 3: Tip kontrolü + Vite derleme**

Run: `npm run check`
Expected: hatasız.
Dev sunucu açıkken: `curl -s -o /dev/null -w "%{http_code}" "http://localhost:5000/src/pages/portal/YeniTalepSayfasi.tsx"` ve aynısı `TaleplerimSayfasi.tsx` için → 200.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/portal/YeniTalepSayfasi.tsx client/src/pages/portal/TaleplerimSayfasi.tsx
git commit -m "feat(odemeler): temsilci ekrani iki sayfaya bolundu - yeni talep + taleplerim

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Muhasebe sayfaları — `GelenTaleplerSayfasi` + `DepoOdemeleriSayfasi`

**Files:**
- Create: `client/src/pages/portal/GelenTaleplerSayfasi.tsx`
- Create: `client/src/pages/portal/DepoOdemeleriSayfasi.tsx`
- Kaynak (DEĞİŞTİRİLMEZ, Task 6'da silinecek): `client/src/pages/portal/MuhasebePanel.tsx`

**Interfaces:**
- Consumes: `MuhasebePanel.tsx` içeriği (`OdemeDialog` ~45-126, `IadeDialog` ~128-226, tabs gövdesi), `BelgeLinkleri` (Task 2).
- Produces: `GelenTaleplerSayfasi()` ve `DepoOdemeleriSayfasi()` default exportları; talepleri `useQuery({ queryKey: ["/api/portal/talepler"] })` ile refetchInterval OLMADAN okurlar. Dialoglar key-remount davranışıyla (`key={talep?.id ?? "..."}`) aynen taşınır.

- [ ] **Step 1: GelenTaleplerSayfasi.tsx oluştur**

1. Import bloğunu MuhasebePanel.tsx'ten kopyala; `Tabs*` importlarını ve `IadeDialog`'a özel olanları çıkar (`Select*`, `Textarea` iade dialoguna aitti — çıkar; `gunFarki`, `IADE_ETIKET` çıkar). `import BelgeLinkleri from "./BelgeLinkleri";` ekle; `BELGE_ETIKET, belgeUrl` importlarını çıkar (artık BelgeLinkleri içinde).
2. `OdemeDialog` fonksiyonunu OLDUĞU GİBİ taşı (BelgeLinkleri kullanımı artık import edilen bileşeni işaret eder).
3. `export default function GelenTaleplerSayfasi()`:
   - `useQuery<TalepDetay[]>({ queryKey: ["/api/portal/talepler"] })` (interval YOK),
   - `const [odemeTalebi, setOdemeTalebi] = useState<TalepDetay | null>(null);`
   - return: MuhasebePanel'deki `<TabsContent value="gelen">` İÇİNDEKİ `<Card>` bloğu OLDUĞU GİBİ (TabsContent sarmalayıcısı olmadan) + altına:

```tsx
      <OdemeDialog
        key={odemeTalebi?.id ?? "odeme-kapali"}
        talep={odemeTalebi}
        kapat={() => setOdemeTalebi(null)}
      />
```

- [ ] **Step 2: DepoOdemeleriSayfasi.tsx oluştur**

Aynı desen: `IadeDialog` fonksiyonu OLDUĞU GİBİ taşınır (prefill'li güncel haliyle); sayfa gövdesi MuhasebePanel'deki `<TabsContent value="depo">` içindeki Card bloğu + `depoTalepleri` filtresi:

```tsx
export default function DepoOdemeleriSayfasi() {
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
  });
  const [iadeTalebi, setIadeTalebi] = useState<TalepDetay | null>(null);
  const depoTalepleri = talepler.filter((t) => t.odemeTipi === "depo_teminat");

  return (
    <div className="space-y-6">
      {/* >>> MuhasebePanel'deki depo Card bloğu OLDUĞU GİBİ buraya <<< */}
      <IadeDialog
        key={iadeTalebi?.id ?? "iade-kapali"}
        talep={iadeTalebi}
        kapat={() => setIadeTalebi(null)}
      />
    </div>
  );
}
```

(Rozet sayıları artık sidebar'da olduğundan MuhasebePanel'deki `bekleyenSayisi`/`acikIadeSayisi` hesapları ve TabsTrigger rozetleri bu sayfalara TAŞINMAZ.)

- [ ] **Step 3: Tip kontrolü + Vite derleme**

Run: `npm run check` → hatasız; iki yeni dosya için Vite 200 kontrolü.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/portal/GelenTaleplerSayfasi.tsx client/src/pages/portal/DepoOdemeleriSayfasi.tsx
git commit -m "feat(odemeler): muhasebe ekrani iki sayfaya bolundu - gelen talepler + depo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `DogrudanOdemeSayfasi`

**Files:**
- Create: `client/src/pages/portal/DogrudanOdemeSayfasi.tsx`

**Interfaces:**
- Consumes: `POST /api/portal/dogrudan-odeme` (Task 1 sözleşmesi), portalUtils, shadcn bileşenleri.
- Produces: `DogrudanOdemeSayfasi()` default export (Task 6 rotalar).

- [ ] **Step 1: Dosyayı oluştur**

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, MasrafTuru } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatTarih, formatPara } from "./portalUtils";

// Muhasebenin talepsiz ödeme girişi — tek adımda "Ödendi" kaydı oluşur (dekont zorunlu).
export default function DogrudanOdemeSayfasi() {
  const { toast } = useToast();
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({
    queryKey: ["/api/portal/beyannameler"], // muhasebe: tüm liste
  });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({
    queryKey: ["/api/portal/masraf-turleri"],
  });

  const [arama, setArama] = useState("");
  const [beyannameId, setBeyannameId] = useState("");
  const [dosyaYok, setDosyaYok] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<"masraf" | "depo_teminat">("masraf");
  const [masrafTuru, setMasrafTuru] = useState("");
  const [tutar, setTutar] = useState("");
  const [paraBirimi, setParaBirimi] = useState("TRY");
  const [alacakli, setAlacakli] = useState("");
  const [iban, setIban] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [dekont, setDekont] = useState<File | null>(null);
  const [konsimento, setKonsimento] = useState<File | null>(null);
  const [formSayac, setFormSayac] = useState(0);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const filtreliBeyannameler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return beyannameler;
    return beyannameler.filter(
      (b) =>
        b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
        (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
        (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q),
    );
  }, [beyannameler, arama]);

  const secili = beyannameler.find((b) => b.id === beyannameId);

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dosyaYok && !beyannameId) {
      toast({ title: "Beyanname seçin", description: "Dosya yoksa 'Dosya yok' işaretleyin.", variant: "destructive" });
      return;
    }
    if (dosyaYok && !aciklama.trim()) {
      toast({ title: "Dosyasız kayıtta açıklama zorunlu", variant: "destructive" });
      return;
    }
    if (!tutar.trim() || !alacakli.trim()) {
      toast({ title: "Tutar ve alacaklı zorunlu", variant: "destructive" });
      return;
    }
    if (odemeTipi === "masraf" && !masrafTuru) {
      toast({ title: "Masraf türü seçin", variant: "destructive" });
      return;
    }
    if (!dekont) {
      toast({ title: "Dekont dosyası zorunlu", variant: "destructive" });
      return;
    }
    setGonderiliyor(true);
    try {
      const fd = new FormData();
      if (!dosyaYok) fd.set("beyannameId", beyannameId);
      fd.set("odemeTipi", odemeTipi);
      fd.set("masrafTuru", masrafTuru);
      fd.set("tutar", tutar);
      fd.set("paraBirimi", paraBirimi);
      fd.set("alacakli", alacakli);
      fd.set("iban", iban);
      fd.set("aciklama", aciklama);
      fd.set("dekont", dekont);
      if (konsimento) fd.set("konsimento", konsimento);
      const res = await fetch("/api/portal/dogrudan-odeme", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");
      toast({ title: "Ödeme kaydedildi", description: "Kayıt doğrudan Ödendi durumunda oluştu." });
      setBeyannameId(""); setDosyaYok(false); setMasrafTuru(""); setTutar("");
      setAlacakli(""); setIban(""); setAciklama(""); setDekont(null); setKonsimento(null);
      setFormSayac((s) => s + 1);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Doğrudan Ödeme Girişi</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={gonder} className="space-y-4">
          <div className="space-y-2">
            <Label>Beyanname / Dosya</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="dogrudan-dosya-yok"
                checked={dosyaYok}
                onCheckedChange={(v) => {
                  setDosyaYok(v === true);
                  if (v === true) setBeyannameId("");
                }}
                data-testid="checkbox-dogrudan-dosya-yok"
              />
              <Label htmlFor="dogrudan-dosya-yok" className="font-normal text-muted-foreground">
                Dosya yok — beyannamesiz kayıt (açıklama zorunlu)
              </Label>
            </div>
            {!dosyaYok && (
              <>
                <Input
                  placeholder="Dosya no, müşteri veya beyan no ara…"
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  data-testid="input-dogrudan-arama"
                />
                <Select value={beyannameId} onValueChange={setBeyannameId}>
                  <SelectTrigger data-testid="select-dogrudan-beyanname">
                    <SelectValue placeholder="Beyanname seçin (tüm liste)" />
                  </SelectTrigger>
                  <SelectContent>
                    {filtreliBeyannameler.slice(0, 100).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.dosyaNo} — {b.alici ?? "?"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {!dosyaYok && secili && (
              <div className="text-xs text-muted-foreground rounded-md border p-2 space-y-0.5">
                <div><span className="font-medium">Müşteri:</span> {secili.alici ?? "—"}</div>
                <div><span className="font-medium">Beyan No:</span> {secili.beyanNo ?? "—"}</div>
                <div>
                  <span className="font-medium">Beyan Tarihi:</span>{" "}
                  {secili.beyanTarihi ? formatTarih(secili.beyanTarihi) : "beyan tarihi yok"}
                </div>
                <div>
                  <span className="font-medium">Fatura:</span>{" "}
                  {formatPara(secili.fatBedeli, secili.doviz)}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Ödeme Tipi</Label>
              <Select
                value={odemeTipi}
                onValueChange={(v) => setOdemeTipi(v as "masraf" | "depo_teminat")}
              >
                <SelectTrigger data-testid="select-dogrudan-tip">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="masraf">Normal Masraf</SelectItem>
                  <SelectItem value="depo_teminat">Depo Teminatı</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {odemeTipi === "masraf" && (
              <div className="space-y-2">
                <Label>Masraf Türü</Label>
                <Select value={masrafTuru} onValueChange={setMasrafTuru}>
                  <SelectTrigger data-testid="select-dogrudan-masraf-turu">
                    <SelectValue placeholder="Seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {masrafTurleri.map((t) => (
                      <SelectItem key={t.id} value={t.ad}>{t.ad}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Tutar</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="0,00"
                  value={tutar}
                  onChange={(e) => setTutar(e.target.value)}
                  data-testid="input-dogrudan-tutar"
                />
                <Select value={paraBirimi} onValueChange={setParaBirimi}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRY">TRY</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kime Ödendi (Alacaklı)</Label>
              <Input
                placeholder="Firma adı"
                value={alacakli}
                onChange={(e) => setAlacakli(e.target.value)}
                data-testid="input-dogrudan-alacakli"
              />
            </div>
            <div className="space-y-2">
              <Label>IBAN (varsa)</Label>
              <Input placeholder="TR.." value={iban} onChange={(e) => setIban(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Açıklama</Label>
            <Textarea
              placeholder="Ödemeyle ilgili not…"
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              data-testid="input-dogrudan-aciklama"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Dekont (zorunlu)</Label>
              <Input
                key={`dekont-${formSayac}`}
                type="file"
                onChange={(e) => setDekont(e.target.files?.[0] ?? null)}
                data-testid="input-dogrudan-dekont"
              />
            </div>
            {odemeTipi === "depo_teminat" && (
              <div className="space-y-2">
                <Label>Konşimento Örneği</Label>
                <Input
                  key={`konsimento-${formSayac}`}
                  type="file"
                  onChange={(e) => setKonsimento(e.target.files?.[0] ?? null)}
                  data-testid="input-dogrudan-konsimento"
                />
              </div>
            )}
          </div>

          <Button type="submit" disabled={gonderiliyor} data-testid="button-dogrudan-kaydet">
            {gonderiliyor ? "Kaydediliyor…" : "Ödemeyi Kaydet"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Tip kontrolü + Vite derleme**

Run: `npm run check` → hatasız; Vite 200 kontrolü.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/portal/DogrudanOdemeSayfasi.tsx
git commit -m "feat(odemeler): dogrudan odeme sayfasi - dekont zorunlu tek adim kayit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Kabuk — `PortalSidebar` + yeni `PortalApp` + App.tsx rotası + eski panellerin silinmesi

**Files:**
- Create: `client/src/pages/portal/PortalSidebar.tsx`
- Rewrite: `client/src/pages/portal/PortalApp.tsx`
- Modify: `client/src/App.tsx` (yalnız `/portal` rota path'i)
- Delete: `client/src/pages/portal/TemsilciPanel.tsx`, `client/src/pages/portal/MuhasebePanel.tsx`

**Interfaces:**
- Consumes: Task 2-5'in tüm default exportları, `useTalepBildirimleri`/`SayfaAnahtari`/`Rozetler`/`bildirimIzniIste` (Task 2), shadcn Sidebar bileşenleri (`@/components/ui/sidebar`), `PortalLogin` (mevcut).
- Produces: `/portal/*` alt rotalarıyla çalışan kabuk; `PortalMe` tipi PortalApp'te export edilmeye devam eder (Task 2-3 dosyaları import ediyor).

- [ ] **Step 1: PortalSidebar.tsx oluştur**

```tsx
import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilePlus2, ListChecks, Inbox, Warehouse, BanknoteArrowUp, LogOut } from "lucide-react";
import { type PortalMe } from "./PortalApp";
import { type Rozetler, type SayfaAnahtari } from "./useTalepBildirimleri";

type MenuOgesi = {
  title: string;
  href: string;
  icon: typeof Inbox;
  rozetAnahtari?: SayfaAnahtari;
};

const TEMSILCI_MENU: MenuOgesi[] = [
  { title: "Yeni Talep", href: "/portal/yeni-talep", icon: FilePlus2 },
  { title: "Taleplerim", href: "/portal/taleplerim", icon: ListChecks, rozetAnahtari: "taleplerim" },
];

const MUHASEBE_MENU: MenuOgesi[] = [
  { title: "Gelen Talepler", href: "/portal/gelen-talepler", icon: Inbox, rozetAnahtari: "gelenTalepler" },
  { title: "Depo Ödemeleri", href: "/portal/depo", icon: Warehouse, rozetAnahtari: "depo" },
  { title: "Doğrudan Ödeme", href: "/portal/dogrudan-odeme", icon: BanknoteArrowUp },
];

export default function PortalSidebar({
  me, rozetler, cikisYap,
}: { me: PortalMe; rozetler: Rozetler; cikisYap: () => void }) {
  const [location] = useLocation();
  const menu = me.rol === "muhasebe" ? MUHASEBE_MENU : TEMSILCI_MENU;

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-6 border-b border-sidebar-border">
        <div className="flex flex-col items-center justify-center gap-3">
          <img src="/logo.png" alt="CNC" className="h-14 w-auto object-contain" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest text-center">
            Ödemeler Portalı
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menu.map((item) => {
                const rozet = item.rozetAnahtari ? rozetler[item.rozetAnahtari] : 0;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={location === item.href} className="h-10">
                      <Link href={item.href} data-testid={`link-portal-${item.href.split("/").pop()}`}>
                        <item.icon className="w-5 h-5" />
                        <span>{item.title}</span>
                        {rozet > 0 && (
                          <Badge
                            variant="destructive"
                            className="ml-auto"
                            data-testid={`rozet-${item.rozetAnahtari}`}
                          >
                            {rozet}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex flex-col gap-0.5 mb-3 min-w-0">
          <span className="text-sm font-medium truncate" data-testid="text-portal-kullanici">
            {me.adSoyad}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {me.rol === "muhasebe" ? "Muhasebe" : "Müşteri Temsilcisi"}
          </span>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={cikisYap}
          data-testid="button-portal-cikis"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Çıkış
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
```

Not: `BanknoteArrowUp` lucide'de yoksa (`npm run check` söyler) `Banknote` kullan.

- [ ] **Step 2: PortalApp.tsx'i yeniden yaz**

Dosyanın tüm içeriğini şununla değiştir (`PortalMe` tipi aynen korunur — diğer dosyalar import ediyor):

```tsx
import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import PortalLogin from "./PortalLogin";
import PortalSidebar from "./PortalSidebar";
import YeniTalepSayfasi from "./YeniTalepSayfasi";
import TaleplerimSayfasi from "./TaleplerimSayfasi";
import GelenTaleplerSayfasi from "./GelenTaleplerSayfasi";
import DepoOdemeleriSayfasi from "./DepoOdemeleriSayfasi";
import DogrudanOdemeSayfasi from "./DogrudanOdemeSayfasi";
import { type TalepDetay } from "./portalUtils";
import {
  useTalepBildirimleri, bildirimIzniIste, type SayfaAnahtari,
} from "./useTalepBildirimleri";

export type PortalMe = {
  id: string;
  adSoyad: string;
  rol: "temsilci" | "muhasebe";
  avAdi: string | null;
};

const SAYFA_BASLIKLARI: Record<string, string> = {
  "/portal/yeni-talep": "Yeni Talep",
  "/portal/taleplerim": "Taleplerim",
  "/portal/gelen-talepler": "Gelen Talepler",
  "/portal/depo": "Depo Ödemeleri",
  "/portal/dogrudan-odeme": "Doğrudan Ödeme",
};

const ROTA_SAYFASI: Record<string, SayfaAnahtari> = {
  "/portal/taleplerim": "taleplerim",
  "/portal/gelen-talepler": "gelenTalepler",
  "/portal/depo": "depo",
};

function PortalIcerik({ me }: { me: PortalMe }) {
  const [location] = useLocation();

  // Tek itici sorgu: 10 sn'de bir tazeler; sayfalar aynı queryKey cache'ini okur.
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
    refetchInterval: 10000,
  });

  const aktifSayfa = ROTA_SAYFASI[location] ?? null;
  const rozetler = useTalepBildirimleri(me, talepler, aktifSayfa);

  useEffect(() => {
    bildirimIzniIste(); // girişten sonra bir kez sorar; reddedilirse sessiz
  }, []);

  const cikisYap = async () => {
    await apiRequest("POST", "/api/portal/logout").catch(() => {});
    queryClient.setQueryData(["/api/portal/me"], null);
  };

  const varsayilanRota = me.rol === "muhasebe" ? "/portal/gelen-talepler" : "/portal/yeni-talep";
  const baslik = SAYFA_BASLIKLARI[location] ?? "Ödemeler Portalı";

  return (
    <div className="flex h-screen w-full bg-background">
      <PortalSidebar me={me} rozetler={rozetler} cikisYap={cikisYap} />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center gap-4 h-14 px-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
          <SidebarTrigger data-testid="button-portal-sidebar-toggle" />
          <h1 className="text-lg font-semibold" data-testid="text-portal-sayfa-baslik">{baslik}</h1>
        </header>
        <main className="flex-1 overflow-auto p-4">
          <div className="max-w-6xl mx-auto">
            <Switch>
              {me.rol === "temsilci" && (
                <Route path="/portal/yeni-talep">
                  <YeniTalepSayfasi me={me} />
                </Route>
              )}
              {me.rol === "temsilci" && (
                <Route path="/portal/taleplerim" component={TaleplerimSayfasi} />
              )}
              {me.rol === "muhasebe" && (
                <Route path="/portal/gelen-talepler" component={GelenTaleplerSayfasi} />
              )}
              {me.rol === "muhasebe" && (
                <Route path="/portal/depo" component={DepoOdemeleriSayfasi} />
              )}
              {me.rol === "muhasebe" && (
                <Route path="/portal/dogrudan-odeme" component={DogrudanOdemeSayfasi} />
              )}
              <Route>
                <Redirect to={varsayilanRota} />
              </Route>
            </Switch>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function PortalApp() {
  const { data: me, isLoading } = useQuery<PortalMe | null>({
    queryKey: ["/api/portal/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }
  if (!me) return <PortalLogin />;

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <PortalIcerik me={me} />
    </SidebarProvider>
  );
}
```

- [ ] **Step 3: App.tsx rotasını alt yolları kapsayacak biçimde değiştir**

`client/src/App.tsx` içinde:

```tsx
      <Route path="/portal" component={PortalApp} />
```

satırını şu hale getir (wouter'da `:rest*` hem `/portal` hem alt yolları eşler):

```tsx
      <Route path="/portal/:rest*" component={PortalApp} />
```

Bypass koşuluna DOKUNMA (`startsWith("/portal")` zaten kapsıyor).

- [ ] **Step 4: Eski panelleri sil**

```bash
git rm client/src/pages/portal/TemsilciPanel.tsx client/src/pages/portal/MuhasebePanel.tsx
```

- [ ] **Step 5: Tip kontrolü + derleme + hızlı akış**

Run: `npm run check` → hatasız (silinen dosyalara referans kalmadığını da kanıtlar).
Dev sunucuyu yeniden başlat; Vite 200 kontrolü: `PortalApp.tsx`, `PortalSidebar.tsx`.
`curl -s http://localhost:5000/portal/taleplerim | head -c 100` → SPA HTML (200).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/portal/PortalSidebar.tsx client/src/pages/portal/PortalApp.tsx client/src/App.tsx
git commit -m "feat(odemeler): portal sidebar kabugu - alt rotalar, rozetler, bildirim entegrasyonu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(`git rm` edilen dosyalar da bu commit'e girer.)

---

### Task 7: E2E doğrulama — Faz 1 regresyonu + Faz 1.5 senaryoları

**Files:**
- Create (scratchpad'de, repo dışı): `e2e-faz15.js`
- Modify: yok (yalnız doğrulama; gerçek uygulama hatası bulunursa DÜZELTME, DONE_WITH_CONCERNS raporla)

**Interfaces:**
- Consumes: tüm önceki görevler; Playwright scratchpad kurulumu; test kullanıcıları `suleyman`/1234, `muhasebe`/1234.

- [ ] **Step 1: Playwright senaryosu — kontrol noktaları**

Scratchpad'de `e2e-faz15.js` yaz ve çalıştır (`node e2e-faz15.js`); her kontrol noktasında ekran görüntüsü (`faz15-NN-*.png`):

1. **Sidebar/temsilci:** login suleyman → sidebar'da "Yeni Talep" + "Taleplerim", altta "Süleyman / Müşteri Temsilcisi" + Çıkış görünür; `/portal` → `/portal/yeni-talep`'e yönlenir.
2. **Faz 1 regresyonu (form):** beyanname ara/seç → bilgi kutusu dolar; `E2E Faz15 AS` alacaklısıyla masraf talebi gönder → toast.
3. **Taleplerim sayfası:** sidebar'dan Taleplerim → tablo talep listeler; "Bekliyor" rozeti.
4. **Rozet akışı (muhasebe):** ayrı context'te muhasebe login → `/portal/gelen-talepler`'e yönlenir. Temsilci context'inde İKİNCİ bir talep gönder; muhasebe context'inde Depo veya Doğrudan Ödeme sayfasına GEÇ (gelen-talepler'den ayrıl) → ≤15 sn içinde sidebar'da `[data-testid="rozet-gelenTalepler"]` görünür ve sayı ≥1 → Gelen Talepler'e tıkla → rozet kaybolur.
5. **Ödeme + temsilci rozeti:** muhasebe bir talebi dekontla öder; temsilci context'i Yeni Talep sayfasındayken ≤15 sn'de `rozet-taleplerim` belirir; sekme başlığı `(n)` içerir (`page.title()`); Taleplerim'e tıkla → rozet sıfırlanır, satır "Ödendi".
6. **Bildirim:** muhasebe context'ini `context.grantPermissions(["notifications"], {origin:"http://localhost:5000"})` ile aç; sayfada `page.evaluate` ile `Notification` çağrılarını yakalayan bir sarmalayıcı kur (constructor'ı stub'la, çağrı kaydı window dizisine). Sekmeyi `page.evaluate(() => Object.defineProperty(document, "hidden", {value: true, configurable: true}))` + visibilitychange event dispatch ile arka plana it; temsilciden yeni talep gönder; ≤15 sn'de stub kaydında "Yeni ödeme talebi" metni görülür. (Bu, gerçek OS bildirimi yerine çağrının yapıldığını kanıtlar — yeterli.)
7. **Doğrudan Ödeme:** muhasebe → Doğrudan Ödeme sayfası; dosyasız + açıklamalı + dekontlu kayıt → toast; Gelen Talepler'de "Ödendi" olarak listelenir; temsilci context'inde Taleplerim'de GÖRÜNMEZ.
8. **Depo doğrudan ödeme:** depo teminatı tipiyle doğrudan ödeme (konşimento alanı görünür) → Depo Ödemeleri sayfasında "İade Bekleniyor" rozetiyle listelenir.
9. **Faz 1 regresyonu (iade + eşleştirme):** depo kaydına İade Kaydı → "İade Alındı"; temsilciden dosyasız talep → muhasebe öder → temsilci Taleplerim'de Eşleşme Bekleyenler kartından eşleştir → kart düşer.
10. **Yönetim regresyonu:** admin context (`cnc2024`) → `/odemeler` İzleme'de E2E kayıtları görünür; `/` dashboard hâlâ açılıyor (yönetim düzeni bozulmadı).

- [ ] **Step 2: Temizlik + son kontroller**

```bash
# Test verilerini sil (repo kökünden):
node -e "
require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
p.query(\"DELETE FROM odeme_talepleri WHERE alacakli LIKE 'E2E %'\").then(r => { console.log('silinen:', r.rowCount); p.end(); });
"
```

Run: `npm run check` → hatasız. `npm run build` → `dist/` üretilir, hata yok.

- [ ] **Step 3: Rapor**

Kontrol noktası sonuçları + ekran görüntüsü adları + temizlik sayısı + build çıktısı raporlanır. Commit yok (kod değişmediyse).
