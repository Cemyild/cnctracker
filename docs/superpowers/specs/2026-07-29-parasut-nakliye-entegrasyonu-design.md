# Paraşüt Nakliye Entegrasyonu — Tasarım

**Tarih:** 2026-07-29
**Kapsam:** Nakliye modülü — gelen fatura girişi (e-Fatura + e-Arşiv), beyanname eşleştirme, müşteriye satış faturası taslağı
**Muhasebe programı:** Paraşüt (API v4)

---

## 1. Bağlam ve mevcut durum

Şirket, gümrük müşavirliği yapıyor. Nakliye masrafları tedarikçilerden fatura olarak geliyor; bu masraflar bir beyanname dosyasına ait ve müşteriye **%20 marj eklenerek** yeniden faturalanıyor.

### Bugün çalışan sistem

VPS'te (`167.235.252.49`) saatlik bir cron:

```
5 * * * *  cd /root/nakliye && python3 gmail_poller.py >> /var/log/nakliye-poller.log
0 5 * * *  curl -X POST http://localhost:5000/api/nakliye/eslestir
```

`gmail_poller.py` (saf stdlib + `pdftotext`):
1. IMAP ile `noreply@sysmond.com.tr`'den son 30 günün maillerini çeker
2. PDF eklerini `pdftotext` ile metne çevirip regex'le ayrıştırır (fatura no, tarih, ödenecek tutar, konteyner)
3. `psql` ile `nakliye_verileri`'nde olmayan fatura numaralarını `/api/nakliye/webhook-receiver`'a POST eder
4. `/api/nakliye/eslestir`'i tetikler

`/api/nakliye/eslestir` ([server/routes.ts:2930](../../../server/routes.ts)) fatura kalem metninden `([A-Z]{4})\s*(\d{6,7})` regex'iyle konteyner çıkarıp `gumruk_verileri.house_no` ile eşleştiriyor; çoklu adayı tarih yakınlığıyla (45 gün) kırıyor.

`/api/proxy/nakliye-upload` hâlâ eski n8n webhook URL'ine bakıyor — **ölü kod**, n8n devre dışı.

### Ölçülen durum (2026-07-29)

| | 2025 | 2026 |
|---|---|---|
| Nakliye faturası | 165 | 113 |
| Beyannameyle eşleşen | 0 (%0) | 61 (%54) |

- Eşleşmeyen 221 konteyner kaleminin **hiçbiri** `gumruk_verileri.house_no` içinde yok → eşleştirici kaçırmıyor, kaynak veri eksik
- `house_no` 91.555 gümrük satırının yalnızca 859'unda konteyner formatında (%1); 2025'te hiç yok, 2026'da aylık ~4.000 satırın 90-200'ünde var
- `konteyner_sayisi` 27.606 / 91.555 satırda dolu (%30)
- Hacim: son 120 günde 42 mail (~ayda 11 fatura)
- `mal_hizmet` alanı çoğunlukla sadece konteyner numarası — poller PDF'ten firma adını çıkarmıyor
- `nakliye_verileri`'nde KDV alanları 279 kaydın 132'sinde dolu (n8n dönemi); Python poller bunları hiç doldurmuyor

### İki ayrı gelen-fatura kanalı

| Kanal | Nereye düşer | Nasıl alınır | Paraşüt'e nasıl girer |
|---|---|---|---|
| **e-Arşiv** (sysmond vb.) | GİB gelen kutusuna düşmez, alıcıya mail/portal ile gider | Mail poller — tek yol | **Bugün elle giriliyor → bu sistemle otomatikleşecek** |
| **e-Fatura** | Paraşüt gelen e-fatura kutusuna düşer | Paraşüt'te manuel onaylanır → `purchase_bills` GET | Onay sonrası kendiliğinden |

### Elle giriş gerçeği (doğrulandı 2026-07-29)

Paraşüt'teki alış faturaları ile `nakliye_verileri` birebir örtüşüyor:

| Fatura No | CNC `odenecek_tutar` | Paraşüt `net_total` | Tedarikçi | `e_invoices_count` |
|---|---|---|---|---|
| GIB2026000000072 | 12.760 | 12.760 | HANİFE EKER | 0 |
| GIB2026000000074 | 23.200 | 23.200 | HANİFE EKER | 0 |
| GIB2026000000075 | 11.600 | 11.600 | HANİFE EKER | 0 |
| GIB2026000000076 | 34.800 | 34.800 | HANİFE EKER | 0 |

