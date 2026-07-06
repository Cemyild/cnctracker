# Operasyon Kasası (Şube Masraf) — Tasarım

**Tarih:** 2026-07-06
**Durum:** Onaylandı (yaklaşım A + tüm kararlar kullanıcıyla netleştirildi)
**Önkoşul:** Ödemeler Portalı canlıda (roller temsilci/muhasebe; F1.11 kayıtlı firma listesi mevcut).

## 1. İhtiyaç

Şube operasyon ofisleri, müşteriler adına ödemeleri **kendileri** yapıyor. Gün
başında muhasebe onlara **avans** yolluyor; operasyon bu avanstan ödemelerini
yapıp her ödemeyi **kaydediyor** (talep/onay değil — yapılmış ödemenin kaydı).
Gün sonunda operasyon hesap veriyor: kalan **+/- bakiye bir sonraki güne devreder**,
muhasebe gün sonu raporunu alır. Bu, standart bir **imprest (sabit avans/kasa)
defteri**dir.

## 2. Kararlar (kullanıcıyla netleştirildi)

1. **Yeni rol:** `operasyon` (üçüncü portal rolü). Muhasebe tarafındaki sekme adı
   **"Şube Masraf"** (rol içeride `operasyon`, muhasebe etiketi "Şube Masraf").
2. **Para birimi:** yalnız **TL**, tek sürekli bakiye (çoklu döviz yok).
3. **Masraf kaydı alanları:** temsilci masrafıyla aynı set (beyanname/dosya-yok,
   masraf türü, tutar, alacaklı, IBAN opsiyonel, açıklama) + **belge (fiş/fatura)
   ZORUNLU**. Talep/onay YOK — kayıt anında bakiyeden düşer.
4. **Alacaklı:** F1.11 kayıtlı firma listesinden öneri/seçim + serbest yazım
   (temsilci formundaki datalist mantığı).
5. **Yaklaşım A:** hareket tabanlı defter + kapanış-snapshot. "Gün", takvimden çok
   bir **kapanış olayıyla** tanımlanır (`kapanisId` null=açık, dolu=kilitli).
6. **Gün kapanışı:** operasyon kapatır → o güne ait açık hareketler kilitlenir +
   snapshot rapor muhasebeye düşer + kapanış bakiyesi devreder. **Muhasebe
   gerekirse günü "geri açabilir"** (operasyona düzeltme izni).
7. **Muhasebe görünürlüğü:** tam şeffaflık — her operasyonun **canlı bakiyesi** +
   **gün içi masraf/avans akışı** + kapanmış gün raporları; avans yükleme.

## 3. Rol & Yetki

- `shared/schema.ts`: `portalKullanicilar.rol` yorumu `'temsilci' | 'muhasebe' | 'operasyon'`.
- `server/portalAuth.ts`: yeni `requireOperasyon` (requireMuhasebe eşi;
  `portalRol !== "operasyon"` → 403). Muhasebe uçları `requireMuhasebe` kalır.
- `client/.../PortalApp.tsx`: `PortalMe.rol` tipi `"temsilci" | "muhasebe" | "operasyon"`;
  varsayılan rota operasyon için `/portal/kasam`.
- `client/src/pages/Odemeler.tsx:197-201`: rol Select'ine `SelectItem value="operasyon">Operasyon</SelectItem>`;
  satır 277 rol gösterimine "Operasyon" eşlemesi.

## 4. Şema (`shared/schema.ts`)

Tutarlar `numeric(14,2)` (sürekli bakiye için tam SQL toplamı; giriş `parseTutar`
ile normalize edilir). Tarihler `text` YYYY-MM-DD (timezone tuzağı — `new Date(str)`
YOK). FK kolon adları açık snake_case string.

