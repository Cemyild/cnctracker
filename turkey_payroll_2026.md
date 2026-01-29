# Türkiye 2026 Yılı Bordro Yasal Kesintileri

Bu dosya, Türkiye'deki bordro hesaplamalarında kullanılacak 2026 yılı yasal kesinti parametrelerini içermektedir.

> **Kaynak:** CottGroup - 05 Ocak 2026  
> **Geçerlilik:** 01 Ocak 2026 ve sonrası

---

## 1. Asgari Ücret (2026)

| Parametre | Değer |
|-----------|-------|
| Brüt Asgari Ücret | 33.030,00 TL |
| Net Asgari Ücret | 28.075,50 TL |

---

## 2. SGK Prime Esas Kazanç Taban ve Tavan Tutarları

| Parametre | Aylık Tutar (TL) |
|-----------|------------------|
| SGK Tabanı | 33.030,00 |
| SGK Tavanı | 297.270,00 |

---

## 3. Sosyal Güvenlik Prim Oranları

### 3.1 Çalışan Kesintileri

| Kesinti Türü | Oran (%) |
|--------------|----------|
| SGK Primi (Çalışan Payı) | 14,00 |
| İşsizlik Sigortası (Çalışan Payı) | 1,00 |
| **Toplam Çalışan Kesintisi** | **15,00** |

### 3.2 İşveren Kesintileri

| Kesinti Türü | Oran (%) |
|--------------|----------|
| SGK Primi (İşveren Payı) | 21,75 |
| İşsizlik Sigortası (İşveren Payı) | 2,00 |
| **Toplam İşveren Payı (İndirimsiz)** | **23,75** |

### 3.3 İşveren SGK Prim İndirimleri

| İndirim Türü | İndirim Oranı (%) | İndirimli İşveren SGK Oranı (%) |
|--------------|-------------------|--------------------------------|
| Standart İndirim (5510/81-ı) | 2,00 | 19,75 |
| İmalat Sektörü İndirimi (2026 sonuna kadar) | 5,00 | 16,75 |

**Not:** İmalat sektörü için 5 puanlık indirim 2026 yılı sonuna kadar geçerlidir.

---

## 4. Gelir Vergisi Tarifeleri (2026)

### 4.1 Ücret Gelirleri İçin Gelir Vergisi Tarifesi

| Gelir Dilimi Alt Sınır (TL) | Gelir Dilimi Üst Sınır (TL) | Vergi Oranı (%) | Önceki Dilim Vergisi (TL) |
|-----------------------------|-----------------------------|-----------------|-----------------------------|
| 0 | 190.000,00 | 15 | 0 |
| 190.000,01 | 400.000,00 | 20 | 28.500,00 |
| 400.000,01 | 1.500.000,00 | 27 | 70.500,00 |
| 1.500.000,01 | 5.300.000,00 | 35 | 367.500,00 |
| 5.300.000,01 | ∞ | 40 | 1.697.500,00 |

### 4.2 Ücret Dışı Gelirler İçin Gelir Vergisi Tarifesi

| Gelir Dilimi Alt Sınır (TL) | Gelir Dilimi Üst Sınır (TL) | Vergi Oranı (%) | Önceki Dilim Vergisi (TL) |
|-----------------------------|-----------------------------|-----------------|-----------------------------|
| 0 | 190.000,00 | 15 | 0 |
| 190.000,01 | 400.000,00 | 20 | 28.500,00 |
| 400.000,01 | 1.000.000,00 | 27 | 70.500,00 |
| 1.000.000,01 | 5.300.000,00 | 35 | 232.500,00 |
| 5.300.000,01 | ∞ | 40 | 1.737.500,00 |

---

## 5. Damga Vergisi

| Parametre | Değer |
|-----------|-------|
| Damga Vergisi Oranı | %0,759 (0,00759) |
| Matrah | Brüt Ücret Toplamı |

---

## 6. Asgari Ücret Vergi İstisnaları (Aylık)

| Ay | Gelir Vergisi İstisnası (TL) | Damga Vergisi İstisnası (TL) |
|----|------------------------------|------------------------------|
| Ocak | 4.211,33 | 250,70 |
| Şubat | 4.211,33 | 250,70 |
| Mart | 4.211,33 | 250,70 |
| Nisan | 4.211,33 | 250,70 |
| Mayıs | 4.211,33 | 250,70 |
| Haziran | 4.211,33 | 250,70 |
| Temmuz | 4.537,75 | 250,70 |
| Ağustos | 5.615,10 | 250,70 |
| Eylül | 5.615,10 | 250,70 |
| Ekim | 5.615,10 | 250,70 |
| Kasım | 5.615,10 | 250,70 |
| Aralık | 5.615,10 | 250,70 |

