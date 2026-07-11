# Otomatik Excel Yükleme (Power Automate → App) — Tasarım

**Tarih:** 2026-07-11
**Kapsam:** Müşteri Tahsilat (Mizan) ve Ödemeler (Beyanname) sekmelerindeki elle Excel yüklemelerini, ofisteki sürekli açık bir bilgisayarda çalışan Power Automate üzerinden otomatikleştirmek.

## 1. Amaç ve bağlam

Kullanıcı, ofisindeki muhasebe/gümrük programından periyodik olarak Excel çıkarıp ilgili klasörlere kaydeden bir **Power Automate Desktop** akışı kurdu. Bu bilgisayar, uygulamanın çalıştığı Hetzner VPS'ten (`167.235.252.49`, `https://cncgumruk.space`) **farklı bir makine**. Amaç: klasöre düşen Excel dosyalarının, insan müdahalesi olmadan uygulamaya aktarılması.

**Doğrulanmış kısıtlar:**
- Otomatik çıkan Excel dosyaları, elle yüklenenlerle **birebir aynı formatta** (Mizan: `120-` ile başlayan hesap satırları; Beyanname: "İthalat Raporu" sayfası + başlık doğrulaması). → Mevcut parser'lar (`parseMizanXlsx`, `parseBeyannameWorkbook`) **değişmeden** kullanılır.
- Uygulamaya erişim **HTTPS** üzerinden (`https://cncgumruk.space`) → token şifreli kanaldan gider, ekstra altyapı gerekmez.
- Otomasyon **arka planda sessizce** çalışacak (insan onay adımı yok); görünürlük **uygulama içi log + durum rozeti** ile sağlanacak.

## 2. Mevcut durum (değişmeyecek çekirdek)

| Sekme | Endpoint | Parser | Kayıt | Tekillik |
|---|---|---|---|---|
| Müşteri Tahsilat | `POST /api/tahsilat/mizan/upload` (önizle) + `/save` (yaz) | `parseMizanXlsx` | `insertMizanYukleme` + müşteri upsert + bakiye batch | MD5 hash → 409 |
| Ödemeler (yönetim) | `POST /api/odemeler/beyanname-excel` | `parseBeyannameWorkbook` | `upsertBeyannameler` | DOSYA NO upsert |

İkisi de şu an **backend auth'suz** (yalnız frontend şifre kapısı). Elle UI akışları bu tasarımda **birebir korunur**.

## 3. Mimari

```
Ofis PC (Power Automate Desktop)
  └─ "Dosya oluştu" tetikleyici (izlenen klasör)
       └─ Run PowerShell: Invoke-RestMethod -InFile -Headers{X-Ingest-Token, X-Dosya-Adi}
            └── HTTPS POST (application/octet-stream) ──►  cncgumruk.space (nginx → :5000)
                    └─ requireIngestToken  (env yoksa 503 / token yanlışsa 401 — fail-closed)
                         └─ POST /api/ingest/:tip            (tip = mizan | beyanname)
                              ├─ mizan    → processMizanBuffer()  (ortak fonksiyon)
                              ├─ beyanname→ parseBeyannameWorkbook + upsertBeyannameler
                              └─ her sonuç → otomatik_yukleme_log
       └─ (başarı sonrası) dosyayı "İşlenenler/" alt klasörüne taşı (yeniden tetikleme önlenir)

UI: /tahsilat + /odemeler → "Son otomatik yükleme" durum rozeti + son ~10 kayıt listesi
```

**Transport kodlaması kararı:** Endpoint multipart/form-data yerine **ham binary gövde** (`application/octet-stream`) kabul eder. Sebep: Power Automate'te multipart üretmek kırılgan; PowerShell `Invoke-RestMethod -InFile` ham dosyayı gövdede sorunsuz gönderir. Dosya adı `X-Dosya-Adi` header'ından (fallback: `?dosya=` query) alınır.

## 4. Bileşenler

### 4.1 Middleware — `requireIngestToken` (server/routes.ts)
- `X-Ingest-Token` header'ını `process.env.INGEST_TOKEN` ile **timing-safe** (`crypto.timingSafeEqual`) karşılaştırır.
- `INGEST_TOKEN` tanımsız → `503 { error: "Otomatik alım devre dışı" }` (SESSION_SECRET gibi *fail-closed*; env eksikken kimse veri basamaz).
- Token yok/yanlış → `401 { error: "Yetkisiz" }`.
- Uzunluk farkı timingSafeEqual'i patlatmasın diye önce hash'leyip (sha256) sabit uzunlukta karşılaştır.

