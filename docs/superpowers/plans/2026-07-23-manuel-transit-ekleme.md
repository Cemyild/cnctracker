# Manuel Transit Ekleme (Faz 2B) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transit (TR) beyannamelerini masraf giren kullanıcının beyanname seçici içinden elle ekleyebilmesini sağlamak.

**Architecture:** Yeni `POST /api/portal/transit` ucu + `storage.createManuelTransit` (tek satır insert, mükerrer beyan_no'da mevcudu döndürür). `getBeyannameler` sıralaması `NULLS LAST` olur (transitler sona). `BeyannameSecici` Transit sekmesine inline ekleme formu (ayrı Dialog DEĞİL — nested dialog riskini önler). **Şema değişikliği YOK.**

**Tech Stack:** Express + Drizzle ORM 0.39.1 (pg, `.returning()`) + React 18 + shadcn/ui + TanStack Query

**Spec:** [docs/superpowers/specs/2026-07-23-manuel-transit-ekleme-design.md](../specs/2026-07-23-manuel-transit-ekleme-design.md)

## Global Constraints

- **ŞEMA DEĞİŞİKLİĞİ YOK.** `shared/schema.ts` dokunulmaz, `db:push` çalışmaz, `migrations/` dokunulmaz. Tablo Faz 1a'da hazırlandı.
- **`upsertBeyannameler` DEĞİŞMEZ.** Manuel transit ayrı `createManuelTransit` yolundan gider; TR asla batch upsert'e girmez (M2 bu yüzden gereksiz).
- **Uç `requirePortal`** — masraf giren herkes (operasyon/muhasebe/temsilci).
- **Mükerrer `beyan_no`:** hata YOK — mevcut TR satırını döndür (masraf-türü kalıbı, `routes.ts:4859`). Kısmi unique indeks (`beyannameler_tr_beyan_no_idx`) yarış backstop'u.
- **Transit satırı:** `dosyaNo: null`, `rejim: "TR"`, `kaynak: "manuel"`, `alici`+`beyanNo` dolu, `gumrukIdaresi` opsiyonel.
- **M3 sıralama:** `getBeyannameler` iki dalda da `ORDER BY dosya_no DESC NULLS LAST, beyan_no DESC`. Emsal: `storage.ts:700` `sql\`... desc nulls last\``.
- **İnline form, ayrı Dialog DEĞİL** — `BeyannameSecici` bazı ekranlarda Dialog içinde; nested Dialog>Popover>Dialog Radix odak sorunu yaratır. Form aynı Popover içinde.
- **`BeyannameSecici` `Props` imzası DEĞİŞMEZ** — transit ekleme iç davranış. 4 tüketici ekran değiştirilmez.
- **İLK TR SATIRI GERİ-ALINABİLİRLİĞİ KAPATIR:** `dosya_no NOT NULL` bir daha geri konamaz (null satır oluşunca). Faz 1a'dan beri kabul edilmiş eşik.
- Türkçe küçültme `toLocaleLowerCase("tr")`; `toLowerCase()` YASAK. `new Date(...)` ile tarih işleme YOK.
- **DEV DB izolasyonu:** transit ekleme DB'ye yazar; **her yazma öncesi** `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true`; değilse **DUR**. (Paralel oturum `.env`'i prod'a çevirebiliyor — oturum başında bir kez bakmak yetmez.)
- **YENİ NPM PAKETİ YOK.** `package.json`/lockfile değişmez.
- **`git add` YALNIZ açık dosya yoluyla.** `-A`/`.` ASLA. **`git push` YAPILMAZ.** `.env`/`.env.*`/`*.xlsx` commit edilmez.
- **Türkçe kaynak dosyasını PowerShell `Set-Content` ile yeniden YAZMA.** Edit/Write; U+FFFD **ve** Kiril/Yunan (`/[Ѐ-ӿͰ-Ͽ]/`) taraması.
- Kalite kapıları: `npm run check` (0 hata) ve `npm run build`.
- **Kalıcı dev test seti:** `optest`/`muhasebe`/`suleyman`, `Test1234!`, giriş `POST /api/portal/login` (`/giris` DEĞİL).

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `server/storage.ts` | `createManuelTransit` + `getBeyannameler` NULLS LAST | T1 |
| `server/routes.ts` | `POST /api/portal/transit` | T1 |
| `client/src/pages/portal/BeyannameSecici.tsx` | Transit inline ekleme formu + state | T1 |
| — | Uçtan uca doğrulama + kalite kapıları | T2 |

---

### Task 1: Transit ucu + storage + inline form

**Files:**
- Modify: `server/storage.ts` (`IStorage` arayüzü, `getBeyannameler`, yeni `createManuelTransit`)
- Modify: `server/routes.ts` (yeni uç, beyannameler ucunun yakınına ~4842)
- Modify: `client/src/pages/portal/BeyannameSecici.tsx`

**Interfaces:**
- Produces: `POST /api/portal/transit` → `Beyanname`; `storage.createManuelTransit(girdi): Promise<Beyanname>`
- Consumes: `db`, `beyannameler`, `eq`, `and`, `sql`, `desc` (hepsi `storage.ts`'te import edilmiş, satır 41)

- [ ] **Step 1: `getBeyannameler` — NULLS LAST**

`server/storage.ts`'te `getBeyannameler` fonksiyonunu şununla DEĞİŞTİR:

```ts
  async getBeyannameler(kullanici?: string): Promise<Beyanname[]> {
    // Transit satirlari dosya_no=null; NULLS LAST ile listenin SONUNA gider (basini kaplamasin).
    // Emsal: storage.ts:700 sql`... desc nulls last`.
    const siralama = sql`${beyannameler.dosyaNo} desc nulls last, ${beyannameler.beyanNo} desc`;
    if (kullanici !== undefined) {
      return db.select().from(beyannameler)
        .where(eq(beyannameler.kullanici, kullanici))
        .orderBy(siralama);
    }
    return db.select().from(beyannameler).orderBy(siralama);
  }
```

- [ ] **Step 2: `createManuelTransit` — impl**

`getBeyanname` fonksiyonunun (`async getBeyanname(id: string)...`) ALTINA ekle:

```ts
  async createManuelTransit(girdi: { beyanNo: string; alici: string; gumrukIdaresi: string | null }): Promise<Beyanname> {
    // Mukerrer beyan_no: mevcut TR satirini dondur (masraf-turu kalibi). Kismi unique indeks
    // (beyannameler_tr_beyan_no_idx WHERE rejim='TR') yaris backstop'u.
    const mevcutBul = async (): Promise<Beyanname | undefined> => {
      const [b] = await db.select().from(beyannameler)
        .where(and(eq(beyannameler.rejim, "TR"), eq(beyannameler.beyanNo, girdi.beyanNo)));
      return b;
    };
    const mevcut = await mevcutBul();
    if (mevcut) return mevcut;
    try {
      const [yeni] = await db.insert(beyannameler).values({
        dosyaNo: null,
        alici: girdi.alici,
        gonderen: null,
        gumrukIdaresi: girdi.gumrukIdaresi,
        beyanNo: girdi.beyanNo,
        kullanici: null,
        rejim: "TR",
        kaynak: "manuel",
      }).returning();
      return yeni;
    } catch (e) {
      // Yaris: iki kullanici ayni anda ekledi -> ikincisi mevcudu alsin.
      const tekrar = await mevcutBul();
      if (tekrar) return tekrar;
      throw e;
    }
  }
```

- [ ] **Step 3: `IStorage` arayüzüne ekle**

`server/storage.ts`'te `IStorage` arayüzünde `getBeyanname(id: string): Promise<Beyanname | undefined>;` satırının ALTINA ekle:

```ts
  createManuelTransit(girdi: { beyanNo: string; alici: string; gumrukIdaresi: string | null }): Promise<Beyanname>;
```

- [ ] **Step 4: Uç — `POST /api/portal/transit`**

`server/routes.ts`'te `app.post("/api/portal/masraf-turleri"...` bloğunun (kapanış `});`) ALTINA ekle:

```ts
  // Manuel transit ekleme — TR beyannameleri otomatik gelmiyor, masrafi giren elle ekler.
  // Mukerrer beyan_no: mevcut transit doner (hata degil).
  app.post("/api/portal/transit", requirePortal, async (req, res) => {
    try {
      const beyanNo = String(req.body?.beyanNo ?? "").trim();
      const alici = String(req.body?.alici ?? "").trim();
      const gumrukIdaresi = String(req.body?.gumrukIdaresi ?? "").trim() || null;
      if (!beyanNo || !alici) return res.status(400).json({ error: "Beyanname no ve firma zorunlu" });
      const transit = await storage.createManuelTransit({ beyanNo, alici, gumrukIdaresi });
      res.json(transit);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
```

- [ ] **Step 5: `BeyannameSecici` — import + state**

`import { cn } from "@/lib/utils";` satırının ALTINA ekle:

```tsx
import { queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
```

`REJIM_ETIKET` tanımının ALTINA ekle:

```tsx
  // Transit inline ekleme formu durumu.
  const [transitForm, setTransitForm] = useState(false);
  const [tBeyanNo, setTBeyanNo] = useState("");
  const [tAlici, setTAlici] = useState("");
  const [tGumruk, setTGumruk] = useState("");
  const [tGonderiliyor, setTGonderiliyor] = useState(false);

  const transitFormSifirla = () => {
    setTransitForm(false); setTBeyanNo(""); setTAlici(""); setTGumruk(""); setTGonderiliyor(false);
  };

  const transitEkle = async () => {
    const beyanNo = tBeyanNo.trim(), alici = tAlici.trim();
    if (!beyanNo || !alici || tGonderiliyor) return;
    setTGonderiliyor(true);
    try {
      const res = await fetch("/api/portal/transit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beyanNo, alici, gumrukIdaresi: tGumruk.trim() || null }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Eklenemedi");
      const yeni = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/portal/beyannameler"] });
      onChange(yeni.id);
      transitFormSifirla();
      acKapa(false);
    } catch {
      setTGonderiliyor(false); // form korunur, kullanici tekrar deneyebilir
    }
  };
```

- [ ] **Step 6: `BeyannameSecici` — panel kapanınca formu da sıfırla**

`acKapa` fonksiyonunu şununla DEĞİŞTİR:

```tsx
  const acKapa = (o: boolean) => {
    setAcik(o);
    if (!o) { setArama(""); setRejimFiltre("hepsi"); setTransitForm(false); setTBeyanNo(""); setTAlici(""); setTGumruk(""); }
  };
```

**NOT:** `transitEkle` içinde `acKapa(false)` çağrılıyor; bu da formu sıfırlıyor — çift sıfırlama zararsız (idempotent).

- [ ] **Step 7: `BeyannameSecici` — inline form + "yeni transit ekle" JSX**

`<CommandList>` bloğunu — açılış `<CommandList>` ile kapanış `</CommandList>` arası TAMAMI — şununla DEĞİŞTİR:

```tsx
          <CommandList>
            {transitForm ? (
              <div className="space-y-2 p-2" data-testid={`${testId}-transit-form`}>
                <div className="text-xs font-medium text-muted-foreground">Yeni Transit</div>
                <Input placeholder="Beyanname no" value={tBeyanNo} onChange={(e) => setTBeyanNo(e.target.value)} data-testid={`${testId}-transit-beyanno`} />
                <Input placeholder="Firma" value={tAlici} onChange={(e) => setTAlici(e.target.value)} data-testid={`${testId}-transit-firma`} />
                <Input placeholder="Gümrük (opsiyonel)" value={tGumruk} onChange={(e) => setTGumruk(e.target.value)} data-testid={`${testId}-transit-gumruk`} />
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={transitEkle} disabled={!tBeyanNo.trim() || !tAlici.trim() || tGonderiliyor} data-testid={`${testId}-transit-ekle`}>
                    {tGonderiliyor ? "Ekleniyor…" : "Ekle"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={transitFormSifirla} data-testid={`${testId}-transit-vazgec`}>Vazgeç</Button>
                </div>
              </div>
            ) : (
              <>
                {gosterilen.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground" data-testid={`${testId}-bos`}>
                    Beyanname bulunamadı
                  </div>
                ) : (
                  gosterilen.map((b) => (
                    <CommandItem
                      key={b.id}
                      value={b.id}
                      onSelect={() => sec(b.id)}
                      data-testid={`${testId}-item-${b.id}`}
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", b.id === value ? "opacity-100" : "opacity-0")} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{kimlik(b)}</span>
                          {REJIM_ETIKET[b.rejim ?? "IM"] && (
                            <span className="shrink-0 rounded border px-1 text-[10px] leading-tight text-muted-foreground">
                              {REJIM_ETIKET[b.rejim ?? "IM"]}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{b.alici ?? "?"}</div>
                        {b.dosyaNo && b.beyanNo && <div className="truncate text-xs text-muted-foreground">{b.beyanNo}</div>}
                      </div>
                    </CommandItem>
                  ))
                )}
                {kirpildi && (
                  <div className="border-t px-3 py-2 text-xs text-muted-foreground" data-testid={`${testId}-limit`}>
                    İlk {LIMIT} gösteriliyor — aramayı daraltın
                  </div>
                )}
                {rejimFiltre === "TR" && (
                  <button
                    type="button"
                    onClick={() => setTransitForm(true)}
                    className="w-full border-t px-3 py-2 text-left text-sm text-primary hover:bg-muted"
                    data-testid={`${testId}-transit-ac`}
                  >
                    ➕ Yeni transit ekle
                  </button>
                )}
              </>
            )}
          </CommandList>
```

**DİKKAT:** Bu blok Step 5-6'daki state/fonksiyonlara ve mevcut `kimlik`, `REJIM_ETIKET`, `gosterilen`, `kirpildi`, `rejimFiltre`, `sec`, `value` değişkenlerine dayanır — hepsi bileşende mevcut. `Button` importu zaten var.

- [ ] **Step 8: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 9: Karakter + kural taraması**

Run:
```bash
node -e "['server/storage.ts','server/routes.ts','client/src/pages/portal/BeyannameSecici.tsx'].forEach(f=>{const s=require('fs').readFileSync(f,'utf8');console.log(f.split('/').pop(),'U+FFFD:',s.includes(String.fromCharCode(0xFFFD)),'| Kiril/Yunan:',[...s.matchAll(/[Ѐ-ӿͰ-Ͽ]/g)].length)})"
grep -c "toLowerCase(" client/src/pages/portal/BeyannameSecici.tsx
grep -n "type Props" -A 9 client/src/pages/portal/BeyannameSecici.tsx
```
Expected: üçünde de temiz; `toLowerCase(` sayımı `1` (yorum); `Props` bloğu değişmemiş (7 alan).

- [ ] **Step 10: Commit**

```bash
git add server/storage.ts server/routes.ts client/src/pages/portal/BeyannameSecici.tsx
git status
git commit -m "feat(portal): manuel transit ekleme — POST /api/portal/transit + inline form

Transit (TR) beyannameleri otomatik gelmiyor; masrafi giren BeyannameSecici
Transit sekmesinden beyan no + firma + gumruk ile elle ekler. Mukerrer beyan_no
mevcut transiti dondurur (masraf-turu kalibi). getBeyannameler NULLS LAST —
transitler listenin sonunda. Inline form (nested dialog riski yok); Props imzasi
degismedi. Sema degismedi. ILK TR SATIRI dosya_no NOT NULL geri-donusunu kapatir.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
`git status` YALNIZ bu 3 dosyayı staged göstermeli.

---

### Task 2: Uçtan uca doğrulama + kalite kapıları

**Files:**
- Create (scratchpad): `e2e-transit.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla.

**Interfaces:**
- Consumes: T1

- [ ] **Step 1: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise **DUR**. Bu görev DB'ye yazar; yanlış hedef canlıya TR satırı ekler.

- [ ] **Step 2: Uç testleri (HTTP + token'sız portal oturumu)**

Dev sunucu 5000'de. `optest` ile giriş yap (`POST /api/portal/login`, cookie sakla). Sonra:

(a) `POST /api/portal/transit {beyanNo:"TR-E2E-1", alici:"TRANSIT FIRMA", gumrukIdaresi:"HALKALI"}` →
    200; dönen kayıt `rejim="TR"`, `kaynak="manuel"`, `dosyaNo=null`, `alici="TRANSIT FIRMA"`.
(b) **Aynı `beyanNo` tekrar** → 200; **aynı `id`** döner (yeni açılmaz). SQL: `select count(*) from beyannameler where beyan_no='TR-E2E-1' and rejim='TR'` → **1**.
(c) `{beyanNo:"TR-E2E-2", alici:"IKINCI"}` (gümrüksüz) → 200; `gumrukIdaresi=null`. Toplam TR = 2.
(d) `{beyanNo:"", alici:"X"}` → **400** "Beyanname no ve firma zorunlu". `{beyanNo:"X", alici:""}` → 400.

Her adımın çıktısını raporla.

- [ ] **Step 3: M3 sıralama doğrulaması**

`optest` ile `GET /api/portal/beyannameler` → yanıt dizisinde **null `dosyaNo`'lar en sonda** (transitler başta değil). İlk eleman `dosyaNo` dolu bir kayıt olmalı; TR-E2E kayıtları dizinin sonunda.
```bash
# yanitin son 5 ve ilk 5 elemaninin dosyaNo/rejim'i
```
Raporla: ilk 3 ve son 3 kaydın `rejim`/`dosyaNo` özeti; transitlerin sonda olduğunu göster.

- [ ] **Step 4: Playwright — inline form**

`optest` Kasam → Yeni Ödeme Kaydet → seçici. (Dialog-içi-Popover; inline form nested dialog'u önlüyor, burada doğrulanır.)

(e) **Transit** sekmesi → "➕ Yeni transit ekle" görünür → tıkla → inline form (beyan no/firma/gümrük + Ekle/Vazgeç).
(f) Boş formda **Ekle pasif**; beyan no + firma dolunca aktif.
(g) `TR-UI-1` + `UI FIRMA` + gümrük gir → **Ekle** → panel kapanır, tetikleyicide **`TR-UI-1 — UI FIRMA`** seçili (dosyaNo null → kimlik beyanNo).
(h) Tekrar aç → Transit sekmesi → `TR-UI-1` **`TR` etiketiyle** listede; seç → uçtan uca masraf ekle → HTTP 2xx.
(i) **Vazgeç:** formu aç, doldur, Vazgeç → listeye döner, kayıt oluşmaz.
(j) **Doğrudan Ödeme** (`muhasebe`) ekranında da transit ekleme çalışıyor (aynı bileşen, Dialog dışı ekran).

- [ ] **Step 5: Regresyon**

(k) IM/EX seçici + rejim şeridi + etiket (Faz 2A) bozulmadı; "İthalat"/"İhracat" filtreleri çalışıyor.
(l) `Props` imzası değişmedi (grep, Step 9'da da bakıldı).

- [ ] **Step 6: Temizlik**

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{await p.query(\"delete from operasyon_masraflar where beyanname_id in (select id from beyannameler where beyan_no like 'TR-E2E%' or beyan_no like 'TR-UI%')\");await p.query(\"delete from beyannameler where beyan_no like 'TR-E2E%' or beyan_no like 'TR-UI%'\");const r=await p.query(\"select count(*)::int tr from beyannameler where rejim='TR'\");console.log('kalan TR:',r.rows[0].tr);process.exit(0)})()"
```
Expected: `kalan TR: 0`. Dev sunucu sürecini **kapat**.

- [ ] **Step 7: Kalite kapıları**

Run: `npm run check` → 0 hata.
Run: `npm run build` → hatasız.
Run: `git diff --stat $(git merge-base origin/main HEAD)..HEAD -- shared/ migrations/ package.json package-lock.json` → **boş** (şema/paket yok).

- [ ] **Step 8: Commit (yalnız gerçek bir hata düzeltildiyse)**

Kod değişmediyse commit YOK.

---

## Self-Review Notu

**Spec kapsamı:**
- §3.1 uç (requirePortal, 400 doğrulama) → T1 Step 4; T2 Step 2
- §3.2 createManuelTransit (mükerrer döndür, yarış backstop) → T1 Step 2; T2 Step 2(b)
- §3.3 M3 NULLS LAST → T1 Step 1; T2 Step 3
- §4 inline form (nested dialog yok, Props değişmez, invalidate+onChange) → T1 Step 5-7; T2 Step 4
- §6 geri-alınabilirlik → deploy notu (kod değil)
- §8 doğrulama → T2

**Tip tutarlılığı:** `createManuelTransit(girdi: {beyanNo, alici, gumrukIdaresi})` imzası T1 Step 2 (impl), Step 3 (arayüz), Step 4 (çağrı) ve spec §3.2'de aynı. `InsertBeyanname` alanları (dosyaNo nullable, rejim, kaynak) Faz 1a şemasıyla uyumlu. `.returning()` Drizzle pg'de `Beyanname[]` döndürür, `[yeni]` destructure. İstemci `onChange(yeni.id)` — `Props.onChange: (id: string) => void`.

**Bu görevin üç tuzağı:**
1. **`Props` imzasına dokunmamak** — transit ekleme iç state olmalı, prop eklersek 4 ekranı da değiştirmek gerekir. Step 9 kontrol ediyor.
2. **Nested dialog** — ayrı Dialog yerine inline form. Kasam (`YeniOdemeModal`, Dialog içi) T2 Step 4'te özellikle test edilir.
3. **`db:push` yok** — şema hazır. `shared/`/`migrations/` diff'i boş olmalı (T2 Step 7).

**Kapsam dışı (görev YOK):** transit düzenleme/silme · rejim raporları · sunucu-tarafı arama (I2) · `upsertBeyannameler` (dokunulmaz) · şema.
