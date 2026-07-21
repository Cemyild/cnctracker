# Operasyon Kasam: Açık Hareketler Tablo Görünümü + Avans Sadeleştirme — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operasyon Kasam açık hareketler listesini iki bloğa çevirmek — avanslar yeşil sade, masraflar sütun-başlıklı grid tablo (dosya no bold önce, adet rozeti kalkar) — hepsi yalnız render katmanında.

**Architecture:** `OperasyonKasaSayfasi.tsx` açık hareketler render bloğu değişir; state/query/gruplama (`gruplar`, `ofisMasraflar`, `beyannameMap`, `acikGruplar`, `masrafKaldir`, `grupAcKapa`) AYNEN kalır. Avanslar yeşil arka planlı sade satır olur; masraflar tek bir başlık satırı + CSS grid hizalı grup satırları hâline gelir. Backend/veri/uç DEĞİŞMEZ.

**Tech Stack:** React 18 + Vite + TanStack Query + shadcn/ui + lucide-react (ChevronRight/ChevronDown) + Tailwind grid

**Spec:** [docs/superpowers/specs/2026-07-21-operasyon-kasam-acik-hareketler-tablo-design.md](../specs/2026-07-21-operasyon-kasam-acik-hareketler-tablo-design.md)

## Global Constraints

- **Saf görsel / YALNIZ istemci.** `server/`, `shared/`, `db:push` HİÇ dokunulmaz. State/query/gruplama/`masrafKaldir`/`grupAcKapa`/`beyannameMap` mantığı DEĞİŞMEZ — yalnız açık hareketler JSX'i.
- **Avans:** yeşil (kullanıcı onayı), "Avans" + tutar; **boş açıklamada `—` GÖSTERİLMEZ**; ikon EKLENMEZ. Dekont linki varsa korunur.
- **Adet rozeti (`Badge` sayısı) KALKAR** grup başlığından.
- **Grup satırı sırası:** Dosya No (BOLD) → Beyanname No → Firma → Tutar → açılma oku.
- **Sütun başlıkları** yalnız masraf bölümünün EN ÜSTÜNDE bir kez: `Dosya No · Beyanname No · Firma · Tutar`.
- **İşlevsellik korunur:** açılan masraf satırında belge linki + Kaldır butonu kaybolmaz.
- **Mevcut testid'ler korunur:** `row-avans-{id}`, `group-beyanname-{id}`, `button-group-toggle-{id}`, `row-masraf-{id}`, `button-masraf-kaldir-{id}`, `group-ofis`, `button-group-toggle-ofis`, `text-bakiye`, `button-op-yeni-odeme`, `button-op-gunu-kapat`.
- **DEV DB izolasyonu:** Playwright yazma testi öncesi `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true`; değilse DUR.
- **git add YALNIZ açık dosya yoluyla.** `-A`/`.` ASLA. `git push` YAPILMAZ. `package.json`/lockfile değişmez.
- **Türkçe kaynak dosyalarını PowerShell Set-Content ile yeniden YAZMA.** Edit tool; U+FFFD taraması.
- Playwright projede bağımlılık DEĞİL; yerel önbellekten `NODE_PATH` ile kullanılır.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `client/src/pages/portal/OperasyonKasaSayfasi.tsx` | Açık hareketler render → iki blok (avans yeşil + masraf grid tablo) | T1 |
| — | Uçtan uca doğrulama + build | T2 |

---

### Task 1: Açık hareketler render'ını iki bloğa çevir

**Files:**
- Modify: `client/src/pages/portal/OperasyonKasaSayfasi.tsx` (yalnız Açık Hareketler kartının `<CardContent>` içi, satır ~104-167)

**Interfaces:**
- Consumes: mevcut `ozet`, `gruplar` (`{beyannameId, beyanname, masraflar, toplam}`), `ofisMasraflar`, `ofisToplam`, `acikGruplar`, `grupAcKapa`, `masrafKaldir`, `formatPara`, `formatTarih`, `ChevronRight`/`ChevronDown`, `Badge`
- Produces: yeni görünüm; testid'ler değişmez

- [ ] **Step 1: Açık Hareketler CardContent'ini değiştir**

`client/src/pages/portal/OperasyonKasaSayfasi.tsx` içindeki **Açık Hareketler** kartının `<CardContent className="space-y-2"> … </CardContent>` bloğunun TAMAMINI (mevcut avans map + gruplar map + ofis map + boş-durum) şununla DEĞİŞTİR:

