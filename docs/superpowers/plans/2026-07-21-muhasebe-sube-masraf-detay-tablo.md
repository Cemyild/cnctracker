# Muhasebe Şube Masraf Detayı: Gruplu Tablo + Katlanır Kapanış Günleri — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Muhasebe "Şube Masraf" ekranındaki Detay kartını operasyon tarafıyla aynı düzene getirmek — Açık Hareketler gruplu tablo, Kapanmış Günler katlanır gün + gruplu tablo.

**Architecture:** `OperasyonTakipSayfasi.tsx`'in Detay kartı yeniden yazılır: `beyannameler` query'si + `Map<id, Beyanname>` eklenir, ortak `masraflariGrupla` yardımcısı üçüncü kez tüketilir. Açık Hareketler'de gruplar varsayılan KAPALI (`acikAcikGruplar`), kapanış içindeki gruplar varsayılan AÇIK (`kapaliKapanisGruplar`). Kapanış günü katlanır; "Geri Aç" butonu katlama butonunun İÇİNDE DEĞİL, kardeşidir. Backend/şema/uç HİÇ değişmez.

**Tech Stack:** React 18 + Vite + TanStack Query + shadcn/ui + lucide-react (ChevronRight/ChevronDown) + Tailwind grid

**Spec:** [docs/superpowers/specs/2026-07-21-muhasebe-sube-masraf-detay-tablo-design.md](../specs/2026-07-21-muhasebe-sube-masraf-detay-tablo-design.md)

## Global Constraints

- **YALNIZ istemci.** `server/`, `shared/`, `db:push` HİÇ dokunulmaz. Yeni uç açılmaz (`beyannameler` mevcut queryKey — Kasam ile aynı, cache paylaşılır).
- **Ortak yardımcı kullanılır:** `masraflariGrupla(masraflar, beyannameMap)` (`./masrafGruplama`). Yeni gruplama kodu YAZILMAZ.
- **İKİ TERS GRUP SEMANTİĞİ aynı dosyada — karıştırma:**
  - `acikAcikGruplar` → Açık Hareketler; **sette olan AÇIK**, varsayılan KAPALI (`const acik = acikAcikGruplar.has(...)`).
  - `kapaliKapanisGruplar` → kapanış içi; **sette olan KAPALI**, varsayılan AÇIK (`const acik = !kapaliKapanisGruplar.has(...)`).
- **"Geri Aç" İÇ İÇE BUTON OLMAZ.** Gün başlığı flex kapsayıcıdır: solda katlama `<button>`, sağda kardeş Geri Aç butonu / "Geri Açıldı" rozeti. Geri Aç'a basmak günü açıp kapatmamalı.
- **Muhasebe SİLMEZ:** hiçbir masraf satırında Kaldır butonu YOKTUR.
- **Avans satırında boş açıklamada `—` GÖSTERİLMEZ** (bugünkü `?? "—"` kaldırılır).
- **Korunan testid'ler:** `grup-sube-{şube}`, `grup-sube-toplam-{şube}`, `sube-{id}`, `sube-bakiye-{id}`, `button-avans-{id}`, `button-detay-{id}`, `takip-kapanis-{id}`, `button-geri-ac-{id}`, `input-avans-tutar`, `input-avans-aciklama`, `input-avans-dekont`, `button-avans-gonder`.
- **Yeni testid'ler:** `group-acik-{beyannameId}`, `button-group-toggle-acik-{beyannameId}`, `group-acik-ofis`, `button-group-toggle-acik-ofis`, `button-kapanis-toggle-{kapanisId}`, `group-kapanis-{kapanisId}-{beyannameId}`, `button-group-toggle-{kapanisId}-{beyannameId}`, `group-kapanis-ofis-{kapanisId}`, `button-group-toggle-ofis-{kapanisId}`, `row-avans-{id}`, `row-masraf-{id}`.
- **Şube Bakiyeleri bölümü, Avans Yükle dialog'u ve `geriAc` mantığı DEĞİŞMEZ.**
- Grid şablonu Kasam/Kapanışlarım'daki ile **birebir aynı**: `grid-cols-[minmax(80px,auto)_minmax(0,1fr)_minmax(0,1.4fr)_auto_20px]`.
- Para toplamı `Math.round(x*100)/100` (yardımcı zaten yapıyor).
- **DEV DB izolasyonu:** Playwright yazma testi öncesi `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true`; değilse DUR.
- **git add YALNIZ açık dosya yoluyla.** `-A`/`.` ASLA. **`git push` YAPILMAZ.** `package.json`/lockfile değişmez.
- **Türkçe kaynak dosyasını PowerShell Set-Content ile yeniden YAZMA.** Edit tool; U+FFFD taraması.
- Playwright projede bağımlılık DEĞİL; yerel önbellekten `NODE_PATH` ile kullanılır.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `client/src/pages/portal/OperasyonTakipSayfasi.tsx` | Detay kartı: gruplu Açık Hareketler + katlanır Kapanmış Günler | T1 |
| — | Uçtan uca doğrulama + build | T2 |

