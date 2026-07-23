# Geçmiş Şube Masraf Seed'i (Erenköy + İHL) — Tasarım

**Tarih:** 2026-07-23
**Durum:** Onaylandı
**Tür:** Bir kerelik geçmiş veri girişi (kod özelliği değil). Süreç: **önizleme → kullanıcı onayı → canlıya insert → geri-alınabilir.**

## 1. İhtiyaç

Şubeler (Erenköy, İHL) Temmuz 2026 masraflarını Excel kasa defterinde tutuyor. Kullanıcı bu geçmiş
masrafları Operasyon Kasası'na (`operasyon_masraflar`) girmek istiyor ("eskiyle başlamış olalım").
**Bir kerelik seed** — sürekli Excel akışı değil; kullanıcı açıkça istedi (memory "Excel önerme" kuralı
bu bağlamda geçerli değil).

**Kapsam (kullanıcı kararı):** yalnız **masraflar** girilir. Avanslar GİRİLMEZ — kullanıcı muhasebeden gün
kilidini açıp avans gönderip tekrar kilitleyecek; devreden avanslar sistemce türetilecek.

## 2. Kaynak veri

- **Erenköy:** 3 günlük Excel (`şube masraflar/erenköy/{10,13,16}-07-2026.xlsx`), tek "Sayfa1".
- **İHL:** 1 aylık Excel (`şube masraflar/İHL/2026 TEMMUZ.XLSX`), 9 günlük sayfa (`1.7.26` … `20.7.26`).
- **Kolonlar:** A=REJİM(IM/EX/TR/AN) · B=FİRMA · C=BEYAN NO(kısmi) · D=GÜMRÜK · E=AÇIKLAMA/tür ·
  F=TARİH(Excel seri no) · G=TUTAR.
- **Ölçüm:** 491 satır — 330 beyannameli (IM138/EX161/TR25/AN6), 161 boş-A. Gerçek girilecek masraf ~1,5M TL;
  kalan ~10,7M avans/devir/özet (atlanacak).

## 3. Sınıflandırma kuralları

Her satır, A sütunu (rejim) durumuna ve E (tür) değerine göre sınıflanır. **Carry-down:** A-dolu bir satır
"aktif beyanname"yi belirler; sonraki boş-A satırlar yeni A-dolu satıra kadar aktif beyannameye aittir
(kullanıcı kuralı). İstisna: ofis türleri ve atlanacaklar.

| Girdi | Kategori | Sonuç |
|---|---|---|
| A-dolu (rejim+firma+beyan) | **Beyannameli masraf** | E türüyle, aktif beyannameye bağlı |
| Boş-A, tür ∈ {NAKLİYE, ARDİYE, TEMİNAT, KG FARKI, ORDİNO, ÇIKIŞ MESAİ} | **Carry-down masraf** | aktif beyannameye bağlı |
| Boş-A, tür = **Ad + Soyad** (AVANS içermez) | **Açık masraf** | aktif beyannameye bağlı, `masraf_turu="Açık Masraf"`, `alacakli`=kişi |
| Boş-A, tür ∈ {KIRTASİYE, FOTOKOPİ, YEMEK, OFİS TEMİZLİK, OTO YIKAMA, DONDURMA, HAFTALIK} | **Ofis masrafı** | `dosya_yok=true`, beyannamesiz |
| Boş-A, tür ∈ {GÜN SONU DEVİR, DEVRENDEN HESAP, GELEN PARA, TOPLAM MASRAF, DEVİR AVANS, KALAN AVANS, TOPLAM AVANS, "…AVANS", (boş)} | **ATLA** | girilmez (avans/kasa/özet) |
| Rejim = TR | **Transit** | manuel transit oluştur (§5), sonra masrafı bağla |

