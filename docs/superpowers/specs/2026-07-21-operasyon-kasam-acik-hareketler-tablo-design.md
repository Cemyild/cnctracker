# Operasyon Kasam: Açık Hareketler Tablo Görünümü + Avans Sadeleştirme — Tasarım

**Tarih:** 2026-07-21
**Durum:** Onaylandı (düzen + iki netleştirme kullanıcıyla karara bağlandı)
**Önkoşul:** Kasam UX yenilemesi (kalıcı-beyanname modalı + gruplu açık hareketler) canlıda (commit `06b6e11`).

## 1. İhtiyaç

Mevcut açık hareketler listesi (canlı ekran görüntüsünden):
- Masraf grup satırı **tutar → dosya no · beyan no · firma** sırasında; kullanıcı **dosya no'yu önce ve
  bold** istiyor.
- Liste "tablo tarzı" değil; kullanıcı **üstte sütun başlıkları** olan hizalı bir görünüm istiyor.
- Avans satırı `Avans · 20/07/2026 · —` şeklinde, boş açıklamada çirkin `—` gösteriyor; kullanıcı
  "çok kötü duruyor, daha açıklayıcı ve tek bakışta görünür" olmasını istiyor.

Bu **saf görsel** bir düzenleme — veri, uç, gruplama mantığı DEĞİŞMEZ, yalnız render.

## 2. Kararlar

1. **İki ayrı blok:** Avanslar üstte (yeşil, sade), Masraflar altta (sütun başlıklı tablo). Avans ve
   masraf farklı kolonlara sahip olduğundan tek tabloya zorlanmaz.
2. **Avans sade:** yeşil kalır (kullanıcı: "yeşil renk güzeldi"); "Avans" etiketi + tutar yeterli
   ("avans ve tutar yeterli"). Boş açıklamada `—` GÖSTERİLMEZ. Yukarı-ok ikonu EKLENMEZ.
3. **Adet kolonu KALKAR** (kullanıcı: "adet gereksiz, kaç tane olduğu açınca zaten görünüyor").
   Grup başlığındaki sayı rozeti (`Badge`) kaldırılır.
4. **Grup satırı sırası:** **Dosya No (BOLD)** → Beyanname No → Firma → Tutar → açılma oku.
5. Yalnız `OperasyonKasaSayfasi.tsx` açık hareketler bölümü değişir; backend/veri/gruplama DOKUNULMAZ.

## 3. Blok 1 — Avanslar (üstte, yeşil, sade)

Yalnız `ozet.avanslar` doluysa gösterilir. "Avanslar" alt-başlığı (küçük, muted) + her avans bir satır:

- **Yeşil vurgulu satır** (hafif yeşil arka plan + yeşil metin) — "para girişi" tek bakışta anlaşılır.
- İçerik: **Avans** · {tarih}{açıklama varsa ` · {açıklama}`} … sağda `+{tutar}` {dekont varsa ` · dekont` linki}.
- Boş açıklama → hiçbir `—` yazılmaz.
- testid `row-avans-{id}` KORUNUR.

## 4. Blok 2 — Masraflar (sütun başlıklı tablo)

Tek bir kart içi bölüm; en üstte **bir kez** sütun başlık satırı, altında grup satırları.

**Kolonlar (CSS grid, hizalı):** `Dosya No | Beyanname No | Firma | Tutar | (ok)`
- Başlık satırı: muted, küçük, sadece bu bölümün en üstünde. Son kolon (ok) başlıksız.
- Firma taşarsa kesilir (`truncate` / `min-w-0`).

**Grup satırı** (`gruplar.map`, her `beyannameId` bir satır) — satırın TAMAMI tıklanabilir (`<button>`):
- **Dosya No** — `b?.dosyaNo ?? "?"`, **bold** (`font-semibold`).
- **Beyanname No** — `b?.beyanNo ?? "—"`, muted.
- **Firma** — `b?.alici ?? "?"`, truncate.
- **Tutar** — `−{formatPara(g.toplam,"TL")}`, kırmızı, sağa hizalı.
- **Ok** — kapalı `ChevronRight`, açık `ChevronDown` (grup açık/kapalı göstergesi).
- testid'ler `group-beyanname-{id}` + `button-group-toggle-{id}` KORUNUR. **Adet rozeti KALDIRILIR.**

**Açılan detay** (grup açıkken, altında indentli):
- Her masraf satırı: `{masrafTuru ?? "Masraf"} · {alacakli}{belge linki varsa}` … sağda `−{tutar}` + **Kaldır**.
- testid `row-masraf-{id}` + `button-masraf-kaldir-{id}` KORUNUR. İşlevsellik (belge linki + Kaldır) korunur.

**Ofis Masrafları grubu** (tablonun altında, `ofisMasraflar.length > 0`):
- Dosya/beyanname/firma yok → grup satırı kimlik kolonlarını kapsayan "Ofis Masrafları" etiketi +
  Tutar + ok. Açılan satırlar: `Ofis` rozeti + `{tür} · {açıklama}` + tutar + Kaldır (mevcut davranış,
  yalnız hizalama tablo düzenine uyarlanır). testid `group-ofis` + `button-group-toggle-ofis` KORUNUR.

Boş durumda "Açık hareket yok." mesajı KORUNUR.

## 5. Kapsam / Kapsam dışı

**Değişen:** `client/src/pages/portal/OperasyonKasaSayfasi.tsx` — yalnız açık hareketler render bloğu
(satır ~104-167). State/query/gruplama/`masrafKaldir`/`grupAcKapa`/`beyannameMap` AYNEN KALIR.
`Badge` import'u artık yalnız "Ofis" rozeti için kullanılırsa kalır; grup adet rozeti kalktığı için
kullanım azalır.

**Kapsam dışı:** backend/şema/uç · bakiye kartları · Yeni Ödeme modalı · Günü Kapat · muhasebe/temsilci
ekranları · avans ekleme/silme mantığı · gruplama/veri hesabı.

## 6. Doğrulama

- `npm run check` ve `npm run build` temiz. Yalnız istemci; `db:push` YOK.
- **DEV DB izolasyonu:** Playwright yazma testi öncesi hedef doğrulanır (dev Neon), aksi hâlde durulur.
- Mevcut testid'ler korunur (`row-avans-{id}`, `group-beyanname-{id}`, `button-group-toggle-{id}`,
  `row-masraf-{id}`, `button-masraf-kaldir-{id}`, `group-ofis`, `button-group-toggle-ofis`, `text-bakiye`,
  `button-op-yeni-odeme`, `button-op-gunu-kapat`).
- Playwright (operasyon kullanıcısı, dev DB):
  (a) Avans varsa yeşil sade satır; boş açıklamalı avansta `—` YOK; dekontlu avansta dekont linki var.
  (b) Masraf bölümünde üstte sütun başlıkları (Dosya No / Beyanname No / Firma / Tutar) bir kez görünür.
  (c) Grup satırı: dosya no BOLD + beyan no + firma + tutar; **adet rozeti YOK**; satıra tıkla → açılır.
  (d) Açılan detayda tür/alacaklı/tutar + **Kaldır** çalışır; belge linki (varsa) görünür.
  (e) Ofis Masrafları grubu tablonun altında; açılır, Ofis rozeti + açıklama görünür.
  (f) Regresyon: bakiye kartları, Yeni Ödeme, Günü Kapat bozulmamış; boş durumda "Açık hareket yok."
- Test verileri dev DB'den ve `uploads/operasyon/` içinden temizlenir.