---

## 7. JSON Formatında Parametreler

```json
{
  "year": 2026,
  "effective_date": "2026-01-01",
  "currency": "TRY",
  
  "minimum_wage": {
    "gross": 33030.00,
    "net": 28075.50
  },
  
  "sgk_limits": {
    "monthly_floor": 33030.00,
    "monthly_ceiling": 297270.00
  },
  
  "employee_contributions": {
    "sgk_premium_rate": 0.14,
    "unemployment_insurance_rate": 0.01,
    "total_rate": 0.15
  },
  
  "employer_contributions": {
    "sgk_premium_rate": 0.2175,
    "unemployment_insurance_rate": 0.02,
    "total_rate_without_discount": 0.2375,
    "sgk_discount_standard": 0.02,
    "sgk_discount_manufacturing": 0.05,
    "total_rate_with_standard_discount": 0.2175,
    "total_rate_with_manufacturing_discount": 0.1875
  },
  
  "income_tax_brackets_wages": [
    { "min": 0, "max": 190000.00, "rate": 0.15, "base_tax": 0 },
    { "min": 190000.01, "max": 400000.00, "rate": 0.20, "base_tax": 28500.00 },
    { "min": 400000.01, "max": 1500000.00, "rate": 0.27, "base_tax": 70500.00 },
    { "min": 1500000.01, "max": 5300000.00, "rate": 0.35, "base_tax": 367500.00 },
    { "min": 5300000.01, "max": null, "rate": 0.40, "base_tax": 1697500.00 }
  ],
  
  "income_tax_brackets_other": [
    { "min": 0, "max": 190000.00, "rate": 0.15, "base_tax": 0 },
    { "min": 190000.01, "max": 400000.00, "rate": 0.20, "base_tax": 28500.00 },
    { "min": 400000.01, "max": 1000000.00, "rate": 0.27, "base_tax": 70500.00 },
    { "min": 1000000.01, "max": 5300000.00, "rate": 0.35, "base_tax": 232500.00 },
    { "min": 5300000.01, "max": null, "rate": 0.40, "base_tax": 1737500.00 }
  ],
  
  "stamp_duty": {
    "rate": 0.00759
  },
  
  "tax_exemptions": {
    "income_tax": {
      "january": 4211.33,
      "february": 4211.33,
      "march": 4211.33,
      "april": 4211.33,
      "may": 4211.33,
      "june": 4211.33,
      "july": 4537.75,
      "august": 5615.10,
      "september": 5615.10,
      "october": 5615.10,
      "november": 5615.10,
      "december": 5615.10
    },
    "stamp_duty": {
      "monthly": 250.70
    }
  }
}
```

---

## 8. Bordro Hesaplama Formülleri

### 8.1 Çalışan Kesintileri

```
SGK_Kesintisi = min(Brüt_Kazanç, SGK_Tavanı) × 0.14
İşsizlik_Kesintisi = min(Brüt_Kazanç, SGK_Tavanı) × 0.01
Toplam_SGK_Kesintisi = SGK_Kesintisi + İşsizlik_Kesintisi

Gelir_Vergisi_Matrahı = Brüt_Kazanç - Toplam_SGK_Kesintisi
Hesaplanan_Gelir_Vergisi = Gelir_Vergisi_Hesapla(Kümülatif_Matrah)
Ödenecek_Gelir_Vergisi = max(0, Hesaplanan_Gelir_Vergisi - Gelir_Vergisi_İstisnası)

Hesaplanan_Damga_Vergisi = Brüt_Kazanç × 0.00759
Ödenecek_Damga_Vergisi = max(0, Hesaplanan_Damga_Vergisi - Damga_Vergisi_İstisnası)

Toplam_Kesinti = Toplam_SGK_Kesintisi + Ödenecek_Gelir_Vergisi + Ödenecek_Damga_Vergisi
Net_Ücret = Brüt_Kazanç - Toplam_Kesinti
```

### 8.2 İşveren Maliyeti

```
İşveren_SGK = min(Brüt_Kazanç, SGK_Tavanı) × İşveren_SGK_Oranı
İşveren_İşsizlik = min(Brüt_Kazanç, SGK_Tavanı) × 0.02
Toplam_İşveren_Maliyeti = Brüt_Kazanç + İşveren_SGK + İşveren_İşsizlik
```