`e_invoices_count: 0` → bunlar e-fatura değil; **muhasebeci elle giriyor.** Bu projenin birincil amacı bu elle girişi ortadan kaldırmaktır. Dolayısıyla akış Paraşüt'e **yazar**, ve elle giriş durdurulur.

Ayrıca nakliye tedarikçisi sysmond'dan ibaret değil — örn. **DSV Hava ve Deniz Taşımacılığı** (200 USD, KDV %0) gibi kayıtlar da var. Bunlar e-fatura kanalından geldiği için `purchase_bills` poll'u ile kendiliğinden kapsama girer.

---

## 2. Paraşüt API — doğrulanmış kısıtlar

Kaynak: `https://apidocs.parasut.com/swagger.json` (OpenAPI 2.0, 81 endpoint). ReDoc sayfasının HTML'i boştur; içerik `swagger.json`'dadır.

| Konu | Gerçek |
|---|---|
| Base URL | `https://api.parasut.com/v4/{firma_no}` |
| Kimlik | OAuth2; `authorization_code` veya `password` grant. `CLIENT_ID`/`CLIENT_SECRET` destek@parasut.com'dan alınır |
| Token | `access_token` 2 saat; `refresh_token` **rotasyonlu** (her yenilemede yenisi gelir, eskisi ölür) |
| Rate limit | **10 istek / 10 saniye** |
| Format | JSON:API (`data.attributes` + `data.relationships`); `consumes` yalnızca `application/vnd.api+json` |
| Webhook | **YOK — canlıda doğrulandı.** `GET /v4/216831/webhooks` → HTTP 404. Resmî olmayan SDK'daki (`Sergeant61/parasut-api-v4`) modül spekülatifmiş. Polling kalıcı mimari |
| Dosya eki | **YOK.** `purchase_bills` ilişkileri yalnızca `details, supplier, paid_by_employee, category, tags`; multipart desteklenmiyor. Alış faturasına PDF eklenemez |

### Canlı hesap bilgileri (doğrulandı 2026-07-29)

| | |
|---|---|
| Firma no | **216831** — CNC NAKLİYE HİZMETLERİ LOJİSTİK VE KONTEYNER TAŞIMACILIĞI A.Ş. |
| VKN | 2110687188 |
| e-Fatura / e-Arşiv | 2020-12-08'den beri aktif |
| Kayıtlı alış faturası | 2.089 |
| Kayıtlı ürün | 1.113 — **`NAKLİYE BEDELİ` id `8644976`** (birim ADET) kullanılacak, yeni ürün açılmayacak |

### `net_total` tuzağı — matrah türetme

Paraşüt'ün `purchase_bills.net_total` alanı **KDV dahil ve tevkifat düşülmüş** tutardır (yani "ödenecek"). Marj tabanı olan matrah türetilmelidir:

```
matrah = net_total − total_vat + total_vat_withholding
```

Canlı doğrulama (4 fatura, hepsi tuttu):

| Fatura | net_total | total_vat | tevkifat | → matrah |
|---|---|---|---|---|
| GIB2026000000075 | 11.600 | 2.000 | 400 | 10.000 |
| GIB2026000000074 | 23.200 | 4.000 | 800 | 20.000 |
| GIB2026000000076 | 34.800 | 6.000 | 1.200 | 30.000 |
| GIB2026000000072 | 12.760 | 2.200 | 440 | 11.000 |

`net_total`'ı matrah sanmak her faturayı yanlış hesaplatır — bu türetme kodda tek bir yardımcı fonksiyonda toplanır.

### `purchase_bills` GET filtreleri

Mevcut: `filter[issue_date]`, `filter[due_date]`, `filter[supplier_id]`, `filter[item_type]`, `filter[spender_id]`.
**`filter[invoice_no]` YOK** → "bu fatura Paraşüt'te var mı?" sorusu ancak tarih aralığı çekilip istemci tarafında elenerek cevaplanır. Dedup mantığı buna dayanır.

### Gelen e-fatura