```ts
// Muhasebe → operasyon avans yüklemeleri
export const operasyonAvanslar = pgTable("operasyon_avanslar", {
  id, operasyonId: varchar("operasyon_id").notNull(),   // FK portal_kullanicilar.id
  tutar: numeric("tutar", { precision: 14, scale: 2 }).notNull(),
  aciklama: text("aciklama"),
  tarih: text("tarih").notNull(),                        // YYYY-MM-DD
  gonderenId: varchar("gonderen_id").notNull(),          // muhasebe kullanıcı
  kapanisId: varchar("kapanis_id"),                      // null=açık, dolu=kilitli
  olusturma: timestamp("olusturma").defaultNow(),
}, (t) => [index("IDX_op_avans_operasyon").on(t.operasyonId)]);

// Operasyonun yaptığı ödemelerin kaydı (belge zorunlu)
export const operasyonMasraflar = pgTable("operasyon_masraflar", {
  id, operasyonId: varchar("operasyon_id").notNull(),
  beyannameId: varchar("beyanname_id"),                  // nullable
  dosyaYok: boolean("dosya_yok").notNull().default(false),
  masrafTuru: text("masraf_turu"),
  tutar: numeric("tutar", { precision: 14, scale: 2 }).notNull(),
  alacakli: text("alacakli").notNull(),
  iban: text("iban"),
  aciklama: text("aciklama"),
  tarih: text("tarih").notNull(),                        // YYYY-MM-DD
  belgeDosya: text("belge_dosya").notNull(),             // uploads/operasyon/... (ZORUNLU)
  belgeAdi: text("belge_adi").notNull(),                 // orijinal dosya adı
  kapanisId: varchar("kapanis_id"),                      // null=açık, dolu=kilitli
  olusturma: timestamp("olusturma").defaultNow(),
}, (t) => [index("IDX_op_masraf_operasyon").on(t.operasyonId)]);

// Gün kapanış snapshot'ı (değişmez rapor)
export const operasyonGunKapanis = pgTable("operasyon_gun_kapanis", {
  id, operasyonId: varchar("operasyon_id").notNull(),
  gunTarihi: text("gun_tarihi").notNull(),               // YYYY-MM-DD (kapanış günü)
  kapanisZamani: timestamp("kapanis_zamani").defaultNow(),
  acilisBakiye: numeric("acilis_bakiye", { precision: 14, scale: 2 }).notNull(),
  avansToplam: numeric("avans_toplam", { precision: 14, scale: 2 }).notNull(),
  masrafToplam: numeric("masraf_toplam", { precision: 14, scale: 2 }).notNull(),
  kapanisBakiye: numeric("kapanis_bakiye", { precision: 14, scale: 2 }).notNull(),
  durum: text("durum").notNull().default("kapali"),      // kapali | geri_acildi
  geriAcanId: varchar("geri_acan_id"),                   // muhasebe kullanıcı
}, (t) => [index("IDX_op_kapanis_operasyon").on(t.operasyonId)]);
```

Insert Zod şemaları `insert<Entity>Schema` kalıbıyla. Belge diskte:
`multer.diskStorage` `uploadOperasyonBelge` → `uploads/operasyon/`; `/uploads` statik.

## 5. Bakiye ve Kapanış Mantığı (`server/storage.ts`)

- **Bakiye(operasyonId)** = `SUM(operasyon_avanslar.tutar) − SUM(operasyon_masraflar.tutar)`
  (TÜM satırlar; açık+kapalı). Sürekli, eksiye düşebilir. `getOperasyonBakiye(id)`.
- **Açık hareketler** = `kapanisId IS NULL` avans+masraf (o operasyon için).
- **avansYukle(operasyonId, tutar, aciklama, gonderenId)** → satır ekler (tarih=bugün,
  kapanisId=null).
- **masrafKaydet(operasyonId, {…, belge})** → satır ekler (kapanisId=null); belge zorunlu.
- **gunuKapat(operasyonId)** → açık avans+masraf topla; `avansToplam`/`masrafToplam`;
  `kapanisBakiye = getOperasyonBakiye`; `acilisBakiye = kapanisBakiye − (avansToplam −
  masrafToplam)`; `operasyon_gun_kapanis` snapshot oluştur (durum=kapali); o açık
  satırlara `kapanisId` yaz (kilitle). Açık hareket yoksa 400 ("kapatılacak hareket yok").
- **geriAc(kapanisId, geriAcanId)** → durum=`geri_acildi`, geriAcanId set; o snapshot'a
  bağlı satırların `kapanisId`'sini null'a çek (kilit açılır). Snapshot denetim için kalır.
- Kilitli (kapanisId dolu) satır silinemez (`masrafSil` kilitliyse 409). Düzeltme:
  operasyon açık masrafı siler + yeniden kaydeder (ayrı güncelleme ucu yok — YAGNI).

## 6. API (`server/routes.ts`)

**Operasyon (requireOperasyon):**
- `GET /api/portal/operasyon/ozet` → { bakiye, acikAvanslar[], acikMasraflar[] (belge linkleriyle) }.
- `POST /api/portal/operasyon/masraf` (uploadOperasyonBelge.single("belge")) → masraf
  kaydet; belge yoksa 400; dosyasız modda açıklama zorunlu.
- `DELETE /api/portal/operasyon/masraf/:id` → yalnız kendi + açık (kilitli 409).
- `POST /api/portal/operasyon/gunu-kapat` → gunuKapat(ben).
- `GET /api/portal/operasyon/kapanislar` → kendi kapanış raporları (snapshot + satırlar).