**Not:** "Açık masraf" = kullanıcının terimi (kişiye verilen, firmadan geri talep edilecek). Sistemdeki
"açık masraf" (kapatılmamış = `kapanisId null`) ile KARIŞMAZ; bu bir `masraf_turu` değeridir.
**ÇIKIŞ MESAİ** kullanıcı kararıyla beyannameye ait (mevcut "Mesai" türüne eşlenir).
**Tek kelimelik belirsiz E değerleri** (ör. `EMİRHAN` — soyad yok, temsilci adı olabilir) önizlemede
"BELİRSİZ" işaretlenir, otomatik girilmez.

## 4. Beyanname eşleştirme

Excel'in kısmi beyan no'su (`167929`) canlı `beyan_no` (`26341200IM00167929`) ile eşleşir:
**son 8 hane (sıfır dolgulu) + rejim** anahtarı. `AN` rejimi `IM` kanalı altında aranır (Faz 1a: antrepo
IM). **Firma doğrulaması zorunlu** — son-8-hane kısa numaralarda farklı gümrüklerde çakışabilir; firma
uyuşmazsa yanlış beyannameye masraf bağlanabilir (ör. ölçümde `174830 EX` ORAU ORHAN vs P.M. PROFESYONEL).

Fizibilite ölçüldü (24.665 canlı beyannameye karşı): **301 net eşleşme** (299 tek + 2 çoklu firma-çözülen),
25 firma-uyuşmaz (çoğu yazım farkı: `FİCOSA İNT.`=`FICOSA INTERNATIONAL`), 4 hiç eşleşmeyen
(`2389`, `17519`, `6846`, `ETGB`), 25 TR (beklenen — sistemde yok).

Firma benzerliği: Türkçe normalize (`toLocaleLowerCase("tr")`, noktalama at) + ilk kelime ön-eki. Uyanlar
otomatik; uymayanlar **önizlemede işaretli**, kullanıcı karar verir (yazım farkı→gir, gerçek şüphe→atla).

## 5. Transit oluşturma

