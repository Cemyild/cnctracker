# Antigravity AI - Personel Maaş ve İşveren Maliyeti Hesaplama Sistemi Prompt'u

## Proje Tanımı

Bir personel yönetim sistemi için **Net Maaş → Brüt Maaş → İşveren Maliyeti** hesaplama modülü geliştirmeni istiyorum. Sistem, 2025 yılı Türkiye vergi mevzuatına uygun olacak ve 12 ay boyunca kümülatif vergi takibi yapacak.

---

## 1. VERİ MODELİ

### 1.1. Çalışan (Employee) Modeli

```typescript
interface Employee {
  id: string;
  tcKimlikNo: string;
  adSoyad: string;
  statu: 'NORMAL' | 'EMEKLI' | 'YONETICI';
  iseGirisTarihi: Date;
  netMaas: number;           // Kullanıcı tarafından girilen
  subeId: string;
  // Hesaplanan alanlar (her ay için ayrı tutulacak)
  aylikHesaplamalar: MonthlyCalculation[];
}
```

### 1.2. Aylık Hesaplama Modeli

```typescript
interface MonthlyCalculation {
  ay: number;                        // 1-12
  yil: number;                       // 2025
  
  // Girdiler
  netMaas: number;
  
  // Hesaplanan Brüt ve Matrah
  brutMaas: number;
  gelirVergisiMatrahi: number;       // Brüt - (SGK İşçi + İşsizlik İşçi)
  kumulatifGelirVergisiMatrahi: number;  // Yıl başından itibaren toplam
  
  // İşçi Kesintileri
  sgkIsciPrimi: number;              // Normal: %14, Emekli: %7.5
  issizlikIsciPrimi: number;         // Normal: %1, Emekli: %0
  gelirVergisi: number;              // Dilime göre hesaplanan
  damgaVergisi: number;              // Binde 7.59
  
  // İstisnalar
  asgariUcretGelirVergisiIstisnasi: number;
  asgariUcretDamgaVergisiIstisnasi: number;
  
  // Net Kesintiler (İstisna düşüldükten sonra)
  netGelirVergisi: number;
  netDamgaVergisi: number;
  
  // İşveren Maliyetleri
  sgkIsverenPrimi: number;           // Normal: %20.75 veya %15.75 (teşvikli)
  issizlikIsverenPrimi: number;      // Normal: %2, Emekli: %0
  hazineTesviki: number;             // %5 SGK indirimi
  
  // Toplamlar
  toplamIsciKesintisi: number;
  toplamIsverenMaliyeti: number;
  isvereneBrutMaliyet: number;       // Brüt + İşveren Payları
}
```

---

## 2. SABİT PARAMETRELER (2025)

```typescript
const PARAMETRELER_2025 = {
  // Asgari Ücret
  BRUT_ASGARI_UCRET: 26005.50,
  NET_ASGARI_UCRET: 22104.67,
  
  // SGK Taban/Tavan
  SGK_GUNLUK_TABAN: 866.85,
  SGK_AYLIK_TAVAN: 195041.40,
  
  // İşçi Kesinti Oranları - NORMAL
  ISCI_SGK_ORANI: 0.14,              // %14
  ISCI_ISSIZLIK_ORANI: 0.01,         // %1
  
  // İşçi Kesinti Oranları - EMEKLİ (SGDP)
  ISCI_SGK_ORANI_EMEKLI: 0.075,      // %7.5
  ISCI_ISSIZLIK_ORANI_EMEKLI: 0,     // %0
  
  // İşçi Kesinti Oranları - YÖNETİCİ (SGK/İşsizlik YOK)
  ISCI_SGK_ORANI_YONETICI: 0,        // %0 - UYGULANMAZ
  ISCI_ISSIZLIK_ORANI_YONETICI: 0,   // %0 - UYGULANMAZ
  
  // Damga Vergisi
  DAMGA_VERGISI_ORANI: 0.00759,      // Binde 7.59
  
  // İşveren Kesinti Oranları - NORMAL
  ISVEREN_SGK_ORANI: 0.2075,         // %20.75 (teşviksiz)
  ISVEREN_SGK_ORANI_TESVIKLI: 0.1575, // %15.75 (%5 Hazine teşvikli)
  ISVEREN_ISSIZLIK_ORANI: 0.02,      // %2
  HAZINE_TESVIKI_ORANI: 0.05,        // %5
  
  // İşveren Kesinti Oranları - EMEKLİ (SGDP)
  ISVEREN_SGK_ORANI_EMEKLI: 0.245,   // %24.5
  ISVEREN_ISSIZLIK_ORANI_EMEKLI: 0,  // %0
  
  // İşveren Kesinti Oranları - YÖNETİCİ (HİÇBİRİ UYGULANMAZ)
  ISVEREN_SGK_ORANI_YONETICI: 0,     // %0 - UYGULANMAZ
  ISVEREN_ISSIZLIK_ORANI_YONETICI: 0, // %0 - UYGULANMAZ
  
  // Gelir Vergisi Dilimleri
  GELIR_VERGISI_DILIMLERI: [
    { ustSinir: 158000,   oran: 0.15, oncekiDilimVergi: 0 },
    { ustSinir: 330000,   oran: 0.20, oncekiDilimVergi: 23700 },
    { ustSinir: 800000,   oran: 0.27, oncekiDilimVergi: 58100 },
    { ustSinir: 4300000,  oran: 0.35, oncekiDilimVergi: 185000 },
    { ustSinir: Infinity, oran: 0.40, oncekiDilimVergi: 1410000 }
  ]
};
```

