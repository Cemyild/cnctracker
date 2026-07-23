# Beyanname Rejim Filtresi + Otomatik Yükleme Rozeti (Faz 2A) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beyanname seçicisine IM/EX/TR rejim şeridi + satır etiketi eklemek ve ihracat otomatik yükleme durumunu Ödemeler sayfasında görünür kılmak.

**Architecture:** `BeyannameSecici` combobox'ının açılır paneline 4'lü rejim şeridi ve her satıra rejim etiketi eklenir; filtre metin aramasına ek uygulanır. `OtomatikYuklemeRozeti` prop tipi `beyanname-ex`'i ve opsiyonel `baslik`'i kabul edecek şekilde genişler; Ödemeler sayfasına ikinci bir rozet konur. Sunucu, şema ve `BeyannameSecici` prop imzası **hiç değişmez**.

**Tech Stack:** React 18 + shadcn/ui (Command/Popover) + TanStack Query + Tailwind

**Spec:** [docs/superpowers/specs/2026-07-23-beyanname-rejim-filtresi-rozet-design.md](../specs/2026-07-23-beyanname-rejim-filtresi-rozet-design.md)

## Global Constraints

- **SAF İSTEMCİ.** `server/`, `shared/`, şema **HİÇ dokunulmaz**; `db:push` yok. Sunucu ve log ucu zaten hazır.
- **`BeyannameSecici`'nin `Props` imzası DEĞİŞMEZ** — rejim şeridi bileşenin **iç** state'idir. 4 tüketici ekran (Kasam/YeniOdemeModal, YeniTalep, DogrudanOdeme, Taleplerim) değiştirilmez; şeridi otomatik kazanır.
- **Rejim değerleri:** iç kod `"hepsi" | "IM" | "EX" | "TR"`; etiketler `Hepsi / İthalat / İhracat / Transit`. Varsayılan `"hepsi"`.
- **Satır etiketi:** `IM`→`İTH`, `EX`→`İHR`, `TR`→`TR`. Her satırda görünür (aynı dosya no iki rejimde ayırt edilsin).
- **Rejim karşılaştırması `b.rejim === kod`** (basit eşitlik). Türkçe locale sorunu YOK; metin araması ise `toLocaleLowerCase("tr")` ile kalır. **`toLowerCase()` YASAK.**
- **`shouldFilter={false}` korunur**, metin filtresi + rejim filtresi ikisi de istemcide.
- **Panel her açılışta "Hepsi"ye döner** (arama da her açılışta sıfırlanıyor — mevcut `acKapa` davranışıyla tutarlı). **Seçili beyanname rejim değişince korunur** (`value` yalnız `sec()` ile değişir).
- **Mizan rozeti (Tahsilat sayfası) `baslik` olmadan aynen çalışmalı** — `baslik` opsiyonel, verilmezse mevcut görünüm.
- `new Date(...)` ile tarih işleme YOK (rozet zaten string-slice kullanıyor, korunur).
- **DEV DB izolasyonu:** yazma testi öncesi `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true`; değilse **DUR**.
- **YENİ NPM PAKETİ YOK.** `package.json`/lockfile değişmez.
- **`git add` YALNIZ açık dosya yoluyla.** `-A`/`.` ASLA. **`git push` YAPILMAZ.** `.env`/`.env.*`/`*.xlsx` commit edilmez.
- **Türkçe kaynak dosyasını PowerShell `Set-Content` ile yeniden YAZMA.** Edit/Write; U+FFFD **ve** Kiril/Yunan (`/[Ѐ-ӿͰ-Ͽ]/`) taraması.
- Kalite kapıları: `npm run check` (0 hata) ve `npm run build`.
- **Kalıcı dev test seti:** `optest`/`muhasebe`/`suleyman`, `Test1234!`, giriş `POST /api/portal/login` (`/giris` DEĞİL).

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `client/src/pages/portal/BeyannameSecici.tsx` | Rejim şeridi + satır etiketi + filtre | T1 |
| `client/src/components/OtomatikYuklemeRozeti.tsx` | `beyanname-ex` tipi + `baslik` prop | T1 |
| `client/src/pages/Odemeler.tsx` | İkinci rozet + başlıklar | T1 |
| — | Uçtan uca doğrulama + kalite kapıları | T2 |

---

### Task 1: Rejim şeridi + rozet

**Files:**
- Modify: `client/src/pages/portal/BeyannameSecici.tsx`
- Modify: `client/src/components/OtomatikYuklemeRozeti.tsx`
- Modify: `client/src/pages/Odemeler.tsx` (satır ~442)

