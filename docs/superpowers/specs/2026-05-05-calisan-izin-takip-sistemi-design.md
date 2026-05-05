# Çalışan İzin Takip Sistemi — Tasarım Dokümanı

**Tarih:** 2026-05-05
**Hedef:** Çalışanlar sayfasına yıllık izin + mazeret takibi, klasik aylık takvim görünümü ve net maaş bazlı paraya çevirme hesaplayıcısı eklemek.

---

## 1. Hedef ve Kapsam

### Çözülen problem
Şirkette yıllık izin ve mazeret günleri Excel/zihinde takip ediliyor. Sistem üzerinden:
- Her çalışanın TR İş Kanunu'na göre hak ettiği yıllık izin günleri otomatik hesaplansın
- Aylık takvim görünümünden kim hangi gün izinli görülsün
- Bir çalışan iznini kullanmayıp çalışmayı tercih ederse, güncel net maaşına göre hak ettiği ek ödeme tutarı hesaplansın

### Mod: A (Sadece İzleme)
- Tek admin (mevcut auth modeli) tüm girişi/yönetimi yapar
- Çalışan self-service yok, talep akışı yok, onay süreci yok
- Bordro entegrasyonu yok — paraya çevirme tutarı sadece bilgi/hesaplayıcı

### İzin türleri: B (Yıllık + Mazeret)
- **Yıllık ücretli izin:** bakiyeden düşer
- **Mazeret/Diğer:** kayıt tutar ama bakiyeden düşmez (rapor, vefat, evlilik, doğum, babalık vs. tek kategori altında)

### Tarih sayımı: A (TR yasal — iş günü)
- Hafta sonu (Cmt-Paz) izinden düşmez
- Resmi tatiller izinden düşmez (sistemde tablo)
- **Tam gün sayımı (yarım gün YOK)**

### Paraya çevirme: Sadece Net
- `günlük net = aylık net / 30`
- `ek ödeme = günlük net × kullanılmayan gün`
- Brüt/işveren maliyeti gösterilmez (gereksiz karmaşa)

### Bakiye yönetimi
- **Açılış bakiyesi:** her çalışan için manuel girilen "1 Ocak 2026 itibarıyla X gün bakiyesi vardı" değeri
- **Devir:** tam (yasal) — kullanılmayan günler her yıl devreder, sınır yok

---

## 2. Veri Modeli

### Yeni tablo: `calisan_izinler`

Her izin kaydı bir satır.

| Alan | Tip | Açıklama |
|---|---|---|
| `id` | varchar (uuid) | PK |
| `tcNo` | text | Çalışan referansı (calisanlar.tcNo) |
| `baslangicTarihi` | text (YYYY-MM-DD) | Dahil |
| `bitisTarihi` | text (YYYY-MM-DD) | Dahil |
| `tur` | text | 'YILLIK' \| 'MAZERET' |
| `gunSayisi` | integer | Otomatik hesaplanan iş günü (cached) |
| `aciklama` | text (nullable) | Serbest text (örn. "doktor randevusu", "vefat") |
| `parayaCevrildi` | boolean | true: izin kullanılmadı, yerine ek ödeme |
| `parayaCevrilenTutar` | decimal(15,2) (nullable) | Net ödeme tutarı (parayaCevrildi=true ise) |
| `olusturmaTarihi` | timestamp default now() | |

İndeksler:
- `tcNo` (sorgu performansı için)
- `(yil, ay)` gerekiyorsa hesaplanmış kolon yerine sorgular `baslangicTarihi` aralığı ile yapılır

### Yeni tablo: `calisan_izin_acilis_bakiyesi`

Sistem öncesi tarihte her çalışanın bakiyesi.

| Alan | Tip | Açıklama |
|---|---|---|
| `id` | varchar (uuid) | PK |
| `tcNo` | text UNIQUE | Çalışan referansı |
| `acilisTarihi` | text (YYYY-MM-DD) | Genelde '2026-01-01' |
| `acilisBakiyesi` | integer | "Bu tarihte X gün bakiyesi vardı" — negatif olabilir |
| `not` | text (nullable) | Opsiyonel açıklama |

