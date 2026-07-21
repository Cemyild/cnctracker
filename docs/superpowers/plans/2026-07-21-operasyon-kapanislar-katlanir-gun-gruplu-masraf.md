# Kapanışlarım: Katlanır Gün + Gruplu Masraf Tablosu — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kapanışlarım sayfasında günleri katlanır yapmak ve açılan günde avansları + masrafları Kasam'ın gruplu tablo formatında göstermek; gruplama mantığını iki sayfanın paylaştığı tek bir yardımcıya taşımak.

**Architecture:** Kasam'daki masraf gruplama `useMemo` içeriği `masrafGruplama.ts` yardımcısına çıkarılır (davranış birebir korunur), Kasam onu çağıracak şekilde sadeleşir. Kapanışlarım `beyannameler` query'si ekleyip aynı yardımcıyı kullanır; her gün katlanır kart olur (varsayılan kapalı), açılan günde önce yeşil avans bloğu sonra sütun-başlıklı masraf tablosu gelir. Beyanname grupları katlanabilir ama **varsayılan açık** (`kapaliGruplar` Set'i). Backend/şema/uç HİÇ değişmez.

**Tech Stack:** React 18 + Vite + TanStack Query + shadcn/ui + lucide-react (ChevronRight/ChevronDown) + Tailwind grid

**Spec:** [docs/superpowers/specs/2026-07-21-operasyon-kapanislar-katlanir-gun-gruplu-masraf-design.md](../specs/2026-07-21-operasyon-kapanislar-katlanir-gun-gruplu-masraf-design.md)

## Global Constraints

- **YALNIZ istemci.** `server/`, `shared/`, `db:push` HİÇ dokunulmaz. `k.avanslar` ve `k.masraflar` API'den zaten geliyor; yeni uç açılmaz.
- **Kasam'ın görünümü ve davranışı DEĞİŞMEZ** — T1 yalnız gruplama kodunu yardımcıya taşır; render, testid'ler, varsayılan kapalı gruplar aynen kalır.
- **Kapanışlarım'da beyanname grupları varsayılan AÇIK** — durum `Set<string> kapaliGruplar` ile tutulur (**sette olan KAPALI**). Bu, Kasam'daki `acikGruplar` mantığının TERSİDİR; oradan kopyalanmamalı.
- **Kapanmış gün kilitlidir:** açılan masraf satırlarında **Kaldır butonu YOKTUR**. Belge linki korunur.
- **Avans satırında boş açıklamada `—` gösterilmez** (Kasam kalıbı).
- Korunan testid'ler: `kapanis-{id}` (Kapanışlarım); Kasam tarafında `group-beyanname-{id}`, `button-group-toggle-{id}`, `group-ofis`, `button-group-toggle-ofis`, `row-masraf-{id}`, `button-masraf-kaldir-{id}`, `row-avans-{id}`, `text-bakiye`, `button-op-yeni-odeme`, `button-op-gunu-kapat`.
- Yeni testid'ler (Kapanışlarım): `button-kapanis-toggle-{kapanisId}`, `group-kapanis-{kapanisId}-{beyannameId}`, `button-group-toggle-{kapanisId}-{beyannameId}`, `group-kapanis-ofis-{kapanisId}`.
- Para toplamı `Math.round(x * 100) / 100`. Grid template başlık + grup satırlarında BİREBİR aynı olmalı.
- **DEV DB izolasyonu:** Playwright yazma testi öncesi `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true`; değilse DUR.
- **git add YALNIZ açık dosya yollarıyla.** `-A`/`.` ASLA. **`git push` YAPILMAZ.** `package.json`/lockfile değişmez.
- **Türkçe kaynak dosyalarını PowerShell Set-Content ile yeniden YAZMA.** Edit/Write tool; U+FFFD taraması.
- Playwright projede bağımlılık DEĞİL; yerel önbellekten `NODE_PATH` ile kullanılır.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `client/src/pages/portal/masrafGruplama.ts` | Paylaşılan gruplama yardımcısı | T1 (yeni) |
| `client/src/pages/portal/OperasyonKasaSayfasi.tsx` | Gruplama çağrısı yardımcıya taşınır (davranış aynı) | T1 |
| `client/src/pages/portal/OperasyonKapanislarSayfasi.tsx` | Katlanır gün + avans bloğu + gruplu masraf tablosu | T2 |
| — | Uçtan uca doğrulama + build | T3 |

---

### Task 1: Ortak gruplama yardımcısı + Kasam'ı ona bağla

**Files:**
- Create: `client/src/pages/portal/masrafGruplama.ts`
- Modify: `client/src/pages/portal/OperasyonKasaSayfasi.tsx` (yalnız `useMemo` gruplama bloğu + import)

**Interfaces:**
- Consumes: `Beyanname`, `OperasyonMasraf` (`@shared/schema`)
- Produces:
  - `export type MasrafGrubu = { beyannameId: string; beyanname: Beyanname | undefined; masraflar: OperasyonMasraf[]; toplam: number }`
  - `export type GruplamaSonucu = { gruplar: MasrafGrubu[]; ofisMasraflar: OperasyonMasraf[]; ofisToplam: number }`
  - `export function masraflariGrupla(masraflar: OperasyonMasraf[], beyannameMap: Map<string, Beyanname>): GruplamaSonucu`

- [ ] **Step 1: Yardımcıyı oluştur**

`client/src/pages/portal/masrafGruplama.ts` dosyasını OLUŞTUR:

```ts
import type { Beyanname, OperasyonMasraf } from "@shared/schema";

// Kasam ve Kapanışlarım aynı gruplamayı kullanır — tek doğruluk kaynağı.
// Kural: dosyaYok=true VEYA beyannameId boş → ofis grubuna; diğerleri beyannameId bazında.
export type MasrafGrubu = {
  beyannameId: string;
  beyanname: Beyanname | undefined;
  masraflar: OperasyonMasraf[];
  toplam: number;
};

export type GruplamaSonucu = {
  gruplar: MasrafGrubu[];
  ofisMasraflar: OperasyonMasraf[];
  ofisToplam: number;
};

export function masraflariGrupla(
  masraflar: OperasyonMasraf[],
  beyannameMap: Map<string, Beyanname>,
): GruplamaSonucu {
  const harita = new Map<string, OperasyonMasraf[]>();
  const ofis: OperasyonMasraf[] = [];
  for (const m of masraflar) {
    if (m.dosyaYok || !m.beyannameId) { ofis.push(m); continue; }
    const g = harita.get(m.beyannameId);
    if (g) g.push(m); else harita.set(m.beyannameId, [m]);
  }
  const topla = (list: OperasyonMasraf[]) =>
    Math.round(list.reduce((s, m) => s + parseFloat(m.tutar), 0) * 100) / 100;
  const gruplar = Array.from(harita.entries()).map(([beyannameId, list]) => ({
    beyannameId, beyanname: beyannameMap.get(beyannameId), masraflar: list, toplam: topla(list),
  }));
  return { gruplar, ofisMasraflar: ofis, ofisToplam: topla(ofis) };
}
```

- [ ] **Step 2: Kasam'ı yardımcıya bağla**

`client/src/pages/portal/OperasyonKasaSayfasi.tsx` içinde:

(a) Import ekle (mevcut `import YeniOdemeModal ...` satırının ALTINA):

```tsx
import { masraflariGrupla } from "./masrafGruplama";
```

(b) Mevcut gruplama `useMemo` bloğunu — yani

```tsx
  // Masraflar beyannameId'ye göre gruplanır; dosyaYok (ofis) ayrı grupta.
  const { gruplar, ofisMasraflar, ofisToplam } = useMemo(() => {
    const harita = new Map<string, OperasyonMasraf[]>();
    const ofis: OperasyonMasraf[] = [];
    for (const m of ozet?.masraflar ?? []) {
      if (m.dosyaYok || !m.beyannameId) { ofis.push(m); continue; }
      const g = harita.get(m.beyannameId);
      if (g) g.push(m); else harita.set(m.beyannameId, [m]);
    }
    const topla = (list: OperasyonMasraf[]) => Math.round(list.reduce((s, m) => s + parseFloat(m.tutar), 0) * 100) / 100;
    const gruplar = Array.from(harita.entries()).map(([beyannameId, masraflar]) => ({
      beyannameId, beyanname: beyannameMap.get(beyannameId), masraflar, toplam: topla(masraflar),
    }));
    return { gruplar, ofisMasraflar: ofis, ofisToplam: topla(ofis) };
  }, [ozet?.masraflar, beyannameMap]);
```

— şununla DEĞİŞTİR:

```tsx
  // Gruplama ortak yardımcıda (Kapanışlarım da aynısını kullanır).
  const { gruplar, ofisMasraflar, ofisToplam } = useMemo(
    () => masraflariGrupla(ozet?.masraflar ?? [], beyannameMap),
    [ozet?.masraflar, beyannameMap],
  );
```

**Render, testid'ler ve diğer her şey DEĞİŞMEZ.** `OperasyonMasraf` tipi başka yerde kullanılmıyorsa import'u TypeScript hata vermediği sürece OLDUĞU GİBİ BIRAK (dosyada `Ozet` tipi hâlâ kullanıyor).

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 4: Kasam davranış regresyonu (Playwright)**

DB hedefini doğrula (`DEV_NEON: true`). Dev sunucu 5000'de (`npm run dev`). Hazırlık: `T1REG` operasyon kullanıcısı (şube `Gemlik`) + `belgeZorunlu=false` tür `E2E DOSYA`; muhasebeden 3000 TL avans; aynı beyannameye 2 masraf + 1 ofis masrafı.

1. Kasam'da açık hareketler: avans yeşil satır, masraf bölümünde sütun başlıkları bir kez.
2. Beyanname grubu **KAPALI** gelir (Kasam varsayılanı değişmedi) — masraf satırları görünmez.
3. Gruba tıkla → açılır; 2 masraf + her birinde **Kaldır** butonu görünür.
4. Bir masrafı Kaldır → grup toplamı güncellenir.
5. "Ofis Masrafları" grubu görünür, açılır.

Beklenen: 5/5 PASS — yani yardımcıya taşıma Kasam'ı bozmadı.

**Temizlik:** `T1REG` + hareketleri + avansı + `E2E DOSYA` türü + `uploads/operasyon/` test dosyaları silinir; sorgu + dizin listesiyle kanıtla.

- [ ] **Step 5: U+FFFD taraması ve commit**

Run:
```bash
node -e "['client/src/pages/portal/masrafGruplama.ts','client/src/pages/portal/OperasyonKasaSayfasi.tsx'].forEach(f=>console.log(f, require('fs').readFileSync(f,'utf8').includes('�')))"
```
Expected: iki satır da `false`.

```bash
git add client/src/pages/portal/masrafGruplama.ts client/src/pages/portal/OperasyonKasaSayfasi.tsx
git status
git commit -m "refactor(operasyon): masraf gruplamasini ortak yardimciya tasi (davranis ayni)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
`git status` YALNIZ bu 2 dosyayı göstermeli.

---

### Task 2: Kapanışlarım — katlanır gün + avans bloğu + gruplu masraf tablosu

**Files:**
- Modify: `client/src/pages/portal/OperasyonKapanislarSayfasi.tsx` (tamamı yeniden yazılır)

**Interfaces:**
- Consumes: T1'in `masraflariGrupla(masraflar, beyannameMap)`; mevcut `["/api/portal/operasyon/kapanislar"]` ve `["/api/portal/beyannameler"]` queryKey'leri; `formatTarih`/`formatPara`
- Produces: yeni testid'ler `button-kapanis-toggle-{kapanisId}`, `group-kapanis-{kapanisId}-{beyannameId}`, `button-group-toggle-{kapanisId}-{beyannameId}`, `group-kapanis-ofis-{kapanisId}`; `kapanis-{id}` KORUNUR

- [ ] **Step 1: Dosyanın TAMAMINI değiştir**

`client/src/pages/portal/OperasyonKapanislarSayfasi.tsx` dosyasını şununla DEĞİŞTİR:

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Beyanname, OperasyonAvans, OperasyonGunKapanis, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown } from "lucide-react";
import { formatTarih, formatPara } from "./portalUtils";
import { masraflariGrupla } from "./masrafGruplama";

type Kapanis = OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };

// Kasam'daki tabloyla BİREBİR aynı grid şablonu (hizalama şartı).
const GRID = "grid-cols-[minmax(80px,auto)_minmax(0,1fr)_minmax(0,1.4fr)_auto_20px]";

export default function OperasyonKapanislarSayfasi() {
  const { data: kapanislar = [] } = useQuery<Kapanis[]>({ queryKey: ["/api/portal/operasyon/kapanislar"] });
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });

  // Gün: sette OLAN açık (varsayılan KAPALI).
  const [acikGunler, setAcikGunler] = useState<Set<string>>(new Set());
  const gunAcKapa = (id: string) => setAcikGunler((p) => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Beyanname grubu: sette OLAN KAPALI (varsayılan AÇIK) — Kasam'daki mantığın TERSİ.
  const [kapaliGruplar, setKapaliGruplar] = useState<Set<string>>(new Set());
  const grupAcKapa = (anahtar: string) => setKapaliGruplar((p) => {
    const n = new Set(p); n.has(anahtar) ? n.delete(anahtar) : n.add(anahtar); return n;
  });

  const beyannameMap = useMemo(() => new Map(beyannameler.map((b) => [b.id, b])), [beyannameler]);

  return (
    <div className="space-y-4">
      {kapanislar.length === 0 && <p className="text-sm text-muted-foreground">Henüz kapanış yok.</p>}
      {kapanislar.map((k) => {
        const gunAcik = acikGunler.has(k.id);
        const { gruplar, ofisMasraflar, ofisToplam } = masraflariGrupla(k.masraflar, beyannameMap);
        return (
          <Card key={k.id} data-testid={`kapanis-${k.id}`}>
            <button type="button" onClick={() => gunAcKapa(k.id)} className="w-full p-4 text-left hover:bg-muted/50" data-testid={`button-kapanis-toggle-${k.id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {gunAcik ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="text-base font-semibold">{formatTarih(k.gunTarihi)} Kapanışı</span>
                </span>
                {k.durum === "geri_acildi" && <Badge variant="destructive">Geri Açıldı</Badge>}
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><div className="text-muted-foreground text-xs">Açılış</div><div className="font-semibold">{formatPara(k.acilisBakiye, "TL")}</div></div>
                <div><div className="text-muted-foreground text-xs">Avans</div><div className="font-semibold text-green-600">+{formatPara(k.avansToplam, "TL")}</div></div>
                <div><div className="text-muted-foreground text-xs">Masraf</div><div className="font-semibold text-destructive">−{formatPara(k.masrafToplam, "TL")}</div></div>
                <div><div className="text-muted-foreground text-xs">Kapanış</div><div className="font-semibold">{formatPara(k.kapanisBakiye, "TL")}</div></div>
              </div>
            </button>

            {gunAcik && (
              <CardContent className="space-y-4 border-t pt-4">
                {k.avanslar.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Avanslar</div>
                    {k.avanslar.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-900 dark:bg-green-950/40" data-testid={`row-avans-${a.id}`}>
                        <div className="text-green-700 dark:text-green-400">
                          <span className="font-medium">Avans</span> · {formatTarih(a.tarih)}{a.aciklama ? ` · ${a.aciklama}` : ""}
                          {a.belgeDosya && <> · <a className="underline" href={"/" + a.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">dekont</a></>}
                        </div>
                        <div className="font-semibold text-green-700 dark:text-green-400">+{formatPara(a.tutar, "TL")}</div>
                      </div>
                    ))}
                  </div>
                )}

                {(gruplar.length > 0 || ofisMasraflar.length > 0) ? (
                  <div className="rounded-md border">
                    <div className={`grid ${GRID} gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground`}>
                      <span>Dosya No</span>
                      <span>Beyanname No</span>
                      <span>Firma</span>
                      <span className="text-right">Tutar</span>
                      <span />
                    </div>

                    {gruplar.map((g) => {
                      const anahtar = `${k.id}-${g.beyannameId}`;
                      const acik = !kapaliGruplar.has(anahtar); // VARSAYILAN AÇIK
                      const b = g.beyanname;
                      return (
                        <div key={g.beyannameId} className="border-b last:border-b-0" data-testid={`group-kapanis-${k.id}-${g.beyannameId}`}>
                          <button type="button" onClick={() => grupAcKapa(anahtar)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-${k.id}-${g.beyannameId}`}>
                            <span className="font-semibold">{b?.dosyaNo ?? "?"}</span>
                            <span className="truncate text-muted-foreground">{b?.beyanNo ?? "—"}</span>
                            <span className="truncate">{b?.alici ?? "?"}</span>
                            <span className="text-right font-semibold text-destructive">−{formatPara(g.toplam, "TL")}</span>
                            {acik ? <ChevronDown className="h-4 w-4 justify-self-end" /> : <ChevronRight className="h-4 w-4 justify-self-end" />}
                          </button>
                          {acik && (
                            <div className="space-y-1 border-t bg-muted/20 px-3 py-1.5">
                              {g.masraflar.map((m) => (
                                <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                                  <span className="min-w-0 truncate">{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                                  <span className="shrink-0 font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {ofisMasraflar.length > 0 && (() => {
                      const anahtar = `${k.id}-__ofis__`;
                      const acik = !kapaliGruplar.has(anahtar); // VARSAYILAN AÇIK
                      return (
                        <div data-testid={`group-kapanis-ofis-${k.id}`}>
                          <button type="button" onClick={() => grupAcKapa(anahtar)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-ofis-${k.id}`}>
                            <span className="col-span-3 font-semibold">Ofis Masrafları</span>
                            <span className="text-right font-semibold text-destructive">−{formatPara(ofisToplam, "TL")}</span>
                            {acik ? <ChevronDown className="h-4 w-4 justify-self-end" /> : <ChevronRight className="h-4 w-4 justify-self-end" />}
                          </button>
                          {acik && (
                            <div className="space-y-1 border-t bg-muted/20 px-3 py-1.5">
                              {ofisMasraflar.map((m) => (
                                <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                                  <span className="min-w-0 truncate"><Badge variant="outline" className="mr-1">Ofis</Badge>{m.masrafTuru ?? "Masraf"} · {m.aciklama ?? "—"}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                                  <span className="shrink-0 font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-xs">Masraf yok.</div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
```

**Notlar:**
- Gün başlığı `<button>`; içindeki özet grid de onun içinde (tıklama alanı tüm başlık).
- Grup anahtarı `${k.id}-${g.beyannameId}` — aynı beyanname birden çok günde görünebileceğinden kapanış kimliği önektedir.
- Masraf satırlarında **Kaldır YOK** (kapanmış gün kilitli). Belge linki var.
- `CardHeader`/`CardTitle` artık kullanılmıyor; import'tan çıkarıldı (yukarıdaki import satırı zaten yalnız `Card, CardContent` alıyor).

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 3: U+FFFD taraması**

Run: `node -e "console.log(require('fs').readFileSync('client/src/pages/portal/OperasyonKapanislarSayfasi.tsx','utf8').includes('�'))"`
Expected: `false`.

- [ ] **Step 4: Playwright doğrulaması**

DB hedefini doğrula (`DEV_NEON: true`). Hazırlık: `T2KAP` operasyon kullanıcısı (şube `Gemlik`) + `belgeZorunlu=false` tür `E2E DOSYA`; muhasebeden **açıklamasız** bir avans; **iki farklı beyannameye** masraf (birine 2, diğerine 1) + **1 ofis masrafı**; sonra **Günü Kapat** ile gün kapatılır. (Kapanış oluşması için Günü Kapat şart.)

1. Kapanışlarım'da gün **KAPALI** gelir: başlıkta tarih + dört özet değer görünür, masraf satırları GÖRÜNMEZ.
2. Gün başlığına tıkla → açılır.
3. **Avanslar** bloğu görünür; açıklamasız avansta `—` YOK; yeşil.
4. Masraf tablosunda sütun başlıkları bir kez (Dosya No / Beyanname No / Firma / Tutar).
5. **Beyanname grupları AÇIK gelir** — tıklamadan masraf satırları görünür; grup başlığında dosya no bold + beyan no + firma + tutar.
6. Bir gruba tıkla → **kapanır**; tekrar tıkla → açılır.
7. Açık masraf satırlarında belge linki var, **Kaldır butonu YOK** (`button-masraf-kaldir-` hiç bulunmamalı).
8. "Ofis Masrafları" grubu görünür, `Ofis` rozetli, açık gelir.
9. Gün başlığına tekrar tıkla → gün kapanır.

Sonuçları raporla. Başarısızlıkta kodu "geçsin diye" değiştirme.

**Temizlik:** `T2KAP` + kapanışı + hareketleri + `E2E DOSYA` türü + `uploads/operasyon/` test dosyaları silinir (kapanış kaydı için `operasyon_gun_kapanis` satırı da); sorgu + dizin listesiyle kanıtla.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/portal/OperasyonKapanislarSayfasi.tsx
git status
git commit -m "feat(operasyon): Kapanislarim katlanir gun + gruplu masraf tablosu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Uçtan uca doğrulama + kalite kapıları

**Files:**
- Create (scratchpad): `e2e-kapanis.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla; "geçsin diye" değiştirme.

**Interfaces:**
- Consumes: T1 + T2

- [ ] **Step 1: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 2: Karma E2E senaryosu**

Scratchpad'de `e2e-kapanis.js` (Playwright chromium). Kurulum: `KAPE2E` operasyon kullanıcısı (şube `İstanbul - Erenköy` — boşluklu/Türkçe kasıtlı) + `belgeZorunlu=false` tür `E2E DOSYA`; muhasebeden **iki avans** (biri açıklamalı, biri açıklamasız); **iki beyannameye** masraf (2 + 1) + **1 ofis masrafı**; Günü Kapat.

**(A) Gün kapalı:** Kapanışlarım'da gün kapalı; dört özet değer doğru (Açılış/Avans/Masraf/Kapanış), masraf satırı yok.
**(B) Gün açılır:** başlığa tıkla → avans bloğu + masraf tablosu görünür.
**(C) Avans:** açıklamasız avansta `—` YOK; açıklamalı avansta açıklama var; dekontlu avansta dekont linki var.
**(D) Gruplar açık:** iki beyanname grubu da tıklamadan açık; dosya no bold, beyan no + firma + tutar doğru.
**(E) Grup katla:** bir gruba tıkla → kapanır; tekrar → açılır.
**(F) Kaldır yok:** açılan gün içinde `button-masraf-kaldir-` hiç yok.
**(G) Ofis grubu:** "Ofis Masrafları" açık, `Ofis` rozetli.
**(H) Kasam regresyonu:** Kasam'da yeni bir masraf ekle → açık hareketlerde grup **KAPALI** gelir (Kasam varsayılanı korunmuş), tıkla → açılır, **Kaldır çalışır**.
**(I) Boşluklu/Türkçe şube adı** (`İstanbul - Erenköy`) hiçbir yerde bozulmaz.

Her adımın PASS/FAIL + kanıtını (ekran görüntüsü/DOM assert) raporla.

- [ ] **Step 3: Temizlik**

`KAPE2E` + kapanışları + hareketleri + `E2E DOSYA` türü + `uploads/operasyon/` test dosyaları silinir. Doğrula:

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select (select count(*)::int from portal_kullanicilar where kullanici_adi like 'KAPE2E%') k, (select count(*)::int from masraf_turleri where ad like 'E2E%') t, (select count(*)::int from operasyon_gun_kapanis) gk\").then(r=>{console.log('kalan E2E kullanici:',r.rows[0].k,'| E2E tur:',r.rows[0].t,'| gun kapanis:',r.rows[0].gk);process.exit(0)})"
```
Expected: `kalan E2E kullanici: 0 | E2E tur: 0 | gun kapanis: 0`. `ls uploads/operasyon/` → test dosyası kalmamalı.

- [ ] **Step 4: Kalite kapıları**

Run: `npm run check` → 0 hata.
Run: `npm run build` → hatasız; `dist/` üretilir.

- [ ] **Step 5: Commit (yalnız gerçek bir hata düzeltildiyse)**

Kod değişmediyse commit YOK. Değiştiyse açık yolla ekle + `fix(operasyon): …` mesajı.

---

## Self-Review Notu

**Spec kapsamı:**
- §3 Ortak yardımcı (`masraflariGrupla`, kurallar birebir) + Kasam'ın ona bağlanması → T1
- §4 Gün kapalı + başlıkta 4 özet + Geri Açıldı rozeti + tıklanabilir başlık → T2 Step 1
- §4 Avans bloğu (yeşil, boş açıklamada `—` yok, dekont) → T2 Step 1
- §4 Masraf tablosu (sütun başlıkları, dosya no bold, grid aynı, Ofis grubu) → T2 Step 1
- §4 Beyanname grupları **katlanabilir + varsayılan AÇIK** (`kapaliGruplar`) → T2 Step 1
- §4 Kaldır YOK (kilitli) + belge linki korunur + "Masraf yok." → T2 Step 1
- §6 Doğrulama (check/build, DEV DB izolasyonu, testid'ler, Playwright, Kasam regresyonu) → T1 Step 4 + T2 Step 4 + T3

**Tip tutarlılığı:** `masraflariGrupla(masraflar, beyannameMap)` T1'de tanımlanır, T1 (Kasam) ve T2 (Kapanışlarım) aynı imzayla çağırır. `MasrafGrubu.beyannameId/beyanname/masraflar/toplam` alan adları her iki tüketicide aynı. `GRID` sabiti T2'de başlık + grup + ofis satırlarında tek kaynaktan kullanılır (Kasam'daki string ile aynı değer).

**Dikkat (kopyala-yapıştır tuzağı):** Kasam `acikGruplar` (sette olan AÇIK, varsayılan kapalı), Kapanışlarım `kapaliGruplar` (sette olan KAPALI, varsayılan açık). T2'de `const acik = !kapaliGruplar.has(anahtar)` — negasyon atlanırsa gruplar ters davranır. T2 Step 4 adım 5 bunu doğrular.

**Kapsam dışı (görev YOK):** backend/şema/uç · Kasam'ın görünümü · muhasebe ekranları · gün kapatma/geri açma mantığı · kapanmış masrafın silinmesi.
