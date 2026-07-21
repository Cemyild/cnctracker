# Beyanname Seçici Combobox — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dört portal ekranındaki ayrı "arama Input'u + Beyanname Select'i" ikilisini, yazarken arayan tek bir combobox'a (`BeyannameSecici`) indirmek.

**Architecture:** Yeni ortak bileşen `client/src/pages/portal/BeyannameSecici.tsx` — shadcn `Popover` + `Command` (cmdk) üzerine kurulu, `shouldFilter={false}` ile Türkçe-doğru filtreleme bileşenin içinde. Dört tüketici ekran kendi `arama` state'ini, `filtreliBeyannameler` useMemo'sunu, `Input`'unu ve `Select`'ini siler; yerine tek satırlık `<BeyannameSecici …/>` koyar. Backend/şema/uç hiç değişmez.

**Tech Stack:** React 18 + Vite + TanStack Query + shadcn/ui + cmdk@^1.1.1 + @radix-ui/react-popover@^1.1.7 + lucide-react + Tailwind 3.4

**Spec:** [docs/superpowers/specs/2026-07-22-beyanname-secici-combobox-design.md](../specs/2026-07-22-beyanname-secici-combobox-design.md)

## Global Constraints

- **YALNIZ istemci.** `server/`, `shared/`, `db:push` HİÇ dokunulmaz. Yeni uç açılmaz.
- **YENİ NPM PAKETİ YOK.** `cmdk`, `@radix-ui/react-popover`, `command.tsx`, `popover.tsx` zaten mevcut. `package.json`/lockfile **değişmez**.
- **`shouldFilter={false}` ZORUNLU.** cmdk'nin dahili filtresi `toLowerCase()` tabanlıdır ve Türkçe I/İ'yi bozar. Filtreleme bileşenin içinde, `toLocaleLowerCase("tr")` ile yapılır. **Hiçbir yerde `toLowerCase()` kullanılmaz.**
- **Filtre alanları:** `dosyaNo`, `alici`, `beyanNo` — üçü de. (`TaleplerimSayfasi` bugün `beyanNo` aramıyor; bu fazda düzeliyor.)
- **Liste yazmadan açılır.** Arama boşken tüm liste (ilk 100) gösterilir — "önce yazın" ekranı YOKTUR.
- **Placeholder metni birebir:** `Aramak için Ref, Alıcı yada Beyanname No yazın, yada açılır listeden seçin` (kullanıcının yazdığı gibi; "yada" ayrı yazılmaz, imla aynen korunur).
- **100 sınırı korunur** ve aşıldığında görünür uyarı verilir: `İlk 100 gösteriliyor — aramayı daraltın`.
- **Sonuç yoksa:** `Beyanname bulunamadı`. `CommandEmpty` KULLANILMAZ — `shouldFilter={false}` ile cmdk'nin boş-durum sayacı güvenilir değildir; boş durum koşullu `<div>` ile render edilir.
- **testid sözleşmesi:** tetikleyici `{testId}`, arama kutusu `{testId}-arama`, satırlar `{testId}-item-{beyannameId}`, boş durum `{testId}-bos`, sınır uyarısı `{testId}-limit`. Ekran bazında `testId` değerleri: `select-op-beyanname`, `select-beyanname`, `select-dogrudan-beyanname`, `select-eslestir-{talepId}`.
- **Kullanılmayan importlar temizlenir** (`noUnusedLocals` kapalı olduğu için tsc yakalamaz — elle bakılır).
- Tarihler `text` `YYYY-MM-DD`; `new Date(...)` ile parse edilmez.
- Para `formatPara`; `Math.round(x*100)/100`.
- **DEV DB izolasyonu:** Playwright yazma testi öncesi `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true`; değilse DUR.
- **`git add` YALNIZ açık dosya yoluyla.** `-A`/`.` ASLA. **`git push` YAPILMAZ.**
- **Türkçe kaynak dosyasını PowerShell `Set-Content` ile yeniden YAZMA.** Edit tool; U+FFFD taraması.
- Kalite kapısı yalnız `npm run check` (tsc) ve `npm run build`. Test koşucusu/linter yok, uydurma.
- Playwright projede bağımlılık DEĞİL; yerel önbellekten `NODE_PATH` ile kullanılır.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `client/src/pages/portal/BeyannameSecici.tsx` | **YENİ** — combobox bileşeni; arama state'i, Türkçe filtre, 100 sınırı, klavye/ARIA | T1 |
| `client/src/pages/portal/YeniOdemeModal.tsx` | İlk tüketici; **Dialog içinde Popover** riski burada doğrulanır | T1 |
| `client/src/pages/portal/YeniTalepSayfasi.tsx` | Tüketici; `disabled` prop'u | T2 |
| `client/src/pages/portal/DogrudanOdemeSayfasi.tsx` | Tüketici; "(tüm liste)" placeholder'ı | T2 |
| `client/src/pages/portal/TaleplerimSayfasi.tsx` | Tüketici; satır başına örnek, `aramalar` state'i silinir | T2 |
| — | Uçtan uca doğrulama + kalite kapıları | T3 |