---

### Task 1: Detay kartını yeniden yaz

**Files:**
- Modify: `client/src/pages/portal/OperasyonTakipSayfasi.tsx` (import satırları, state ekleme, Detay kartının `<CardContent>` içi — satır ~133-177)

**Interfaces:**
- Consumes: `masraflariGrupla(masraflar: OperasyonMasraf[], beyannameMap: Map<string, Beyanname>): { gruplar; ofisMasraflar; ofisToplam }` (`./masrafGruplama`); mevcut `detay`, `secili`, `geriAc`, `formatTarih`, `formatPara`
- Produces: yeni testid'ler (Global Constraints'te listeli)

- [ ] **Step 1: Importları genişlet**

`client/src/pages/portal/OperasyonTakipSayfasi.tsx` satır 4'ü DEĞİŞTİR (tip listesine `Beyanname` eklenir):

```tsx
import type { Beyanname, OperasyonAvans, OperasyonGunKapanis, OperasyonMasraf } from "@shared/schema";
```

Ve satır 13'ün (`import { formatTarih, formatPara } from "./portalUtils";`) ALTINA ekle:

```tsx
import { masraflariGrupla } from "./masrafGruplama";
import { ChevronRight, ChevronDown } from "lucide-react";
```

- [ ] **Step 2: Grid sabitini ekle**

`type Detay = ...` satırının (satır 17) ALTINA ekle:

```tsx
// Kasam/Kapanışlarım tablolarıyla BİREBİR aynı grid şablonu (hizalama şartı).
const GRID = "grid-cols-[minmax(80px,auto)_minmax(0,1fr)_minmax(0,1.4fr)_auto_20px]";
```

- [ ] **Step 3: beyanname query'si + gün/grup state'lerini ekle**

`const { data: detay } = useQuery<Detay>({...});` bloğunun ALTINA ekle:

```tsx
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });
  const beyannameMap = useMemo(() => new Map(beyannameler.map((b) => [b.id, b])), [beyannameler]);

  // Kapanış günü: sette OLAN açık (varsayılan KAPALI).
  const [acikGunler, setAcikGunler] = useState<Set<string>>(new Set());
  const gunAcKapa = (id: string) => setAcikGunler((p) => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // AÇIK HAREKETLER grupları: sette OLAN AÇIK (varsayılan KAPALI) — Kasam ile aynı.
  const [acikAcikGruplar, setAcikAcikGruplar] = useState<Set<string>>(new Set());
  const acikGrupAcKapa = (k: string) => setAcikAcikGruplar((p) => {
    const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  // KAPANIŞ İÇİ gruplar: sette OLAN KAPALI (varsayılan AÇIK) — Kapanışlarım ile aynı, yukarıdakinin TERSİ.
  const [kapaliKapanisGruplar, setKapaliKapanisGruplar] = useState<Set<string>>(new Set());
  const kapanisGrupAcKapa = (k: string) => setKapaliKapanisGruplar((p) => {
    const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n;
  });
```