25 TR beyannamesi sistemde yok. Her biri için Faz 2B `storage.createManuelTransit`
(`{beyanNo, alici, gumrukIdaresi}`) çağrılır — mükerrer beyan_no'da mevcudu döndürür (idempotent).
Excel'in kısmi beyan no'su `beyanNo` olarak yazılır (tam formatı bilinmiyor; transit zaten manuel/serbest).
Bu, sistemdeki **ilk gerçek TR satırlarını** yaratır → `dosya_no NOT NULL` geri-dönüşü kalıcı kapanır
(Faz 1a'dan beri planlı eşik). Oluşan transit id'si masrafın `beyanname_id`'sine bağlanır.

## 6. `operasyon_masraflar` alan eşlemesi

| Alan | Değer |
|---|---|
| `operasyonId` | Erenköy → `murat` (874bf4c8…), İHL → `yilmaz` (a7f7ebb8…) |
| `sube` | Erenköy → "İstanbul - Erenköy", İHL → "İstanbul - İHL" (snapshot) |
| `beyannameId` | eşleşen/oluşturulan beyanname id; ofis masrafında `null` |
| `dosyaYok` | ofis masrafında `true`, diğer hepsi `false` |
| `masrafTuru` | E türü title-case; mevcut türle eşleşen kullanılır (NAKLİYE→"Nakliye", ORDİNO→"Ordino", ÇIKIŞ MESAİ→"Mesai", ARDİYE→"Ardiye", TEMİNAT→"Teminat", YEMEK→"Yemek"); eşleşmeyen olduğu gibi ("Dosya", "Kırtasiye"…); kişi rüşveti → "Açık Masraf" |
| `tutar` | G kolonu (`decimal(14,2)`) |
| `alacakli` | **zorunlu** — kişi rüşvetinde kişi adı; beyannameli masrafta firma adı; ofiste masraf türü |
| `tarih` | F Excel serisi → `YYYY-MM-DD` (UTC aritmetiği, `new Date` PARSE YOK) |
| `belgeDosya` / `belgeAdi` | `null` (geçmiş veri, fiş yok) |
| `kapanisId` | **`null`** (açık — kullanıcı sonra gün kilidini açıp kapatacak) |
| `aciklama` | orijinal E değeri + geri-alma işareti (§8) |

## 7. İki aşamalı akış

**Aşama 1 — Önizleme (DB'ye YAZMA YOK, salt-okuma):** Excel'leri oku, sınıflandır, canlı beyannamelere
karşı eşleştir (SSH read-only). Çıktı: her masraf için tam satır (şube/kullanıcı/kategori/beyanname
eşleşmesi/tür/tutar/alacaklı) + özet (kaç masraf, kaç TR, kaç ofis, kaç BELİRSİZ, toplam tutar) +
belirsizler listesi. **Kullanıcı önizlemeyi onaylar.**

**Aşama 2 — Onaylı insert (canlıya YAZMA):** Onaydan sonra: (a) 25 transit oluştur; (b) masrafları
`operasyon_masraflar`'a insert (belirsizler HARİÇ ya da kullanıcı kararına göre). Toplam masraf sayısı ve
tutarı önizlemeyle eşleşmeli. İnsert öncesi/sonrası `count` karşılaştırılır.

## 8. Geri-alınabilirlik (idempotentlik)

- **Önizleme tekrar çalıştırılabilir** (salt-okuma, yan etki yok).
- **Insert idempotent değil** ama **geri-alınabilir:** tüm seed masraflarının `aciklama`'sına ortak,
  sorgulanabilir bir işaret eklenir (ör. sonunda ` · [gecmis-seed-2026-07]`). Yanlışsa tek komut:
  `delete from operasyon_masraflar where aciklama like '%[gecmis-seed-2026-07]%'`. Transitler ayrıca
  `delete from beyannameler where rejim='TR' and kaynak='manuel'` (yalnız bu seed'in oluşturduğu TR'ler;
  başka manuel transit henüz yok — canlıda 0 TR).
- **Çift çalıştırma koruması:** insert öncesi işaretli kayıt sayısı kontrol edilir; >0 ise durulur
  (zaten girilmiş).

## 9. Kapsam dışı

Avans girişi (kullanıcı muhasebeden yapacak) · gün kapanışı (kullanıcı yapacak) · sürekli Excel içe
aktarma özelliği/uç (bu bir kerelik seed, kod özelliği DEĞİL) · Excel'deki avans/devir/özet satırları ·
belge/fiş yükleme · masraf türü tablosuna yeni tür ekleme (masraf_turu serbest metin, tablo değişmez).

## 10. Doğrulama

- **Önizleme:** 491 satırın tamamı bir kategoriye düşer (hiçbiri sessizce kaybolmaz); atlanan/girilen/
  belirsiz sayıları toplamı = 491. Toplam girilecek tutar makul (~1,5M, 12,2M değil).
- **Eşleştirme:** her beyannameli masrafın bağlandığı beyannamenin firması Excel firmasıyla uyumlu
  (önizlemede yan yana gösterilir).
- **Insert sonrası:** `operasyon_masraflar` sayısı = 4 (önceki) + girilen; `sum(tutar)` önizlemeyle eşleşir;
  örnek 5 kayıt elle doğrulanır (murat/yilmaz, şube, beyanname bağı, tarih).
- **Transit:** oluşan TR sayısı ≤ 25 (mükerrer beyan_no birleşir); her biri `rejim='TR'`, `kaynak='manuel'`.
- **Geri-alma provası:** dev DB'de (dev Neon) tüm akış bir kez çalıştırılıp geri alınır — canlıya
  gitmeden önce insert+delete idempotentliği kanıtlanır.
- **DEV DB izolasyonu:** dev'de prova; canlı insert yalnız kullanıcı önizlemeyi onayladıktan sonra,
  hedef açıkça canlı doğrulanarak.
