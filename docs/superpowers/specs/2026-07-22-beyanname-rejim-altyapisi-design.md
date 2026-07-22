# Beyanname Rejim Altyapısı (Faz 1a) — Tasarım

**Tarih:** 2026-07-22
**Durum:** Onaylandı
**Kapsam:** Yalnız şema + içe aktarma. Arayüzde rejim seçimi ve manuel transit **Faz 2**; EX Excel parser'ı **Faz 1b**.

## 1. İhtiyaç

Bugüne kadar masraf/ödeme yalnız **ithalat** beyannameleri üzerinden işleniyordu. Artık **ihracat (EX)** ve
**transit (TR)** beyannameleri de masraf taşıyacak:

- **EX:** IM ile aynı yoldan, ofisten otomatik olarak yüklenecek (Power Automate → `/api/ingest/...`).
- **TR:** listesi sistemde **yok** ve alınamıyor (bazen işi dışarıdan biri yapıyor). Masrafı giren kullanıcı
  transiti **elle** ekleyecek — dosya no olmadan, beyanname no + firma ile.

Mevcut veri modeli bunu taşıyamıyor: rejim bilgisi yok, `dosya_no` `NOT NULL` ve tek benzersizlik anahtarı.

## 2. Bulgular (tasarımı belirleyen ölçümler)

1. **Rejim `beyan_no`'dan türetilemez.** 275 kaydın **127'sinde (%46) `beyan_no` boş**. Dolu olanlarda
   9-10. karakter rejimi veriyor (115 `IM`, 33 `AN`) ama yarısı için bu bilgi yok.
2. **Rejim zaten kaynak Excel'de var.** `BEYANNAME LİSTESİ.xlsx` → `İthalat Raporu` sayfasında **104 sütun**
   var ve `AU = REJİM` gümrük rejim kodunu taşıyor. Parser bugün 10 sütun okuyor, `AU`'yu okumuyor.
   Dağılım: `7100/7123` antrepo (97), `4000/4010/4071` serbest dolaşıma giriş (124), `5100/5171/5371`
   dahilde işleme (41), `6121/6323/6771` geri gelen eşya (13). `7xxx` ↔ `AN`, diğerleri ↔ `IM` — beyan
   no'daki harfle **birebir tutarlı**.
3. **EX dosya numaraları IM ile ÇAKIŞABİLİR** (kullanıcı teyit etti). Mevcut `upsertBeyannameler`
   `ON CONFLICT (dosya_no)` yapıyor → EX yüklemesi aynı numaralı IM kaydını **sessizce ezerdi**
   (alıcı/beyan no/kullanıcı değişir, o dosyaya bağlı masraflar yanlış firmaya görünür). Bu fazın
   önlediği en somut hasar budur.
4. **`dosya_no` null olunca istemcide yalnız bir dosya kırılıyor.** 16 kullanımın 15'i zaten
   `?? "—"` / `?? "?"` ile null-güvenli; `BeyannameSecici.tsx` üç noktada düzeltme istiyor.

## 3. Kararlar

1. **Tek tablo.** Transit ayrı tabloya alınmaz. Ayrı tablo, her masraf kaydının iki tabloya işaret
   edebilmesini (`beyanname_id` + `transit_id` ya da polimorfik referans) gerektirir; bu da her rapor,
   toplam ve açık-hareket sorgusunun **kalıcı olarak** iki tabloyu birleştirmesi demektir. Transit,
   "dosya no'su olmayan bir beyanname"dir.
2. **`rejim` = KANAL, gümrük rejim kodu değil.** `IM` | `EX` | `TR` — hangi rapordan/uçtan geldiği.
   Kullanıcının iş akışı bu; İthalat Raporu'ndan gelen antrepo kaydı da kullanıcı için "IM"dir.
3. **Ham gümrük kodu ayrıca saklanır** (`rejim_kodu`, `AU` sütunundan). Parser o satırı zaten okuyor,
   maliyeti sıfır; kazancı gerçek — bugün "antrepo mu?" sorusu kayıtların yarısında cevaplanamıyor.
