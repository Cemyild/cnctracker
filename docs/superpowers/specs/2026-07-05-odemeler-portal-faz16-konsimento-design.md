# Ödemeler Portalı Faz 1.6 — Konşimento Zorunluluğu ve Yapay Zekâ Analizi

**Tarih:** 2026-07-05
**Durum:** Onaylandı (kullanıcı ile bölüm bölüm doğrulandı)
**Önkoşul:** Faz 1.5 tamam (lokalde, henüz push edilmedi); deploy Faz 1.6 ile birlikte yapılacak.

## 1. Amaç

İş kuralı düzeltmesi + otomasyon:

1. **Konşimento yükleme sorumluluğu temsilciye geçer ve depo teminatında ZORUNLU olur.**
   (Mevcut durum: muhasebe ödeme anında yüklüyordu.)
2. Yüklenen konşimento PDF'i **Claude API ile analiz edilir**: konşimento numarası,
   taşıyıcı ve konşimentoda yazılı **Türkiye adresli ödeme acentesi** bulunur.
3. Bulunan bilgiler **temsilcinin onayına** sunulur (düzenlenebilir); onaylanmadan talep
   gönderilemez. Onaylanan bilgiler taleple birlikte muhasebe ekranına düşer.

Alan bilgisi (kullanıcıdan): Türkiye acentesi çoğu konşimentoda Türkiye adresli firma
olarak yazılıdır; **yazılı değilse alacaklı taşıyıcının kendisi olur**. Bu nedenle ayrı
bir taşıyıcı→acente eşleme tablosu KURULMAZ — bilgi belgeden okunur, insan onayından
geçer, asla yapay zekâ tahminiyle ödeme hedefi belirlenmez.

### Kapsam dışı

- Konşimento içeriğinin başka alanlarla (konteyner no, gemi vb.) zenginleştirilmesi.
- Geçmiş taleplerin geriye dönük analizi.

## 2. Akış

### Temsilci — Yeni Talep (ve muhasebe — Doğrudan Ödeme; aynı paylaşılan bileşen)

1. Ödeme tipi "Depo Teminatı" seçilince **Konşimento (zorunlu)** PDF alanı belirir.
2. Dosya seçilir seçilmez `POST /api/portal/konsimento-analiz`'e gönderilir;
   "Konşimento analiz ediliyor…" göstergesi (tipik 3-8 sn, form kilitlenmez).
3. **Onay kartı** belirir:
   - Konşimento No (düzenlenebilir, ZORUNLU)
   - Taşıyıcı (düzenlenebilir, opsiyonel)
   - Türkiye Ödeme Acentesi: bulunduysa firma adı; bulunamadıysa
     "Konşimentoda Türkiye acentesi bulunamadı — alacaklı taşıyıcı olarak ayarlandı" uyarısı.
   - **Alacaklı otomatik dolar**: acente ?? taşıyıcı (temsilci değiştirebilir).