---

### Task 1: `BeyannameSecici` bileşeni + Kasam modalına bağlama

**Files:**
- Create: `client/src/pages/portal/BeyannameSecici.tsx`
- Modify: `client/src/pages/portal/YeniOdemeModal.tsx` (import satırları, `arama` state'i, `filtreliBeyannameler` useMemo'su, JSX satır ~129-137)

**Interfaces:**
- Consumes: `Beyanname` (`@shared/schema`); `Popover/PopoverContent/PopoverTrigger` (`@/components/ui/popover`); `Command/CommandInput/CommandItem/CommandList` (`@/components/ui/command`); `Button`; `cn` (`@/lib/utils`)
- Produces: **default export** `BeyannameSecici` with props
  `{ beyannameler: Beyanname[]; value: string; onChange: (id: string) => void; disabled?: boolean; testId: string; placeholder?: string; className?: string }`
  — T2 bu imzayı aynen kullanır.

- [ ] **Step 1: Bileşeni oluştur**

`client/src/pages/portal/BeyannameSecici.tsx` dosyasını şu içerikle OLUŞTUR:

```tsx
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { Beyanname } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

const LIMIT = 100;
const VARSAYILAN_PLACEHOLDER =
  "Aramak için Ref, Alıcı yada Beyanname No yazın, yada açılır listeden seçin";

type Props = {
  beyannameler: Beyanname[];
  value: string;                 // seçili beyanname id; "" = seçim yok
  onChange: (id: string) => void;
  disabled?: boolean;
  testId: string;
  placeholder?: string;
  className?: string;
};

export default function BeyannameSecici({
  beyannameler, value, onChange, disabled, testId,
  placeholder = VARSAYILAN_PLACEHOLDER, className,
}: Props) {
  const [acik, setAcik] = useState(false);
  const [arama, setArama] = useState("");

  const secili = beyannameler.find((b) => b.id === value);

  // cmdk'nin dahili filtresi toLowerCase() tabanlidir ve Turkce I/I'yi bozar
  // ("ISTANBUL" -> noktali i, "istanbul" ile eslesmez). Bu yuzden Command'da
  // shouldFilter={false} ve filtreleme BURADA, toLocaleLowerCase("tr") ile yapilir.
  const eslesenler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return beyannameler;
    return beyannameler.filter(
      (b) =>
        b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
        (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
        (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q),
    );
  }, [beyannameler, arama]);

  const gosterilen = eslesenler.slice(0, LIMIT);
  const kirpildi = eslesenler.length > LIMIT;

  const acKapa = (o: boolean) => { setAcik(o); if (!o) setArama(""); };
  const sec = (id: string) => { onChange(id); setArama(""); setAcik(false); };

  return (
    <Popover open={acik} onOpenChange={acKapa}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={acik}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !secili && "text-muted-foreground", className)}
          data-testid={testId}
        >
          <span className="truncate">
            {secili ? `${secili.dosyaNo} — ${secili.alici ?? "?"}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        {/* shouldFilter={false}: filtre yukarida, Turkce-dogru sekilde yapiliyor */}
        <Command shouldFilter={false}>
          <CommandInput
            value={arama}
            onValueChange={setArama}
            placeholder={placeholder}
            data-testid={`${testId}-arama`}
          />
          <CommandList>
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
                    <div className="font-semibold">{b.dosyaNo}</div>
                    <div className="truncate text-xs text-muted-foreground">{b.alici ?? "?"}</div>
                    {b.beyanNo && <div className="truncate text-xs text-muted-foreground">{b.beyanNo}</div>}
                  </div>
                </CommandItem>
              ))
            )}
            {kirpildi && (
              <div className="border-t px-3 py-2 text-xs text-muted-foreground" data-testid={`${testId}-limit`}>
                İlk {LIMIT} gösteriliyor — aramayı daraltın
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

**Neden `CommandEmpty` yok:** `shouldFilter={false}` iken cmdk tüm render edilen öğeleri "eşleşmiş" sayar; `CommandEmpty`'nin görünürlüğü sürüme bağlı hale gelir. Boş durum koşullu `<div>` ile deterministik render edilir.

**Neden `w-[var(--radix-popover-trigger-width)] p-0`:** `popover.tsx` varsayılanı `w-72 p-4`; `cn` (tailwind-merge) sayesinde `className` kazanır. `select.tsx:91` aynı sözdizimini (`var(--radix-select-trigger-width)`) kullanıyor — tutarlı.

- [ ] **Step 2: Kasam modalının importlarını güncelle**

`client/src/pages/portal/YeniOdemeModal.tsx` satır 10'u SİL:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
```

(Beyanname Select'i bu dosyadaki TEK `Select` kullanımıydı — satır 130. `Input` başka 4 yerde kullanılıyor, importu KALIR.)

Satır 14'ün (`import MasrafTuruSecici from "./MasrafTuruSecici";`) ALTINA ekle:

```tsx
import BeyannameSecici from "./BeyannameSecici";
```

- [ ] **Step 3: `arama` state'ini ve filtre useMemo'sunu sil**

Satır 26'yı SİL:

```tsx
  const [arama, setArama] = useState("");
```

Ve `filtreliBeyannameler` useMemo bloğunun TAMAMINI SİL:

```tsx
  const filtreliBeyannameler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return beyannameler;
    return beyannameler.filter((b) =>
      b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
      (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
      (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q));
  }, [beyannameler, arama]);
```

`useMemo` importu KALIR — dosyada başka useMemo'lar (`seciliTur` vb.) var.

- [ ] **Step 4: JSX'i değiştir**

Şu bloğun TAMAMINI:

```tsx
                <>
                  <Input placeholder="Dosya no, beyan no veya müşteri ara…" value={arama} onChange={(e) => setArama(e.target.value)} data-testid="input-op-arama" />
                  <Select value={beyannameId} onValueChange={setBeyannameId}>
                    <SelectTrigger data-testid="select-op-beyanname"><SelectValue placeholder="Beyanname seçin" /></SelectTrigger>
                    <SelectContent>
                      {filtreliBeyannameler.slice(0, 100).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.dosyaNo} — {b.alici ?? "?"}{b.beyanNo ? ` · ${b.beyanNo}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
```

şununla DEĞİŞTİR:

```tsx
                <BeyannameSecici
                  beyannameler={beyannameler}
                  value={beyannameId}
                  onChange={setBeyannameId}
                  testId="select-op-beyanname"
                />
```

(Sarmalayıcı `<>…</>` artık gereksiz — tek eleman kaldı.)

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 6: U+FFFD taraması**

Run: `node -e "['client/src/pages/portal/BeyannameSecici.tsx','client/src/pages/portal/YeniOdemeModal.tsx'].forEach(f=>console.log(f, require('fs').readFileSync(f,'utf8').includes(String.fromCharCode(0xFFFD))))"`
Expected: her iki satır da `false`. (Kaçış dizisi kasıtlı — komut bozuk karakter içermesin.)

- [ ] **Step 7: `toLowerCase` sızıntısı kontrolü**

Run: `grep -n "toLowerCase(" client/src/pages/portal/BeyannameSecici.tsx; echo "eslesme sayisi: $(grep -c 'toLowerCase(' client/src/pages/portal/BeyannameSecici.tsx)"`
Expected: `eslesme sayisi: 0`.

- [ ] **Step 8: Playwright doğrulaması (Kasam modalı — Dialog içinde Popover)**

DB hedefini doğrula (`DEV_NEON: true`). Dev sunucu 5000'de (`npm run dev`). Operasyon kullanıcısıyla giriş yap, Kasam → **Yeni Ödeme Kaydet** modalını aç.

1. Kutuya tıkla → **yazmadan liste açılır**; arama kutusu odaklanmış (`document.activeElement` = `{testId}-arama`).
2. Modal kilitlenmedi: popover açıkken tıklama/klavye çalışıyor. **Bloke olursa** `<Popover modal>` ekleyip tekrar dene ve bunu raporla (Dialog-içi-Popover odak tuzağı bilinen risk).
3. Dosya no'nun bir parçasını yaz → liste anında filtrelenir.
4. **Beyan no ile ara** → eşleşme gelir.
5. **Türkçe I/İ:** büyük harfli Türkçe müşteri adı taşıyan bir beyanname bul, adı **küçük harfle** yaz → eşleşir. (Yoksa dev DB'de böyle bir beyanname oluştur.)
6. Klavye: `ArrowDown` → satır vurgulanır, `Enter` → seçilir, popover kapanır.
7. Tetikleyicide `{dosyaNo} — {alici}` görünür; seçili satırda ✓ vardı.
8. `Escape` ile açık popover kapanır.
9. Sonuç vermeyen bir metin yaz → `{testId}-bos` görünür ("Beyanname bulunamadı").
10. Arama boşken sonuç 100'ü aşıyorsa `{testId}-limit` uyarısı görünür. (Dev DB'de 100'den az beyanname varsa bu adımı **atlamayıp** ATLANDI diye raporla.)
11. Uçtan uca: beyanname seç → masraf ekle → kayıt oluştu; beyannamenin sabit özet çubuğuna kilitlenmesi **korunuyor**.

Sonuçları PASS/FAIL + kanıtla raporla. Başarısızlıkta kodu "geçsin diye" değiştirme.

**Temizlik:** oluşturulan test masrafı/beyannamesi/kullanıcısı ve `uploads/operasyon/` test dosyaları silinir; sorgu + dizin listesiyle kanıtla.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/portal/BeyannameSecici.tsx client/src/pages/portal/YeniOdemeModal.tsx
git status
git commit -m "feat(portal): beyanname secici combobox + Kasam masraf modaline baglandi

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
`git status` YALNIZ bu 2 dosyayı staged göstermeli.

---

### Task 2: Kalan üç ekranı bağla

**Files:**
- Modify: `client/src/pages/portal/YeniTalepSayfasi.tsx` (importlar, `arama` state'i satır 58, `filtreliBeyannameler` satır 82-91, JSX satır ~339-359)
- Modify: `client/src/pages/portal/DogrudanOdemeSayfasi.tsx` (importlar, `arama` state'i satır 32, `filtreliBeyannameler` satır 47-56, JSX satır ~212-233)
- Modify: `client/src/pages/portal/TaleplerimSayfasi.tsx` (importlar, `aramalar` state'i satır 27, satır içi filtre satır 70-77, JSX satır ~88-107)

**Interfaces:**
- Consumes: T1'in `BeyannameSecici` default export'u ve prop imzası (yukarıda tam olarak verildi)
- Produces: yok (son tüketiciler)

- [ ] **Step 1: `YeniTalepSayfasi` — importlar**

`import MasrafTuruSecici from "./MasrafTuruSecici";` satırının ALTINA ekle:

```tsx
import BeyannameSecici from "./BeyannameSecici";
```

`Select` importu KALIR (satır 381, 415, 470'te hâlâ kullanılıyor). `Input` importu KALIR.

- [ ] **Step 2: `YeniTalepSayfasi` — state ve filtreyi sil**

Satır 58'i SİL:

```tsx
  const [arama, setArama] = useState("");
```

Ve şu bloğun TAMAMINI SİL:

```tsx
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
```

`const secili = beyannameler.find((b) => b.id === beyannameId);` satırı KALIR (altındaki detay kutusu onu kullanıyor). `useMemo` importu KALIR.

- [ ] **Step 3: `YeniTalepSayfasi` — JSX**

Şu bloğun TAMAMINI:

```tsx
                <>
                  <Input
                    placeholder="Dosya no, müşteri veya beyan no ara…"
                    value={arama}
                    onChange={(e) => setArama(e.target.value)}
                    disabled={listeDolu || gonderimAktif}
                    data-testid="input-beyanname-arama"
                  />
                  <Select value={beyannameId} onValueChange={setBeyannameId} disabled={listeDolu || gonderimAktif}>
                    <SelectTrigger data-testid="select-beyanname">
                      <SelectValue placeholder="Beyanname seçin" />
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
```

şununla DEĞİŞTİR:

```tsx
                <BeyannameSecici
                  beyannameler={beyannameler}
                  value={beyannameId}
                  onChange={setBeyannameId}
                  disabled={listeDolu || gonderimAktif}
                  testId="select-beyanname"
                />
```

- [ ] **Step 4: `DogrudanOdemeSayfasi` — importlar**

`import MasrafTuruSecici from "./MasrafTuruSecici";` satırının ALTINA ekle:

```tsx
import BeyannameSecici from "./BeyannameSecici";
```

`Select` ve `Input` importları KALIR (satır 252/286/339 ve 280/305/352/374'te kullanılıyor).

- [ ] **Step 5: `DogrudanOdemeSayfasi` — state ve filtreyi sil**

Satır 32'yi SİL:

```tsx
  const [arama, setArama] = useState("");
```

Ve şu bloğun TAMAMINI SİL:

```tsx
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
```

`const secili = …` satırı KALIR. `useMemo` importu KALIR.

- [ ] **Step 6: `DogrudanOdemeSayfasi` — JSX**

Şu bloğun TAMAMINI:

```tsx
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
```

şununla DEĞİŞTİR:

```tsx
              <BeyannameSecici
                beyannameler={beyannameler}
                value={beyannameId}
                onChange={setBeyannameId}
                testId="select-dogrudan-beyanname"
                placeholder="Aramak için Ref, Alıcı yada Beyanname No yazın, yada açılır listeden seçin (tüm liste)"
              />
```

- [ ] **Step 7: `TaleplerimSayfasi` — importlar**

`Input` ve `Select` importlarının HER İKİSİNİ de SİL (bu dosyadaki tek kullanımları beyanname arama/seçme idi — satır 89 ve 95):

```tsx
import { Input } from "@/components/ui/input";
```

```tsx
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
```

`portalUtils` import bloğunun ALTINA ekle:

```tsx
import BeyannameSecici from "./BeyannameSecici";
```

- [ ] **Step 8: `TaleplerimSayfasi` — satır-başına arama state'ini sil**

Satır 27'yi SİL:

```tsx
  const [aramalar, setAramalar] = useState<Record<string, string>>({});
```

`secimler` ve `gonderilen` state'leri KALIR; `useState` importu KALIR.

- [ ] **Step 9: `TaleplerimSayfasi` — satır içi filtreyi ve JSX'i değiştir**

Şu bloğu:

```tsx
        {bekleyenler.map((t) => {
          const q = (aramalar[t.id] ?? "").trim().toLocaleLowerCase("tr");
          const filtreli = q
            ? beyannameler.filter(
                (b) =>
                  b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
                  (b.alici ?? "").toLocaleLowerCase("tr").includes(q),
              )
            : beyannameler;
          return (
```

şununla DEĞİŞTİR (filtre bileşenin içine taşındı; `map` artık gövde bloğuna gerek duymuyor):

```tsx
        {bekleyenler.map((t) => {
          return (
```

Ve şu bloğun TAMAMINI:

```tsx
                <Input
                  placeholder="Beyanname ara…"
                  value={aramalar[t.id] ?? ""}
                  onChange={(e) => setAramalar((s) => ({ ...s, [t.id]: e.target.value }))}
                  className="md:max-w-56"
                />
                <Select
                  value={secimler[t.id] ?? ""}
                  onValueChange={(v) => setSecimler((s) => ({ ...s, [t.id]: v }))}
                >
                  <SelectTrigger className="md:max-w-md">
                    <SelectValue placeholder="Beyanname seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {filtreli.slice(0, 100).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.dosyaNo} — {b.alici ?? "?"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
```

şununla DEĞİŞTİR:

```tsx
                <BeyannameSecici
                  beyannameler={beyannameler}
                  value={secimler[t.id] ?? ""}
                  onChange={(v) => setSecimler((s) => ({ ...s, [t.id]: v }))}
                  testId={`select-eslestir-${t.id}`}
                  className="md:max-w-md"
                />
```

**NOT:** Bu ekranda beyanname araması bugün `beyanNo` alanını KAPSAMIYOR. Ortak bileşene geçişle birlikte kapsayacak — bu, kasıtlı bir düzeltmedir, kapsam sızıntısı değildir (spec §1).

- [ ] **Step 10: Tip kontrolü + tarama**

Run: `npm run check`
Expected: 0 hata.

Run:
```bash
for f in YeniTalepSayfasi DogrudanOdemeSayfasi TaleplerimSayfasi; do
  node -e "console.log('$f U+FFFD:', require('fs').readFileSync('client/src/pages/portal/$f.tsx','utf8').includes(String.fromCharCode(0xFFFD)))"
done
grep -rn "filtreliBeyannameler\|input-op-arama\|input-beyanname-arama\|input-dogrudan-arama" client/src || echo "ESKI KALINTI YOK"
```
Expected: üç `false` satırı ve `ESKI KALINTI YOK`.

- [ ] **Step 11: Playwright doğrulaması (üç ekran)**

DB hedefini doğrula (`DEV_NEON: true`).

**(A) `YeniTalepSayfasi`** (temsilci): kutuya tıkla → liste açılır; ara → filtrelenir; seç → tetikleyicide görünür ve **altındaki müşteri/beyan-no detay kutusu doluyor**. Listeye bir kalem ekle → kontrol **`disabled`** oluyor (tıklayınca popover AÇILMIYOR).
**(B) `DogrudanOdemeSayfasi`** (muhasebe): aynı akış; tetikleyici metninde **"(tüm liste)"** görünüyor.
**(C) `TaleplerimSayfasi`** (temsilci): eşleşme bekleyen **en az iki** satır hazırla. Bir satırda ara → **diğer satırın seçicisi etkilenmiyor** (bağımsız state kanıtı). **Beyan no ile ara → sonuç geliyor** (bu fazın düzelttiği gerileme; öncesinde gelmiyordu). Seç → Eşleştir → kayıt eşleşiyor.

Her adımın PASS/FAIL + kanıtını raporla. **Temizlik:** oluşturulan talep/beyanname/kullanıcı ve yüklenen dosyalar silinir; sorgu ile kanıtla.

- [ ] **Step 12: Commit**

```bash
git add client/src/pages/portal/YeniTalepSayfasi.tsx client/src/pages/portal/DogrudanOdemeSayfasi.tsx client/src/pages/portal/TaleplerimSayfasi.tsx
git status
git commit -m "feat(portal): beyanname combobox kalan uc ekrana baglandi

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
`git status` YALNIZ bu 3 dosyayı staged göstermeli.

---

### Task 3: Uçtan uca doğrulama + kalite kapıları

**Files:**
- Create (scratchpad): `e2e-beyanname-combobox.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla; "geçsin diye" değiştirme.

**Interfaces:**
- Consumes: T1 + T2

- [ ] **Step 1: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 2: Yeni paket eklenmediğini kanıtla**

Run: `git diff --stat $(git merge-base origin/main HEAD)..HEAD -- package.json package-lock.json server/ shared/ drizzle.config.ts script/`
Expected: **boş çıktı**. Doluysa Critical bulgu olarak raporla.

- [ ] **Step 3: Karma E2E senaryosu**

Scratchpad'de `e2e-beyanname-combobox.js` (Playwright chromium). Hazırlık: dev DB'de **Türkçe büyük harfli** alıcı adı taşıyan beyannameler bulunduğundan emin ol (yoksa oluştur; en az biri `İ`/`I` içermeli, ör. `İSTANBUL TEKSTİL A.Ş.`).

**Dört ekranın HEPSİNDE** şu ortak davranışları doğrula:
- (a) Kutuya tıkla → **yazmadan liste açılır**, arama kutusu odaklı.
- (b) Ref (dosya no) ile ara → eşleşir.
- (c) **Beyan no ile ara → eşleşir** (dört ekranda da; `TaleplerimSayfasi` için bu YENİ).
- (d) Alıcı adıyla ara → eşleşir.
- (e) **Türkçe I/İ:** `İSTANBUL TEKSTİL` kaydını `istanbul tekstil` yazarak bul → eşleşmeli. (Bu, `shouldFilter={false}` kararının işe yaradığının kanıtı; `toLowerCase()` ile bu adım BAŞARISIZ olurdu.)
- (f) Klavye: ↓ + Enter ile seçim, Esc ile kapatma.
- (g) Sonuç yoksa `Beyanname bulunamadı`.
- (h) Satırda dosya no **bold**, altında alıcı ve beyan no görünüyor; seçili satırda ✓.
- (i) Seçim sonrası popover kapanıyor ve tetikleyicide `{dosyaNo} — {alici}` var.

**Ekrana özel:**
- (j) `YeniOdemeModal`: Dialog içinde popover sorunsuz; seçim sonrası beyanname özet çubuğuna kilitleniyor.
- (k) `YeniTalepSayfasi`: liste doluyken `disabled`.
- (l) `TaleplerimSayfasi`: iki satır bağımsız çalışıyor.
- (m) 100 üstü sonuçta sınır uyarısı (dev DB'de 100'den az kayıt varsa ATLANDI diye raporla, sessizce geçme).

**Regresyon:** dört ekranda da kayıt/gönderim akışı uçtan uca çalışıyor (masraf kaydedildi / talep gönderildi / ödeme kaydedildi / eşleştirme yapıldı).

Her adımın PASS/FAIL + kanıtını raporla.

- [ ] **Step 4: Temizlik**

Oluşturulan tüm test verisi dev DB'den ve `uploads/` içinden silinir. Doğrula:

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select (select count(*)::int from portal_kullanicilar where kullanici_adi like 'E2E%') k, (select count(*)::int from masraf_turleri where ad like 'E2E%') t, (select count(*)::int from beyannameler where dosya_no like 'E2E%') b\").then(r=>{console.log('kalan E2E kullanici:',r.rows[0].k,'| E2E tur:',r.rows[0].t,'| E2E beyanname:',r.rows[0].b);process.exit(0)})"
```
Expected: üçü de `0`.

- [ ] **Step 5: Kalite kapıları**

Run: `npm run check` → 0 hata.
Run: `npm run build` → hatasız; `dist/` üretilir.
Run: `grep -c "toLowerCase(" client/src/pages/portal/BeyannameSecici.tsx` → `0`.

- [ ] **Step 6: Commit (yalnız gerçek bir hata düzeltildiyse)**

Kod değişmediyse commit YOK. Değiştiyse açık yolla ekle + `fix(portal): …` mesajı.

---

## Self-Review Notu

**Spec kapsamı:**
- §2.1 dört ekranın hepsi → T1 (Kasam) + T2 (üç ekran)
- §2.2 shadcn Popover + Command, yeni paket yok → T1 Step 1; T3 Step 2 kanıtlıyor
- §2.3 `shouldFilter={false}` + Türkçe filtre → T1 Step 1; T1 Step 7 ve T3 Step 5 `toLowerCase` sızıntısını, T3 (e) davranışı doğruluyor
- §2.4 liste yazmadan açılır → T1 Step 1 (`if (!q) return beyannameler`); T1 Step 8.1 ve T3 (a) doğruluyor
- §2.5 yalnız istemci → T3 Step 2
- §3 bileşen konumu/props/filtre predicate'i → T1 Step 1
- §4 davranış tablosu (placeholder, boş durum, 100 sınırı, satır düzeni, klavye, seçim sonrası sıfırlama) → T1 Step 1; T1 Step 8 ve T3 (a)-(i)
- §5 ekran bazında notlar (Dialog-içi, disabled, "(tüm liste)", satır başına) → T1 Step 4, T2 Step 3/6/9; T3 (j)-(l)
- §6 testid sözleşmesi → T1 Step 1 (bileşen) + her tüketicide `testId` prop'u
- §8 doğrulama → T1 Step 5-8, T2 Step 10-11, T3

**Tip tutarlılığı:** `BeyannameSecici`'nin T1'de tanımlanan prop imzası (`beyannameler`, `value`, `onChange`, `disabled?`, `testId`, `placeholder?`, `className?`) T2'nin dört çağrısında aynen kullanılıyor; `onChange: (id: string) => void` hem `setBeyannameId` (React setter) hem `(v) => setSecimler(...)` ile uyumlu. `Beyanname` tipi `@shared/schema`'dan, dört ekranda zaten import edilmiş durumda.

**Bu görevin üç tuzağı:**
1. **`toLowerCase()` sızıntısı** — cmdk'nin dahili filtresi açık kalırsa veya filtrede yanlış metot kullanılırsa Türkçe arama sessizce bozulur (hata vermez, sadece eşleşmez). T1 Step 7, T3 Step 5 (statik) ve T3 (e) (davranışsal) üç ayrı katmandan yakalar.
2. **Dialog içinde Popover** — `YeniOdemeModal` odak tuzağına takılabilir. T1 Step 8.2 bunu açıkça test eder ve düzeltme yolunu (`<Popover modal>`) verir.
3. **Kullanılmayan import** — `noUnusedLocals` kapalı olduğu için tsc yakalamaz. Her adımda hangi importun kalıp hangisinin gideceği tek tek yazıldı (`YeniOdemeModal`: Select gider, Input kalır; `TaleplerimSayfasi`: ikisi de gider; diğer ikisi: ikisi de kalır).

**Kapsam dışı (görev YOK):** sunucu tarafı arama · sayfalama/sanallaştırma · 100 sınırının kaldırılması · `MasrafTuruSecici`'nin combobox'a çevrilmesi · beyanname dışındaki Select'ler · backend/şema/uç · yeni npm paketi.
