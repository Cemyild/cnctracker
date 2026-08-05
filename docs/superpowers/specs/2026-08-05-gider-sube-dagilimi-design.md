# Gider Faturası Şube Dağılımı — Tasarım

**Tarih:** 2026-08-05
**Durum:** Onaylandı

## Problem

Bazı gider faturaları tek bir şubeye ait değil. Somut örnek: çalışanlara verilen yemek kartı yüklemeleri tek faturada toplu geliyor.

| Firma | Fatura | Toplam |
|---|---|---|
| METROPAL KURUMSAL HİZMETLER A.Ş. | 8 | ₺1.014.624 |
| PLUXEE ÇALIŞAN DENEYİMİ | 2 | ₺173.046 |

`giderler.sube` tek değerli olduğu için bu faturalara şube atanamıyor; sonuçta "şubesi eksik" filtresinde sonsuza kadar takılı kalıyorlar.

## Kararlar

Kullanıcıyla netleştirilen iki karar:

1. **Pay tutarları elle girilir.** Çalışan sayısına göre otomatik oran veya sabit yüzde şablonu yok — kullanıcı Pluxee/Metropal'den gelen kişi listesine bakarak her şubenin TL tutarını yazar. Yüzde girişi de yok, yalnız TL.
2. **Ana satır listede kalır.** Fatura ayrı satırlara parçalanmaz; şube hücresinde "Bölündü (N)" rozeti görünür, kırılım satır altında açılır. Fatura adedi ve Excel mutabakatı bozulmaz.

## Veri modeli

Yeni tablo `gider_sube_dagilimlari`. `giderler` satırına dokunulmaz.

| Alan | Tip | Not |
|---|---|---|
| `id` | varchar PK | `gen_random_uuid()` |
| `giderId` | varchar → `gider_id` | FK `giderler.id`, `onDelete: cascade` |
| `sube` | text NOT NULL | `subeler` whitelist'inden |
| `tutar` | decimal(15,2) NOT NULL | **KDV dahil** toplam tutar payı |
| `olusturmaTarihi` | timestamp | |

Bir gider için aynı şube iki kez olamaz → `(gider_id, sube)` compound unique index.

### Mal bedeli / KDV payları saklanmaz, türetilir

```
oran          = payTutar / faturaToplamTutar
malBedeliPayi = malBedeli × oran
kdvPayi       = kdvTutari × oran
```

Tek gerçek kaynak ilkesi: iki ayrı alan saklanırsa biri güncellenip diğeri unutulduğunda sessizce tutarsız kalır. Ayrıca PLUXEE `PEF2026000236606` faturasında mal bedeli ₺12.600, KDV ₺0, toplam ₺12.096 — toplam mal bedelinden düşük. Sabit KDV oranı varsayan bir formül bu satırda yanlış sonuç verir; oransal türetme vermez.

## Bölme kuralları

- Modal 6 şubenin tümünü listeler; boş bırakılan şube dağılıma girmez.
- **Payların toplamı = faturanın `toplamTutar` değeri** (±0,01 tolerans). Tutmazsa kayıt reddedilir; modalda canlı "Kalan: ₺X" göstergesi eksiği/fazlayı anlık gösterir.
- Kısmi bölme yok — ya tamamı dağıtılır ya hiç.
- Doğrulama **hem client hem server** tarafında yapılır; server tek gerçek otorite.
- Şube adı `normalizeSube` ile whitelist'ten geçirilir (bkz. 2026-08-05 GUID tuzağı düzeltmesi).

## API

| Uç | İş |
|---|---|
| `PUT /api/giderler/:id/dagilim` | Dağılımı tümüyle değiştirir (sil + ekle, tek transaction). Gövde: `{ dagilimlar: [{ sube, tutar }] }` |
| `DELETE /api/giderler/:id/dagilim` | Bölmeyi kaldırır |

`GET /api/giderler` yanıtındaki her satıra `dagilimlar: [{ sube, tutar }]` eklenir. N+1 önlemek için tek `inArray` sorgusu + Map join (CLAUDE.md kuralı).

Gider bulunamazsa `404 { error: "Bulunamadı" }`.

## Arayüz

- **Şube hücresi:** dağılım varsa Select yerine `▸ Bölündü (4)` rozeti. Rozete tıklamak kırılımı açar/kapatır; kırılımdaki "Düzenle" bölme modalını açar.
- **Bölme modalı:** fatura özeti (firma, fatura no, toplam tutar) + 6 şube için TL input + canlı kalan göstergesi + "Kaydet" ve "Bölmeyi kaldır".
- **Bölme başlatma:** şube Select'inin içine `🔀 Şubelere böl…` özel seçeneği.
- **Kategori:** normal Select olarak kalır; fatura geneli tek kategori (örn. YEMEK).

## "Eksik" filtresine etkisi

Dağılımı olan fatura şubesi eksik sayılmaz:

```ts
sube: (g) => g.dagilimlar?.length ? false : normalizeSube(g.sube) === null
```

Kategori kontrolü değişmez.

## Kapsam

Özellik **tüm gider satırları** için çalışır — METROPAL/PLUXEE'ye özel kod yok. Kira, elektrik gibi paylaşılan giderler de aynı akışla bölünebilir.

### Kapsam dışı

- **Şube bazlı gider raporu.** Sistemde henüz yok. Bu tablo raporun veri temelini hazırlar ama raporun kendisi ayrı iş.
- Çalışan sayısına göre otomatik oran önerisi.
- Yüzde ile giriş.
- Dağılımın Excel'e aktarımı.