### Yeni tablo: `resmi_tatiller`

| Alan | Tip | Açıklama |
|---|---|---|
| `id` | varchar (uuid) | PK |
| `tarih` | text (YYYY-MM-DD) UNIQUE | |
| `ad` | text | "19 Mayıs Atatürk'ü Anma", "Ramazan Bayramı 1. Gün" |
| `yil` | integer | Sorgu performansı için |

İndeks: `yil`

### Mevcut `calisanlar` tablosu DEĞİŞMEZ
- `isGirisTarihi` zaten var, kıdem hesabı için yeterli
- `netUcret` zaten var, paraya çevirme için yeterli

---

## 3. Hesaplama Mantığı

### Kıdem yılı hesabı

```ts
function kidemYili(iseGirisTarihi: string, refTarihi: Date = new Date()): number {
  // YYYY-MM-DD parse, refTarihi'ye göre tam yıl farkı
  // Örn: 2018-03-15 → 2026-05-05 = 8 yıl
}
```

### Yıllık hak hesabı (TR İş Kanunu m.53)

```ts
function yillikIzinHakki(kidem: number): number {
  if (kidem >= 15) return 26;
  if (kidem >= 5) return 20;
  if (kidem >= 1) return 14;
  return 0; // 1 yıl dolmadan yıllık izin hakkı yok
}
```

**Not:** İlk yıl içinde işe başlama (orantılı hak) bu sürümde gösterilmez — TR yasal olarak 1 yıl dolması beklenir, bu mantığa uyulur.

### Bakiye formülü

**Hak edilen hesabı (yıllık eklemeli):**
Bir çalışanın hak edilen toplamı, açılış tarihinden referans tarihine kadar geçen **her tam çalışma yılı** için o yıldaki kıdem aralığına göre eklenir.

Örnek (işe giriş 2018-03-15, ref tarihi 2026-05-05):
- 1. yıl (2019-03-15): kıdem 1 → +14 gün
- 2. yıl (2020-03-15): kıdem 2 → +14 gün
- 3. yıl (2021-03-15): kıdem 3 → +14 gün
- 4. yıl (2022-03-15): kıdem 4 → +14 gün
- 5. yıl (2023-03-15): kıdem 5 → +20 gün (kademe değişti)
- 6. yıl (2024-03-15): kıdem 6 → +20 gün
- 7. yıl (2025-03-15): kıdem 7 → +20 gün
- 8. yıl (2026-03-15): kıdem 8 → +20 gün
- Toplam yasal hak: 4×14 + 4×20 = 136 gün

**Sistem hak edilen:** Bu yasal hakkın **sadece açılış tarihinden (2026-01-01) sonraki kısmı** sayılır. Daha önceki kazanım `acilisBakiyesi`'ne dahil edilmiş varsayılır.

```
sistemHakEdilen = açılış tarihi sonrası her tam yıl dolmasında o yılki yillikIzinHakki(kidem)

hakEdilen   = acilisBakiyesi + sistemHakEdilen

kullanilan  = SELECT SUM(gunSayisi) FROM calisan_izinler
              WHERE tcNo = X AND tur = 'YILLIK'
              -- parayaCevrildi=true OLANLAR DA dahil (bakiyeden düşer)

guncelBakiye = hakEdilen - kullanilan
```

**Yıl parametresi (`?yil=` opsiyonel):**
- Verilmezse: bugüne kadar kümülatif (default davranış, kart görünümü için)
- Verilirse: o yıl sonuna kadar projeksiyon (rapor/planlama için)

### İş günü hesabı (yeni izin eklenirken)

```ts
function isGunuSayisi(bas: string, bit: string, resmiTatiller: Set<string>): number {
  let count = 0;
  let cur = parse(bas);
  const end = parse(bit);
  while (cur <= end) {
    const dow = cur.getDay(); // 0=Paz, 6=Cmt
    const iso = format(cur, 'yyyy-MM-dd');
    if (dow !== 0 && dow !== 6 && !resmiTatiller.has(iso)) {
      count++;
    }
    cur = addDays(cur, 1);
  }
  return count;
}
```