### 8.3 Gelir Vergisi Hesaplama Fonksiyonu (Pseudocode)

```python
def hesapla_gelir_vergisi(kumulatif_matrah, onceki_ay_vergisi):
    dilimler = [
        (190000.00, 0.15, 0),
        (400000.00, 0.20, 28500.00),
        (1500000.00, 0.27, 70500.00),
        (5300000.00, 0.35, 367500.00),
        (float('inf'), 0.40, 1697500.00)
    ]
    
    for i, (ust_sinir, oran, onceki_vergi) in enumerate(dilimler):
        if kumulatif_matrah <= ust_sinir:
            if i == 0:
                alt_sinir = 0
            else:
                alt_sinir = dilimler[i-1][0]
            
            toplam_vergi = onceki_vergi + (kumulatif_matrah - alt_sinir) * oran
            bu_ay_vergisi = toplam_vergi - onceki_ay_vergisi
            return bu_ay_vergisi
    
    return 0
```

---

## 9. Örnek Hesaplamalar

### 9.1 Asgari Ücret Hesaplama (Ocak 2026)

| Kalem | Tutar (TL) |
|-------|------------|
| Brüt Ücret | 33.030,00 |
| SGK Kesintisi (%14) | 4.624,20 |
| İşsizlik Kesintisi (%1) | 330,30 |
| Toplam SGK Kesintisi | 4.954,50 |
| Gelir Vergisi | 0,00 (istisna) |
| Damga Vergisi | 0,00 (istisna) |
| **Net Ücret** | **28.075,50** |

### 9.2 50.000 TL Brüt Ücret Hesaplama (Ocak 2026)

| Kalem | Tutar (TL) |
|-------|------------|
| Brüt Ücret | 50.000,00 |
| SGK Kesintisi (%14) | 7.000,00 |
| İşsizlik Kesintisi (%1) | 500,00 |
| Toplam SGK Kesintisi | 7.500,00 |
| Gelir Vergisi Matrahı | 42.500,00 |
| Hesaplanan Gelir Vergisi (%15) | 6.375,00 |
| Gelir Vergisi İstisnası | 4.211,33 |
| Ödenecek Gelir Vergisi | 2.163,67 |
| Hesaplanan Damga Vergisi | 379,50 |
| Damga Vergisi İstisnası | 250,70 |
| Ödenecek Damga Vergisi | 128,80 |
| **Toplam Kesinti** | **9.792,47** |
| **Net Ücret** | **40.207,53** |

### 9.3 İşveren Maliyeti (Asgari Ücret)

| Kalem | Tutar (TL) |
|-------|------------|
| Brüt Ücret | 33.030,00 |
| İşveren SGK (%21,75) | 7.184,03 |
| İşveren İşsizlik (%2) | 660,60 |
| **Toplam Maliyet (İndirimsiz)** | **40.874,63** |
| **Toplam Maliyet (2 Puan İndirimli)** | **40.214,03** |
| **Toplam Maliyet (5 Puan İndirimli - İmalat)** | **39.223,13** |

---

## 10. Önemli Notlar

1. **Kümülatif Vergi Sistemi:** Türkiye'de gelir vergisi kümülatif olarak hesaplanır. Yılbaşından itibaren toplam matrah dikkate alınır.

2. **SGK Tavanı:** Brüt ücret SGK tavanını aştığında, SGK kesintileri tavan üzerinden hesaplanır.

3. **Vergi İstisnaları:** Asgari ücret düzeyine kadar olan kısım için gelir vergisi ve damga vergisi istisna uygulanır.

4. **İmalat Sektörü:** 2026 yılı sonuna kadar 5 puanlık SGK işveren indirimi geçerlidir.

5. **Asgari Ücret Desteği:** 2026 yılı için 1.270 TL tutarında asgari ücret desteği mevcuttur (hesaplamalara dahil edilmemiştir).

6. **İrtibat Büroları:** Türkiye'deki irtibat bürolarından elde edilen ücret gelirleri gelir vergisinden istisnadır (GVK Madde 23/14).

---

## 11. Resmi Kaynaklar

- Asgari Ücret Kararı: [Resmi Gazete (26.12.2025)](https://www.resmigazete.gov.tr/eskiler/2025/12/20251226-6.pdf)
- 332 Seri No'lu Gelir Vergisi Genel Tebliği: [Resmi Gazete (31.12.2025)](https://www.resmigazete.gov.tr/eskiler/2025/12/20251231M5-30.pdf)