---

## 3. HESAPLAMA ALGORİTMALARI

### 3.1. Net'ten Brüt'e Dönüşüm (İteratif)

Net maaştan brüt maaşa giderken **döngüsel hesaplama** gereklidir çünkü vergiler brüte bağlıdır. Newton-Raphson veya basit iterasyon yöntemi kullanılmalı.

```
ALGORITHM: NettenBruteHesapla(netMaas, statu, kumulatifMatrah)

1. IF statu == 'YONETICI':
   // Yöneticide SGK/İşsizlik yok, sadece vergi var
   RETURN NettenBruteHesaplaYonetici(netMaas, kumulatifMatrah)

2. brutTahmin = netMaas * 1.35  // Başlangıç tahmini
3. REPEAT (max 100 iterasyon, tolerans: 0.01 TL):
   a. sgkIsci = brutTahmin * sgkOrani(statu)
   b. issizlikIsci = brutTahmin * issizlikOrani(statu)
   c. vergiMatrahi = brutTahmin - sgkIsci - issizlikIsci
   d. gelirVergisi = GelirVergisiHesapla(vergiMatrahi, kumulatifMatrah)
   e. asgariUcretIstisnasi = AsgariUcretGelirVergisiIstisnasi(ay)
   f. netGelirVergisi = max(0, gelirVergisi - asgariUcretIstisnasi)
   g. damgaVergisi = DamgaVergisiHesapla(brutTahmin)
   h. hesaplananNet = brutTahmin - sgkIsci - issizlikIsci - netGelirVergisi - damgaVergisi
   i. fark = netMaas - hesaplananNet
   j. IF |fark| < 0.01 THEN RETURN brutTahmin
   k. brutTahmin = brutTahmin + fark
4. RETURN brutTahmin


ALGORITHM: NettenBruteHesaplaYonetici(netMaas, kumulatifMatrah)
// Yönetici için: Brüt = Net + Gelir Vergisi + Damga Vergisi (SGK/İşsizlik YOK)

1. brutTahmin = netMaas * 1.20  // Başlangıç tahmini (daha düşük çünkü SGK yok)
2. REPEAT (max 100 iterasyon, tolerans: 0.01 TL):
   a. vergiMatrahi = brutTahmin  // SGK kesintisi olmadığı için brüt = matrah
   b. gelirVergisi = GelirVergisiHesapla(vergiMatrahi, kumulatifMatrah)
   c. asgariUcretIstisnasi = AsgariUcretGelirVergisiIstisnasi(ay)
   d. netGelirVergisi = max(0, gelirVergisi - asgariUcretIstisnasi)
   e. damgaVergisi = DamgaVergisiHesapla(brutTahmin)
   f. hesaplananNet = brutTahmin - netGelirVergisi - damgaVergisi
   g. fark = netMaas - hesaplananNet
   h. IF |fark| < 0.01 THEN RETURN brutTahmin
   i. brutTahmin = brutTahmin + fark
3. RETURN brutTahmin

### 3.2. Gelir Vergisi Hesaplama (Kümülatif Dilim Sistemi)

```
ALGORITHM: GelirVergisiHesapla(aylikMatrah, oncekiKumulatifMatrah)

