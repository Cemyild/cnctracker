# Beyanname Seçici: Ayrı Arama + Select Yerine Tek Combobox — Tasarım

**Tarih:** 2026-07-22
**Durum:** Onaylandı (liste davranışı kullanıcının referans ekran görüntüsüne göre revize edildi)

## 1. İhtiyaç

Dört portal ekranında beyanname seçimi **iki ayrı kutu** ile yapılıyor: bir `Input` (arama) ve bir `Select`
(seçim). Kullanıcı arama kutusuna yazdıktan sonra elini kaldırıp alttaki kutuya geçmek zorunda. Kullanıcının
talebi: **yazarken aynı anda arayan ve sonuçları gösteren tek kutu.**

Mevcut kalıp dört ekrana kopyalanmış — `arama` state + `filtreliBeyannameler` useMemo + `Input` + `Select` +
`.slice(0, 100)`:

| Ekran | Rol | Arama alanları | Not |
|---|---|---|---|
| `YeniOdemeModal.tsx` (Kasam masraf girişi) | operasyon | dosyaNo · alici · beyanNo | Dialog içinde |
| `YeniTalepSayfasi.tsx` | temsilci | dosyaNo · alici · beyanNo | `disabled={listeDolu \|\| gonderimAktif}` |
| `DogrudanOdemeSayfasi.tsx` | muhasebe | dosyaNo · alici · beyanNo | tetikleyicide "(tüm liste)" |
| `TaleplerimSayfasi.tsx` (eşleşme bekleyenler) | temsilci | dosyaNo · alici — **beyanNo YOK** | satır başına state |

**Kopyalanan mantığın kanıtlı maliyeti:** `TaleplerimSayfasi` beyan-no aramasının eklendiği fazda gözden
kaçmış. Şube `167929` yazınca diğer üç ekran buluyor, bu bulmuyor. Tek bileşene toplamak bunu kapatır.

## 2. Kararlar

1. **Kapsam: dört ekranın hepsi.** Kalıp dördünde de aynı; birini bırakmak tutarsızlığı sürdürür.
2. **Temel: shadcn `Popover` + `Command` (cmdk).** `cmdk@^1.1.1` ve `command.tsx`/`popover.tsx` projede
   **zaten kurulu** — yeni npm paketi YOK. Klavye gezinme (↑↓/Enter/Esc), odak yönetimi ve ARIA rolleri
   hazır gelir; tema token'ları kullandığı için koyu tema uyumludur. Kullanıcının verdiği elle-yazılmış örnek
   uyarlanmaz: klavye gezinme ve ARIA sıfırdan yazılmalı, `setTimeout(150)` blur yarışı taşır ve sabit gri
   renkleri (`bg-white`, `text-gray-900`) koyu temada kırılır.
3. **`shouldFilter={false}` ZORUNLU.** cmdk'nin dahili filtresi `toLowerCase()` tabanlıdır; Türkçe'de
   "İSTANBUL" → `i̇stanbul` (noktalı i + birleşen nokta) olur ve `istanbul` ile eşleşmez. Filtreleme bizde
   kalır, mevcut `toLocaleLowerCase("tr")` predicate'i aynen korunur.
4. **Liste yazmadan açılır.** Kullanıcının referans ekran görüntüsünde kutuya basınca tüm liste geliyor.
   (Brainstorming sırasında önce "önce yazmasını iste" seçilmişti; referans görüntü üzerine iptal edildi.)
5. **Yalnız istemci.** Backend, uç, şema **hiç değişmez**; arama zaten yüklü `beyannameler` listesi üzerinde
   istemcide çalışıyor.

## 3. Ortak bileşen: `BeyannameSecici`

**Konum:** `client/src/pages/portal/BeyannameSecici.tsx` — `MasrafTuruSecici.tsx` ile aynı klasör (portal
ekranlarının paylaştığı bileşen konvansiyonu).

```ts
type Props = {
  beyannameler: Beyanname[];
  value: string;                 // seçili beyanname id; "" = seçim yok
  onChange: (id: string) => void;
  disabled?: boolean;
  testId: string;                // zorunlu — mevcut testid'ler korunsun diye
  placeholder?: string;          // tetikleyici metni; varsayılan aşağıdaki uzun metin
  className?: string;            // Taleplerim'de md:max-w-md
};
```

Arama mantığı **tek yerde** yaşar; dört ekrandaki dört kopya (`arama` state + `filtreliBeyannameler` useMemo +
`Input` + `Select`) silinir. `TaleplerimSayfasi`'nın `aramalar: Record<string, string>` satır-başına-state'i de
tamamen kalkar — bileşen kendi arama durumunu kendi taşır.

**Filtre predicate'i (mevcut davranışın aynısı, tek fark: dördüncü ekran da beyanNo arar):**

```ts
const q = arama.trim().toLocaleLowerCase("tr");
const eslesenler = q
  ? beyannameler.filter((b) =>
      b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
      (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
      (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q))
  : beyannameler;
```

## 4. Davranış