```tsx
        <CardContent className="space-y-4">
          {/* Blok 1 — Avanslar (yeşil, sade) */}
          {(ozet?.avanslar.length ?? 0) > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Avanslar</div>
              {(ozet?.avanslar ?? []).map((a) => (
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

          {/* Blok 2 — Masraflar (sütun başlıklı grid tablo) */}
          {(gruplar.length > 0 || ofisMasraflar.length > 0) && (
            <div className="rounded-md border">
              {/* Sütun başlıkları — yalnız en üstte bir kez */}
              <div className="grid grid-cols-[minmax(80px,auto)_minmax(0,1fr)_minmax(0,1.4fr)_auto_20px] gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <span>Dosya No</span>
                <span>Beyanname No</span>
                <span>Firma</span>
                <span className="text-right">Tutar</span>
                <span />
              </div>

              {gruplar.map((g) => {
                const acik = acikGruplar.has(g.beyannameId);
                const b = g.beyanname;
                return (
                  <div key={g.beyannameId} className="border-b last:border-b-0" data-testid={`group-beyanname-${g.beyannameId}`}>
                    <button type="button" onClick={() => grupAcKapa(g.beyannameId)} className="grid w-full grid-cols-[minmax(80px,auto)_minmax(0,1fr)_minmax(0,1.4fr)_auto_20px] items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50" data-testid={`button-group-toggle-${g.beyannameId}`}>
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
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                              <Button variant="ghost" size="sm" onClick={() => masrafKaldir(m.id)} data-testid={`button-masraf-kaldir-${m.id}`}>Kaldır</Button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {ofisMasraflar.length > 0 && (
                <div data-testid="group-ofis">
                  <button type="button" onClick={() => grupAcKapa("__ofis__")} className="grid w-full grid-cols-[minmax(80px,auto)_minmax(0,1fr)_minmax(0,1.4fr)_auto_20px] items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50" data-testid="button-group-toggle-ofis">
                    <span className="col-span-3 font-semibold">Ofis Masrafları</span>
                    <span className="text-right font-semibold text-destructive">−{formatPara(ofisToplam, "TL")}</span>
                    {acikGruplar.has("__ofis__") ? <ChevronDown className="h-4 w-4 justify-self-end" /> : <ChevronRight className="h-4 w-4 justify-self-end" />}
                  </button>
                  {acikGruplar.has("__ofis__") && (
                    <div className="space-y-1 border-t bg-muted/20 px-3 py-1.5">
                      {ofisMasraflar.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                          <span className="min-w-0 truncate"><Badge variant="outline" className="mr-1">Ofis</Badge>{m.masrafTuru ?? "Masraf"} · {m.aciklama ?? "—"}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                            <Button variant="ghost" size="sm" onClick={() => masrafKaldir(m.id)} data-testid={`button-masraf-kaldir-${m.id}`}>Kaldır</Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {hareketSayisi === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Açık hareket yok.</p>
          )}
        </CardContent>
```

**Notlar:**
- Grup başlığı ve sütun-başlık satırı AYNI grid template'i (`grid-cols-[minmax(80px,auto)_minmax(0,1fr)_minmax(0,1.4fr)_auto_20px]`) kullanır → kolonlar hizalı.
- Ofis başlığında dosya/beyan/firma yok → "Ofis Masrafları" `col-span-3` ile ilk üç kolonu kapsar.
- `Badge` import'u yalnız "Ofis" rozeti için kullanılmaya devam eder (kaldırma!). `ChevronRight`/`ChevronDown` import'u korunur.

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 3: U+FFFD taraması**

Run: `node -e "console.log(require('fs').readFileSync('client/src/pages/portal/OperasyonKasaSayfasi.tsx','utf8').includes('�'))"`
Expected: `false`.

- [ ] **Step 4: Playwright doğrulaması**

DB hedefini doğrula (`DEV_NEON: true`). Dev sunucu 5000'de (`npm run dev`). Hazırlık: API/modal ile `TABLOUI` operasyon kullanıcısı (şube `Gemlik`) + `belgeZorunlu=false` tür `E2E DOSYA`; muhasebeden **açıklamasız** bir avans (boş açıklama testi için) + masraflar: aynı beyannameye 2 masraf + 1 Ofis masrafı.