- `GET /e_invoice_inboxes?filter[vkn]=` **gelen kutusunu listelemez** — dönen alanlar `vkn`, `e_invoice_address`, `name`, `inbox_type`, `address_registered_at`. Bu bir **mükellef sorgusu**dur; giden fatura keserken e-Fatura mı e-Arşiv mi kararı için kullanılır.
- `GET /e_invoices` **koleksiyonu yok**. Sadece `POST /e_invoices`, `GET /e_invoices/{id}`, `GET /e_invoices/{id}/pdf`.
- `GET /e_invoices/{id}` `include=invoice` ile `included` dizisinde **`purchase_bills`** dönebiliyor; `EInvoiceAttributes` `direction: inbound|outbound`, `from_vkn`, `uuid` (ETTN), `env_uuid`, `gtb_registration_no`, `gtb_export_date` taşıyor.
- **Sonuç:** gelen e-fatura verisine ulaşılır ama keşfine ulaşılmaz. Tek giriş noktası `GET /purchase_bills` — yani Paraşüt arayüzünde onaylanıp alış faturasına dönüşmüş kayıtlar.

### Kullanılacak uçlar

| Uç | Amaç |
|---|---|
| `GET /purchase_bills` | Onaylanmış alış faturalarını çek. Filtre: `filter[issue_date]`. `include=details,supplier,active_e_document,category` |
| `POST /purchase_bills#detailed` | e-Arşiv faturalarını Paraşüt'e yaz (kalemli) |
| `POST /purchase_bills#basic` | Alternatif; zorunlu: `item_type, issue_date, due_date, currency, net_total, total_vat` |
| `GET /contacts?filter[tax_number]=` | VKN ile cari bul |
| `POST /sales_invoices` | Satış faturası taslağı |
| `GET /trackable_jobs/{id}` | (Faz 2) resmileştirme takibi |
| `GET /tags`, `POST /tags` | Beyanname dosya no etiketi |

`sales_invoice_details` zorunlu alanları: `quantity`, `unit_price`, `vat_rate`. Kalem bir `product`'a bağlanır. Nakliye için kullanışlı iki alan daha var: `shipping_method` (Denizyolu/Karayolu/…) ve `delivery_method` (CIF/FOB/…).

---

## 3. Hedefler ve kapsam

### Hedefler
1. e-Arşiv faturalarını maildan al, **Claude ile ayrıştır**, CNC'ye ve Paraşüt'e yaz
2. e-Fatura olarak gelenleri Paraşüt'ten poll ederek CNC'ye al
3. Faturaları beyannameyle eşleştir; eşleşmeyenleri kuyruğa düşür
4. Beyanname tamamlandığında müşteriye satış faturası **taslağı** oluştur (Paraşüt'te kayıtlı, resmileştirilmemiş)

### Kapsam dışı (Faz 2)
- Otomatik resmileştirme (`POST /e_invoices` / `/e_archives` + `trackable_jobs` polling)
- Nakliye dışı masraf türleri (ardiye, liman, terminal)
- Gelen e-faturayı Paraşüt'te otomatik onaylama (API'de yok)
- Tahsilat/ödeme akışı

---

## 4. Mimari

### Yürütme modeli: tek zamanlayıcı + durum makinesi

Sunucuda periyodik bir iş (15 dk): token tazele → `purchase_bills` çek → ayrıştırılmamışları işle → eşleştir → tamamlanan dosyaları faturala. Her kayıt bir `durum` alanı taşır; her tur "bir sonraki adıma geçebilecekleri" işler. Kesinti olursa kaldığı yerden devam eder; her adım idempotent.

Genel amaçlı iş kuyruğu (`jobs` tablosu) **Faz 1'de yazılmıyor** — resmileştirme olmadığı için asenkron `trackable_jobs` beklemesi yok, bugün çözdüğü bir problem yok. Faz 2'de durum makinesine "resmileştirme bekleniyor" durumu eklenip kuyruk oraya girer.

Webhook doğrulanmadı. Kimlik bilgileri gelince `GET /v4/{firma_no}/webhooks` tek istekle test edilir; 200 dönerse zamanlayıcının tetikleyicisi olarak takılır, mimari değişmez.

### Boru hattı

