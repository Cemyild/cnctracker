# Ödemeler Portalı Faz 1.7 — Konşimento Analiz Doğruluğu + Kayıtlı Ödeme Şirketleri

**Tarih:** 2026-07-05
**Durum:** Onaylandı (model + alan kuralı kararları kullanıcıyla netleştirildi)
**Önkoşul:** Faz 1.6 canlıda. Kullanıcı, gerçek konşimento örneklerini kırmızı/yeşil
işaretleyerek `E:\CEM APPS\cnctracker\KONŞİMENTO ÖRNEKLERİ\` klasörüne koydu
(klasör repoya COMMIT EDİLMEZ — gerçek müşteri verisi; testler lokal diskten okur).

## 1. Sorun ve Kökü

Canlı kullanımda: (a) konşimento numaraları bazen yanlış, (b) ödeme yapılacak Türk
şirketi bazen yanlış — model consignee (alıcı) veya taşıyıcı adını alıyor.

İşaretli örneklerin analizi kökü gösterdi:

- **Consignee/Notify blokları neredeyse her belgede Türk A.Ş./LTD şirketi içeriyor**
  (müşterinin kendisi). "Türkiye adresli firma ara" talimatı modeli tam da yanlış
  kutuya yönlendiriyordu.
- **`B/L No` ile `Booking Number`/`Carrier's Reference` yan yana** basılıyor (AWOT,
  MSC, HAPAG) — numara karışmasının kaynağı.

## 2. Kararlar

1. **Model:** `claude-haiku-4-5` → **`claude-sonnet-5`** (kullanıcı seçimi; görsel
   doğrulukta büyük sıçrama, maliyet farkı ihmal edilebilir).
2. **Alan kuralı (kullanıcının kırmızı/yeşil işaretlerinden):**
   - **YASAK bloklar (KIRMIZI):** `Shipper/Exporter`, `Consignee/Importer`,
     `Notify Party/Address` — bu bloklardaki hiçbir firma, Türk ve A.Ş./LTD olsa
     bile ASLA ödeme acentesi olarak alınmaz. Rota kutuları (vessel/port) da bilgi
     kaynağı değildir.
   - **İZİNLİ bloklar (YEŞİL):** yalnız şu etiketli bloklardan acente alınır:
     `Port Agent`, `Carrier's Agent(s)` / `Carrier's Agents Endorsements` /
     `Port of Discharge Agent`, `Destination Agent`, `Delivery Agent`,
     `For delivery of (this) goods please apply to`, ve belge alt/kenarındaki
     acente iletişim bloğu (vergi no / MERSİS / telefon içeren Türkiye adresli firma).
   - Acente **Türkiye adresli olmalı**. `A.Ş./LTD` uzantısı **doğrulama sinyalidir,
     katı filtre değildir** (AWOT örneği: "SAVINO DEL BENE HEAD OFFICE - ISTANBUL"
     uzantısız ama geçerli — kullanıcı onayladı).
   - İzinli bloklarda Türkiye adresli firma yoksa → `null` (HAPAG örneği).
3. **Konşimento no disiplini:** yalnız `B/L No` / `B/L Number` /
   `Bill of Lading No` / `Sea Waybill No` / `SWB-No` etiketli değer okunur.
   `Booking Number/Ref`, `Carrier's Reference`, `Export References`,
   `Shipper's Ref`, `OTI/NVOCC Number`, fatura/kontrat/konteyner numaraları
   (4 harf + 7 rakam) ASLA. Karakter karakter aynen aktarılır (O/0, I/1, B/8
   karışmalarına dikkat); etiket bulunamaz veya okunamıyorsa `null`.
4. **Kaynak şeffaflığı:** model, acenteyi HANGİ blok etiketinden aldığını da döndürür
   (`acenteKaynagi`, örn. "Destination Agent"). Onay kartında temsilciye gösterilir —
   hem güven verir hem modeli izinli-blok disiplinine bağlar (kaynak gösteremiyorsa
   almaması gerektiğini öğrenir).
5. **Kayıtlı ödeme şirketleri:** temsilcinin onaylayıp gönderdiği depo alacaklıları
   sisteme kaydedilir; sonraki taleplerde alacaklı alanında öneri listesi olarak açılır
   (algılanan şirket yanlışsa listeden seçilir).

## 3. Analiz Servisi Değişiklikleri (`server/konsimentoAnaliz.ts`)

- Model: `claude-sonnet-5`; timeout 30 sn'ye çıkar (daha büyük model + taranmış çok
  sayfalı belgeler), `maxRetries: 1` kalır.