**Muhasebe (requireMuhasebe):**
- `GET /api/portal/operasyon-takip` → operasyon kullanıcıları + canlı bakiye + bugün harcanan.
- `GET /api/portal/operasyon-takip/:operasyonId` → o operasyonun açık akışı + kapanış raporları.
- `POST /api/portal/operasyon-takip/:operasyonId/avans` → avansYukle.
- `POST /api/portal/operasyon-takip/kapanis/:kapanisId/geri-ac` → geriAc.

Beyanname/masraf türü/firma önerisi uçları mevcut (`/api/portal/{beyannameler,
masraf-turleri,odeme-sirketleri}`) — operasyon rolü de okuyabilmeli (bunlar
`requirePortal`; operasyon da portal kullanıcısı → erişir).

## 7. Frontend — Operasyon Ekranları

Sidebar (rol=operasyon): **Kasam** (`/portal/kasam`), **Kapanışlarım** (`/portal/kapanislarim`).

**Kasam (`OperasyonKasaSayfasi.tsx`):**
- Üstte büyük **canlı bakiye** kartı (+ bugün açık masraf/avans toplamı).
- **Ödeme Kaydet** formu: temsilci masrafıyla aynı alanlar (beyanname arama/seç +
  dosya-yok, masraf türü, tutar, alacaklı [firma datalist + benzerlik], IBAN,
  açıklama) + **belge (zorunlu)**. Kaydet → masraf oluşur, bakiye düşer, form sıfırlanır.
- Altta **açık hareketler** listesi (avanslar + masraflar, tarih/tutar/alacaklı/belge;
  masrafta "Kaldır" — yalnız açık).
- **"Günü Kapat"** butonu → özet dialog (açılış/avans/masraf/kapanış) → onayla.
- 10 sn canlı tazeleme (mevcut portal polling kalıbı).

**Kapanışlarım (`OperasyonKapanislarSayfasi.tsx`):** geçmiş kapanış raporları (salt-okunur;
açılış/avans/masraf/kapanış + masraf listesi; geri açıldıysa "geri açıldı" rozeti).

## 8. Frontend — Muhasebe "Şube Masraf"

Muhasebe sidebar'ına yeni sekme **"Şube Masraf"** (`/portal/sube-masraf`).

**`OperasyonTakipSayfasi.tsx`:**
- Operasyon kullanıcıları listesi: her biri **canlı bakiye** + bugün harcanan +
  "Avans Yükle" + "Detay".
- **Avans Yükle** dialog: operasyon (seçili), tutar, açıklama → gönder.
- **Detay** (operasyon seçilince): **gün içi açık akış** (avans+masraf canlı) +
  **kapanmış gün raporları** (açılış/avans/masraf/kapanış + masraf belgeleri);
  kapanmış günde **"Geri Aç"** butonu.

## 9. Kapsam / Kapsam Dışı

- Değişen/eklenen: `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`,
  `server/portalAuth.ts`, `client/src/pages/Odemeler.tsx` (rol), `PortalApp.tsx`,
  `PortalSidebar.tsx`, yeni `OperasyonKasaSayfasi.tsx` / `OperasyonKapanislarSayfasi.tsx`
  / `OperasyonTakipSayfasi.tsx`. Temsilci/gümrük ana uygulaması değişmez.
- Çoklu döviz, avans onay akışı, operasyonun avans talep etmesi, PDF rapor çıktısı:
  kapsam dışı (gerekirse sonra).
- Operasyonun beyanname görünürlüğü: tüm beyannameler (temsilcideki AV filtresi
  operasyona uygulanmaz — şube tüm dosyalara ödeme yapabilir). Muhasebe gibi tam liste.

## 10. Doğrulama

- `npm run check` temiz.
- Storage duman testi: avans yükle → bakiye artar; masraf kaydet → bakiye düşer;
  gunuKapat → snapshot doğru (açılış/avans/masraf/kapanış), satırlar kilitli;
  ikinci masraf (kapanıştan sonra) yeni açık batch; geriAc → kilit açılır, snapshot
  geri_acildi; kilitli masraf silme 409; bakiye eksiye düşebilir.
- Playwright: operasyon girişi → masraf (belge) kaydet → bakiye düşer → günü kapat →
  muhasebe "Şube Masraf"ta bakiye + rapor görür → geri aç → operasyon düzeltir.
- Tarih text YYYY-MM-DD (kayma yok); belge zorunluluğu sunucuda doğrulanır.
- `db:push` (3 yeni tablo) + `npm run build` temiz.