1. yeniKumulatifMatrah = oncekiKumulatifMatrah + aylikMatrah
2. oncekiVergi = DilimeGoreVergiHesapla(oncekiKumulatifMatrah)
3. yeniVergi = DilimeGoreVergiHesapla(yeniKumulatifMatrah)
4. RETURN yeniVergi - oncekiVergi  // Bu ayki vergi

ALGORITHM: DilimeGoreVergiHesapla(kumulatifMatrah)

1. FOR EACH dilim IN GELIR_VERGISI_DILIMLERI:
   IF kumulatifMatrah <= dilim.ustSinir:
     oncekiDilimUstSinir = (onceki dilim varsa) oncekiDilim.ustSinir ELSE 0
     fazlaMatrah = kumulatifMatrah - oncekiDilimUstSinir
     RETURN dilim.oncekiDilimVergi + (fazlaMatrah * dilim.oran)
```

### 3.3. Asgari Ücret İstisnası Hesaplama

```
ALGORITHM: AsgariUcretGelirVergisiIstisnasi(ay, oncekiKumulatifMatrah)

// Asgari ücretin o ayki gelir vergisi matrahını hesapla
1. asgariUcretMatrahi = BRUT_ASGARI_UCRET * (1 - ISCI_SGK_ORANI - ISCI_ISSIZLIK_ORANI)
   // = 26005.50 * 0.85 = 22104.675 TL

2. asgariUcretKumulatifMatrah = asgariUcretMatrahi * ay
3. oncekiAsgariKumulatif = asgariUcretMatrahi * (ay - 1)

4. asgariUcretVergi = DilimeGoreVergiHesapla(asgariUcretKumulatifMatrah)
5. oncekiAsgariUcretVergi = DilimeGoreVergiHesapla(oncekiAsgariKumulatif)

6. RETURN asgariUcretVergi - oncekiAsgariUcretVergi

ALGORITHM: AsgariUcretDamgaVergisiIstisnasi()

1. RETURN BRUT_ASGARI_UCRET * DAMGA_VERGISI_ORANI
   // = 26005.50 * 0.00759 = 197.38 TL
```

### 3.4. Damga Vergisi Hesaplama

```
ALGORITHM: DamgaVergisiHesapla(brutMaas)

1. hesaplananDamga = brutMaas * DAMGA_VERGISI_ORANI
2. istisna = BRUT_ASGARI_UCRET * DAMGA_VERGISI_ORANI
3. RETURN max(0, hesaplananDamga - istisna)
```

### 3.5. İşveren Maliyeti Hesaplama

```
ALGORITHM: IsverenMaliyetiHesapla(brutMaas, statu, hazineTesvikiVar)

1. // YÖNETİCİ: İşveren payı YOK, brüt = maliyet
   IF statu == 'YONETICI':
     RETURN { 
       sgkIsveren: 0, 
       issizlikIsveren: 0, 
       hazineTesviki: 0, 
       toplamIsverenMaliyeti: brutMaas 
     }

2. sgkMatrahi = min(brutMaas, SGK_AYLIK_TAVAN)  // Tavan kontrolü

3. IF statu == 'EMEKLI':
   sgkIsveren = sgkMatrahi * ISVEREN_SGK_ORANI_EMEKLI
   issizlikIsveren = 0
   hazineTesviki = 0
   
4. ELSE:  // NORMAL çalışan
   IF hazineTesvikiVar:
     sgkIsveren = sgkMatrahi * ISVEREN_SGK_ORANI_TESVIKLI
     hazineTesviki = sgkMatrahi * HAZINE_TESVIKI_ORANI
   ELSE:
     sgkIsveren = sgkMatrahi * ISVEREN_SGK_ORANI
     hazineTesviki = 0
   issizlikIsveren = sgkMatrahi * ISVEREN_ISSIZLIK_ORANI

5. toplamIsverenMaliyeti = brutMaas + sgkIsveren + issizlikIsveren
6. RETURN { sgkIsveren, issizlikIsveren, hazineTesviki, toplamIsverenMaliyeti }
```

---

## 4. SGK TAVAN KONTROLÜ

Brüt maaş SGK tavanını (195.041,40 TL) aştığında:
- SGK primi hesabında **tavan tutar** baz alınır
- Gelir vergisi matrahı hesabında **gerçek brüt** kullanılır

```
ALGORITHM: SgkPrimMatrahiBelirle(brutMaas)