- Sistem istemi §2'deki kurallarla baştan yazılır (yasak/izinli blok listeleri,
  numara disiplini, Türkiye adresi şartı, uzantı-sinyal notu, UYDURMA yasağı,
  emin-değilsen-null).
- Çıktı şemasına eklenir: `acenteKaynagi: string | null` (izinli blok etiketi;
  acente null ise null). Rota yanıtına da eklenir.
- Yanıt sözleşmesi: `{konsimentoNo, tasiyici, acenteAdi, acenteAdres, acenteBulundu,
  acenteKaynagi}`.

## 4. Kayıtlı Ödeme Şirketleri

**Şema** — yeni tablo `odeme_sirketleri`:

| Alan | Tip | Not |
|---|---|---|
| id | varchar uuid PK | |
| ad | text unique | firma adı (trim'li) |
| kullanimSayisi | integer default 1 | her kullanımda ++ |
| sonKullanim | timestamp | her kullanımda tazelenir |
| aktif | boolean default true | yanlış girilenler yönetimden kapatılabilir (Faz 2 UI) |

**Kayıt:** `POST /api/portal/talepler` ve `POST /api/portal/dogrudan-odeme`,
`odemeTipi=depo_teminat` talebi BAŞARIYLA oluşturduktan sonra `alacakli` değerini
upsert eder (`ad` bazlı; varsa sayaç++ ve sonKullanim, yoksa ekle). Upsert hatası
talebi BOZMAZ (best-effort, log'lanır).

**Okuma:** `GET /api/portal/odeme-sirketleri` — `requirePortal`, aktif kayıtlar,
`kullanimSayisi` sonra `sonKullanim` azalan sıralı, ilk 100.

**Frontend:** İki formda da (YeniTalep, DogrudanOdeme) alacaklı `Input`'una native
`<datalist>` bağlanır — temsilci yazmaya devam edebilir VEYA açılan öneri listesinden
kayıtlı şirketi seçer. Ayrı bir dropdown bileşeni eklenmez (mevcut davranış ve
testid'ler korunur; yalnız `list` attribute + `<datalist>` eklenir).

## 5. Onay Kartı Güncellemesi (`KonsimentoAnalizAlani`)

Acente bulunduğunda bilgi satırına kaynak eklenir:
"Türkiye Ödeme Acentesi: X — **Kaynak: Destination Agent**". `acenteKaynagi` tipine
`AnalizYaniti`'na eklenir. Diğer davranışlar (onay, bayat-yanıt koruması, elle mod)
değişmez.

## 6. Gerçek Örneklerle Doğrulama (regresyon seti)

`KONŞİMENTO ÖRNEKLERİ` klasöründeki İŞARETSİZ dosyalar analiz ucuna gönderilir ve
beklenenlerle karşılaştırılır (işaretli versiyonlar modele ipucu vereceğinden test
edilmez):

| Dosya | Beklenen konsimentoNo | Beklenen acente (içerir) |
|---|---|---|
| ADP.pdf | DGSSE260400154 | ASAV LOJISTIK |
| AKKON.pdf | AKKNBO26029624 | AKKON DENIZCILIK |
| NINGBO.pdf | GYSE2604083 | VOLANTIS |
| AWOT.pdf | ASCAN2640213 | SAVINO DEL BENE |
| 4.pdf | (bilinmiyor — çıktı rapor edilir, kullanıcı doğrular) | |

Kabul: 4/4 bilinen örnekte konsimentoNo birebir + acente adı beklenen firmayı
içeriyor + acente consignee firmasını İÇERMİYOR (A-PLAS/DE-KA/ENYTEKS/PRO METAL
adları acente alanında görünmemeli). Bu karşılaştırma E2E scriptinde otomatiktir;
klasör yolu sabit lokal disk yoludur (CI'da çalışmaz, lokal doğrulama aracıdır).

## 7. Hata Durumları / Kapsam Dışı

- Upsert çakışması (eşzamanlı aynı ad): unique ihlali yutulur, sayaç bir eksik
  kalabilir — önemsiz.
- Öneri listesi boşken datalist görünmez — davranış değişmez.
- Kayıtlı şirket yönetim UI'ı (kapatma/düzeltme) Faz 2; şimdilik tablo birikir.
- İşaretli örnek klasörü repoya girmez; `.gitignore`'a eklenir.

## 8. Uygulama Sırası (özet)

Şema+storage+upsert/GET rotaları → konsimentoAnaliz yeniden yazımı (model+istem+
kaynak alanı) → frontend (datalist + kaynak satırı) → gerçek örnek regresyon E2E.