```
                    ┌─ e-Arşiv kanalı ─────────────────────────┐
mail (IMAP) ──► PDF ─┤                                          │
                    │  pdf-parse (ham metin, doğrulama refs)    │
                    │  Claude Opus 5 (document, structured)     │
                    │  doğrulama ✓/✗                            │
                    └───────────────┬──────────────────────────┘
                                    │
                    ┌─ e-Fatura kanalı ────────────────────────┐
Paraşüt (onaylı) ──► GET purchase_bills (include=details,…)     │
                    └───────────────┬──────────────────────────┘
                                    ▼
                        nakliye_faturalari (ortak depo)
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
     POST purchase_bills     konteyner+firma      uploads/nakliye/
      (yalnız e-Arşiv)        eşleştirme            PDF arşivi
                                    │
                          beyanname bazında grup
                                    │  eşleşen konteyner == konteynerSayisi
                                    ▼
                        POST sales_invoices (taslak)
                          matrah × 1,20 · tevkifat 0
```

---

## 5. Veri modeli

Tüm tarih alanları `text`, `YYYY-MM-DD`. FK kolon adları açık string olarak verilir (Türkçe karakter TS alan adında yok).

### `parasut_token` — tek satır
| Alan | Tip | Not |
|---|---|---|
| `id` | varchar PK | sabit `'default'` |
| `accessToken` | text | |
| `refreshToken` | text | rotasyonlu |
| `expiresAt` | timestamp | |
| `guncellemeTarihi` | timestamp | |

Rotasyon yüzünden **tek yazıcı** olmalı: yenileme tek fonksiyonda, transaction içinde.

### `nakliye_faturalari` — gelen faturaların ortak deposu
| Alan | Tip | Not |
|---|---|---|
| `id` | varchar PK | |
| `kaynak` | text | `earsiv` \| `efatura` |
| `faturaNo` | text | **unique** — kanallar arası dedup |
| `faturaTarihi` | text | YYYY-MM-DD |
| `tedarikciUnvan` | text | |
| `tedarikciVkn` | text | |
| `musteriFirmaAdi` | text | PDF'ten çıkarılan; eşleşme sinyali |
| `paraBirimi` | text | TRY/USD/EUR/GBP |
| `kur` | decimal(10,4) | |
| `matrah` | decimal(15,2) | KDV hariç |
| `kdvOrani` | integer | |
| `kdvTutari` | decimal(15,2) | |
| `tevkifatTutari` | decimal(15,2) | gelen faturada olabilir |
| `odenecekTutar` | decimal(15,2) | |
| `konteynerler` | text | virgülle ayrılmış, normalize |
| `aciklama` | text | |
| `pdfYolu` | text | `uploads/nakliye/<fatura_no>.pdf` |
| `parasutPurchaseBillId` | varchar | Paraşüt alış faturası id |
| `parasutEttn` | text | e-fatura kanalında `active_e_document.uuid` |
| `hamMetin` | text | pdf-parse çıktısı (denetim + doğrulama) |
| `llmJson` | text | LLM ham cevabı |
| `durum` | text | `ayristirildi` \| `dogrulama_hatasi` \| `parasutta` \| `eslesti` \| `faturalandi` \| `revizyon_gerekli` \| `hata` |
| `hataMesaji` | text | |
| `olusturmaTarihi` | timestamp | |

### `nakliye_fatura_eslesme` — fatura ↔ beyanname (n:n)
| Alan | Tip | Not |
|---|---|---|
| `id` | varchar PK | |
| `faturaId` | varchar | FK → `nakliye_faturalari` (`varchar("fatura_id")`) |
| `gumrukVerisiId` | varchar | FK → `gumruk_verileri` (`varchar("gumruk_verisi_id")`) |
| `konteyner` | text | eşleşmeyi sağlayan konteyner |
| `skor` | integer | 0-100 |
| `kaynak` | text | `konteyner` \| `konteyner+firma` \| `manuel` |
| `durum` | text | `otomatik` \| `onaylandi` \| `reddedildi` |

### `parasut_satis_faturalari` — kesilen taslaklar
| Alan | Tip | Not |
|---|---|---|
| `id` | varchar PK | |
| `gumrukDosyaNo` | text | **unique** — dosya başına tek taslak |
| `parasutSalesInvoiceId` | varchar | |
| `contactId` | varchar | Paraşüt cari id |
| `netToplam` | decimal(15,2) | |
| `paraBirimi` | text | |
| `kalemSayisi` | integer | |
| `durum` | text | `taslak` \| `hata` |
| `hataMesaji` | text | |
| `olusturmaTarihi` | timestamp | |

### Mevcut `nakliye_verileri`