**Interfaces:**
- Consumes: `Beyanname.rejim: string` (Faz 1a, istemcide hazır)
- Produces: yeni testid'ler `{testId}-rejim-{hepsi|IM|EX|TR}`, satır etiketi görünür; `oto-yukleme-beyanname-ex` rozeti

- [ ] **Step 1: `BeyannameSecici` — rejim sabitleri + state**

`const [arama, setArama] = useState("");` satırının ALTINA ekle:

```tsx
  const [rejimFiltre, setRejimFiltre] = useState<"hepsi" | "IM" | "EX" | "TR">("hepsi");

  // Serit: ic kod -> etiket. Sira sabit.
  const REJIMLER: { kod: "hepsi" | "IM" | "EX" | "TR"; etiket: string }[] = [
    { kod: "hepsi", etiket: "Hepsi" },
    { kod: "IM", etiket: "İthalat" },
    { kod: "EX", etiket: "İhracat" },
    { kod: "TR", etiket: "Transit" },
  ];
  // Satir etiketi: rejim kodu -> kisa rozet.
  const REJIM_ETIKET: Record<string, string> = { IM: "İTH", EX: "İHR", TR: "TR" };
```

- [ ] **Step 2: `BeyannameSecici` — filtreye rejim ekle**

`eslesenler` useMemo'sunu şununla DEĞİŞTİR (rejim EK filtre; metin filtresi aynen kalır):

```tsx
  const eslesenler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    return beyannameler.filter((b) => {
      // Rejim EK filtre — basit esitlik, locale sorunu yok. null savunmasi: varsayilan IM.
      if (rejimFiltre !== "hepsi" && (b.rejim ?? "IM") !== rejimFiltre) return false;
      if (!q) return true;
      return (
        (b.dosyaNo ?? "").toLocaleLowerCase("tr").includes(q) ||
        (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
        (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q)
      );
    });
  }, [beyannameler, arama, rejimFiltre]);
```

- [ ] **Step 3: `BeyannameSecici` — açılışta şeridi sıfırla**

`acKapa` fonksiyonunu şununla DEĞİŞTİR:

```tsx
  const acKapa = (o: boolean) => { setAcik(o); if (!o) { setArama(""); setRejimFiltre("hepsi"); } };
```

`sec` fonksiyonu DEĞİŞMEZ — seçim rejimden bağımsız, `value` yalnız burada değişir.

- [ ] **Step 4: `BeyannameSecici` — şerit JSX'i**

`<CommandInput ... />` bloğunun (kapanışı `/>`) ALTINA, `<CommandList>`'in ÜSTÜNE ekle:

```tsx
          <div className="flex gap-1 border-b p-1.5">
            {REJIMLER.map((r) => (
              <button
                key={r.kod}
                type="button"
                onClick={() => setRejimFiltre(r.kod)}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs transition-colors",
                  rejimFiltre === r.kod
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
                data-testid={`${testId}-rejim-${r.kod}`}
              >
                {r.etiket}
              </button>
            ))}
          </div>
```

- [ ] **Step 5: `BeyannameSecici` — satır etiketi**

Liste satırındaki kimlik `<div>`'ini (şu an `<div className="font-semibold">{kimlik(b)}</div>`) şununla DEĞİŞTİR:

```tsx
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{kimlik(b)}</span>
                      {REJIM_ETIKET[b.rejim ?? "IM"] && (
                        <span className="shrink-0 rounded border px-1 text-[10px] leading-tight text-muted-foreground">
                          {REJIM_ETIKET[b.rejim ?? "IM"]}
                        </span>
                      )}
                    </div>
```

- [ ] **Step 6: `OtomatikYuklemeRozeti` — tip + başlık**

İmza satırını DEĞİŞTİR:

```tsx
export function OtomatikYuklemeRozeti({ tip }: { tip: "mizan" | "beyanname" }) {
```

şununla:

```tsx
export function OtomatikYuklemeRozeti({ tip, baslik }: { tip: "mizan" | "beyanname" | "beyanname-ex"; baslik?: string }) {
```

Ve return içindeki `<div className="font-medium">` bloğunu DEĞİŞTİR:

```tsx
      <div className="font-medium">
        Son otomatik yükleme: {tarih} — <span className={renk}>{son.mesaj || son.durum}</span>
      </div>
```

şununla (başlık varsa öne eklenir):

```tsx
      <div className="font-medium">
        {baslik ? `${baslik} — son yükleme: ` : "Son otomatik yükleme: "}{tarih} — <span className={renk}>{son.mesaj || son.durum}</span>
      </div>
```

- [ ] **Step 7: `Odemeler` — ikinci rozet**

`client/src/pages/Odemeler.tsx` satır ~442'yi DEĞİŞTİR:

```tsx
          <OtomatikYuklemeRozeti tip="beyanname" />
```

şununla:

```tsx
          <div className="grid gap-3 md:grid-cols-2">
            <OtomatikYuklemeRozeti tip="beyanname" baslik="İthalat" />
            <OtomatikYuklemeRozeti tip="beyanname-ex" baslik="İhracat" />
          </div>
```

- [ ] **Step 8: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 9: Karakter taraması**

Run:
```bash
node -e "['client/src/pages/portal/BeyannameSecici.tsx','client/src/components/OtomatikYuklemeRozeti.tsx','client/src/pages/Odemeler.tsx'].forEach(f=>{const s=require('fs').readFileSync(f,'utf8');console.log(f,'U+FFFD:',s.includes(String.fromCharCode(0xFFFD)),'| Kiril/Yunan:',[...s.matchAll(/[Ѐ-ӿͰ-Ͽ]/g)].length)})"
grep -c "toLowerCase(" client/src/pages/portal/BeyannameSecici.tsx
```
Expected: üçünde de `U+FFFD: false`, `Kiril/Yunan: 0`; `toLowerCase(` sayımı `1` (satır ~35'teki yorum — doğrula, kod değil).

- [ ] **Step 10: Salt görsel/davranış — `Props` imzası değişmedi mi**

Run: `grep -n "type Props" -A 9 client/src/pages/portal/BeyannameSecici.tsx`
Expected: `Props` bloğu Faz 1'deki ile aynı (`beyannameler, value, onChange, disabled?, testId, placeholder?, className?`). Yeni prop **eklenmemeli** — rejim şeridi iç state.

- [ ] **Step 11: Commit**

```bash
git add client/src/pages/portal/BeyannameSecici.tsx client/src/components/OtomatikYuklemeRozeti.tsx client/src/pages/Odemeler.tsx
git status
git commit -m "feat(portal): beyanname secici rejim seridi + ihracat otomatik yukleme rozeti

BeyannameSecici acilir panelinde IM/EX/TR seridi + her satirda rejim etiketi
(ayni dosya no iki rejimde ayirt edilsin). Filtre metin aramasina EK; Props
imzasi degismedi, 4 tuketici ekran otomatik kazandi. Odemeler sayfasina
ihracat (beyanname-ex) rozeti eklendi (I1 kapandi).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
`git status` YALNIZ bu 3 dosyayı staged göstermeli.

---

### Task 2: Uçtan uca doğrulama + kalite kapıları

**Files:**
- Create (scratchpad): `e2e-rejim-filtresi.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla; "geçsin diye" değiştirme.

**Interfaces:**
- Consumes: T1

- [ ] **Step 1: DB hedefini doğrula + test verisi**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise **DUR**.

Dev DB'de rejim çeşitliliği için birkaç kayıt: en az bir `rejim='EX'` satır ve **aynı `dosya_no` ile bir IM + bir EX** (etiket ayrımı testi için). Örnek:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{await p.query(\"delete from beyannameler where dosya_no='2A-TEST'\");await p.query(\"insert into beyannameler (dosya_no,alici,rejim,kaynak) values ('2A-TEST','ITHALAT FIRMA','IM','excel'),('2A-TEST','IHRACAT FIRMA','EX','excel')\");await p.query(\"insert into beyannameler (dosya_no,beyan_no,alici,rejim,kaynak) values (null,'2ATR001','TRANSIT FIRMA','TR','manuel')\");console.log('test verisi eklendi');process.exit(0)})()"
```
(TR satırı yalnız şerit testi için — Faz 2B'nin akışı değil, doğrudan insert.)

- [ ] **Step 2: Playwright — rejim şeridi**

Dev sunucu 5000'de. `optest` (operasyon) ile Kasam → Yeni Ödeme Kaydet → seçici.

(a) Şerit görünür, **Hepsi** seçili (vurgulu), liste dolu.
(b) **İhracat** → yalnız `İHR` etiketli satırlar; **İthalat** → yalnız `İTH`; **Transit** → `2ATR001` + boş değilse yalnız TR.
(c) **`2A-TEST` ara** (Hepsi'de) → **iki satır**, biri `İTH`/ITHALAT FIRMA, biri `İHR`/IHRACAT FIRMA. **İthalat** seç → yalnız `İTH` satırı.
(d) **İhracat + metin** birlikte: İhracat seçip alıcı adının parçasını yaz → yalnız eşleşen EX.
(e) **Türkçe I/İ:** İthalat seçip büyük harfli Türkçe alıcıyı küçük harfle ara → eşleşir.
(f) Bir kayıt seç → şeridi değiştir → **tetikleyicide seçim korunuyor** (aynı kayıt).
(g) Panel kapat-aç → şerit **Hepsi**'ye dönmüş, arama kutusu boş.
(h) Muhasebe (`muhasebe`) Doğrudan Ödeme ekranında da şerit çalışıyor (aynı bileşen, farklı ekran).

Her adımın PASS/FAIL + kanıtını raporla.

- [ ] **Step 3: Playwright — rozet (I1)**

`muhasebe` ile Ödemeler sayfası → İzleme sekmesi. **İki rozet** görünür:
- `oto-yukleme-beyanname` → "İthalat — son yükleme: …"
- `oto-yukleme-beyanname-ex` → "İhracat — son yükleme: …"

Dev DB'de `beyanname-ex` logu yoksa o rozet render olmaz (`loglar.length === 0 → null`); bu durumda bir test logu ekle:
```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"insert into otomatik_yukleme_log (tip,dosya_adi,durum,kayit_sayisi,mesaj,zaman) values ('beyanname-ex','2A-test.xlsx','basarili',5,'5 satır (5 yeni, 0 güncellendi)','2026-07-23 10:00:00')\").then(()=>{console.log('log eklendi');process.exit(0)})"
```
Rozet "İhracat — son yükleme: 23/07/2026 10:00 — 5 satır …" göstermeli.

**Regresyon:** Tahsilat sayfasında mizan rozeti (`oto-yukleme-mizan`) `baslik` olmadan **eskisi gibi** "Son otomatik yükleme: …" gösteriyor.

- [ ] **Step 4: Temizlik**

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{await p.query(\"delete from beyannameler where dosya_no='2A-TEST' or beyan_no='2ATR001'\");await p.query(\"delete from otomatik_yukleme_log where dosya_adi='2A-test.xlsx'\");const r=await p.query(\"select count(*) filter (where dosya_no='2A-TEST' or beyan_no='2ATR001')::int b, count(*) filter (where dosya_adi='2A-test.xlsx')::int l from beyannameler,otomatik_yukleme_log\");console.log('kalan:',r.rows[0]);process.exit(0)})()"
```
Beklenen: `b: 0, l: 0`. (Sorgu cross-join uyarısı verirse ayrı iki sayımla doğrula.) Dev sunucu sürecini **kapat**.

- [ ] **Step 5: Kalite kapıları**

Run: `npm run check` → 0 hata.
Run: `npm run build` → hatasız.
Run: `git diff --stat $(git merge-base origin/main HEAD)..HEAD -- server/ shared/ package.json package-lock.json` → **boş** (saf istemci).

- [ ] **Step 6: Commit (yalnız gerçek bir hata düzeltildiyse)**

Kod değişmediyse commit YOK.

---

## Self-Review Notu

**Spec kapsamı:**
- §3 rejim şeridi (panel üstü, EK filtre, varsayılan Hepsi, açılışta sıfırla, seçim korunur) → T1 Step 1-4
- §3.1 satır içi rejim etiketi → T1 Step 5; T2 Step 2(c)
- §3.3 `b.rejim` hazır, Props değişmez → T1 Step 2 + Step 10 kontrolü
- §4 rozet tip + başlık, sunucu değişmez → T1 Step 6-7; T2 Step 3
- §5 üç dosya, şema yok → T1; T2 Step 5 kanıtlıyor
- §7 doğrulama → T2

**Tip tutarlılığı:** `rejimFiltre` tipi `"hepsi" | "IM" | "EX" | "TR"` Step 1'de tanımlanıp Step 2/3/4'te aynen kullanılıyor. `REJIM_ETIKET` `Record<string,string>` — `b.rejim ?? "IM"` her zaman string. Rozet `baslik?: string` opsiyonel, mizan çağrısı (Tahsilat) prop'suz geçerli kalıyor.

**Bu görevin iki tuzağı:**
1. **`Props` imzasına dokunmamak** — rejim şeridi iç state olmalı; prop eklersek 4 tüketici ekranı da değiştirmek gerekir ve kapsam patlar. Step 10 bunu kontrol ediyor.
2. **Satır etiketi olmadan "Hepsi" belirsiz** — aynı dosya no iki rejimde iki satır, ayırt edilemez. Step 5 etiketi ekliyor, T2 Step 2(c) `2A-TEST` ile kanıtlıyor.

**Kapsam dışı (görev YOK):** sunucu-tarafı arama (I2) · manuel transit (Faz 2B) · `upsertBeyannameler` TR dalı (M2) · `getBeyannameler` NULLS LAST (M3) · rejim kırılımlı raporlar · sunucu/şema/uç.