| Durum | Görünen |
|---|---|
| Kapalı, seçim yok | `Aramak için Ref, Alıcı yada Beyanname No yazın, yada açılır listeden seçin` |
| Kapalı, seçim var | `{dosyaNo} — {alici}` |
| **Açık, arama boş** | **Liste hemen gelir** (ilk 100); arama kutusu otomatik odaklanmış |
| Arama var, sonuç var | Filtrelenmiş liste (ilk 100) |
| Arama var, sonuç yok | `Beyanname bulunamadı` |
| Sonuç sayısı > 100 | İlk 100 + listenin altında `İlk 100 gösteriliyor — aramayı daraltın` |

- **Satır düzeni:** Dosya no **bold** ve üstte; altında müşteri adı ve beyan no soluk (`text-muted-foreground`).
  Seçili satırda `Check` ikonu. Dört ekranda aynı görünür — beyan no bugün üç ekranın listesinde hiç
  görünmüyor, oysa onunla arama yapılabiliyor.
- **Klavye:** ↑↓ gezinme, Enter seçim, Esc kapatma — `cmdk`'den gelir.
- **Seçim sonrası:** popover kapanır, arama sorgusu sıfırlanır (sonraki açılış temiz başlar).
- **Placeholder metni** hem tetikleyicide hem panel içindeki arama kutusunda kullanılır. Metin uzundur;
  tetikleyicide dar ekranda kırpılır (`truncate`), panelde tam görünür.
- **100 sınırı bugün sessiz.** Kullanıcı aradığını göremeyince "sistemde yok" sanabiliyor; uyarı satırı bu
  sessiz kesintiyi görünür yapar. Sınırın kendisi korunur (kayıt sayısı binlere çıkabilir; sınırı kaldırmak
  sanallaştırma gerektirir, kapsam dışı).

## 5. Ekran bazında uygulama

| Ekran | Değişiklik |
|---|---|
| `YeniOdemeModal.tsx` | `Input`+`Select` → `BeyannameSecici`. **Dialog içinde Popover** — Radix'te odak/kaydırma kilidi çakışabilir, tarayıcıda ayrıca doğrulanır. Seçim sonrası beyannamenin sabit özet çubuğuna kilitlenmesi **aynen korunur**. |
| `YeniTalepSayfasi.tsx` | `disabled={listeDolu \|\| gonderimAktif}` prop olarak geçer. Seçim altındaki müşteri/beyan-no detay kutusu aynen kalır. |
| `DogrudanOdemeSayfasi.tsx` | `placeholder` ile "(tüm liste)" vurgusu korunur. |
| `TaleplerimSayfasi.tsx` | Satır başına bir bileşen; `aramalar` state'i silinir. **Beyan no araması burada ilk kez çalışır.** |

## 6. testid sözleşmesi

İki eleman tek kontrole indiğinden eski `input-*-arama` testid'leri kaybolur (kod tabanında başka referansları
yok — doğrulandı). Kontrolün kendisi eski **Select** testid'ini alır, böylece kontrolü hedefleyen seçiciler
çalışmaya devam eder:

- Tetikleyici: `data-testid={testId}` → `select-op-beyanname`, `select-beyanname`, `select-dogrudan-beyanname`.
  `TaleplerimSayfasi`'nın bugün testid'i yok; `select-eslestir-{talepId}` verilir.
- Panel içi arama kutusu: `{testId}-arama`
- Satırlar: `{testId}-item-{beyannameId}`
- Sınır uyarısı: `{testId}-limit`

## 7. Kapsam dışı

Sunucu tarafı arama · beyanname listesinin sayfalanması/sanallaştırılması · 100 sınırının kaldırılması ·
`MasrafTuruSecici` veya diğer seçicilerin combobox'a çevrilmesi · beyanname listesi dışındaki hiçbir Select ·
backend/şema/uç · yeni npm paketi.

## 8. Doğrulama

- `npm run check` ve `npm run build` temiz. Yalnız istemci; `db:push` YOK.
- **DEV DB izolasyonu:** Playwright yazma testi öncesi hedef doğrulanır (dev Neon), aksi hâlde durulur.
- Playwright, **dört ekranda da**:
  (a) Kutuya tıkla → liste **yazmadan** açılır, arama kutusu odaklı.
  (b) Yaz → anında filtrelenir; dosya no, alıcı ve **beyan no** ile ayrı ayrı arama çalışır.
  (c) **Türkçe I/İ:** büyük harfli Türkçe müşteri adının küçük harfle aranması eşleşir.
  (d) Klavye: ↓ ile satır seç, Enter ile onayla, Esc ile kapat.
  (e) Seçim sonrası tetikleyicide `{dosyaNo} — {alici}` görünür; kayıt akışı uçtan uca çalışır.
  (f) Sonuç yoksa "Beyanname bulunamadı"; 100'den fazla sonuçta sınır uyarısı görünür.
  (g) `YeniTalepSayfasi`: liste doluyken kontrol `disabled`.
  (h) `YeniOdemeModal`: Dialog içinde popover açılıyor, seçim yapılıyor, modal kilitlenmiyor.
  (i) `TaleplerimSayfasi`: satır başına bağımsız çalışır (bir satırdaki arama diğerini etkilemez) ve
      **beyan no ile arama artık sonuç verir** (bu fazın düzelttiği gerileme).
- Test verileri dev DB'den ve `uploads/` içinden temizlenir.