Dokunulmuyor; geçmiş veri ve mevcut ekran korunuyor. Yeni akış `nakliye_faturalari`'na yazar. Geçiş tamamlandığında eski tablo salt-okunur arşive dönüşür (bu spec kapsamında değil).

---

## 6. Paraşüt istemci katmanı — `server/parasut/client.ts`

SDK bağımlılığı yok; ince kendi katmanımız. Repodaki mevcut ince katman kalıbıyla uyumlu.

- **Kimlik:** `password` grant (kendi hesabımız; kullanıcı yönlendirmesi gerekmiyor). `.env`: `PARASUT_CLIENT_ID`, `PARASUT_CLIENT_SECRET`, `PARASUT_USERNAME`, `PARASUT_PASSWORD`, `PARASUT_FIRMA_NO`
- **Token yönetimi:** DB'den oku; `expiresAt` yaklaşınca `refresh_token` ile yenile ve **yeni refresh_token'ı yaz**. Yenileme tek fonksiyon, eşzamanlı çağrıda tek kez çalışır.
- **Throttle:** 10 istek / 10 sn token bucket. Bu hacimde asla sınıra yaklaşılmaz ama koruma kalıcı.
- **JSON:API çözümleyici:** `data` + `included` → düz obje; `relationships` id'leri `included`'dan resolve edilir.
- **Hata:** 401 → bir kez token yenile ve tekrar dene; 429 → bekle ve tekrar dene; 4xx/5xx → kaydın `durum`'unu `hata` yapıp `hataMesaji`'na yaz, boru hattını durdurma.

Kimlik bilgileri yoksa entegrasyon **fail-closed** davranır: zamanlayıcı çalışmaz, log'a bir satır yazar, mevcut hiçbir akış bozulmaz.

---

## 7. PDF ayrıştırma — `server/nakliye/faturaAnaliz.ts`

Kalıp [server/lib/policeOcr.ts](../../../server/lib/policeOcr.ts) ve [server/konsimentoAnaliz.ts](../../../server/konsimentoAnaliz.ts) ile aynı.

- **Model:** `claude-opus-5`. Ayda ~11 fatura olduğu için maliyet ihmal edilebilir; tutarlar para anlamına geldiği için doğruluk önceliklidir.
- **Girdi:** PDF base64, `document` content bloğu olarak.
- **Çıktı:** structured output (`output_config.format` + JSON schema). Emin olunamayan alan `null` döner — **asla tahmin edilmez**.

### Çıkarılan alanlar
`fatura_no`, `fatura_tarihi`, `tedarikci_unvan`, `tedarikci_vkn`, `musteri_firma_adi`, `konteynerler[]`, `para_birimi`, `matrah`, `kdv_orani`, `kdv_tutari`, `tevkifat_tutari`, `odenecek_tutar`, `aciklama`

### Doğrulama — iki katman

1. **Metin kontrolü:** `pdf-parse` ile ham metin çıkarılır. LLM'in döndürdüğü her **tutar** ve `fatura_no`, ham metinde birebir (Türkçe binlik/ondalık ayraç normalize edilerek) geçmelidir. Geçmiyorsa halüsinasyon sayılır.
2. **Aritmetik kontrolü:** `matrah + kdv_tutari − tevkifat_tutari == odenecek_tutar` (±0,01 tolerans).

İkisinden biri tutmazsa kayıt `durum = 'dogrulama_hatasi'` ile kuyruğa düşer, Paraşüt'e yazılmaz. Operasyon ekranda PDF'i açıp elle düzeltir.

### Gerçek örnek (doğrulama referansı)

```
GIB2026000000023
  matrah          10.000,00
  kdv_orani       20
  kdv_tutari       2.000,00
  tevkifat_tutari    400,00   (KDV'nin 2/10'u — taşımacılık tevkifatı)
  odenecek_tutar  11.600,00   ✓ 10.000 + 2.000 − 400
```

KDV %0 (istisna) faturalar da var: matrah 7.000 → ödenecek 7.000.

### Paraşüt'e yazma (e-Arşiv kanalı)

Doğrulamayı geçen fatura `POST /purchase_bills#detailed` ile Paraşüt'e yazılır. Bu, bugün elle yapılan girişin yerini alır.

**Dedup — `filter[invoice_no]` olmadığı için üç katmanlı:**