İzin DB'ye yazılmadan önce `gunSayisi` hesaplanır, kaydedilir (cached). Resmi tatil tablosu sonradan değişirse eski kayıtlar güncellenmez (snapshot).

### Paraya çevirme tutarı

```ts
function parayaCevirmeHesabi(aylikNet: number, gunSayisi: number): number {
  return (aylikNet / 30) * gunSayisi;
}
```

`aylikNet` çalışanın **son bordrodaki** netUcret değerinden alınır (mevcut `calisanlar` tablosu, en yeni kayıt).

### Edge case'ler
- **Yıl ortasında işe başlama:** İlk yıl tamamlanmadan yıllık hak yok → bakiye 0 (sadece açılış bakiyesi varsa).
- **"Aktif çalışan" tanımı:** `calisanlar` tablosunda **(yıl, ay) en yeni** kayıttaki tcNo listesinde olan kişi. Yani "son yüklenen ay bordrosunda yer alan" çalışan = aktif. Mart bordrosu yüklenmiş ama Şubat'ta olup Mart'ta olmayan kişi = ayrılmış sayılır.
- **Ayrılmış çalışan:** Bakiye/izin görünmez (varsayılan), filtre ile gösterilebilir. Yeni izin eklenemez (UI'da çalışan dropdown'ında listelenmez).
- **Açılış bakiyesi negatif:** İzin verilir (geçmişte hak ettiğinden fazla kullanmış varsayımı, kullanıcı bilinçli giriyor).
- **İki izin tarih çakışması:** Aynı çalışan, çakışan tarih → POST endpoint'te validation **uyarı** (engellenmez, kullanıcı manuel onaylar). Yarım gün desteklenmediği için bu pratik olarak nadir.
- **Resmi tatil sonradan eklenirse:** Eski izin kayıtlarının `gunSayisi` değeri yeniden hesaplanmaz (cached snapshot). Doğru davranış, çünkü çalışan o gün izinli olmuştu — değişen bir şey yok.
- **`gunSayisi` = 0 olan izin:** Tüm tarihler hafta sonu/resmi tatil → uyarı + onay (engellenmez, kullanıcı bilinçli olarak "bilgi notu" amaçlı kaydediyor olabilir).
- **`netUcret` boş** (mevcut çalışan ama bordro yüklenmemiş): Paraya çevirme hesabı 0 gösterir, ek ödeme alanı disabled.
- **`isGirisTarihi` boş:** Kıdem 0 sayılır, yıllık hak 0 olur. UI'da uyarı: "İşe giriş tarihi girilmemiş, bakiye hesaplanamaz."

---

## 4. API Endpoint'leri

### CRUD
```
GET    /api/izinler?yil=&tcNo=&tur=          ← liste, opsiyonel filtre
POST   /api/izinler                          ← yeni, gunSayisi otomatik
PUT    /api/izinler/:id                      ← güncelle (gunSayisi yeniden hesaplanır)
DELETE /api/izinler/:id
```

### Takvim (optimize)
```
GET    /api/izinler/takvim?yil=&ay=
       Response: [{ tcNo, adSoyad, tur, baslangicTarihi, bitisTarihi, aciklama }]
       Sadece o ay için aralığa düşen kayıtlar (start <= ayBitis AND end >= ayBaslangic)
```

### Bakiye
```
GET    /api/izinler/bakiye?yil=                       ← tüm aktif çalışanlar
GET    /api/izinler/bakiye/:tcNo?yil=                 ← tek kişi detay
       Response: {
         tcNo, adSoyad, isGirisTarihi, kidemYili, yillikHakki,
         acilisBakiyesi, hakEdilen, kullanilan, guncelBakiye,
         aylikNet, gunlukNet
       }
```