IF brutMaas > SGK_AYLIK_TAVAN:
  RETURN SGK_AYLIK_TAVAN
ELSE:
  RETURN brutMaas
```

---

## 5. STATÜ BAZLI FARKLILIKLAR

| Parametre | Normal Çalışan | Emekli (SGDP) | Yönetici |
|-----------|---------------|---------------|----------|
| SGK İşçi | %14 | %7.5 | **YOK** |
| İşsizlik İşçi | %1 | %0 | **YOK** |
| SGK İşveren | %20.75 veya %15.75 | %24.5 | **YOK** |
| İşsizlik İşveren | %2 | %0 | **YOK** |
| Hazine Teşviki | Uygulanabilir | Uygulanmaz | **YOK** |
| Gelir Vergisi | Var | Var | **Var** |
| Damga Vergisi | Var | Var | **Var** |

> **ÖNEMLİ - Yönetici Statüsü:** Yöneticilerde SGK ve işsizlik sigortası kesintisi YOKTUR. Sadece Gelir Vergisi ve Damga Vergisi uygulanır. Bu durumda:
> - Brüt maaş = Net maaş + Gelir Vergisi + Damga Vergisi
> - Gelir Vergisi Matrahı = Brüt Maaş (SGK kesintisi olmadığı için)
> - İşveren Maliyeti = Brüt Maaş (ek işveren payı yok)

---

## 6. 12 AYLIK KÜMÜLATİF HESAPLAMA

Her çalışan için Ocak-Aralık arası tüm aylar hesaplanmalı:

```
ALGORITHM: YillikHesapla(employee)

1. kumulatifGelirVergisiMatrahi = 0
2. aylikHesaplamalar = []

3. FOR ay = 1 TO 12:
   a. hesaplama = AylikHesapla(
        employee.netMaas,
        employee.statu,
        ay,
        kumulatifGelirVergisiMatrahi
      )
   b. kumulatifGelirVergisiMatrahi += hesaplama.gelirVergisiMatrahi
   c. hesaplama.kumulatifGelirVergisiMatrahi = kumulatifGelirVergisiMatrahi
   d. aylikHesaplamalar.push(hesaplama)