4. **"Bilgiler doğru, onaylıyorum"** işaretlenmeden gönderim yapılamaz.
5. Analiz başarısız olursa kart boş+düzenlenebilir açılır ("Analiz yapılamadı —
   bilgileri elle girin"); onay kuralı aynı kalır. Süreç asla bloke olmaz.
6. Talep gönderiminde konşimento dosyası (`belgeTipi="konsimento"`) + konsimentoNo +
   tasiyici kaydedilir.

### Muhasebe tarafı değişiklikleri

- **Öde dialogundan konşimento yükleme alanı KALKAR** (belge talepte zaten var; dialog
  dekont alanıyla devam eder). Dialog talep özetinde Konşimento No + Taşıyıcı gösterilir.
- Gelen Talepler ve Depo Ödemeleri tablolarına **Konşimento No** ve **Taşıyıcı**
  kolonları eklenir (dosyasız/masraf kayıtlarında "—").
- **Doğrudan Ödeme** formunda depo teminatı seçilince aynı zorunlu konşimento + analiz +
  onay kartı çalışır.

## 3. Analiz Servisi

**Dosya:** `server/konsimentoAnaliz.ts` — tek sorumluluk: PDF buffer → yapılandırılmış
çıkarım.

- SDK: `@anthropic-ai/sdk` (kurulu); anahtar `ANTHROPIC_API_KEY` (.env'de mevcut;
  VPS .env'inde de var).
- Model: `claude-haiku-4-5` (görü destekli — taranmış konşimentolar da çalışır).
- Girdi: PDF base64 `document` content bloğu + Türkçe sistem istemi. İstem kuralları:
  "Türkiye adresli teslim/ödeme acentesini ara; kesin değilsen null döndür — UYDURMA.
  Konşimento numarasını belge üzerindeki B/L No / Bill of Lading No alanından al."
- Çıktı (tool use ile zorunlu şema):
  `{ konsimentoNo: string | null, tasiyici: string | null, turkiyeAcentesi: { ad: string, adres: string } | null }`
- Zaman aşımı 20 sn; hata → istisnayı fırlatır (rota 502'ye çevirir).

**Rota:** `POST /api/portal/konsimento-analiz` — `requirePortal` (her iki rol), multer
**memoryStorage** (analizde diske yazılmaz), alan adı `konsimento`, yalnız
`application/pdf`, 10 MB sınır.

- Başarı: `{ konsimentoNo, tasiyici, acenteAdi, acenteAdres, acenteBulundu }`
  (acente yoksa `acenteAdi=null, acenteBulundu=false`).
- Claude hatası/zaman aşımı: `502 {error:"Analiz yapılamadı — bilgileri elle girin"}`.
- `ANTHROPIC_API_KEY` tanımsız: `503 {error:"Analiz servisi yapılandırılmamış"}` —
  istemci elle giriş moduna düşer (özellik zarifçe devre dışı).
- PDF değil / 10 MB üstü: 400.

## 4. Şema ve Sunucu Doğrulaması

`odeme_talepleri`'ne iki nullable kolon (`db:push`):

| Alan | Kolon | Tip |
|---|---|---|
| konsimentoNo | `varchar("konsimento_no")` → text | depo teminatında zorunlu |
| tasiyici | `text("tasiyici")` | opsiyonel |

Acente ayrı kolon DEĞİL — onaylanan acente/taşıyıcı `alacakli` alanına yazılır
(ödeme hedefi tek yerde, veri ikiliği yok).

**`POST /api/portal/talepler`** ve **`POST /api/portal/dogrudan-odeme`**,
`odemeTipi === "depo_teminat"` iken ek doğrulama:

- `konsimento` dosyası zorunlu → yoksa `400 {"error":"Depo teminatında konşimento zorunlu"}`
- `konsimentoNo` (gövde alanı) zorunlu → yoksa `400 {"error":"Konşimento numarası zorunlu"}`
- `tasiyici` opsiyonel metin; ikisi de talebe kaydedilir.
- Talepler rotasında konşimento için multer konfigürasyonu `fields`'a döner:
  `belgeler` (max 10, fatura) + `konsimento` (max 1). Dosya `belgeTipi="konsimento"`
  ile kaydedilir. Yetim dosya temizliği tüm erken dönüşlerde iki alan grubunu da kapsar.
- Masraf tipinde konşimento alanları yok sayılır (gönderilirse de kaydedilmez).

## 5. Paylaşılan Bileşen

`client/src/pages/portal/KonsimentoAnalizAlani.tsx`:

- Props: `{ deger: KonsimentoBilgisi; onDegisim: (b: KonsimentoBilgisi) => void }`
  — `KonsimentoBilgisi = { dosya: File | null, konsimentoNo: string, tasiyici: string,
  onaylandi: boolean, alacakliOnerisi: string | null }`.
- Davranış: dosya seçimi → analiz isteği → onay kartı (düzenlenebilir Konşimento No /
  Taşıyıcı / acente bilgi satırı + "Bilgiler doğru, onaylıyorum" checkbox'ı).
  Alan değişince `onaylandi` sıfırlanır (değiştirilen bilgi yeniden onay ister).
  `alacakliOnerisi` üst forma iletilir; üst form alacaklıyı bir kez otomatik doldurur
  (kullanıcı elle değiştirdiyse ezilmez).
- Kullanım: `YeniTalepSayfasi` ve `DogrudanOdemeSayfasi` — depo teminatı seçiliyken render.
- Gönderim kuralı (üst formlarda): depo teminatında `dosya` + `konsimentoNo` +
  `onaylandi` yoksa toast hatası, gönderim yok.

## 6. Hata Durumları

- Analiz hatası/servis yapılandırılmamış: kart elle giriş modunda açılır; onay kuralı değişmez.
- Claude alan bulamazsa (null): ilgili alan boş gelir, temsilci doldurur.
- Depo talebinde konşimentosuz/numarasız gönderim: sunucu 400 (yukarıdaki mesajlar).
- Eski kayıtlar (Faz 1/1.5'ten konşimentosuz depo talepleri — canlıda yok, lokalde test):
  tablolarda konsimentoNo "—" görünür; hiçbir geriye dönük zorunluluk uygulanmaz.
- Bildirim/rozet motoru: talep imzası zaten `belgeler.length` içerdiğinden ek değişiklik yok.

## 7. Doğrulama

1. tsc + curl: analiz ucuna gerçek/örnek bir konşimento PDF'i (kullanıcı örnek
   paylaşabilir; yoksa test PDF'i ile en azından hata-yolu doğrulanır).
2. curl: depo talebi konşimentosuz → 400; konşimentolu + numaralı → kayıt + belge.
3. Playwright E2E: depo seçimi → dosya → analiz göstergesi → onay kartı → onaysız
   gönderim engeli → onay → gönderim → muhasebe tablolarında Konşimento No/Taşıyıcı
   kolonları → Öde dialogunda konşimento alanının OLMADIĞI.
4. Regresyon: masraf talebi akışı değişmedi; doğrudan ödeme masraf tipi değişmedi.

## 8. Uygulama Sırası (özet)

Şema kolonları → analiz servisi + rota → talepler/doğrudan-ödeme doğrulama + kayıt →
paylaşılan bileşen → iki formun entegrasyonu + muhasebe tablo/dialog güncellemeleri →
E2E. Ayrıntı writing-plans ile.