4. **`kaynak` alanı** (`excel` | `manuel`) — Excel içe aktarmanın elle girilmiş transiti asla ezmemesi
   yapısal olarak garanti altında (TR'nin `dosya_no`'su null, çakışma hedefiyle eşleşemez), ama alan
   denetlenebilirlik ve arayüzde rozet için tutulur.
5. **Bu faz geri alınabilir.** TR satırı Faz 2'de oluşacağı için Faz 1a sonunda `dosya_no` null olan
   **hiçbir satır yoktur** — gerekirse `NOT NULL` geri konabilir. Faz 2'den sonra bu geçerli değildir.

## 4. Şema değişikliği — `beyannameler`

| Alan | Bugün | Olacak |
|---|---|---|
| `dosyaNo` | `text NOT NULL` | `text` (**nullable**) |
| `rejim` | — | `text NOT NULL DEFAULT 'IM'` — `IM` \| `EX` \| `TR` |
| `rejimKodu` | — | `text` (nullable) — `AU` sütunundaki ham kod (`4000`, `7100`, …) |
| `kaynak` | — | `text NOT NULL DEFAULT 'excel'` — `excel` \| `manuel` |

**İndeksler:**

| İndeks | Bugün | Olacak |
|---|---|---|
| `beyannameler_dosya_no_idx` | `UNIQUE (dosya_no)` | **kaldırılır** |
| `beyannameler_dosya_rejim_idx` | — | `UNIQUE (dosya_no, rejim)` |
| `beyannameler_tr_beyan_no_idx` | — | `UNIQUE (beyan_no) WHERE rejim = 'TR'` (kısmi) |
| `beyannameler_kullanici_idx` | var | değişmez |

`rejim` `NOT NULL DEFAULT 'IM'` olarak eklendiği için Postgres mevcut 275 satırı **otomatik doldurur** —
ayrı backfill betiği gerekmez. Aynısı `kaynak` için `'excel'` ile geçerli.

`(dosya_no, rejim)` bileşiğinde `dosya_no` null olan TR satırları birbiriyle çakışmaz (Postgres null'ları
ayrı sayar); TR benzersizliğini kısmi indeks sağlar.

**Varsayılan değer riski:** `rejim`'in varsayılanı `'IM'` olduğu için rejim yazmayı unutan bir insert
sessizce IM olur. Bu yüzden **parser ve içe aktarma yolu `rejim`'i her zaman açıkça yazar**; varsayılan
yalnız mevcut satırların doldurulması içindir.

## 5. `upsertBeyannameler` değişikliği

`server/storage.ts` — üç nokta:

1. **Tekilleştirme anahtarı** `dosyaNo` → `` `${dosyaNo}|${rejim}` ``. Bugünkü `tekil.set(r.dosyaNo, r)`
   iki rejimin aynı numaralı satırını birbirine ezer.
2. **Mevcutluk sorgusu** tek kolon yerine `(dosya_no, rejim)` çifti üzerinden eşleşir — "eklenen /
   güncellenen" sayımı doğru kalsın diye.
3. **`ON CONFLICT` hedefi** `beyannameler.dosyaNo` → `[beyannameler.dosyaNo, beyannameler.rejim]`.
   `set` bloğuna `rejimKodu` eklenir; **`rejim` ve `kaynak` `set`'e KONMAZ** (çakışma anahtarının parçası
   ve kayıt kimliği).

## 6. Parser değişikliği

`server/beyannameParser.ts`:

- İmza `parseBeyannameWorkbook(buffer, rejim: "IM" | "EX")` olur; IM yolu `"IM"` geçirir. (EX parser'ı
  Faz 1b'de; bu fazda `"EX"` çağrısı yoktur ama imza hazırdır.)
- Her satıra `rejim` ve `kaynak: "excel"` yazılır.
- **`AU` sütunu KOŞULLU okunur:** yalnız `AU` başlığı tam olarak `"REJİM"` ise `rejimKodu` yazılır, aksi
  hâlde `null`. **Katı başlık doğrulamasına EKLENMEZ.** Gerekçe: `dosyaNo`/`alici` gibi alanlar zorunlu
  ve eksikliği yüklemeyi reddetmeli (sessiz sıfır-satır ithalatı yasak); `rejimKodu` tamamlayıcıdır ve
  eksikliği çalışan IM akışını durdurmamalı. Eski bir export'ta `AU` kaymışsa yanlış değer yazmak yerine
  hiç yazmaz.
- Sayfa seçimi (`İthalat Raporu`) ve mevcut 10 başlık doğrulaması **değişmez**.

## 7. İstemci etkisi

`dosyaNo` nullable olunca TypeScript yalnız `client/src/pages/portal/BeyannameSecici.tsx`'te kırılır:

| Satır | Bugün | Olacak |
|---|---|---|
| 40 | `b.dosyaNo.toLocaleLowerCase("tr")` | `(b.dosyaNo ?? "").toLocaleLowerCase("tr")` |
| 65 | `` `${secili.dosyaNo} — ${secili.alici ?? "?"}` `` | `dosyaNo` null ise `beyanNo`, o da yoksa `"?"` |
| 94 | `{b.dosyaNo}` | `{b.dosyaNo ?? b.beyanNo ?? "?"}` |

Diğer 13 kullanım zaten `?? "—"` / `?? "?"` taşıyor, dokunulmaz. Bu faz **görsel bir değişiklik
getirmez** — TR satırı henüz oluşmadığı için davranış aynen korunur; yapılan yalnız null-güvenliktir.

## 8. Göç riski ve doğrulama

Bu, projede **ilk kez mevcut bir benzersiz indeksin değiştirilmesi**. `drizzle-kit push` şunları üretecek:
kolon ekleme (×3), `dosya_no DROP NOT NULL`, eski unique indeksin düşürülmesi, iki yeni indeksin
oluşturulması.

**Bilinen tuzaklar (ikisi de bu projede yaşandı):**
- Şema dışı bir tablo CI'daki `db:push`'u sessizce kilitlemişti → deploy yeşili ≠ migration uygulandı.
- `NOT NULL` → nullable dönüşümü, null satır oluştuktan sonra geri alınamaz hale gelmişti.

**Bu yüzden:**
1. Önce **dev Neon'da** `npm run db:push` çalıştırılır, ürettiği SQL ve varsa onay soruları kaydedilir.
2. **Kısmi benzersiz indeksin** (`WHERE rejim = 'TR'`) `drizzle-kit push` tarafından gerçekten
   oluşturulduğu dev'de **elle doğrulanır** (`pg_indexes` sorgusu). Oluşturulmuyorsa manuel SQL ile
   uygulanır ve şema tanımı buna uygun bırakılır.
3. Deploy sonrası **canlıda elle doğrulanır**: üç kolon var mı, `dosya_no` nullable mı, iki indeks var mı,
   275+ satırın `rejim`'i `'IM'` mi. Actions'ın yeşil olması yeterli sayılmaz.

**Doğrulama listesi:**
- `npm run check` ve `npm run build` temiz.
- Dev'de: `IM` içe aktarma tekrar çalıştırılır → satır sayısı ve `eklenen/güncellenen` bugünküyle aynı
  (regresyon); `rejim_kodu` dolu geliyor ve `AU` dağılımıyla (`7100`→97 vb.) uyuşuyor.
- **Çakışma testi:** aynı `dosya_no` ile biri `IM` biri `EX` iki satır eklenir → **ikisi de yaşar**
  (bugünkü şemada ikincisi birinciyi ezerdi). Bu fazın varlık sebebinin kanıtıdır.
- **TR benzersizlik testi:** `rejim='TR'`, `dosya_no=null` iki satır aynı `beyan_no` ile eklenmeye
  çalışılır → ikincisi **reddedilir**; farklı `beyan_no` ile → kabul edilir.
- Portal beyanname listesi ucu (`/api/portal/beyannameler`) ve dört masraf ekranı **regresyonsuz** çalışır.
- Test verileri dev DB'den temizlenir.

## 9. Kapsam dışı

EX Excel parser'ı ve `/api/ingest/beyanname-ex` ucu (**Faz 1b** — örnek ihracat dosyası bekleniyor) ·
arayüzde IM/EX/TR seçimi ve filtreleme (**Faz 2**) · manuel transit ekleme akışı ve ucu (**Faz 2**) ·
rejim kırılımlı raporlar · `gumruk_verileri` tablosu ve Gümrük modülü · mevcut IM içe aktarma ucunun
adresi (`/api/ingest/beyanname` aynen kalır).