4. RETURN aylikHesaplamalar
```

---

## 7. UI TASARIMI

### 7.1. Çalışan Listesi Sayfası (Mevcut Tasarım)
- TC Kimlik No, Ad Soyad, Statü, İşe Giriş, Hesaplanan Brüt, Net Ücret, Şube
- Özet kartlar: Aktif Personel, Genel Brüt Toplam, Genel Net Toplam

### 7.2. Çalışan Detay / Maaş Hesaplama Modal'ı

```
┌─────────────────────────────────────────────────────────────────────┐
│  Çalışan Maaş Hesaplama                                      [X]    │
├─────────────────────────────────────────────────────────────────────┤
│  Ad Soyad: [_______________]  TC: [___________]                     │
│  Statü: [Normal ▼]  Şube: [Merkez ▼]  İşe Giriş: [__/__/__]         │
│                                                                     │
│  ┌─── GİRDİ ───────────────────────────────────────────────────┐    │
│  │  Net Maaş (TL): [________]  [Hesapla]                       │    │
│  │  ☑ %5 Hazine Teşviki Uygula (Yönetici'de devre dışı)        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─── AY SEÇİMİ ───────────────────────────────────────────────┐    │
│  │  Dönem: [Ocak 2025 ▼]                                       │    │
│  │         ┌──────────────┐                                    │    │
│  │         │ Ocak 2025    │                                    │    │
│  │         │ Şubat 2025   │                                    │    │
│  │         │ Mart 2025    │                                    │    │
│  │         │ ...          │                                    │    │
│  │         │ Aralık 2025  │                                    │    │
│  │         └──────────────┘                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│               [İptal]  [Kaydet]                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.3. Seçilen Ay İçin Hesaplama Tablosu

Dropdown'dan ay seçildiğinde, o aya ait detaylı hesaplama tablosu görüntülenir:

```
┌─────────────────────────────────────────────────────────────────────┐
│  📅 ŞUBAT 2025 - MAAŞ HESAPLAMA DETAYI                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─── MAAŞ BİLGİLERİ ──────────────────────────────────────────┐    │
│  │  Girilen Net Maaş          │            28.000,00 TL        │    │
│  │  Hesaplanan Brüt Maaş      │            33.500,00 TL        │    │
│  │  Gelir Vergisi Matrahı     │            28.475,00 TL        │    │
│  │  Kümülatif GV Matrahı      │            56.950,00 TL        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─── İŞÇİ KESİNTİLERİ ────────────────────────────────────────┐    │
│  │  SGK İşçi Primi (%14)      │             4.690,00 TL        │    │
│  │  İşsizlik İşçi Primi (%1)  │               335,00 TL        │    │
│  │  ──────────────────────────┼─────────────────────────────── │    │
│  │  Hesaplanan Gelir Vergisi  │             4.271,25 TL        │    │
│  │  Asgari Ücret GV İstisnası │            -3.315,70 TL        │    │
│  │  Ödenecek Gelir Vergisi    │               955,55 TL        │    │
│  │  ──────────────────────────┼─────────────────────────────── │    │
│  │  Hesaplanan Damga Vergisi  │               254,27 TL        │    │
│  │  Asgari Ücret DV İstisnası │              -197,38 TL        │    │
│  │  Ödenecek Damga Vergisi    │                56,89 TL        │    │
│  │  ──────────────────────────┼─────────────────────────────── │    │
│  │  TOPLAM İŞÇİ KESİNTİSİ     │             6.037,44 TL        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─── İŞVEREN MALİYETLERİ ─────────────────────────────────────┐    │
│  │  SGK İşveren Primi (%15.75)│             5.276,25 TL        │    │
│  │  İşsizlik İşveren (%2)     │               670,00 TL        │    │
│  │  Hazine Teşviki (%5)       │            -1.675,00 TL        │    │
│  │  ──────────────────────────┼─────────────────────────────── │    │
│  │  TOPLAM İŞVEREN PAYI       │             4.271,25 TL        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ╔═════════════════════════════════════════════════════════════╗    │
│  ║  💰 TOPLAM İŞVEREN MALİYETİ        37.771,25 TL             ║    │
│  ╚═════════════════════════════════════════════════════════════╝    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.4. Yönetici Statüsü İçin Tablo (SGK/İşsizlik Yok)

```
┌─────────────────────────────────────────────────────────────────────┐
│  📅 OCAK 2025 - MAAŞ HESAPLAMA DETAYI (YÖNETİCİ)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─── MAAŞ BİLGİLERİ ──────────────────────────────────────────┐    │
│  │  Girilen Net Maaş          │            50.000,00 TL        │    │
│  │  Hesaplanan Brüt Maaş      │            58.750,00 TL        │    │
│  │  Gelir Vergisi Matrahı     │            58.750,00 TL        │    │
│  │  Kümülatif GV Matrahı      │            58.750,00 TL        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─── KESİNTİLER (SADECE VERGİ) ───────────────────────────────┐    │
│  │  SGK İşçi Primi            │          UYGULANMAZ            │    │
│  │  İşsizlik İşçi Primi       │          UYGULANMAZ            │    │
│  │  ──────────────────────────┼─────────────────────────────── │    │
│  │  Hesaplanan Gelir Vergisi  │             8.812,50 TL        │    │
│  │  Asgari Ücret GV İstisnası │            -3.315,70 TL        │    │
│  │  Ödenecek Gelir Vergisi    │             5.496,80 TL        │    │
│  │  ──────────────────────────┼─────────────────────────────── │    │
│  │  Hesaplanan Damga Vergisi  │               445,91 TL        │    │
│  │  Asgari Ücret DV İstisnası │              -197,38 TL        │    │
│  │  Ödenecek Damga Vergisi    │               248,53 TL        │    │
│  │  ──────────────────────────┼─────────────────────────────── │    │
│  │  TOPLAM KESİNTİ            │             5.745,33 TL        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─── İŞVEREN MALİYETLERİ ─────────────────────────────────────┐    │
│  │  SGK İşveren Primi         │          UYGULANMAZ            │    │
│  │  İşsizlik İşveren Primi    │          UYGULANMAZ            │    │
│  │  Hazine Teşviki            │          UYGULANMAZ            │    │
│  │  ──────────────────────────┼─────────────────────────────── │    │
│  │  TOPLAM İŞVEREN PAYI       │                 0,00 TL        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ╔═════════════════════════════════════════════════════════════╗    │
│  ║  💰 TOPLAM İŞVEREN MALİYETİ        58.750,00 TL             ║    │
│  ║     (Brüt maaş = İşveren maliyeti, ek yük yok)              ║    │
│  ╚═════════════════════════════════════════════════════════════╝    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.5. Ay Dropdown Davranışı

1. **Varsayılan:** Mevcut ay seçili gelir
2. **Değişiklik:** Ay değiştiğinde tablo otomatik güncellenir
3. **Kümülatif Etki:** Seçilen aya kadar olan kümülatif matrah hesaba katılır
4. **Yıl Ortası İşe Giriş:** İşe giriş tarihinden önceki aylar seçilemez (disabled)

---

## 8. DOĞRULAMA KURALLARI

1. **Asgari Ücret Kontrolü:** Net maaş, net asgari ücretten (22.104,67 TL) düşük olamaz
2. **SGK Tavan Kontrolü:** Brüt maaş SGK tavanını aşarsa, SGK primi tavan üzerinden hesaplanır
3. **Negatif Vergi Kontrolü:** Hesaplanan vergi negatif olamaz (minimum 0)
4. **İstisna Kontrolü:** İstisna tutarı, hesaplanan vergiden büyük olamaz

---

## 9. VERİTABANI ŞEMASI ÖNERİSİ

```sql
-- Çalışanlar tablosu
CREATE TABLE employees (
  id UUID PRIMARY KEY,
  tc_kimlik_no VARCHAR(11) UNIQUE NOT NULL,
  ad_soyad VARCHAR(100) NOT NULL,
  statu ENUM('NORMAL', 'EMEKLI', 'YONETICI') NOT NULL,
  ise_giris_tarihi DATE NOT NULL,
  net_maas DECIMAL(12,2) NOT NULL,
  sube_id UUID REFERENCES branches(id),
  hazine_tesviki_var BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Aylık hesaplamalar tablosu
CREATE TABLE monthly_calculations (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  yil INT NOT NULL,
  ay INT NOT NULL CHECK (ay BETWEEN 1 AND 12),
  
  -- Maaş değerleri
  net_maas DECIMAL(12,2),
  brut_maas DECIMAL(12,2),
  gelir_vergisi_matrahi DECIMAL(12,2),
  kumulatif_gelir_vergisi_matrahi DECIMAL(15,2),
  
  -- İşçi kesintileri
  sgk_isci_primi DECIMAL(12,2),
  issizlik_isci_primi DECIMAL(12,2),
  gelir_vergisi DECIMAL(12,2),
  gelir_vergisi_istisnasi DECIMAL(12,2),
  damga_vergisi DECIMAL(12,2),
  damga_vergisi_istisnasi DECIMAL(12,2),
  
  -- İşveren payları
  sgk_isveren_primi DECIMAL(12,2),
  issizlik_isveren_primi DECIMAL(12,2),
  hazine_tesviki DECIMAL(12,2),
  
  -- Toplamlar
  toplam_isveren_maliyeti DECIMAL(12,2),
  
  UNIQUE(employee_id, yil, ay)
);

-- Parametreler tablosu (yıllık güncelleme için)
CREATE TABLE salary_parameters (
  yil INT PRIMARY KEY,
  brut_asgari_ucret DECIMAL(12,2),
  net_asgari_ucret DECIMAL(12,2),
  sgk_aylik_tavan DECIMAL(12,2),
  isci_sgk_orani DECIMAL(5,4),
  isci_sgk_orani_emekli DECIMAL(5,4),
  isci_issizlik_orani DECIMAL(5,4),
  isveren_sgk_orani DECIMAL(5,4),
  isveren_sgk_orani_tesvikli DECIMAL(5,4),
  isveren_sgk_orani_emekli DECIMAL(5,4),
  isveren_issizlik_orani DECIMAL(5,4),
  damga_vergisi_orani DECIMAL(6,5),
  hazine_tesviki_orani DECIMAL(5,4),
  gelir_vergisi_dilimleri JSONB
);
```

---

## 10. API ENDPOINT'LERİ

```
POST   /api/employees                    - Yeni çalışan ekle
GET    /api/employees                    - Çalışan listesi
GET    /api/employees/:id                - Çalışan detayı
PUT    /api/employees/:id                - Çalışan güncelle
DELETE /api/employees/:id                - Çalışan sil

POST   /api/calculations/preview         - Önizleme hesaplama (kaydetmeden)
POST   /api/calculations/:employeeId     - 12 aylık hesaplama yap ve kaydet
GET    /api/calculations/:employeeId/:year - Yıllık hesaplama sonuçları

GET    /api/reports/monthly-summary/:year/:month  - Aylık özet rapor
GET    /api/reports/yearly-summary/:year          - Yıllık özet rapor
```

---

## 11. ÖRNEK HESAPLAMALAR (DOĞRULAMA İÇİN)

### 11.1. Normal Çalışan Örneği

**Girdi:** Net Maaş = 28.000 TL, Statü = Normal, Ay = Ocak, %5 Teşvik Var

**Beklenen Çıktı:**
- Brüt Maaş: ~33.500 TL (iteratif hesaplama ile)
- SGK İşçi (%14): 4.690 TL
- İşsizlik İşçi (%1): 335 TL
- GV Matrahı: 28.475 TL
- Hesaplanan GV (%15): 4.271,25 TL
- Asgari Ücret GV İstisnası: 3.315,70 TL
- Net GV: 955,55 TL
- Hesaplanan Damga: 254,27 TL
- Damga İstisnası: 197,38 TL
- Net Damga: 56,89 TL
- İşveren SGK (%15.75): 5.276,25 TL
- İşveren İşsizlik (%2): 670 TL
- **Toplam İşveren Maliyeti:** ~39.446 TL

### 11.2. Yönetici Örneği (SGK/İşsizlik YOK)

**Girdi:** Net Maaş = 50.000 TL, Statü = Yönetici, Ay = Ocak

**Beklenen Çıktı:**
- Brüt Maaş: ~58.750 TL (iteratif hesaplama ile)
- SGK İşçi: **0 TL** (Uygulanmaz)
- İşsizlik İşçi: **0 TL** (Uygulanmaz)
- GV Matrahı: 58.750 TL (Brüt = Matrah, kesinti yok)
- Hesaplanan GV (%15): 8.812,50 TL
- Asgari Ücret GV İstisnası: 3.315,70 TL
- Net GV: 5.496,80 TL
- Hesaplanan Damga: 445,91 TL
- Damga İstisnası: 197,38 TL
- Net Damga: 248,53 TL
- İşveren SGK: **0 TL** (Uygulanmaz)
- İşveren İşsizlik: **0 TL** (Uygulanmaz)
- **Toplam İşveren Maliyeti:** 58.750 TL (Brüt = Maliyet)

### 11.3. Emekli Çalışan Örneği

**Girdi:** Net Maaş = 25.000 TL, Statü = Emekli, Ay = Ocak

**Beklenen Çıktı:**
- SGK İşçi (%7.5): SGDP olarak kesilir
- İşsizlik İşçi: **0 TL**
- İşveren SGK (%24.5): SGDP işveren payı
- İşveren İşsizlik: **0 TL**
- Hazine Teşviki: **Uygulanmaz**

---

## 12. NOTLAR

1. **Asgari Ücret İstisnası:** 2025'te asgari ücretin gelir vergisi matrahı = 26.005,50 × 0.85 = 22.104,675 TL/ay. Her ay için bu tutarın kümülatif vergi karşılığı hesaplanıp, çalışanın vergisinden düşülür.

2. **Yıl Ortası İşe Giriş:** İşe giriş ayından itibaren kümülatif matrah hesabı başlar. Örneğin Mart'ta işe başlayan için Ocak-Şubat hesaplanmaz.

3. **Emekli Çalışanlar:** SGDP (Sosyal Güvenlik Destek Primi) uygulanır. İşsizlik sigortası kesilmez.

4. **Performans:** 12 aylık hesaplama için iteratif brüt hesabı optimize edilmeli. Önbellekleme kullanılabilir.

5. **Para Birimi:** Tüm tutarlar TL, 2 ondalık basamak hassasiyetinde saklanmalı.

---

Bu sistemi tam olarak implemente et. Hesaplama fonksiyonları için birim testler yaz ve örnek hesaplamaları doğrula.