### Açılış bakiyesi yönetimi
```
GET    /api/izinler/acilis-bakiye                     ← liste (tüm tcNo'lar)
PUT    /api/izinler/acilis-bakiye/:tcNo               ← upsert
       Body: { acilisBakiyesi: number, not?: string }
```

### Resmi tatiller (read-only ilk versiyonda)
```
GET    /api/resmi-tatiller?yil=                       ← takvim render için
```

---

## 5. UI Yapısı

### Çalışanlar sayfasına entegrasyon
[client/src/pages/Calisanlar.tsx](../../client/src/pages/Calisanlar.tsx) içine üst seviyede 2 tab:
- **"Maaşlar"** — mevcut görünüm, hiçbir şey değişmez
- **"İzinler"** — yeni

### "İzinler" tab'ı içinde 3 alt-sekme

#### 5.1. Aylık Takvim (varsayılan)

Klasik 7 sütun × 5-6 satır Google Calendar tarzı görünüm.

- Sağ üst: **Ay/Yıl seçici** (← →) + mini özet ("Bu ay 4 kişi izinli, 12 toplam izin günü")
- Hücreler:
  - **Hafta sonu** → açık gri arka plan
  - **Resmi tatil** → koyu gri arka plan + tatil adı küçük yazı
  - **Bugün** → mavi border
- Hücre içeriği:
  - İlk 2 izin kişisi: `🔵 Onur K.` (yıllık) / `🟠 Şafak Ü.` (mazeret)
  - 3+ kişi varsa: `🔵 +3` rozeti
  - Hücreye tıklamak → **Gün Detay Modal** (o günkü tüm izinli kişiler + "yeni izin ekle" butonu, çalışan seçilebilir)
- Renk kodu: 🔵 yıllık (mavi), 🟠 mazeret (turuncu)

shadcn'in `Calendar` (react-day-picker) gerçek input için kullanılır ama görüntü için kendi grid'imizi yazıyoruz çünkü her güne çoklu kişi rozeti basmamız gerek.

#### 5.2. İzin Listesi