### 4.2 Endpoint — `POST /api/ingest/:tip` (server/routes.ts)
- Route-scoped body parser: `express.raw({ type: "application/octet-stream", limit: "25mb" })` — sadece bu route'ta; global body parser'ları etkilemez.
- `tip` ∈ `{ "mizan", "beyanname" }`; başka değer → `400`.
- Boş gövde → `400`.
- **mizan:** `processMizanBuffer(buffer, dosyaAdi, { mizanTarihi: null })` çağrılır. Mükerrer (MD5 eşleşmesi) → `409` yerine `200 { durum: "atlandi" }` (Power Automate retry'ında hata görünmesin).
- **beyanname:** `parseBeyannameWorkbook(buffer)` + `storage.upsertBeyannameler(rows)`.
- Her dalda sonuç `otomatik_yukleme_log`'a yazılır (başarılı/atlandı/hata). Hata durumunda bile log yazılır, sonra ilgili status kodu döner.

### 4.3 Refactor — `processMizanBuffer()` (server/routes.ts veya server/mizanIngest.ts)
Mizan kayıt mantığı şu an `/api/tahsilat/mizan/save` içinde satır-içi (yaklaşık routes.ts:1819–1937): parse → MD5 dedup → filesystem arşiv (`uploads/mizan/YYYY/MM/`) → `insertMizanYukleme` → müşteri upsert döngüsü (fuzzy eşleştirme + öneri) → `insertMizanBakiyeBatch`. Bu blok **aynen** `processMizanBuffer(buffer, filename, opts)` fonksiyonuna taşınır; hem mevcut `/save` hem yeni `/ingest/mizan` bu fonksiyonu çağırır.
- `opts.overrideDuplicate` (varsayılan false) ile mükerrer davranışı çağırana bırakılır: `/save` 409 döndürmeye devam eder, `/ingest` "atlandi" olarak yorumlar.
- **Elle UI akışının davranışı değişmez** — yalnız kod ortak yere taşınır.

### 4.4 Şema — `otomatik_yukleme_log` (shared/schema.ts)
| Alan | Tip | Not |
|---|---|---|
| `id` | varchar (uuid) | PK |
| `tip` | text | "mizan" \| "beyanname" |
| `dosyaAdi` | text | gelen dosya adı |
| `durum` | text | "basarili" \| "atlandi" \| "hata" |
| `kayitSayisi` | integer | işlenen satır/kayıt (hata/atlandıda 0 olabilir) |
| `mesaj` | text | özet ("245 kayıt, 12 yeni müşteri") veya hata metni |
| `zaman` | text | yerel `YYYY-MM-DD HH:mm:ss` — tarih konvansiyonu (text, `new Date()` display yönlendirmesi yok) |

Insert Zod şeması: `insertOtomatikYuklemeLogSchema`.

### 4.5 Storage (server/storage.ts — IStorage + DatabaseStorage)
- `insertOtomatikYuklemeLog(kayit): Promise<OtomatikYuklemeLog>`
- `getOtomatikYuklemeLoglar(tip: string | null, limit: number): Promise<OtomatikYuklemeLog[]>` — `zaman` desc.

### 4.6 Görünürlük API'ı
- `GET /api/otomatik-yukleme/log?tip=&limit=` — frontend şifre kapısı arkasında (diğer okuma uçları gibi auth'suz). `tip` verilmezse hepsi, `limit` varsayılan 10.

### 4.7 UI — durum rozeti
- `client/src/pages/Tahsilat.tsx` (tip="mizan") ve `client/src/pages/Odemeler.tsx` (tip="beyanname") sayfalarına küçük bir **durum kartı**:
  - "Son otomatik yükleme: 11/07/2026 14:30 — 245 kayıt ✓" (tarih `dd/mm/yyyy`, `new Date()` yönlendirmesi yok).
  - Açılır/katlanır son ~10 kayıt listesi; `durum==="hata"` kırmızı, `"atlandi"` gri, `"basarili"` yeşil.
  - TanStack Query ile `/api/otomatik-yukleme/log?tip=...` — mevcut sayfa deseniyle.

## 5. İstek/yanıt sözleşmesi

**İstek:**
```
POST /api/ingest/mizan
Host: cncgumruk.space
Content-Type: application/octet-stream
X-Ingest-Token: <gizli>
X-Dosya-Adi: Mizan-2026-07.xlsx

<ham .xlsx byte'ları>
```

**Yanıtlar:**
| Durum | Kod | Gövde |
|---|---|---|
| Başarılı | 200 | `{ durum:"basarili", tip, kayitSayisi, mesaj }` |
| Mükerrer (mizan) | 200 | `{ durum:"atlandi", mesaj:"Aynı dosya daha önce yüklendi" }` |
| Parse hatası | 400 | `{ durum:"hata", error }` |
| Geçersiz tip / boş gövde | 400 | `{ error }` |
| Token yok/yanlış | 401 | `{ error:"Yetkisiz" }` |
| INGEST_TOKEN tanımsız | 503 | `{ error:"Otomatik alım devre dışı" }` |

## 6. Güvenlik & Deploy

- `INGEST_TOKEN` → `.env.example`'a eklenir + **VPS `.env`'ine elle eklenir** (uzun rastgele değer). Push=deploy olduğundan, token VPS'e eklenmeden endpoint 503 verir → hatalı/erken açılma olmaz.
- HTTPS zaten mevcut → token açık ağda görünmez.
- Ara commit'ler deploy-güvenli (endpoint env yoksa kapalı). Açık-yol `git add` (paralel oturum commit karışması riski). [[feedback_paralel_oturum_riski]]
- `db:push` sonrası `otomatik_yukleme_log` tablosunun canlıda oluştuğu **elle doğrulanır** (yeşil ≠ migration uygulandı). [[project_drizzle_push_ci_tuzagi]]

## 7. Power Automate Desktop kurulumu (dok. çıktısı)

Her Excel türü için bir akış (Mizan ve Beyanname). Adımlar:
1. **Tetikleyici:** "Dosya oluşturuldu" — izlenen klasör (ör. `C:\Otomasyon\Mizan\`).
2. **Bekleme:** dosya kilidi bitene kadar kısa `Wait` (program yazmayı bitirsin).
3. **Run PowerShell script:**
   ```powershell
   $token = "<INGEST_TOKEN>"
   $file  = "%FileToProcess%"           # tetikleyiciden gelen tam yol
   $name  = [System.IO.Path]::GetFileName($file)
   Invoke-RestMethod -Uri "https://cncgumruk.space/api/ingest/mizan" `
     -Method Post -InFile $file -ContentType "application/octet-stream" `
     -Headers @{ "X-Ingest-Token" = $token; "X-Dosya-Adi" = $name }
   ```
   (Beyanname akışında URL `.../api/ingest/beyanname`.)
4. **Başarı sonrası:** dosyayı `İşlenenler\` alt klasörüne taşı (yeniden tetiklenmeyi ve mükerrer POST'u önler).

## 8. Test / doğrulama

- Test runner yok. Doğrulama:
  - `npm run check` (tip kontrolü) — tek kalite kapısı.
  - Dev sunucuya karşı gerçek örnek Excel ile `Invoke-RestMethod -InFile` POST → 200 + DB'de kayıt + log satırı.
  - Mükerrer POST → `atlandi`.
  - Bozuk/yanlış dosya → 400 + log'da `hata`.
  - Yanlış token → 401; env kaldırılınca → 503.
  - **Elle UI yükleme akışı** (Tahsilat mizan + Ödemeler beyanname) hâlâ birebir çalışıyor (refactor regresyon kontrolü).

## 9. Kapsam dışı (YAGNI)

- E-posta/SMTP bildirimi (uygulama içi log yeterli).
- Bulut senkron/cron poll yaklaşımı (doğrudan POST tercih edildi).
- Rate limiting (token gate yeterli; gerekirse Faz 2).
- Yeni Excel türleri (yalnız mizan + beyanname; `:tip` genişletilebilir bırakıldı).
- Web push / gerçek zamanlı UI bildirimi (rozet + sayfa yenileme yeterli).