1. Kasam'da **Avanslar** alt-başlığı + yeşil satır; avansın açıklaması boşsa satırda **`—` YOK** (yalnız "Avans · tarih").
2. Masraf bölümünde üstte **sütun başlıkları** bir kez: "Dosya No", "Beyanname No", "Firma", "Tutar".
3. Grup satırı: **dosya no bold** (ilk kolon) + beyan no + firma + tutar; **adet rozeti YOK** (sayı Badge'i görünmez).
4. Grup satırına tıkla → açılır; detayda tür · alacaklı · tutar + **Kaldır** + (varsa) belge linki. Kaldır çalışır → grup toplamı güncellenir.
5. Ofis Masrafları grubu tablonun altında; "Ofis Masrafları" başlığı + tutar; aç → Ofis rozeti + açıklama.
6. Regresyon: bakiye kartları, "Yeni Ödeme Kaydet", "Günü Kapat" bozulmamış; tüm hareketler silinince "Açık hareket yok."

Sonuçları raporla. Başarısızlıkta kodu "geçsin diye" değiştirme.

**Temizlik:** `TABLOUI` + hareketleri + avansı + `E2E DOSYA` türü + `uploads/operasyon/` test dosyaları silinir; sorgu + dizin listesiyle kanıtla.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/portal/OperasyonKasaSayfasi.tsx
git status
git commit -m "feat(operasyon): acik hareketler tablo gorunumu + avans sadelestirme

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
`git status` YALNIZ bu 1 dosyayı göstermeli.

---

### Task 2: Uçtan uca doğrulama + kalite kapıları

**Files:**
- Create (scratchpad): `e2e-tablo.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla; "geçsin diye" değiştirme.

**Interfaces:**
- Consumes: T1

- [ ] **Step 1: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 2: Görsel + işlevsel E2E**

Scratchpad'de `e2e-tablo.js` (Playwright chromium). Kurulum: `TABLOE2E` operasyon kullanıcısı (şube `İstanbul - Erenköy` — boşluklu/Türkçe kasıtlı) + `belgeZorunlu=false` tür `E2E DOSYA`; muhasebeden **açıklamasız** avans + **açıklamalı** avans; aynı beyannameye 3 masraf + başka beyannameye 1 masraf + 1 Ofis masrafı.

**(A) Avans blok:** "Avanslar" başlığı; açıklamasız avansta `—` YOK; açıklamalı avansta açıklama görünür; yeşil.
**(B) Sütun başlıkları:** masraf bölümünde bir kez (Dosya No/Beyanname No/Firma/Tutar).
**(C) Grup satırı:** dosya no BOLD + beyan no + firma + tutar; adet rozeti YOK; hizalı kolonlar.
**(D) Aç/detay/Kaldır:** grup aç → 3 masraf; birini Kaldır → toplam güncellenir; belge linki korunur.
**(E) İkinci beyanname + Ofis:** ikinci grup + "Ofis Masrafları" grubu ayrı görünür.
**(F) Uzun firma adı** taşmıyor (truncate) — ekran görüntüsüyle kontrol.
**(G) Regresyon:** bakiye kartları/Yeni Ödeme/Günü Kapat çalışır; boş durumda "Açık hareket yok."

Her adımın PASS/FAIL + kanıtını (ekran görüntüsü/DOM assert) raporla.

- [ ] **Step 3: Temizlik**

`TABLOE2E` + hareketleri + avansları + `E2E DOSYA` türü + `uploads/operasyon/` test dosyaları silinir. Doğrula:

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select (select count(*)::int from portal_kullanicilar where kullanici_adi like 'TABLOE2E%') k, (select count(*)::int from masraf_turleri where ad like 'E2E%') t\").then(r=>{console.log('kalan E2E kullanici:',r.rows[0].k,'| kalan E2E tur:',r.rows[0].t);process.exit(0)})"
```
Expected: `kalan E2E kullanici: 0 | kalan E2E tur: 0`. `ls uploads/operasyon/` → test dosyası kalmamalı.

- [ ] **Step 4: Kalite kapıları**

Run: `npm run check` → 0 hata.
Run: `npm run build` → hatasız; `dist/` üretilir.

- [ ] **Step 5: Commit (yalnız gerçek bir hata düzeltildiyse)**

Kod değişmediyse commit YOK. Değiştiyse açık yolla ekle + `fix(operasyon): …` mesajı.

---

## Self-Review Notu

**Spec kapsamı:**
- §2/§3 Avans yeşil sade + boş açıklamada `—` yok + ikon yok → T1 Blok 1
- §2/§4 Adet rozeti kalkar + dosya no bold önce + sütun başlıkları + grid hizalama → T1 Blok 2
- §4 İşlevsellik korunur (belge linki + Kaldır) + Ofis grubu → T1
- §6 Doğrulama (check/build, DEV DB izolasyonu, testid'ler, Playwright) → T1 Step 4 + T2

**Tip tutarlılığı:** `gruplar`/`ofisMasraflar`/`ofisToplam`/`acikGruplar`/`grupAcKapa`/`masrafKaldir`/`beyannameMap` T1'de tüketilir, hepsi mevcut kodda tanımlı (değişmez). `hareketSayisi` mevcut değişken korunur. Grid template string'i başlık satırı + grup satırı + ofis satırında BİREBİR aynı (hizalama şartı).

**Kapsam dışı (görev YOK):** backend/şema/uç · bakiye kartları · Yeni Ödeme modalı · Günü Kapat · muhasebe/temsilci ekranları · gruplama/veri hesabı.
