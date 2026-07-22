# Yeni Ödeme Modalı Genişlik + Ekran Uyumu — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operasyon "Yeni Ödeme Kaydet" modalını 672px'e genişletmek, taşma korumasını eklemek ve dar ekranda alanların alt alta dizilmesini sağlamak.

**Architecture:** Tek dosyada beş Tailwind sınıf-dizesi değişikliği. JSX yapısı, state, doğrulama ve kayıt akışı **hiç değişmez** — yalnız `className` değerleri ve iki yerde sarmalayıcı `<span>`/`<div>`'e yardımcı sınıf eklenir.

**Tech Stack:** React 18 + shadcn/ui Dialog (Radix) + Tailwind 3.4

**Spec:** [docs/superpowers/specs/2026-07-22-yeni-odeme-modal-genislik-responsive-design.md](../specs/2026-07-22-yeni-odeme-modal-genislik-responsive-design.md)

## Global Constraints

- **Tek dosya:** `client/src/pages/portal/YeniOdemeModal.tsx`. Başka hiçbir dosya değişmez — `BeyannameSecici.tsx`, `dialog.tsx`, diğer üç tüketici ekran ve `server/`/`shared/` dahil.
- **SALT GÖRSEL.** State, handler, doğrulama, `fetch` çağrıları, koşullu render mantığı **dokunulmaz**. Sadece `className` değerleri değişir; JSX ağacına yeni eleman eklenmez/silinmez.
- **YENİ NPM PAKETİ YOK.** `package.json`/lockfile değişmez. `db:push` YOK.
- **Korunan testid'ler (hiçbiri değişmez):** `checkbox-op-ofis`, `select-op-beyanname`, `button-op-beyanname-degistir`, `op-masraf-turu`, `input-op-tutar`, `input-op-alacakli`, `input-op-iban`, `input-op-belge`, `input-op-aciklama`, `button-op-kaydet`, `button-op-yeni-odeme-kapat`, `eklenen-{id}`, `button-eklenen-kaldir-{id}`.
- **`min-w-0` + `truncate` her zaman ÇİFT gelir**, ve kardeş butona `shrink-0` eşlik eder. `min-w-0` olmadan `truncate` çalışmaz (flex öğesinin varsayılan `min-width: auto`'su içeriğinden dar olmasını engeller).
- **DEV DB izolasyonu:** tarayıcı testi yazma yapıyorsa önce `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true`; değilse DUR.
- **`git add` YALNIZ açık dosya yoluyla.** `-A`/`.` ASLA. **`git push` YAPILMAZ.**
- **Türkçe kaynak dosyasını PowerShell `Set-Content` ile yeniden YAZMA.** Edit tool; U+FFFD taraması.
- Kalite kapıları: `npm run check` (0 hata) ve `npm run build`. Test koşucusu/linter yok, uydurma.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `client/src/pages/portal/YeniOdemeModal.tsx` | Modal genişliği, taşma koruması, ekran uyumu, metin kırpma | T1 |

---

### Task 1: Modal genişliği + ekran uyumu + taşma koruması

**Files:**
- Modify: `client/src/pages/portal/YeniOdemeModal.tsx` (satır 108, 127-133, 141, 149, 163-168)

**Interfaces:**
- Consumes: mevcut `BeyannameSecici` (değişmez), shadcn `Dialog`/`DialogContent`
- Produces: yok (yaprak değişiklik)

- [ ] **Step 1 (A): Modal genişliği + taşma koruması**

Satır 108'i DEĞİŞTİR:

```tsx
      <DialogContent className="max-w-lg">
```

şununla:

```tsx
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
```

- [ ] **Step 2 (D): Sabitlenmiş beyanname çubuğunda metin kırpma**

Şu bloğu:

```tsx
            <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
              <div className="text-sm">
                {dosyaYok ? <span className="font-medium">Ofis Masrafı</span> : (
                  <><span className="font-medium">{seciliBeyanname?.dosyaNo ?? "?"}</span> · {seciliBeyanname?.alici ?? "?"}{seciliBeyanname?.beyanNo ? ` · ${seciliBeyanname.beyanNo}` : ""}</>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={beyannameDegistir} data-testid="button-op-beyanname-degistir">Değiştir</Button>
            </div>
```

şununla DEĞİŞTİR (yalnız iki `className` değişti — metne `min-w-0 truncate`, butona `shrink-0`):

```tsx
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-3">
              <div className="min-w-0 truncate text-sm">
                {dosyaYok ? <span className="font-medium">Ofis Masrafı</span> : (
                  <><span className="font-medium">{seciliBeyanname?.dosyaNo ?? "?"}</span> · {seciliBeyanname?.alici ?? "?"}{seciliBeyanname?.beyanNo ? ` · ${seciliBeyanname.beyanNo}` : ""}</>
                )}
              </div>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={beyannameDegistir} data-testid="button-op-beyanname-degistir">Değiştir</Button>
            </div>
```

- [ ] **Step 3 (B): Tutar / Kime Ödendi satırı ekran uyumu**

Satır 141'i DEĞİŞTİR:

```tsx
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Tutar (TL)</Label><Input placeholder="0,00" value={tutar} onChange={(e) => setTutar(e.target.value)} data-testid="input-op-tutar" /></div>
```

şununla:

```tsx
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Tutar (TL)</Label><Input placeholder="0,00" value={tutar} onChange={(e) => setTutar(e.target.value)} data-testid="input-op-tutar" /></div>
```

- [ ] **Step 4 (C): IBAN / Belge satırı ekran uyumu**

Satır 149'u DEĞİŞTİR:

```tsx
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>IBAN (varsa)</Label><Input placeholder="TR.." value={iban} onChange={(e) => setIban(e.target.value)} data-testid="input-op-iban" /></div>
```

şununla:

```tsx
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>IBAN (varsa)</Label><Input placeholder="TR.." value={iban} onChange={(e) => setIban(e.target.value)} data-testid="input-op-iban" /></div>
```

- [ ] **Step 5 (E): Eklenenler listesi satırında metin kırpma**

Şu bloğu:

```tsx
                <div key={e.id} className="flex items-center justify-between text-sm" data-testid={`eklenen-${e.id}`}>
                  <span>{e.masrafTuru ?? "Masraf"} · {e.alacakli}</span>
                  <span className="flex items-center gap-2">
```

şununla DEĞİŞTİR:

```tsx
                <div key={e.id} className="flex items-center justify-between gap-2 text-sm" data-testid={`eklenen-${e.id}`}>
                  <span className="min-w-0 truncate">{e.masrafTuru ?? "Masraf"} · {e.alacakli}</span>
                  <span className="flex shrink-0 items-center gap-2">
```

- [ ] **Step 6: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 7: Değişikliğin SALT GÖRSEL olduğunu kanıtla**

Run: `git diff -- client/src/pages/portal/YeniOdemeModal.tsx | grep '^[-+]' | grep -v '^[-+][-+]' | wc -l`
Expected: **10** (5 değişiklik × 2 satır). Fazlaysa JSX yapısına dokunulmuş demektir — incele.

Run: `git diff -U0 -- client/src/pages/portal/YeniOdemeModal.tsx | grep -E '^\+' | grep -vE '^\+\+\+' | grep -cE 'useState|onClick|onChange|fetch|toast|data-testid="[^"]*"' `
Beklenen: eklenen satırlarda `data-testid` değerleri **birebir korunmuş** olmalı; hiçbir `useState`/`fetch`/`toast` çağrısı eklenmemiş/değişmemiş olmalı. Çıktıyı gözle doğrula.

- [ ] **Step 8: U+FFFD taraması**

Run: `node -e "console.log(require('fs').readFileSync('client/src/pages/portal/YeniOdemeModal.tsx','utf8').includes(String.fromCharCode(0xFFFD)))"`
Expected: `false`.

- [ ] **Step 9: Tarayıcı doğrulaması**

DB hedefini doğrula (`DEV_NEON: true`). Dev sunucu 5000'de. Operasyon kullanıcısıyla Kasam → **Yeni Ödeme Kaydet**.

1. **1280px genişlikte:** modal 672px; beyanname seçicinin placeholder metni **kırpılmadan tek satırda** görünüyor (tetikleyicide `…` yok).
2. **1280px:** Tutar/Kime Ödendi ve IBAN/Belge satırları **iki sütun**.
3. **375px viewport:** aynı satırlar **alt alta**; modal yatay kaydırma yapmıyor.
4. **Uzun müşteri adlı** bir beyanname seç → sabit çubukta metin kırpılıyor, **"Değiştir" butonu görünür ve tıklanabilir**.
5. **Uzun alacaklı adıyla** (≥40 karakter) masraf ekle → listede tutar ve **"Kaldır" butonu görünür**.
6. **Taşma:** birkaç masraf ekleyerek içeriği ekrandan uzun yap → **modal kaydırılabiliyor**, "Kapat" butonuna ulaşılıyor.
7. **Regresyon:** beyanname seç → masraf ekle → kayıt oluştu (HTTP 2xx); "Ofis Masrafı" yolu çalışıyor; "Değiştir" beyannameyi serbest bırakıyor; "Kaldır" eklenen satırı siliyor.

Her adımın PASS/FAIL + kanıtını raporla. Başarısızlıkta kodu "geçsin diye" değiştirme.

**Temizlik:** oluşturulan test masrafları/kullanıcısı ve `uploads/operasyon/` test dosyaları silinir; sorgu + dizin listesiyle kanıtla.

- [ ] **Step 10: Build**

Run: `npm run build`
Expected: hatasız; `dist/` üretilir.

- [ ] **Step 11: Commit**

```bash
git add client/src/pages/portal/YeniOdemeModal.tsx
git status
git commit -m "fix(portal): yeni odeme modali genisletildi + ekran uyumu ve tasma korumasi

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
`git status` YALNIZ bu 1 dosyayı staged göstermeli.

---

## Self-Review Notu

**Spec kapsamı:** §3 tablosundaki A/B/C/D/E maddelerinin tamamı Step 1-5'e birebir eşleniyor. §6 doğrulama maddeleri Step 6-10'a; (a)→9.1, (b)→9.2, (c)→9.4, (d)→9.5, (e)→9.6, (f)→9.7.

**Tip tutarlılığı:** Yeni tip, prop veya fonksiyon tanımlanmıyor; yalnız `className` dizeleri ve iki sarmalayıcıya `gap-2` ekleniyor. `Button`'ın `className` prop'u shadcn `buttonVariants` + `cn` ile birleşiyor, `shrink-0` güvenle ekleniyor.

**Bu görevin tek tuzağı:** `min-w-0` olmadan `truncate` sessizce çalışmaz — flex öğesinin varsayılan `min-width: auto` değeri onu içeriğinden dar olmaya bırakmaz, metin kardeş butonu dışarı iter. Bu yüzden Step 2 ve 5'te ikisi **birlikte** ve kardeş butona `shrink-0` ile ekleniyor; Step 9.4 ve 9.5 bunu davranışsal olarak doğruluyor.

**Kapsam dışı (görev YOK):** `BeyannameSecici.tsx` · `dialog.tsx` · diğer üç tüketici ekran · başka modalların genişlikleri · masraf doğrulama/kayıt mantığı · backend/şema/uç · yeni npm paketi.