Sortable tablo (gümrük gider tablosu pattern'i):

| Çalışan | Tür | Başlangıç | Bitiş | İş Günü | Açıklama | Paraya Çevrildi | Tutar | İşlem |
|---|---|---|---|---|---|---|---|---|

Üst filtre satırı: Yıl, Çalışan (search/select), Tür, Şube, paraya çevrildi mi
Sağ üst: **"Yeni İzin Ekle"** (yeşil) + **"CSV İndir"**
Aksiyonlar: ✏️ düzenle, 🗑️ sil
Sticky header, zebra striping, kompakt padding (gümrük tablosundaki tasarım)

#### 5.3. Bakiye Yönetimi

Aktif çalışanlar için kart grid (3 kolon @ desktop):

```
┌─────────────────────────────────────┐
│ ONUR KARADAĞ                        │
│ İşe giriş: 15.03.2018 (8 yıl)       │
│ Yıllık hak: 20 gün/yıl              │
│                                     │
│ Açılış bakiyesi: 12 gün  [Düzenle]  │
│ Toplam hak edilen: 28 gün           │
│ Kullanılan: 6 gün                   │
│ ─────────────────────────────────── │
│ ★ Kalan bakiye: 22 gün              │
│                                     │
│ 💰 Paraya çevirme:                  │
│ Aylık net: 100.000 TL               │
│ Günlük net: 3.333,33 TL             │
│ [___] gün için: 0 TL ödeme          │
│ [İzin olarak işaretle]              │
│                                     │
│ [Yeni İzin Ekle]                    │
└─────────────────────────────────────┘
```

- Açılış bakiyesi düzenle → küçük inline input
- Paraya çevirme alanı → input + canlı hesap, "İzin olarak işaretle" butonu yeni izin kaydı oluşturur (parayaCevrildi=true)
- Aktif çalışan filtresi: son yüklenen ay bordrosundan gelen liste (mevcut kalıba uygun)
- Üstte search/sort: "Bakiyesi en yüksek", "ad-soyad", "şube"

### 5.4. Yeni İzin Ekle modal (3 sekmeden de açılır)

```
┌─────────────────────────────────────┐
│ İzin Ekle                          ×│
├─────────────────────────────────────┤
│ Çalışan: [▼ aktif liste]            │
│ Tür: ◯ Yıllık  ◯ Mazeret            │
│ Başlangıç: [📅 tarih seç]            │
│ Bitiş: [📅 tarih seç]                │
│ ──────────────────────────────────  │
│ ⓘ Hesaplanan iş günü: 6 gün         │
│   (11 takvim - 4 hafta sonu - 1 RT) │
│ ──────────────────────────────────  │
│ Açıklama (opsiyonel):               │
│ [_____________________________]     │
│                                     │
│ ☐ Bu izni paraya çevir              │
│   ↳ Hesaplanan ek ödeme: 20.000 TL  │
│                                     │
│           [İptal] [Kaydet]          │
└─────────────────────────────────────┘
```

Validasyon:
- Bitiş < Başlangıç → hata
- gunSayisi = 0 (tüm günler hafta sonu+RT) → uyarı + "yine de kaydet?"
- Aynı çalışan + çakışan tarih → uyarı + "yine de kaydet?" (engellenmez, kullanıcı manuel karar)
- Çalışan zorunlu, tarihler zorunlu, tür zorunlu

### 5.5. Gün Detay Modal (takvim hücresinden)

```
┌─────────────────────────────────────┐
│ 22 Mayıs 2026, Cuma                ×│
├─────────────────────────────────────┤
│ İzinli çalışanlar (3):              │
│ ─────────────────────────────────   │
│ 🔵 Onur Karadağ — Yıllık            │
│    15-22 Mayıs (6 gün) yaz tatili   │
│    [✏️ Düzenle] [🗑️ Sil]            │
│                                     │
│ 🟠 Şafak Üner — Mazeret             │
│    22 Mayıs (1 gün) doktor          │
│    [✏️ Düzenle] [🗑️ Sil]            │
│                                     │
│ ────────────────────────────        │
│ [+ Bu güne yeni izin ekle]          │
└─────────────────────────────────────┘
```

---

## 6. Resmi Tatil Seed

[server/storage.ts](../../server/storage.ts) içine bir `seedResmiTatiller()` fonksiyonu — app start'ta tablo boşsa doldurur.

Hard-coded tablo: 2024-2030 arası TR resmi tatilleri.

**Sabit (yıl bağımsız):**
- 1 Ocak — Yılbaşı
- 23 Nisan — Ulusal Egemenlik ve Çocuk Bayramı
- 1 Mayıs — Emek ve Dayanışma Günü
- 19 Mayıs — Atatürk'ü Anma, Gençlik ve Spor Bayramı
- 15 Temmuz — Demokrasi ve Milli Birlik Günü
- 30 Ağustos — Zafer Bayramı
- 28 Ekim (yarım) + 29 Ekim — Cumhuriyet Bayramı

**Hicri (yıl bazlı manuel):**
- 2026 Ramazan B.: 20-22 Mart
- 2026 Kurban B.: 27-30 Mayıs
- 2027, 2028, 2029, 2030 için Diyanet takviminden teyit edilip seed'e konulur

İlk versiyonda **kullanıcı düzenleme arayüzü yok** — bir tatih kaymışsa SQL update ile düzeltilir. V2'de basit admin sayfası eklenebilir.

---

## 7. Storage Katmanı

[server/storage.ts](../../server/storage.ts) içine eklenecek metodlar:

```
// İzinler
getIzinler(yil?, tcNo?, tur?): Promise<CalisanIzin[]>
getIzinlerForCalendar(yil, ay): Promise<CalisanIzin[]>  // tarih aralığı
insertIzin(data): Promise<CalisanIzin>
updateIzin(id, data): Promise<CalisanIzin>
deleteIzin(id): Promise<{success: boolean}>

// Bakiye
getIzinBakiye(yil, tcNo?): Promise<IzinBakiye[]>
  // tek bir SQL turuyla aktif çalışanların bakiyeleri

// Açılış bakiyesi
getAcilisBakiye(): Promise<AcilisBakiye[]>
upsertAcilisBakiye(tcNo, data): Promise<AcilisBakiye>

// Resmi tatiller
getResmiTatiller(yil?): Promise<ResmiTatil[]>
seedResmiTatiller(): Promise<void>  // app start'ta çağrılır
```

---

## 8. Yeni Bağımlılıklar

**Yok.** Mevcut paketler yeterli:
- `react-day-picker@^8.10.1` — tarih seçici (kurulu)
- `date-fns@^3.6.0` — tarih hesabı (kurulu)
- `@radix-ui/react-popover@^1.1.7` — popover (kurulu)

---

## 9. Test Stratejisi

Mevcut sistemde test runner yok (CLAUDE.md), bu nedenle **manuel test senaryoları**:

1. **Kıdem hesabı** — 2018-03-15 işe giriş + 2026-05-05 ref → 8 yıl → 20 gün/yıl
2. **İş günü hesabı** — 15-25 Mayıs 2026 (11 takvim, 4 hafta sonu, 19 Mayıs RT) → 6 gün
3. **Yıl ortası işe başlama** — 2025-08-01 işe giriş → 2026 başında 0 hak (1 yıl dolmadı)
4. **Açılış bakiyesi devir** — 2026-01-01 açılış 12 gün, hiç izin alınmamış, kıdem yılı sonunda 12+20=32 gün
5. **Paraya çevirme** — 100.000 TL net, 14 gün → (100.000 / 30) × 14 = 46.666,67 TL
6. **Çakışan izin** — POST validation, çakışırsa uyarı

---

## 10. Çıkarılan / V2'ye Bırakılan

- 18 yaş altı / 50 yaş üstü minimum 20 gün kuralı (çalışan tablosunda doğum tarihi yok)
- Şube/departman bazlı izin politikası
- E-posta/SMS bildirim
- Talep formu / onay süreci (mod B/C)
- Yarım gün izin (0.5 hassasiyet)
- Resmi tatil admin sayfası
- iCal export
- Bordro otomatik entegrasyonu (paraya çevirme tutarını otomatik bordroya ekleme)
- Yıllık özet PDF raporu

---

## 11. Yapılacaklar Sırası (özet — detaylı plan ayrı çıkacak)

1. Schema: 3 yeni tablo + Drizzle types
2. `npm run db:push`
3. Resmi tatil seed (server/storage.ts)
4. Hesaplama yardımcıları (shared/izinHesaplari.ts) — kıdem, hak, iş günü, paraya çevirme
5. Storage metodları
6. API endpoint'leri (server/routes.ts)
7. UI: Calisanlar.tsx içine üst tab + alt sekmeler
8. UI: Yeni izin modal + Gün detay modal + Bakiye kartları + Açılış bakiyesi düzenleme
9. Type-check + manuel test
10. Commit + push

---

## 12. Riskler ve Açık Noktalar

- **Resmi tatil tarihleri** — Hicri bayramlar manuel girildiği için 2030 sonrası boşluk olur. Notu kullanıcıya: "Yılbaşında bir kez güncelle".
- **Bakiye SQL performansı** — 60 çalışan × tüm geçmiş izinler bir sayfada → tek SQL turu yeterli. 500+ çalışana çıkarsa optimize gerekebilir.
- **Çalışan ayrılması** — Mevcut sistemde "ayrıldı" flag'i yok, son bordrodaki listeden türetiliyor. Yeniden işe alınma senaryosu için önemli; şimdilik son bordro listesi yeterli.
- **Tarih timezone** — Tüm tarihler `YYYY-MM-DD` text, `new Date()` kullanılmadan parse edilir (CLAUDE.md kuralı, gümrükteki off-by-one bug'ından öğrenildi).