- [ ] **Step 4: Detay kartının CardContent'ini değiştir**

Detay kartındaki `<CardContent className="space-y-4"> … </CardContent>` bloğunun TAMAMINI (mevcut Açık Hareketler bloğu + Kapanmış Günler bloğu) şununla DEĞİŞTİR:

```tsx
          <CardContent className="space-y-6">
            {/* ---- AÇIK HAREKETLER ---- */}
            {(() => {
              const { gruplar: aGruplar, ofisMasraflar: aOfis, ofisToplam: aOfisToplam } =
                masraflariGrupla(detay.acik.masraflar, beyannameMap);
              const hicYok = detay.acik.avanslar.length === 0 && detay.acik.masraflar.length === 0;
              return (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Açık Hareketler</div>
                  {hicYok && <p className="text-xs text-muted-foreground">Açık hareket yok.</p>}

                  {detay.acik.avanslar.length > 0 && (
                    <div className="space-y-1">
                      {detay.acik.avanslar.map((a) => (
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

                  {(aGruplar.length > 0 || aOfis.length > 0) && (
                    <div className="rounded-md border">
                      <div className={`grid ${GRID} gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground`}>
                        <span>Dosya No</span><span>Beyanname No</span><span>Firma</span><span className="text-right">Tutar</span><span />
                      </div>
                      {aGruplar.map((g) => {
                        const acik = acikAcikGruplar.has(g.beyannameId); // VARSAYILAN KAPALI
                        const b = g.beyanname;
                        return (
                          <div key={g.beyannameId} className="border-b last:border-b-0" data-testid={`group-acik-${g.beyannameId}`}>
                            <button type="button" onClick={() => acikGrupAcKapa(g.beyannameId)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-acik-${g.beyannameId}`}>
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
                      {aOfis.length > 0 && (
                        <div data-testid="group-acik-ofis">
                          <button type="button" onClick={() => acikGrupAcKapa("__ofis__")} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid="button-group-toggle-acik-ofis">
                            <span className="col-span-3 font-semibold">Ofis Masrafları</span>
                            <span className="text-right font-semibold text-destructive">−{formatPara(aOfisToplam, "TL")}</span>
                            {acikAcikGruplar.has("__ofis__") ? <ChevronDown className="h-4 w-4 justify-self-end" /> : <ChevronRight className="h-4 w-4 justify-self-end" />}
                          </button>
                          {acikAcikGruplar.has("__ofis__") && (
                            <div className="space-y-1 border-t bg-muted/20 px-3 py-1.5">
                              {aOfis.map((m) => (
                                <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                                  <span className="min-w-0 truncate"><Badge variant="outline" className="mr-1">Ofis</Badge>{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.aciklama ? ` · ${m.aciklama}` : ""}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                                  <span className="shrink-0 font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ---- KAPANMIŞ GÜNLER ---- */}
            <div className="border-t pt-4 space-y-3">
              <div className="text-sm font-medium">Kapanmış Günler</div>
              {detay.kapanislar.length === 0 && <p className="text-xs text-muted-foreground">Kapanış yok.</p>}
              {detay.kapanislar.map((k) => {
                const gunAcik = acikGunler.has(k.id);
                const { gruplar, ofisMasraflar, ofisToplam } = masraflariGrupla(k.masraflar, beyannameMap);
                return (
                  <div key={k.id} className="rounded-md border" data-testid={`takip-kapanis-${k.id}`}>
                    {/* Başlık: KATLAMA BUTONU + GERİ AÇ KARDEŞ (iç içe button YOK) */}
                    <div className="flex items-start justify-between gap-2 p-3">
                      <button type="button" onClick={() => gunAcKapa(k.id)} className="min-w-0 flex-1 text-left hover:bg-muted/50 rounded" data-testid={`button-kapanis-toggle-${k.id}`}>
                        <div className="flex items-center gap-2">
                          {gunAcik ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <span className="text-sm font-semibold">{formatTarih(k.gunTarihi)} Kapanışı</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div><div className="text-muted-foreground text-xs">Açılış</div><div className="font-semibold">{formatPara(k.acilisBakiye, "TL")}</div></div>
                          <div><div className="text-muted-foreground text-xs">Avans</div><div className="font-semibold text-green-600">+{formatPara(k.avansToplam, "TL")}</div></div>
                          <div><div className="text-muted-foreground text-xs">Masraf</div><div className="font-semibold text-destructive">−{formatPara(k.masrafToplam, "TL")}</div></div>
                          <div><div className="text-muted-foreground text-xs">Kapanış</div><div className="font-semibold">{formatPara(k.kapanisBakiye, "TL")}</div></div>
                        </div>
                      </button>
                      <div className="shrink-0">
                        {k.durum === "geri_acildi" && <Badge variant="destructive">Geri Açıldı</Badge>}
                        {k.durum === "kapali" && <Button size="sm" variant="outline" onClick={() => geriAc(k.id)} data-testid={`button-geri-ac-${k.id}`}>Geri Aç</Button>}
                      </div>
                    </div>

                    {gunAcik && (
                      <div className="space-y-3 border-t p-3">
                        {k.avanslar.length > 0 && (
                          <div className="space-y-1">
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
                              <span>Dosya No</span><span>Beyanname No</span><span>Firma</span><span className="text-right">Tutar</span><span />
                            </div>
                            {gruplar.map((g) => {
                              const anahtar = `${k.id}-${g.beyannameId}`;
                              const acik = !kapaliKapanisGruplar.has(anahtar); // VARSAYILAN AÇIK
                              const b = g.beyanname;
                              return (
                                <div key={g.beyannameId} className="border-b last:border-b-0" data-testid={`group-kapanis-${k.id}-${g.beyannameId}`}>
                                  <button type="button" onClick={() => kapanisGrupAcKapa(anahtar)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-${k.id}-${g.beyannameId}`}>
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
                              const acik = !kapaliKapanisGruplar.has(anahtar); // VARSAYILAN AÇIK
                              return (
                                <div data-testid={`group-kapanis-ofis-${k.id}`}>
                                  <button type="button" onClick={() => kapanisGrupAcKapa(anahtar)} className={`grid w-full ${GRID} items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50`} data-testid={`button-group-toggle-ofis-${k.id}`}>
                                    <span className="col-span-3 font-semibold">Ofis Masrafları</span>
                                    <span className="text-right font-semibold text-destructive">−{formatPara(ofisToplam, "TL")}</span>
                                    {acik ? <ChevronDown className="h-4 w-4 justify-self-end" /> : <ChevronRight className="h-4 w-4 justify-self-end" />}
                                  </button>
                                  {acik && (
                                    <div className="space-y-1 border-t bg-muted/20 px-3 py-1.5">
                                      {ofisMasraflar.map((m) => (
                                        <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                                          <span className="min-w-0 truncate"><Badge variant="outline" className="mr-1">Ofis</Badge>{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.aciklama ? ` · ${m.aciklama}` : ""}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
```

**Notlar:**
- Açık Hareketler bloğu bir IIFE (`{(() => { ... })()}`) içinde çünkü `masraflariGrupla` sonucu JSX içinde yerel değişkene alınıyor; hook değil, koşulsuz çalışır.
- Kapanış başlığında katlama `<button>` ve Geri Aç `<Button>` **kardeştir** — iç içe buton yok.
- Ofis satırlarında `alacakli` + (varsa) `aciklama` birlikte gösterilir (Kapanışlarım'daki düzeltmeyle aynı).
- `CardHeader`/`CardTitle` Detay kartında AYNEN kalır (değiştirilmez).

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 6: U+FFFD taraması**

Run: `node -e "console.log(require('fs').readFileSync('client/src/pages/portal/OperasyonTakipSayfasi.tsx','utf8').includes(String.fromCharCode(0xFFFD)))"`
Expected: `false`. (Kaçış dizisi kasıtlı — komutun kendisi bozuk karakter içermesin.)

- [ ] **Step 7: Playwright doğrulaması**

DB hedefini doğrula (`DEV_NEON: true`). Dev sunucu 5000'de (`npm run dev`).

**Hazırlık:** `MUHTEST` operasyon kullanıcısı (şube `Gemlik`) + `belgeZorunlu=false` tür `E2E DOSYA`. Muhasebeden **açıklamasız** bir avans yükle. `MUHTEST` ile: iki farklı beyannameye masraf (birine 2, diğerine 1) + 1 ofis masrafı ekle → **Günü Kapat**. Sonra kapanış sonrası **bir açık masraf daha** ekle (Açık Hareketler bölümünün dolu olması için). Muhasebe ile `/portal/sube-masraf` → `button-detay-{MUHTEST id}`.

1. **Açık Hareketler**: sütun başlıkları bir kez; beyanname grubu **KAPALI** gelir (masraf satırı görünmez).
2. Gruba tıkla → açılır; satırda tür · alacaklı + belge linki; **`button-masraf-kaldir-` HİÇ YOK**.
3. **Kapanmış Günler**: gün **KAPALI** gelir; başlıkta tarih + dört özet değer; sağda **Geri Aç** butonu görünür.
4. Gün başlığına tıkla → açılır; avanslar yeşil blokta, **açıklamasız avansta `—` YOK**.
5. Kapanış içindeki beyanname grupları **AÇIK** gelir (tıklamadan masraflar görünür).
6. Kapanış içindeki bir gruba tıkla → **kapanır**; tekrar tıkla → açılır.
7. **Geri Aç'a tıkla** → gün geri açılır (satırlar Açık Hareketler'e döner) **ve bu tıklama günü katlamaz/açmaz** — iç içe buton olmadığının kanıtı. (Tıklamadan önce günün açık/kapalı durumunu not al, tıklamadan sonra aynı kaldığını doğrula.)
8. "Ofis Masrafları" grubu görünür, `Ofis` rozetli, satırda alacaklı + açıklama.
9. **Regresyon:** Şube Bakiyeleri gruplaması (`grup-sube-*`) çalışıyor; `button-avans-{id}` → dialog açılıyor, `input-avans-dekont` var, Vazgeç ile kapanıyor.

Sonuçları raporla. Başarısızlıkta kodu "geçsin diye" değiştirme.

**Temizlik:** `MUHTEST` + kapanışı + hareketleri + `E2E DOSYA` türü + `uploads/operasyon/` test dosyaları silinir; sorgu + dizin listesiyle kanıtla.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/portal/OperasyonTakipSayfasi.tsx
git status
git commit -m "feat(operasyon): muhasebe Sube Masraf detayi gruplu tablo + katlanir kapanis gunleri

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
`git status` YALNIZ bu 1 dosyayı göstermeli.

---

### Task 2: Uçtan uca doğrulama + kalite kapıları

**Files:**
- Create (scratchpad): `e2e-muhasebe-detay.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla; "geçsin diye" değiştirme.

**Interfaces:**
- Consumes: T1

- [ ] **Step 1: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 2: Karma E2E senaryosu**

Scratchpad'de `e2e-muhasebe-detay.js` (Playwright chromium). Kurulum: `MUHE2E` operasyon kullanıcısı (şube `İstanbul - Erenköy` — boşluklu/Türkçe kasıtlı) + `belgeZorunlu=false` tür `E2E DOSYA`; muhasebeden **açıklamalı ve açıklamasız** iki avans; iki beyannameye masraf (2+1) + 1 ofis masrafı → **Günü Kapat**; ardından 1 açık masraf daha.

**(A) Açık Hareketler:** avans yeşil satır (açıklamasızda `—` yok); sütun başlıkları; grup **KAPALI** gelir; tıkla → açılır; **Kaldır YOK**.
**(B) Kapanmış gün kapalı:** başlıkta tarih + dört özet değer; Geri Aç butonu sağda.
**(C) Gün açılır:** avanslar yeşil blokta; masraf grupları **AÇIK** gelir.
**(D) Grup katla:** kapanış içi gruba tıkla → kapanır; tekrar → açılır.
**(E) Geri Aç:** tıkla → gün geri açılır; **günün katlanma durumu DEĞİŞMEZ** (iç içe buton yok kanıtı); "Geri Açıldı" rozeti görünür / kayıtlar açık hareketlere döner.
**(F) Ofis grubu:** `Ofis` rozetli, alacaklı + açıklama görünür.
**(G) Regresyon:** Şube Bakiyeleri gruplaması + Avans Yükle dialog'u (dekont alanı dahil) çalışır.
**(H) Operasyon tarafı regresyonu:** aynı kullanıcıyla Kasam ve Kapanışlarım açılır — Kasam grupları KAPALI, Kapanışlarım gün KAPALI/içindeki gruplar AÇIK (önceki fazlar bozulmamış).
**(I) Boşluklu/Türkçe şube adı** (`İstanbul - Erenköy`) Şube Bakiyeleri başlığında bozulmadan görünür.

Her adımın PASS/FAIL + kanıtını (ekran görüntüsü/DOM assert) raporla.

- [ ] **Step 3: Temizlik**

`MUHE2E` + kapanışları + hareketleri + `E2E DOSYA` türü + `uploads/operasyon/` test dosyaları silinir. Doğrula:

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select (select count(*)::int from portal_kullanicilar where kullanici_adi like 'MUHE2E%') k, (select count(*)::int from masraf_turleri where ad like 'E2E%') t, (select count(*)::int from operasyon_gun_kapanis) gk\").then(r=>{console.log('kalan E2E kullanici:',r.rows[0].k,'| E2E tur:',r.rows[0].t,'| gun kapanis:',r.rows[0].gk);process.exit(0)})"
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
- §3 Açık Hareketler (yeşil avans bloğu, `—` yok, sütun başlıklı gruplu tablo, gruplar varsayılan KAPALI, Kaldır yok, Ofis grubu, "Açık hareket yok.") → T1 Step 4 birinci blok
- §4 Kapanmış Günler (gün varsayılan KAPALI, tarih + 4 özet değer, **Geri Aç kardeş buton**, açılınca avans bloğu + gruplu tablo, gruplar varsayılan AÇIK, Kaldır yok, "Masraf yok.", "Kapanış yok.") → T1 Step 4 ikinci blok
- §4 İki ters grup semantiği (`acikAcikGruplar` / `kapaliKapanisGruplar`) → T1 Step 3
- §5 Şube Bakiyeleri / Avans dialog / geriAc DEĞİŞMEZ → T1 Step 4 yalnız CardContent'i değiştirir
- §6 Doğrulama (check/build, DEV DB izolasyonu, korunan testid'ler, Playwright) → T1 Step 5-7 + T2

**Tip tutarlılığı:** `masraflariGrupla(masraflar, beyannameMap)` imzası `masrafGruplama.ts`'teki ile aynı; dönüşteki `gruplar/ofisMasraflar/ofisToplam` ve `MasrafGrubu.beyannameId/beyanname/masraflar/toplam` alan adları T1'de aynen kullanılır. `GRID` sabiti Kasam/Kapanışlarım'daki string ile birebir aynı değer. `geriAc(k.id)` mevcut fonksiyon, imzası değişmez.

**Dikkat (bu görevin iki tuzağı):**
1. **Ters varsayılanlar:** Açık Hareketler `acik = acikAcikGruplar.has(...)` (negasyon YOK), kapanış içi `acik = !kapaliKapanisGruplar.has(...)` (negasyon VAR). Karıştırılırsa gruplar ters davranır — T1 Step 7 adım 1 ve 5 bunu ayrı ayrı doğrular.
2. **İç içe buton:** Geri Aç, katlama butonunun kardeşi olmalı. T1 Step 7 adım 7 ve T2 (E) bunu doğrular.

**Kapsam dışı (görev YOK):** backend/şema/uç · Şube Bakiyeleri gruplaması · Avans Yükle akışı · `masrafGruplama.ts` · Kasam/Kapanışlarım sayfaları · muhasebeye silme yetkisi.
