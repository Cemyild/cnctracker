# Müşteri Tahsilat Modülü — Yeniden Tasarım

**Tarih:** 2026-05-05
**Hedef:** Mevcut client-side Excel okuyucu sayfasını tam fonksiyonel, backend-bağlı, gümrük entegrasyonlu bir tahsilat takip sistemine dönüştürmek.

**Bu spec Sub-project 1'i kapsar.** Sub-project 2 (mizan diff, e-posta taslağı, yıllık rapor) ayrı brainstorm/spec/plan döngülerine bırakıldı.

---

## 1. Bağlam ve Çözülen Problem

### Mevcut sistemin sınırları
- `Tahsilat.tsx` (324 satır, tek dosya) — tamamen client-side
- Excel mizan yüklenir → tarayıcıda parse edilir → state'te tutulur → sayfa yenilenince kaybolur
- Backend desteği yok (`/api/tahsilat` endpoint'i yok)
- Tarihçe yok (trend, karşılaştırma, drill-down imkansız)
- Magic kolon haritası (C/H/L/M) — gerçek mizanın 19 kolonunu görmüyor
- Risk hesabı tek metrik (gecikme) — büyük müşteri / küçük müşteri ayrımı yok
- Müşteri eşleşmesi sadece string bazında — varyasyonlar parçalanır

### Yeni sistemin amacı
Kullanıcı haftalık veya 2 günde bir mizan yükler. Sistem:
1. Her mizan'ı snapshot olarak kalıcı saklar
2. Müşterileri **hesap kodu** (örn. `120-01-000-002`) ile sabit kimliklendirir
3. **4 metrik** üzerinden hibrit risk değerlendirmesi yapar
4. Gümrük modülündeki fatura verisi ile eşleştirip **Bakiye-Fatura Açığı** hesaplar
5. Trend, drill-down, sektör/firma grubu bazlı raporlama sunar

---

## 2. Anahtar Kararlar (brainstorming sonucu)

| Konu | Karar |
|---|---|
| **Müşteri kimliği** | Hesap kodu (`hesapKodu` UNIQUE — `120-01-000-002`) |
| **Saklama kapsamı** | Sadece 120- ile başlayan hesaplar (defansif filtre) |
| **Dönem yapısı** | Serbest tarih (`mizanTarihi YYYY-MM-DD`), aynı ay birden fazla snapshot |
| **Duplicate kontrolü** | MD5 hash bazında — uyarı gösterir, kullanıcı override edebilir |
| **Aktif/pasif** | `aktif` boolean YOK; `sonGoruldugu` timestamp + UI filtreleri |
| **Risk modeli** | Hibrit: 4 metrik + 5 pattern + 2 rozet |
| **Müşteri-Gümrük eşleştirme** | Otomatik fuzzy (Levenshtein) + manuel düzeltme + kalıcı hafıza (`gumrukFirmaUnvanlari` array) |
| **VIP eşiği** | Yıllık gümrük fatura toplamı > 5.000.000 TL (default, kullanıcı ayarlar) |
| **Yüksek bakiye eşiği** | Anlık net bakiye > 500.000 TL (default, kullanıcı ayarlar) |
| **Eski sayfa** | Tamamen yeniden yazılır, mevcut Tahsilat.tsx atılır |

---

## 3. Veri Modeli (4 yeni tablo)

### `musteriler`
```ts
{
  id: varchar (uuid PK)
  hesapKodu: text UNIQUE NOT NULL    // "120-01-000-002"
  ad: text NOT NULL                  // en son mizan'daki yazım
  sektor: text                       // "OTOMOTİV SEKTÖRÜ"
  firmaGrubu: text                   // R kolonu
  limit: decimal(15,2)               // P kolonu
  problemli: boolean default false   // O kolonu
  gumrukFirmaUnvanlari: text[] default '{}'  // gümrükteki eşleşen yazımlar
  sonGoruldugu: timestamp            // en son hangi snapshot'ta görüldü
  ilkGoruldugu: timestamp default now()
}
INDEX (hesapKodu)
INDEX (sonGoruldugu)
```

### `mizan_yuklemeleri`
```ts
{
  id: varchar (uuid PK)
  mizanTarihi: text NOT NULL         // YYYY-MM-DD
  filename: text NOT NULL
  filepath: text NOT NULL            // uploads/mizan/{yil}/{ay}/...
  sizeBytes: integer
  md5Hash: text                      // duplicate uyarısı için (UNIQUE değil)
  kayitSayisi: integer
  toplamNetBakiye: decimal(18,2)     // özet (signed)
  yuklemeTarihi: timestamp default now()
  not: text
}
INDEX (mizanTarihi DESC)
INDEX (md5Hash)
```

### `mizan_bakiye`
```ts
{
  id: varchar (uuid PK)
  mizanId: varchar FK → mizan_yuklemeleri NOT NULL
  musteriId: varchar FK → musteriler NOT NULL
  borc: decimal(18,2)                // F
  alacak: decimal(18,2)              // G
  bakiyeBorc: decimal(18,2)          // H
  bakiyeAlacak: decimal(18,2)        // I
  sonBakiye: decimal(18,2)           // J (signed: + borçlu, − alacaklı, K=B/A flag'i ile uygulanır)
  sonBakiyeBA: text                  // "B" veya "A"
  sonBorcTarihi: text                // L (YYYY-MM-DD)
  sonAlacakTarihi: text              // M (YYYY-MM-DD)
}
INDEX (musteriId, mizanId)            // trend sorgusu için
UNIQUE (mizanId, musteriId)           // bir snapshot'ta tek satır
```

### `mizan_eslestirme_log`
Onaylanmış (otomatik veya manuel) eşleştirmelerin geçmiş kaydı. Audit/debugging için.
```ts
{
  id: varchar (uuid PK)
  musteriId: varchar FK → musteriler NOT NULL
  gumrukUnvan: text NOT NULL
  eklemeTarihi: timestamp default now()
  eklemeTipi: text                   // 'auto-fuzzy' | 'manual'
  benzerlikSkoru: decimal(4,3)       // 0.000-1.000
}
INDEX (musteriId)
```

### `mizan_eslestirme_onerileri`
Skor 0.75-0.94 arası bekleyen öneriler. Kullanıcı onaylarsa `mizan_eslestirme_log`'a taşınır + müşteri.gumrukFirmaUnvanlari'ye eklenir. Reddederse silinir + bir daha önerilmemesi için kara listeye alınır (`reddedildi` flag).
```ts
{
  id: varchar (uuid PK)
  musteriId: varchar FK → musteriler NOT NULL
  gumrukUnvan: text NOT NULL
  benzerlikSkoru: decimal(4,3)
  olusturmaTarihi: timestamp default now()
  reddedildi: boolean default false  // true ise onerilerden çıkar ama tabloda kal
}
INDEX (musteriId, reddedildi)
UNIQUE (musteriId, gumrukUnvan)      // aynı öneri tekrar eklenmesin
```

### `tahsilat_ayarlari` (single-row config)
```ts
{
  id: varchar (uuid PK, sabit '00000000-0000-0000-0000-000000000001')
  vipEsik: decimal(18,2) default 5000000
  yuksekBakiyeEsik: decimal(18,2) default 500000
  eskiOdemeEsik: integer default 30      // gün
  cokEskiOdemeEsik: integer default 60   // gün
  eksiPozisyonYuzde: integer default 20  // %
  faturaPenceresi: integer default 90    // gün
  guncellenme: timestamp default now()
}
```

---

## 4. Hesap Mantığı (`shared/tahsilatHesaplari.ts`)

### Net bakiye (signed)
```ts
function netBakiye(b: { sonBakiye: number; sonBakiyeBA: string }): number {
  return b.sonBakiyeBA === 'A' ? -b.sonBakiye : b.sonBakiye;
}
```

### Son ödeme gecikmesi
```ts
function gecikme(sonAlacakTarihi: string | null, refTarih: string): number {
  if (!sonAlacakTarihi) return 9999; // hiç ödeme yapmamış
  return daysBetween(sonAlacakTarihi, refTarih);
}
```

### İş aktivitesi açığı
```ts
function isAktivitesiAcigi(sonBorc: string | null, sonAlacak: string | null): number {
  if (!sonBorc || !sonAlacak) return 0;
  return daysBetween(sonAlacak, sonBorc); // pozitifse "iş yapıyor para vermiyor"
}
```

### Bakiye-Fatura açığı
```ts
function bakiyeFaturaAcigi(netBakiye: number, faturaToplami: number): {
  acik: number;
  acikYuzde: number;
} {
  const acik = netBakiye - faturaToplami;
  const acikYuzde = faturaToplami > 0 ? (acik / faturaToplami) * 100 : 0;
  return { acik, acikYuzde };
}
```

### Risk profili
```ts
type RiskPattern = 'SAGLIKLI' | 'VIP_AKTIF_RISK' | 'TAKIP_GEREKEN' | 'YAVAS_ODEYICI' | 'DONUK_KAYIP';

function riskProfili(p: {
  netBakiye: number;
  gecikme: number;
  isAktivitesiAcigi: number;
  bakiyeFaturaAcikYuzde: number;
  yillikFaturaToplami: number;
  esikler: TahsilatAyarlari;
}): {
  pattern: RiskPattern;
  vipRozeti: boolean;
  yuksekBakiyeRozeti: boolean;
  eksiPozisyonRozeti: boolean;
} {
  const vipRozeti = p.yillikFaturaToplami > p.esikler.vipEsik;
  const yuksekBakiyeRozeti = p.netBakiye > p.esikler.yuksekBakiyeEsik;
  const eksiPozisyonRozeti = p.bakiyeFaturaAcikYuzde > p.esikler.eksiPozisyonYuzde;

  // Pattern karar ağacı (öncelik sırası)
  let pattern: RiskPattern;
  if (p.netBakiye <= 0) {
    pattern = 'SAGLIKLI'; // alacaklı veya sıfır → tahsilat sorunu yok
  } else if (p.gecikme >= p.esikler.cokEskiOdemeEsik && p.isAktivitesiAcigi >= p.esikler.cokEskiOdemeEsik) {
    pattern = 'DONUK_KAYIP'; // hem borç hem alacak çok eski
  } else if (p.gecikme >= p.esikler.eskiOdemeEsik && p.isAktivitesiAcigi < 0) {
    // Son borç son alacaktan yeni → iş yapıyor para vermiyor
    pattern = 'YAVAS_ODEYICI';
  } else if (vipRozeti && p.gecikme < p.esikler.eskiOdemeEsik) {
    pattern = 'VIP_AKTIF_RISK';
  } else if (p.gecikme >= 11 && p.gecikme < p.esikler.eskiOdemeEsik) {
    pattern = 'TAKIP_GEREKEN';
  } else {
    pattern = 'SAGLIKLI';
  }

  return { pattern, vipRozeti, yuksekBakiyeRozeti, eksiPozisyonRozeti };
}
```

### Pattern renk + etiket eşlemesi
| Pattern | Renk | Etiket |
|---|---|---|
| SAGLIKLI | 🟢 yeşil | "Sağlıklı Müşteri" |
| VIP_AKTIF_RISK | 🟦 mavi | "VIP — Büyük Aktif" |
| TAKIP_GEREKEN | 🟡 sarı | "Takip Gereken" |
| YAVAS_ODEYICI | 🟠 turuncu | "Yavaş Ödeyici" |
| DONUK_KAYIP | 🔴 kırmızı | "Donuk Alacak" |

Rozetler pattern üzerine binebilir: VIP 🌟, Yüksek Bakiye 💰, Eksi Pozisyon ⚡

---

## 5. Eşleştirme Algoritması (`server/eslestirme.ts`)

### Normalizasyon
```ts
function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[ışüöçğ]/g, c => ({ı:'i',ş:'s',ü:'u',ö:'o',ç:'c',ğ:'g'}[c]!))
    .replace(/\b(ltd|sti|aş|tic|san|paz|ve|şti)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

### Skor
```ts
function benzerlikSkoru(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.95;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}
```

### Eşik politikası
- `≥ 0.95` → otomatik eşleşme + log
- `0.75-0.94` → öneri kuyruğuna ekle
- `< 0.75` → eşleşme yok

### Mizan yüklenirken her yeni müşteri için
1. `musteri.gumrukFirmaUnvanlari` boşsa
2. Gümrükten son 1 yıllık unique `firmaUnvan`'ları çek (cache'le, tek sorgu)
3. Müşteri adıyla her birini skorla
4. En yüksek skor `≥ 0.95` → otomatik ekle
5. `0.75-0.94` → `mizan_eslestirme_onerileri` (geçici tablo değil, log + UI bekleyen liste)

---

## 6. Snapshot İşleme Akışı

```
POST /api/tahsilat/mizan/upload (multer memory)
1. Excel parse → MizanRow[] (sadece hesapKodu LIKE '120%')
2. md5Hash hesapla
3. duplicate check: aynı md5 var mı?
   → varsa response.duplicate = true (kullanıcı override edebilir)
4. Önizleme döner: { yeniMusteri, guncellenenMusteri, pasifOlanMusteri,
                      duplicate, otoEslesen, beklemedeOnay, satirlar }

POST /api/tahsilat/mizan/save (önceki upload'tan gelen payload)
1. transaction içinde:
   a. mizan_yuklemeleri'ne yeni kayıt
   b. Excel dosyasını uploads/mizan/{yil}/{ay}/{md5}-{filename} altına yaz
   c. Her satır için:
      - musteriler upsert (hesapKodu key) — ad/sektör/firmaGrubu/limit/problemli güncelle, sonGoruldugu = mizanTarihi
      - mizan_bakiye insert
      - eşleştirme önerileri tetikle (yeni müşteri için)
   d. response: { mizanId, eklenen, guncellenen, otoEslesen, beklemedeOnay }
```

---

## 7. API Endpoints (özet)

```
# Mizan
POST   /api/tahsilat/mizan/upload      ← parse + önizleme
POST   /api/tahsilat/mizan/save        ← onaylanan veriyi yaz
GET    /api/tahsilat/mizan             ← arşiv liste
GET    /api/tahsilat/mizan/:id         ← snapshot detay
DELETE /api/tahsilat/mizan/:id         ← snapshot + ilişkili bakiyeler

# Müşteri
GET    /api/tahsilat/musteriler?gorulme=&sektor=&risk=&search=  ← liste + filter
GET    /api/tahsilat/musteriler/:id           ← detay
GET    /api/tahsilat/musteriler/:id/timeline  ← line chart için
PUT    /api/tahsilat/musteriler/:id           ← manuel düzeltme

# Dashboard
GET    /api/tahsilat/dashboard?mizanId=  ← özet sayfası için
GET    /api/tahsilat/trend?ay=&yil=      ← genel trend grafiği

# Eşleştirme
GET    /api/tahsilat/eslestirme/onerileri      ← bekleyen fuzzy önerileri
POST   /api/tahsilat/eslestirme/onayla         ← öneriyi kabul et { musteriId, gumrukUnvan }
DELETE /api/tahsilat/eslestirme/:musteriId/:unvan ← eşleşmeyi kaldır
POST   /api/tahsilat/eslestirme/manuel-ekle    ← manuel ekle

# Ayarlar
GET    /api/tahsilat/ayarlar
PUT    /api/tahsilat/ayarlar
```

---

## 8. UI Yapısı

### Sayfa: `/tahsilat`

**Üst bar:**
```
Müşteri Tahsilat              [Mizan referans: 08.02.2026 ▼]  [📤 Mizan Yükle]
```

**5 ana sekme:**
1. 📊 Özet (default)
2. 👥 Müşteriler
3. 📈 Trend
4. ⚙ Eşleştirme
5. 📁 Arşiv

### Sekme 1: Özet

5 büyük kart üstte:
- 💰 Toplam Net Alacak
- 🌟 VIP Müşteri (sayı + toplam bakiye)
- 🟠 Yavaş Ödeyici (sayı + risk altındaki ciro)
- 🔴 Donuk/Kayıp (sayı + kayıp ciro)
- ⚡ Eksi Pozisyon (sayı + devreden gecikmiş borç)

Altta 2 panel:
- En kritik 10 müşteri (kompakt)
- Sektör bazlı dağılım (donut chart)

### Sekme 2: Müşteriler (ana çalışma ekranı)

Filtreler (üst):
- Risk profili (5 pattern)
- Rozetler (VIP / Yüksek Bakiye / Eksi Pozisyon)
- Sektör
- Firma grubu
- Görülme penceresi (yıl içinde / 30g / 90g / tüm zamanlar)
- Search

Sortable tablo:
| Müşteri (kod + ad) | Sektör | Net Bakiye | Son Borç | Son Ödeme | Gecikme | İş Akt. Açığı | Bakiye-Fatura % | Risk + Rozetler |

Sağ üst: 📥 CSV İndir | ⚙ Risk Eşikleri (modal)

Satır tıklama → Müşteri Drill-down Dialog

### Sekme 3: Trend

İki alt-tab:
- **Tek Müşteri**: müşteri seç → tarihsel bakiye line chart + son borç/alacak event marker'ları
- **Genel**: aylık ortalama bakiye + risk dağılım stack chart

### Sekme 4: Eşleştirme

İki bölüm:
- **Bekleyen Öneriler**: skor 0.75-0.94 olan eşleştirmeler için onay UI
- **Mevcut Eşleşmeler**: müşteri-gümrük unvan haritası (silme/manuel ekleme)

### Sekme 5: Arşiv

Tablo:
| Mizan Tarihi | Yükleme | Kayıt | Toplam Bakiye | Dosya | İndir | Sil |

### Mizan Yükleme Modal
- Mizan tarihi (dosya adından otomatik tahmin)
- Dosya seç
- Not (opsiyonel)
- "Önizle ve Yükle" → response detaylı önizleme + duplicate uyarısı
- "Onayla ve Kaydet" → atomik save

### Müşteri Drill-down Dialog
- Üst özet (4 metrik + risk profili + rozetler)
- Bakiye geçmişi line chart (tüm snapshot'lar)
- Tüm mizan kayıtları sortable tablo
- Eşleşen gümrük unvanları + manuel ekleme
- Manuel düzeltme (sektör/limit vs.)

---

## 9. Mizan Parser (`server/mizanParser.ts`)

Pattern: `pdf-parse` benzeri arayüz, `xlsx` lib ile.

```ts
export interface MizanRow { /* yukarıda detaylı */ }
export interface MizanParseSonuc {
  mizanTarihi: string | null;  // dosya adından çıkar, yoksa null
  satirlar: MizanRow[];
  toplamSatir: number;
  filtrelenenSatir: number;    // 120- ile başlamayan
  uyarilar: string[];
  toplamBorc: number;
  toplamAlacak: number;
}

export function parseMizanXlsx(buffer: Buffer, sheetName?: string): MizanParseSonuc;
```

- "Hesap Mizanı" sheet'ini bul (yoksa ilk sheet)
- Header satırını skip
- A kolonu `120-` ile başlamayan satırları filtrele (uyarı listesinde say)
- Tarih kolonları (L, M) `dd.MM.yyyy` → `YYYY-MM-DD` çevir
- Sayı parse: noktalı veya virgüllü Türkçe locale destek
- K kolonu boşsa varsayılan "B"

---

## 10. Performans Notları

- **Müşteri × bakiye join**: dashboard sorguları için tek SQL'de Map join (N+1 önlenir)
- **Gümrük fatura sorgusu**: tüm müşterilerin `gumrukFirmaUnvanlari` array'leri tek `IN` ile sorgulanır, group by, frontend Map ile dağıtılır
- **Mizan içinde 380 satır × günde 1-2 yükleme** = aylık ~10K satır → 1 yıl 120K → indeks varsa hızlı
- **Trend grafiği**: 6 aylık snapshot × 380 müşteri = 2.3K satır, tek sorgu yeterli

---

## 10.5. Görülme Penceresi Filtreleri

Müşteriler sekmesindeki "görülme penceresi" filtresinin tanımları (UI dropdown):

| Etiket | Tanım | SQL koşulu |
|---|---|---|
| **Bu yıl** (default) | Mevcut takvim yılı içinde (1 Ocak - bugün) en az bir snapshot'ta görülmüş | `sonGoruldugu >= '{currentYear}-01-01'` |
| **Son 30 gün** | Bugünden geriye 30 gün | `sonGoruldugu >= now() - interval '30 days'` |
| **Son 90 gün** | Bugünden geriye 90 gün | `sonGoruldugu >= now() - interval '90 days'` |
| **Son 6 ay** | Bugünden geriye 180 gün | `sonGoruldugu >= now() - interval '6 months'` |
| **Tüm zamanlar** | Tüm müşteriler (filtre yok) | (yok) |

"Bu yıl" seçimi yıl başında (1 Ocak'ta) otomatik olarak tüm önceki yılları gizler — kullanıcı isterse "Tüm zamanlar"ı seçer. Bu kullanıcının önceki cevabıyla uyumlu: "sene içerisinde bir kere kayıtlı olursa müşteri sene sonuna kadar mizanda durmaya devam eder, kaybolmaz".

## 11. Test Stratejisi

Test runner yok (CLAUDE.md), **smoke + manuel** yaklaşım:

1. **Hesap fonksiyonları smoke** (`shared/tahsilatHesaplari.ts`):
   - Net bakiye signed
   - Gecikme hesabı
   - İş aktivitesi açığı
   - Bakiye-fatura açığı
   - Risk profili karar ağacı
2. **Eşleştirme algoritması smoke** (`server/eslestirme.ts`):
   - Normalize doğru çalışıyor mu (Türkçe karakter, şirket eki silme)
   - Skor: tam eşleşme = 1.0, içerme = 0.95, Levenshtein = 0-1
3. **Mizan parser smoke**: gerçek `mizan 08022026.xlsx` ile parse → 380 satır okuyor mu, tarihler doğru çevriliyor mu
4. **API curl testleri**: yükle → kaydet → liste → drill-down → trend → eşleştirme onay → arşiv sil
5. **UI tarayıcı**: tüm 5 sekme, tüm modal'lar, drill-down

---

## 12. Yapılacaklar Sırası (özet — detaylı plan ayrı çıkacak)

1. Schema: 5 yeni tablo
2. `npm run db:push`
3. `shared/tahsilatHesaplari.ts` (hesap fonksiyonları + smoke)
4. `server/mizanParser.ts` (Excel parse + smoke)
5. `server/eslestirme.ts` (Levenshtein + normalize + skor + smoke)
6. Storage: 15+ yeni metod (musteri/mizan/bakiye/eslestirme/ayarlar CRUD)
7. API: 14 endpoint
8. Tahsilat ayarları seed (default değerler)
9. UI iskelet: 5 sekme
10. Sekme 5 (Arşiv) — en basit, önce yap
11. Mizan yükleme modal
12. Sekme 2 (Müşteriler) — ana ekran
13. Müşteri Drill-down Dialog
14. Sekme 1 (Özet) — dashboard kartları + en kritik 10 + sektör donut
15. Sekme 3 (Trend) — line chart
16. Sekme 4 (Eşleştirme) — onay UI
17. Risk eşikleri modal
18. Eski Tahsilat.tsx silme
19. Type-check + manuel test + push

---

## 13. Riskler ve Açık Noktalar

- **Mizan formatının değişmesi**: Muhasebeci farklı yazılım kullanmaya başlarsa kolon haritası bozulur. Çözüm: parser'da kolon başlıklarını isim ile bulma (sadece kolon harfine güvenme).
- **Levenshtein performansı**: 380 müşteri × 5000 unique firmaUnvan = 1.9M karşılaştırma. Pre-filter ile sadece ilk harfi eşleşenleri karşılaştır.
- **gumruk_verileri.faturaTarihi text**: "DD.MM.YYYY" string. Sorgularda `to_date()` cast lazım, indeks fonksiyonel olmalı veya alternatif: tarih parse'ı uygulamada yap.
- **Eski sayfa silinince link kırılması**: `App.tsx` route aynı (`/tahsilat`), component değişir — sorun yok.
- **Eşleştirme önerileri kuyruğu**: çok büyürse UI yorulur. Default olarak son 30 gün önerilerini göster, "tümü" toggle ile geçmiş.

---

## 14. Sub-project 2 ve 3 için Notlar (V2 referansı)

Bu spec'te kapsanmayan, sonraki sub-project'lerde ele alınacaklar:

**Sub-project 2:**
- Mizan diff (2 mizan karşılaştırma raporu)
- Aylık karşılaştırma dashboard'u
- Risk değişim raporu (sarıdan kırmızıya geçenler)
- Müşteri × gümrük detaylı entegrasyonu (sadece toplam değil, kalem kalem fatura)

**Sub-project 3:**
- E-posta hatırlatma taslağı üreticisi
- Yıllık özet PDF
- Otomatik mizan yükleme (n8n veya benzeri)
- Akıllı uyarılar / bildirimler