1. Yerel: `nakliye_faturalari.faturaNo` unique → aynı PDF iki kez işlenmez
2. Uzak: yazmadan önce `GET /purchase_bills?filter[issue_date]=<fatura tarihi ±7 gün>` çekilir, dönen kayıtların `invoice_no`'ları arasında aynısı varsa **yazılmaz**; bunun yerine mevcut Paraşüt kaydının id'si `parasutPurchaseBillId` alanına bağlanır ve `durum = 'parasutta'` olur
3. Yazma başarılıysa dönen id hemen kaydedilir; ikinci deneme adım 2'de zaten yakalanır

Bu, **geçiş dönemini güvenli kılar**: muhasebeci elle girmeye devam etse bile sistem çift kayıt yaratmaz, mevcut kayda bağlanır. Elle giriş durduğunda adım 2 hiçbir şey bulmaz ve akış tam otomatik hale gelir.

**Alan eşlemesi:**

| Paraşüt alanı | Kaynak |
|---|---|
| `item_type` | `purchase_bill` |
| `issue_date` | `faturaTarihi` |
| `due_date` | `faturaTarihi` (vade bilgisi PDF'te yoksa aynı gün) |
| `invoice_no` | `faturaNo` |
| `currency` | `paraBirimi` (TRY → `TRL`) |
| `exchange_rate` | `kur` (TRY ise 1) |
| `withholding_rate` | gelen faturadaki tevkifat oranı — **alışta korunur** (gidenden farklı olarak) |
| `description` | `<açıklama> · PDF: <CNC url>/uploads/nakliye/<fatura_no>.pdf` |
| `details[]` | tek kalem: `quantity` 1, `unit_price` = matrah, `vat_rate` = `kdvOrani`, `vat_withholding_rate` = gelen orana göre |
| `supplier` | VKN ile `GET /contacts?filter[tax_number]=`; bulunamazsa **kuyruk** (cari otomatik yaratılmaz) |

**PDF eklenemez** — Paraşüt API'si dosya eki desteklemiyor. PDF `uploads/nakliye/` altında durur; Paraşüt tarafında `description` alanındaki bağlantı üzerinden erişilir.

---

## 8. Python poller — küçültme

`gmail_poller.py` ayrıştırmayı bırakır. Kalan tek işi:

1. IMAP ile `noreply@sysmond.com.tr`'den son 30 günün maillerini çek
2. Her PDF ekini `POST /api/nakliye/fatura-yukle`'ye multipart olarak gönder (mail `Message-ID` + ek adı ile birlikte)
3. Yanıtı log'la

Silinen: `pdftotext` çağrıları, `invoice_no`/`fatura_tarihi`/`odenecek`/`extract_containers`/`desc_guess` regex'leri, `psql` ile mevcut-fatura sorgusu, `/api/nakliye/webhook-receiver` ve `/api/nakliye/eslestir` POST'ları (~120 satır).

Dedup Node'a geçer: `nakliye_faturalari.faturaNo` unique. Mükerrer gönderim `already_exists` döner, poller bunu normal sayar. `Message-ID`+ek adı ikinci bir idempotans anahtarı olarak loglanır.

`/api/proxy/nakliye-upload` (ölü n8n proxy'si) **silinir**.

### Zamanlama — hangi iş nerede

| İş | Nerede | Sıklık |
|---|---|---|
| Mail'den PDF çekip yükleme | VPS cron → `gmail_poller.py` | saatlik (mevcut, değişmiyor) |
| Paraşüt poll + eşleştirme + fatura taslağı | Node içi zamanlayıcı | 15 dk |
| Eski `/api/nakliye/eslestir` | VPS cron | **kalır** — mevcut `nakliye_verileri` tablosu ve Nakliye sayfası korunduğu için geçmiş veri üzerinde çalışmaya devam eder. Yeni akışa dokunmaz. |

İki eşleştirici aynı anda yaşar ama farklı tablolara yazar (`nakliye_verileri` vs `nakliye_faturalari`); çakışma yok.

---

## 9. Eşleştirme

Mevcut mantık korunur ve genişletilir:

1. `konteynerler` alanından her konteyner normalize edilir (`[^A-Z0-9]` temizle, upper)
2. `gumruk_verileri.house_no` normalize edilip Map'e alınır (mevcut `getGumrukHouseNoVerileri` kullanılır)
3. Aday bulunursa:
   - Tek aday → skor 90, kaynak `konteyner`
   - Çok aday → `musteriFirmaAdi` ile `firma_unvan` benzerliği (Türkçe normalize: `A.Ş.`/`AŞ`, `LTD.ŞTİ.`/`LTD STI`, İ/I, boşluk/nokta) → eşleşen tek ise skor 95, kaynak `konteyner+firma`
   - Firma da kırmazsa → fatura tarihine en yakın tescil, skor 60, kuyrukta **onay bekler**
4. Bir kalem >1 beyannameye düşerse **otomatik bölüştürme yapılmaz**; kuyruğa gider
5. Hiç aday yoksa → kuyruk. `musteriFirmaAdi` doluysa firma + tarih penceresiyle aday beyanname **önerilir** (otomatik bağlanmaz)

Türkçe normalizasyon yardımcısı `shared/` altına konur, ileride tekrar kullanılabilir.

---

## 10. Satış faturası oluşturma

### Tetikleme

Beyanname bazında: **eşleşen ayrık konteyner sayısı == `gumruk_verileri.konteyner_sayisi`** olduğunda otomatik tetiklenir.

`konteyner_sayisi` boş veya 0 olan beyanname otomatik tetiklenemez (sayaç yoksa "tuttu" kararı verilemez) → kuyrukta bekler, operasyon elle tetikler.

Aynı `gumrukDosyaNo` için ikinci taslak yazılmaz (unique index). Taslak oluştuktan sonra yeni fatura eşleşirse kayıt `revizyon_gerekli` olarak işaretlenir ve kuyruğa düşer — taslak henüz resmileşmediği için `PUT /sales_invoices/{id}` ile güncellenebilir (Faz 2).

### Müşteri

`gumruk_verileri.vn` (VKN) → `GET /contacts?filter[tax_number]=`. Bulunamazsa fatura kesilmez, kayıt kuyruğa düşer. **Cari otomatik yaratılmaz.**

### Kalemler

Her eşleşen gelen fatura → bir kalem:

| Alan | Değer |
|---|---|
| `quantity` | 1 |
| `unit_price` | gelen faturanın `matrah` × **1,20** — KDV **hariç** bedel üzerinden %20. Kullanıcı tarafından teyit edildi (2026-07-30). Paraşüt'teki geçmiş faturalarda eklenen tutarların +1.500/+2.000/+2.500 çıkması muhasebecinin elle yuvarlamasından; kural %20'dir ve yuvarlama yapılmaz. |
| `vat_rate` | gelen faturanın `kdvOrani` (20 veya 0) |
| `vat_withholding_rate` | **0 — kodda sabit** |
| `description` | `<tedarikçi> · <fatura no> · <konteyner>` |
| `product` | mevcut **`NAKLİYE BEDELİ`** ürünü, id `8644976` (`.env` → `PARASUT_NAKLIYE_URUN_ID`). Ürünün üzerindeki %18 KDV önemsiz — oran kalem seviyesinde veriliyor |

Fatura seviyesi: `withholding_rate: 0` (kodda sabit), `item_type: "invoice"`, `currency` gelen faturayla aynı, `issue_date` bugün, `tags` → beyanname `dosya_no`.

> **Tevkifat sabiti gerekçesi:** gelen faturada KDV tevkifatı olabilir; giden faturada asla yoktur. Bu değer gelen faturadan **türetilmez**, kodda sabittir ve yorumla gerekçelendirilir — aksi halde ileride "gelen faturayı birebir yansıtalım" refactor'ü sessizce tevkifatlı fatura kesmeye başlar.

### Doğrulama örneği

Gelen: matrah 10.000, KDV %20 → 2.000, tevkifat 400, ödenecek 11.600
Giden: **matrah 12.000 + KDV 2.400 = 14.400**, tevkifat yok

### Resmileştirme

**Yapılmaz.** `POST /sales_invoices` ile taslak Paraşüt'e yazılır ve orada bekler. `POST /e_invoices` / `POST /e_archives` çağrılmaz.

Gerekçe: `sales_invoices` kaydı geri alınabilir (`DELETE`, `/cancel` var); `e_invoices` ile resmileştirme geri alınamaz — GİB'e gider. Faz 1'de sistemin yapabileceği en kötü hata "yanlış taslak"tır.

---

## 11. Arayüz — `/nakliye-faturalari`

Yeni sayfa. `pageTitles` ve `<Switch>`'e [client/src/App.tsx](../../../client/src/App.tsx) içinde eklenir. Mevcut Nakliye sayfasına dokunulmaz.

Üç sekme:

1. **Gelen Faturalar** — tarih, tedarikçi, fatura no, matrah, KDV, ödenecek, konteynerler, eşleşme durumu, kaynak rozeti (e-Arşiv / e-Fatura), PDF linki
2. **Kuyruk** — doğrulama hatası / eşleşmeyen / çok adaylı / VKN bulunamayan / `konteyner_sayisi` boş. Her satırda PDF önizleme, alanları elle düzeltme, beyanname seçici (mevcut combobox kalıbı: `cmdk` + `shouldFilter={false}` + Türkçe filtre)
3. **Kesilen Taslaklar** — dosya no, müşteri, kalem sayısı, net toplam, Paraşüt linki, durum

---

## 12. Hata yönetimi ve gözlemlenebilirlik

- Her kayıt bir `durum` + `hataMesaji` taşır; hiçbir hata sessizce yutulmaz
- Zamanlayıcı bir turda hata alırsa o kaydı işaretler ve diğerlerine devam eder
- `PUT`/`PATCH` uçlarında storage dönüşü null-check edilip `404 { error: "Bulunamadı" }` döner (repo kuralı)
- N+1 önlemi: `inArray(...)` veya iki-sorgu + Map join (repo kuralı)
- Paraşüt kimlik bilgisi yoksa: fail-closed, log'a tek satır, mevcut akışlar etkilenmez

---

## 13. Riskler ve açık noktalar

| Risk | Durum |
|---|---|
| `house_no` doluluk oranı %1-3 → otomatik eşleşme tavanı düşük | Kabul edildi. Kuyruk ekranı ana çalışma yüzeyi olacak. `musteriFirmaAdi` ile aday önerme bunu kısmen telafi eder |
| `konteyner_sayisi` %30 dolu → otomatik tetikleme sınırlı | Boş olanlar kuyrukta bekler, operasyon tetikler |
| LLM halüsinasyonu | İki katmanlı doğrulama (metin + aritmetik); tutmazsa Paraşüt'e yazılmaz |
| ~~Paraşüt webhook varlığı~~ | **Kapandı** — `GET /webhooks` 404. Webhook yok, polling kalıcı |
| ~~`CLIENT_ID`/`CLIENT_SECRET`~~ | **Kapandı** — alındı, `.env`'de. Token akışı canlıda doğrulandı |
| ~~"Nakliye Hizmeti" ürünü~~ | **Kapandı** — mevcut `NAKLİYE BEDELİ` (id 8644976) kullanılacak |
| Elle giriş ile çakışma (geçiş dönemi) | Üç katmanlı dedup (bölüm 7). Elle girilmiş kayıt bulunursa yazılmaz, mevcut kayda bağlanır |
| PDF Paraşüt'e eklenemez | API desteklemiyor. PDF `uploads/nakliye/` altında; Paraşüt `description` alanına CNC bağlantısı yazılır |
| `refresh_token` rotasyonu | Eşzamanlı yenileme zinciri koparabilir. Tek yazıcı + transaction; koparsa tek seferlik `authorization_code` akışı tekrarlanır |
| Poller küçültme sırasında kesinti | Yeni uç canlıya çıktıktan sonra poller güncellenir; `faturaNo` unique olduğu için çift çalışma zarar vermez |

---

## 14. Fazlar

**Faz 1 (bu spec)**
1. Şema + storage katmanı
2. Paraşüt istemci katmanı (token, throttle, JSON:API)
3. PDF analiz + doğrulama
4. `/api/nakliye/fatura-yukle` ucu + poller küçültme
5. `purchase_bills` poll (e-Fatura kanalı) + `POST purchase_bills` (e-Arşiv kanalı)
6. Eşleştirme motoru
7. Satış faturası taslağı
8. `/nakliye-faturalari` ekranı

**Faz 2 (sonra)**
- Otomatik resmileştirme: `POST /e_invoices` veya `/e_archives` + `trackable_jobs` polling + PDF indirme/arşivleme
- Taslak revizyonu (`PUT /sales_invoices/{id}`)
- Nakliye dışı masraf türleri
- Webhook (varsa)
