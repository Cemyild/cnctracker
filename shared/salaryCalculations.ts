/**
 * 2025 Türkiye Maaş Hesaplama Modülü
 * Net Maaş → Brüt Maaş → İşveren Maliyeti hesaplama sistemi
 * 
 * Desteklenen statüler: NORMAL, EMEKLİ, YÖNETİCİ
 */

// ============================================================================
// 2025 SABİT PARAMETRELERİ
// ============================================================================

export const PARAMETRELER_2025 = {
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
    ISCI_SGK_ORANI_YONETICI: 0,        // %0
    ISCI_ISSIZLIK_ORANI_YONETICI: 0,   // %0

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
    ISVEREN_SGK_ORANI_YONETICI: 0,     // %0
    ISVEREN_ISSIZLIK_ORANI_YONETICI: 0, // %0

    // Gelir Vergisi Dilimleri
    GELIR_VERGISI_DILIMLERI: [
        { ustSinir: 158000, oran: 0.15, oncekiDilimVergi: 0 },
        { ustSinir: 330000, oran: 0.20, oncekiDilimVergi: 23700 },
        { ustSinir: 800000, oran: 0.27, oncekiDilimVergi: 58100 },
        { ustSinir: 4300000, oran: 0.35, oncekiDilimVergi: 185000 },
        { ustSinir: Infinity, oran: 0.40, oncekiDilimVergi: 1410000 }
    ]
} as const;

// ============================================================================
// TİP TANIMLARI
// ============================================================================

export type CalisanStatu = 'NORMAL' | 'EMEKLİ' | 'YÖNETİCİ';

export interface MonthlyCalculation {
    ay: number;                        // 1-12
    yil: number;                       // 2025

    // Girdiler
    netMaas: number;

    // Hesaplanan Brüt ve Matrah
    brutMaas: number;
    sgkPrimMatrahi: number;            // SGK tavan kontrolü sonrası
    gelirVergisiMatrahi: number;       // Brüt - (SGK İşçi + İşsizlik İşçi)
    kumulatifGelirVergisiMatrahi: number;  // Sadece ÖNCEKİ ayların toplamı (bu ay dahil değil)

    // İşçi Kesintileri
    sgkIsciPrimi: number;              // Normal: %14, Emekli: %7.5, Yönetici: %0
    issizlikIsciPrimi: number;         // Normal: %1, Emekli: %0, Yönetici: %0
    hesaplananGelirVergisi: number;    // Dilime göre hesaplanan
    hesaplananDamgaVergisi: number;    // Binde 7.59

    // İstisnalar (TÜM statülere uygulanır)
    asgariUcretGelirVergisiIstisnasi: number;
    asgariUcretDamgaVergisiIstisnasi: number;

    // Net Kesintiler (İstisna düşüldükten sonra)
    netGelirVergisi: number;
    netDamgaVergisi: number;

    // İşveren Maliyetleri
    sgkIsverenPrimi: number;           // Normal: %20.75 veya %15.75, Emekli: %24.5, Yönetici: %0
    issizlikIsverenPrimi: number;      // Normal: %2, Emekli: %0, Yönetici: %0
    hazineTesvikiTasarruf: number;     // Bilgi amaçlı (toplamdan düşülmez)

    // Toplamlar
    toplamIsciKesintisi: number;
    toplamIsverenPayi: number;
    toplamIsverenMaliyeti: number;     // Brüt + İşveren Payları
}

// ============================================================================
// YARDIMCI FONKSİYONLAR
// ============================================================================

/**
 * SGK Prim Matrahı Belirleme (Tavan Kontrolü)
 * Brüt maaş SGK tavanını (195.041,40 TL) aşarsa tavan kullanılır
 */
export function sgkPrimMatrahiBelirle(brutMaas: number): number {
    if (brutMaas > PARAMETRELER_2025.SGK_AYLIK_TAVAN) {
        return PARAMETRELER_2025.SGK_AYLIK_TAVAN;
    }
    return brutMaas;
}

/**
 * Statüye göre SGK işçi oranını döndür
 */
function getIsciSgkOrani(statu: CalisanStatu): number {
    switch (statu) {
        case 'EMEKLİ': return PARAMETRELER_2025.ISCI_SGK_ORANI_EMEKLI;
        case 'YÖNETİCİ': return PARAMETRELER_2025.ISCI_SGK_ORANI_YONETICI;
        default: return PARAMETRELER_2025.ISCI_SGK_ORANI;
    }
}

/**
 * Statüye göre İşsizlik işçi oranını döndür
 */
function getIsciIssizlikOrani(statu: CalisanStatu): number {
    switch (statu) {
        case 'EMEKLİ': return PARAMETRELER_2025.ISCI_ISSIZLIK_ORANI_EMEKLI;
        case 'YÖNETİCİ': return PARAMETRELER_2025.ISCI_ISSIZLIK_ORANI_YONETICI;
        default: return PARAMETRELER_2025.ISCI_ISSIZLIK_ORANI;
    }
}

// ============================================================================
// GELİR VERGİSİ HESAPLAMA
// ============================================================================

/**
 * Kümülatif matrah üzerinden toplam vergi hesapla
 */
function dilimeGoreVergiHesapla(kumulatifMatrah: number): number {
    if (kumulatifMatrah <= 0) return 0;

    const dilimler = PARAMETRELER_2025.GELIR_VERGISI_DILIMLERI;
    let oncekiUstSinir = 0;

    for (const dilim of dilimler) {
        if (kumulatifMatrah <= dilim.ustSinir) {
            const fazlaMatrah = kumulatifMatrah - oncekiUstSinir;
            return dilim.oncekiDilimVergi + (fazlaMatrah * dilim.oran);
        }
        oncekiUstSinir = dilim.ustSinir;
    }

    // Son dilim
    const sonDilim = dilimler[dilimler.length - 1];
    return sonDilim.oncekiDilimVergi + ((kumulatifMatrah - 4300000) * sonDilim.oran);
}

/**
 * Aylık gelir vergisi hesapla (kümülatif sistem)
 * TÜM statülere uygulanır (Normal, Emekli, Yönetici)
 */
export function gelirVergisiHesapla(aylikMatrah: number, oncekiKumulatifMatrah: number): number {
    const yeniKumulatifMatrah = oncekiKumulatifMatrah + aylikMatrah;
    const oncekiVergi = dilimeGoreVergiHesapla(oncekiKumulatifMatrah);
    const yeniVergi = dilimeGoreVergiHesapla(yeniKumulatifMatrah);
    return yeniVergi - oncekiVergi; // Bu ayki vergi
}

// ============================================================================
// ASGARİ ÜCRET İSTİSNALARI (TÜM STATÜLERE UYGULANIR)
// ============================================================================

/**
 * Asgari ücret gelir vergisi istisnası hesapla
 * TÜM statülere (Normal, Emekli, Yönetici) uygulanır
 */
export function asgariUcretGelirVergisiIstisnasi(ay: number): number {
    // Asgari ücretin o ayki gelir vergisi matrahını hesapla
    // Asgari ücret matrahı = Brüt * (1 - SGK - İşsizlik) = 26005.50 * 0.85 = 22104.675 TL
    const asgariUcretMatrahi = PARAMETRELER_2025.BRUT_ASGARI_UCRET *
        (1 - PARAMETRELER_2025.ISCI_SGK_ORANI - PARAMETRELER_2025.ISCI_ISSIZLIK_ORANI);

    const asgariUcretKumulatifMatrah = asgariUcretMatrahi * ay;
    const oncekiAsgariKumulatif = asgariUcretMatrahi * (ay - 1);

    const asgariUcretVergi = dilimeGoreVergiHesapla(asgariUcretKumulatifMatrah);
    const oncekiAsgariUcretVergi = dilimeGoreVergiHesapla(oncekiAsgariKumulatif);

    return asgariUcretVergi - oncekiAsgariUcretVergi;
}

/**
 * Asgari ücret damga vergisi istisnası hesapla
 * TÜM statülere (Normal, Emekli, Yönetici) uygulanır
 */
export function asgariUcretDamgaVergisiIstisnasi(): number {
    return PARAMETRELER_2025.BRUT_ASGARI_UCRET * PARAMETRELER_2025.DAMGA_VERGISI_ORANI;
    // = 26005.50 * 0.00759 = 197.38 TL
}

// ============================================================================
// DAMGA VERGİSİ HESAPLAMA
// ============================================================================

/**
 * Damga vergisi hesapla (istisna dahil)
 * TÜM statülere (Normal, Emekli, Yönetici) uygulanır
 */
export function damgaVergisiHesapla(brutMaas: number): { hesaplanan: number; istisna: number; net: number } {
    const hesaplanan = brutMaas * PARAMETRELER_2025.DAMGA_VERGISI_ORANI;
    const istisna = asgariUcretDamgaVergisiIstisnasi();
    const net = Math.max(0, hesaplanan - istisna);
    return { hesaplanan, istisna, net };
}

// ============================================================================
// İŞVEREN MALİYETİ HESAPLAMA
// ============================================================================

interface IsverenMaliyetiSonuc {
    sgkIsverenPrimi: number;
    issizlikIsverenPrimi: number;
    hazineTesvikiTasarruf: number;
    toplamIsverenPayi: number;
    toplamIsverenMaliyeti: number;
}

/**
 * İşveren maliyeti hesapla
 */
export function isverenMaliyetiHesapla(
    brutMaas: number,
    statu: CalisanStatu,
    hazineTesvikiVar: boolean = true
): IsverenMaliyetiSonuc {
    // YÖNETİCİ: İşveren payı YOK, brüt = maliyet
    if (statu === 'YÖNETİCİ') {
        return {
            sgkIsverenPrimi: 0,
            issizlikIsverenPrimi: 0,
            hazineTesvikiTasarruf: 0,
            toplamIsverenPayi: 0,
            toplamIsverenMaliyeti: brutMaas
        };
    }

    // SGK Prim Matrahı (Tavan kontrolü)
    const sgkMatrahi = sgkPrimMatrahiBelirle(brutMaas);

    let sgkIsverenPrimi: number;
    let issizlikIsverenPrimi: number;
    let hazineTesvikiTasarruf: number = 0;

    if (statu === 'EMEKLİ') {
        // EMEKLİ: SGDP (%24.5), İşsizlik yok, Teşvik yok
        sgkIsverenPrimi = sgkMatrahi * PARAMETRELER_2025.ISVEREN_SGK_ORANI_EMEKLI;
        issizlikIsverenPrimi = 0;
        hazineTesvikiTasarruf = 0;
    } else {
        // NORMAL çalışan
        if (hazineTesvikiVar) {
            sgkIsverenPrimi = sgkMatrahi * PARAMETRELER_2025.ISVEREN_SGK_ORANI_TESVIKLI;
            // Tasarruf bilgisi (toplamdan düşülmez)
            hazineTesvikiTasarruf = sgkMatrahi * PARAMETRELER_2025.HAZINE_TESVIKI_ORANI;
        } else {
            sgkIsverenPrimi = sgkMatrahi * PARAMETRELER_2025.ISVEREN_SGK_ORANI;
            hazineTesvikiTasarruf = 0;
        }
        issizlikIsverenPrimi = sgkMatrahi * PARAMETRELER_2025.ISVEREN_ISSIZLIK_ORANI;
    }

    const toplamIsverenPayi = sgkIsverenPrimi + issizlikIsverenPrimi;
    const toplamIsverenMaliyeti = brutMaas + toplamIsverenPayi;

    return {
        sgkIsverenPrimi,
        issizlikIsverenPrimi,
        hazineTesvikiTasarruf,
        toplamIsverenPayi,
        toplamIsverenMaliyeti
    };
}

// ============================================================================
// NET'TEN BRÜT'E DÖNÜŞÜM (İTERATİF)
// ============================================================================

/**
 * Yönetici için Net'ten Brüt'e hesaplama
 * SGK/İşsizlik YOK, sadece GV + DV
 * Brüt = Net + Gelir Vergisi + Damga Vergisi
 */
function nettenBruteHesaplaYonetici(
    netMaas: number,
    kumulatifMatrah: number,
    ay: number
): number {
    let brutTahmin = netMaas * 1.20; // Başlangıç tahmini (daha düşük çünkü SGK yok)
    const MAX_ITERASYON = 100;
    const TOLERANS = 0.01;

    for (let i = 0; i < MAX_ITERASYON; i++) {
        // Yöneticide SGK kesintisi olmadığı için brüt = matrah
        const vergiMatrahi = brutTahmin;

        // Gelir vergisi
        const gelirVergisi = gelirVergisiHesapla(vergiMatrahi, kumulatifMatrah);
        const gvIstisnasi = asgariUcretGelirVergisiIstisnasi(ay);
        const netGelirVergisi = Math.max(0, gelirVergisi - gvIstisnasi);

        // Damga vergisi
        const { net: netDamgaVergisi } = damgaVergisiHesapla(brutTahmin);

        // Hesaplanan net
        const hesaplananNet = brutTahmin - netGelirVergisi - netDamgaVergisi;

        // Fark kontrolü
        const fark = netMaas - hesaplananNet;
        if (Math.abs(fark) < TOLERANS) {
            return brutTahmin;
        }

        // Yeni tahmin
        brutTahmin = brutTahmin + fark;
    }

    return brutTahmin;
}

/**
 * Normal/Emekli için Net'ten Brüt'e hesaplama
 * İteratif hesaplama (Newton-Raphson benzeri)
 */
function nettenBruteHesaplaNormalEmekli(
    netMaas: number,
    statu: CalisanStatu,
    kumulatifMatrah: number,
    ay: number
): number {
    let brutTahmin = netMaas * 1.35; // Başlangıç tahmini
    const MAX_ITERASYON = 100;
    const TOLERANS = 0.01;

    const sgkOrani = getIsciSgkOrani(statu);
    const issizlikOrani = getIsciIssizlikOrani(statu);

    for (let i = 0; i < MAX_ITERASYON; i++) {
        // SGK Prim Matrahı (Tavan kontrolü)
        const sgkMatrahi = sgkPrimMatrahiBelirle(brutTahmin);

        // İşçi kesintileri
        const sgkIsci = sgkMatrahi * sgkOrani;
        const issizlikIsci = sgkMatrahi * issizlikOrani;

        // Gelir vergisi matrahı (gerçek brütten hesaplanır)
        const vergiMatrahi = brutTahmin - sgkIsci - issizlikIsci;

        // Gelir vergisi
        const gelirVergisi = gelirVergisiHesapla(vergiMatrahi, kumulatifMatrah);
        const gvIstisnasi = asgariUcretGelirVergisiIstisnasi(ay);
        const netGelirVergisi = Math.max(0, gelirVergisi - gvIstisnasi);

        // Damga vergisi
        const { net: netDamgaVergisi } = damgaVergisiHesapla(brutTahmin);

        // Hesaplanan net
        const hesaplananNet = brutTahmin - sgkIsci - issizlikIsci - netGelirVergisi - netDamgaVergisi;

        // Fark kontrolü
        const fark = netMaas - hesaplananNet;
        if (Math.abs(fark) < TOLERANS) {
            return brutTahmin;
        }

        // Yeni tahmin
        brutTahmin = brutTahmin + fark;
    }

    return brutTahmin;
}

/**
 * Net'ten Brüt'e ana hesaplama fonksiyonu
 */
export function nettenBruteHesapla(
    netMaas: number,
    statu: CalisanStatu,
    kumulatifMatrah: number,
    ay: number
): number {
    if (statu === 'YÖNETİCİ') {
        return nettenBruteHesaplaYonetici(netMaas, kumulatifMatrah, ay);
    }
    return nettenBruteHesaplaNormalEmekli(netMaas, statu, kumulatifMatrah, ay);
}

// ============================================================================
// AYLIK HESAPLAMA
// ============================================================================

/**
 * Tek ay için tüm hesaplamaları yap
 */
export function aylikHesapla(
    netMaas: number,
    statu: CalisanStatu,
    ay: number,
    yil: number,
    kumulatifMatrah: number,
    hazineTesvikiVar: boolean = true
): MonthlyCalculation {
    // Asgari ücret kontrolü
    if (netMaas < PARAMETRELER_2025.NET_ASGARI_UCRET) {
        throw new Error(`Net maaş (${netMaas} TL), net asgari ücretten (${PARAMETRELER_2025.NET_ASGARI_UCRET} TL) düşük olamaz.`);
    }

    // Net'ten Brüt'e
    const brutMaas = nettenBruteHesapla(netMaas, statu, kumulatifMatrah, ay);

    // SGK Prim Matrahı (Tavan kontrolü)
    const sgkPrimMatrahi = sgkPrimMatrahiBelirle(brutMaas);

    // İşçi oranları
    const sgkOrani = getIsciSgkOrani(statu);
    const issizlikOrani = getIsciIssizlikOrani(statu);

    // İşçi kesintileri
    const sgkIsciPrimi = sgkPrimMatrahi * sgkOrani;
    const issizlikIsciPrimi = sgkPrimMatrahi * issizlikOrani;

    // Gelir vergisi matrahı
    const gelirVergisiMatrahi = brutMaas - sgkIsciPrimi - issizlikIsciPrimi;
    // NOT: kumulatifMatrah sadece ÖNCEKİ ayları içerir, bu ayın matrahı dahil değil

    // Gelir vergisi (TÜM statülere uygulanır)
    const hesaplananGelirVergisi = gelirVergisiHesapla(gelirVergisiMatrahi, kumulatifMatrah);
    const asgariUcretGVIstisnasi = asgariUcretGelirVergisiIstisnasi(ay);
    const netGelirVergisi = Math.max(0, hesaplananGelirVergisi - asgariUcretGVIstisnasi);

    // Damga vergisi (TÜM statülere uygulanır)
    const damgaSonuc = damgaVergisiHesapla(brutMaas);

    // Toplam işçi kesintisi
    const toplamIsciKesintisi = sgkIsciPrimi + issizlikIsciPrimi + netGelirVergisi + damgaSonuc.net;

    // İşveren maliyeti
    const isverenSonuc = isverenMaliyetiHesapla(brutMaas, statu, hazineTesvikiVar);

    return {
        ay,
        yil,
        netMaas,
        brutMaas,
        sgkPrimMatrahi,
        gelirVergisiMatrahi,
        kumulatifGelirVergisiMatrahi: kumulatifMatrah, // Sadece önceki ayların toplamı (bu ay dahil değil)
        sgkIsciPrimi,
        issizlikIsciPrimi,
        hesaplananGelirVergisi,
        hesaplananDamgaVergisi: damgaSonuc.hesaplanan,
        asgariUcretGelirVergisiIstisnasi: asgariUcretGVIstisnasi,
        asgariUcretDamgaVergisiIstisnasi: damgaSonuc.istisna,
        netGelirVergisi,
        netDamgaVergisi: damgaSonuc.net,
        sgkIsverenPrimi: isverenSonuc.sgkIsverenPrimi,
        issizlikIsverenPrimi: isverenSonuc.issizlikIsverenPrimi,
        hazineTesvikiTasarruf: isverenSonuc.hazineTesvikiTasarruf,
        toplamIsciKesintisi,
        toplamIsverenPayi: isverenSonuc.toplamIsverenPayi,
        toplamIsverenMaliyeti: isverenSonuc.toplamIsverenMaliyeti
    };
}

// ============================================================================
// YILLIK HESAPLAMA
// ============================================================================

/**
 * İşe giriş tarihinden ay numarası çıkar (1-12)
 */
export function iseGirisTarihiAyBelirle(iseGirisTarihi: string | Date): number {
    const tarih = typeof iseGirisTarihi === 'string' ? new Date(iseGirisTarihi) : iseGirisTarihi;
    return tarih.getMonth() + 1; // 1-indexed
}

/**
 * 12 aylık yıllık hesaplama
 * İşe giriş tarihinden itibaren başlar, kümülatif matrah 0'dan başlar
 */
export function yillikHesapla(
    netMaas: number,
    statu: CalisanStatu,
    yil: number,
    iseGirisTarihi: string | Date,
    hazineTesvikiVar: boolean = true
): MonthlyCalculation[] {
    const baslangicAyi = iseGirisTarihiAyBelirle(iseGirisTarihi);
    const hesaplamalar: MonthlyCalculation[] = [];
    let kumulatifMatrah = 0;

    for (let ay = baslangicAyi; ay <= 12; ay++) {
        const hesaplama = aylikHesapla(
            netMaas,
            statu,
            ay,
            yil,
            kumulatifMatrah,
            hazineTesvikiVar
        );
        // Bir sonraki ay için kümülatife BU AYIN matrahını ekle
        kumulatifMatrah = kumulatifMatrah + hesaplama.gelirVergisiMatrahi;
        hesaplamalar.push(hesaplama);
    }

    return hesaplamalar;
}

/**
 * Belirli bir ay için hesaplama (önceki ayların kümülatif matrahı hesaplanarak)
 * NOT: işe giriş tarihi artık maaş hesaplamalarında dikkate alınmıyor
 * Her zaman Ocak'tan (ay=1) başlar, 12 ayın tamamı hesaplanabilir
 */
export function belirliAyHesapla(
    netMaas: number,
    statu: CalisanStatu,
    hedefAy: number,
    yil: number,
    _iseGirisTarihi: string | Date, // Artık kullanılmıyor, geriye uyumluluk için tutuldu
    hazineTesvikiVar: boolean = true
): MonthlyCalculation {
    // Her zaman Ocak'tan başla (işe giriş tarihi artık dikkate alınmıyor)
    const baslangicAyi = 1;

    let kumulatifMatrah = 0;

    // Önceki ayları hesapla (kümülatif matrah için)
    for (let ay = baslangicAyi; ay < hedefAy; ay++) {
        const hesaplama = aylikHesapla(
            netMaas,
            statu,
            ay,
            yil,
            kumulatifMatrah,
            hazineTesvikiVar
        );
        // Bir sonraki ay için kümülatife BU AYIN matrahını ekle
        kumulatifMatrah = kumulatifMatrah + hesaplama.gelirVergisiMatrahi;
    }

    // Hedef ayı hesapla
    return aylikHesapla(
        netMaas,
        statu,
        hedefAy,
        yil,
        kumulatifMatrah,
        hazineTesvikiVar
    );
}

// ============================================================================
// DOĞRULAMA İÇİN ÖRNEK HESAPLAMALAR
// ============================================================================

/**
 * Test fonksiyonu - Normal çalışan örneği
 * Input: Net 28.000 TL, Ocak, %5 Teşvik
 * Expected: Brüt ~33.500 TL, İşveren Maliyeti ~39.446 TL
 */
export function testNormalCalisan(): MonthlyCalculation {
    return aylikHesapla(28000, 'NORMAL', 1, 2025, 0, true);
}

/**
 * Test fonksiyonu - Yönetici örneği
 * Input: Net 50.000 TL, Ocak
 * Expected: Brüt ~58.750 TL, İşveren Maliyeti = Brüt
 */
export function testYonetici(): MonthlyCalculation {
    return aylikHesapla(50000, 'YÖNETİCİ', 1, 2025, 0, true);
}

/**
 * Test fonksiyonu - Emekli örneği
 * Input: Net 25.000 TL, Ocak
 */
export function testEmekli(): MonthlyCalculation {
    return aylikHesapla(25000, 'EMEKLİ', 1, 2025, 0, true);
}

// ============================================================================
// 2026 YILI PARAMETRELERİ VE HESAPLAMALARI
// Kaynak: turkey_payroll_2026.md
// ============================================================================

export const PARAMETRELER_2026 = {
    // Asgari Ücret
    BRUT_ASGARI_UCRET: 33030.00,
    NET_ASGARI_UCRET: 28075.50,

    // SGK Taban/Tavan
    SGK_AYLIK_TAVAN: 297270.00,

    // İşçi Kesinti Oranları - NORMAL
    ISCI_SGK_ORANI: 0.14,              // %14
    ISCI_ISSIZLIK_ORANI: 0.01,         // %1

    // İşçi Kesinti Oranları - EMEKLİ (SGDP)
    ISCI_SGK_ORANI_EMEKLI: 0.075,      // %7.5
    ISCI_ISSIZLIK_ORANI_EMEKLI: 0,     // %0

    // İşçi Kesinti Oranları - YÖNETİCİ (SGK/İşsizlik YOK)
    ISCI_SGK_ORANI_YONETICI: 0,        // %0
    ISCI_ISSIZLIK_ORANI_YONETICI: 0,   // %0

    // Damga Vergisi
    DAMGA_VERGISI_ORANI: 0.00759,      // Binde 7.59

    // İşveren Kesinti Oranları - NORMAL
    ISVEREN_SGK_ORANI: 0.2175,         // %21.75 (teşviksiz)
    ISVEREN_SGK_ORANI_TESVIKLI: 0.1975, // %19.75 (%2 indirimli - 5510/81-ı)
    ISVEREN_ISSIZLIK_ORANI: 0.02,      // %2

    // İşveren Kesinti Oranları - EMEKLİ (SGDP)
    ISVEREN_SGK_ORANI_EMEKLI: 0.2475,  // %24.75
    ISVEREN_ISSIZLIK_ORANI_EMEKLI: 0,  // %0

    // İşveren Kesinti Oranları - YÖNETİCİ (HİÇBİRİ UYGULANMAZ)
    ISVEREN_SGK_ORANI_YONETICI: 0,     // %0
    ISVEREN_ISSIZLIK_ORANI_YONETICI: 0, // %0

    // Gelir Vergisi Dilimleri
    GELIR_VERGISI_DILIMLERI: [
        { ustSinir: 190000, oran: 0.15, oncekiDilimVergi: 0 },
        { ustSinir: 400000, oran: 0.20, oncekiDilimVergi: 28500 },
        { ustSinir: 1500000, oran: 0.27, oncekiDilimVergi: 70500 },
        { ustSinir: 5300000, oran: 0.35, oncekiDilimVergi: 367500 },
        { ustSinir: Infinity, oran: 0.40, oncekiDilimVergi: 1697500 }
    ],

    // Aylık Vergi İstisnaları (Ay indeksi 0-11)
    AYLIK_GV_ISTISNALARI: [
        4211.33, 4211.33, 4211.33, 4211.33, 4211.33, 4211.33,  // Ocak-Haziran
        4537.75, 5615.10, 5615.10, 5615.10, 5615.10, 5615.10   // Temmuz-Aralık
    ],
    AYLIK_DV_ISTISNASI: 250.70
} as const;

// 2026 için ayrı hesaplama sonucu tipi
export interface MonthlyCalculation2026 {
    ay: number;
    yil: number;

    // Girdiler
    brutMaas: number;

    // Hesaplanan Matrahlar
    sgkPrimMatrahi: number;
    gelirVergisiMatrahi: number;
    kumulatifGelirVergisiMatrahi: number;

    // İşçi Kesintileri
    sgkIsciPrimi: number;
    issizlikIsciPrimi: number;
    hesaplananGelirVergisi: number;
    hesaplananDamgaVergisi: number;

    // İstisnalar
    asgariUcretGelirVergisiIstisnasi: number;
    asgariUcretDamgaVergisiIstisnasi: number;

    // Net Kesintiler
    netGelirVergisi: number;
    netDamgaVergisi: number;

    // Net Maaş
    netMaas: number;

    // İşveren Maliyetleri
    sgkIsverenPrimi: number;
    issizlikIsverenPrimi: number;
    toplamIsverenPayi: number;
    toplamIsverenMaliyeti: number;
}

// ============================================================================
// 2026 YARDIMCI FONKSİYONLAR
// ============================================================================

function sgkPrimMatrahiBelirle2026(brutMaas: number): number {
    return Math.min(brutMaas, PARAMETRELER_2026.SGK_AYLIK_TAVAN);
}

function getIsciSgkOrani2026(statu: CalisanStatu): number {
    switch (statu) {
        case 'EMEKLİ': return PARAMETRELER_2026.ISCI_SGK_ORANI_EMEKLI;
        case 'YÖNETİCİ': return PARAMETRELER_2026.ISCI_SGK_ORANI_YONETICI;
        default: return PARAMETRELER_2026.ISCI_SGK_ORANI;
    }
}

function getIsciIssizlikOrani2026(statu: CalisanStatu): number {
    switch (statu) {
        case 'EMEKLİ': return PARAMETRELER_2026.ISCI_ISSIZLIK_ORANI_EMEKLI;
        case 'YÖNETİCİ': return PARAMETRELER_2026.ISCI_ISSIZLIK_ORANI_YONETICI;
        default: return PARAMETRELER_2026.ISCI_ISSIZLIK_ORANI;
    }
}

function dilimeGoreVergiHesapla2026(kumulatifMatrah: number): number {
    if (kumulatifMatrah <= 0) return 0;

    const dilimler = PARAMETRELER_2026.GELIR_VERGISI_DILIMLERI;
    let oncekiUstSinir = 0;

    for (const dilim of dilimler) {
        if (kumulatifMatrah <= dilim.ustSinir) {
            const fazlaMatrah = kumulatifMatrah - oncekiUstSinir;
            return dilim.oncekiDilimVergi + (fazlaMatrah * dilim.oran);
        }
        oncekiUstSinir = dilim.ustSinir;
    }

    // Son dilim
    const sonDilim = dilimler[dilimler.length - 1];
    return sonDilim.oncekiDilimVergi + ((kumulatifMatrah - 5300000) * sonDilim.oran);
}

function gelirVergisiHesapla2026(aylikMatrah: number, oncekiKumulatifMatrah: number): number {
    const yeniKumulatifMatrah = oncekiKumulatifMatrah + aylikMatrah;
    const oncekiVergi = dilimeGoreVergiHesapla2026(oncekiKumulatifMatrah);
    const yeniVergi = dilimeGoreVergiHesapla2026(yeniKumulatifMatrah);
    return yeniVergi - oncekiVergi;
}

// ============================================================================
// 2026 ANA HESAPLAMA FONKSİYONU - BRÜTTEN TÜM VERİLERİ HESAPLA
// ============================================================================

/**
 * Brüt maaştan tüm kesinti ve maliyetleri hesapla (2026)
 * PDF'den alınan brüt ücret üzerinden detaylı hesaplama yapar
 */
export function bruttenHesapla2026(
    brutMaas: number,
    statu: CalisanStatu,
    ay: number,  // 1-12
    kumulatifMatrah: number = 0,
    hazineTesvikiVar: boolean = true
): MonthlyCalculation2026 {
    // 1. SGK Prim Matrahı (Tavan kontrolü)
    const sgkPrimMatrahi = sgkPrimMatrahiBelirle2026(brutMaas);

    // 2. İşçi oranları
    const sgkOrani = getIsciSgkOrani2026(statu);
    const issizlikOrani = getIsciIssizlikOrani2026(statu);

    // 3. İşçi kesintileri
    const sgkIsciPrimi = sgkPrimMatrahi * sgkOrani;
    const issizlikIsciPrimi = sgkPrimMatrahi * issizlikOrani;

    // 4. Gelir vergisi matrahı
    const gelirVergisiMatrahi = brutMaas - sgkIsciPrimi - issizlikIsciPrimi;

    // 5. Gelir vergisi hesaplama
    const hesaplananGelirVergisi = gelirVergisiHesapla2026(gelirVergisiMatrahi, kumulatifMatrah);

    // 6. Asgari ücret GV istisnası (ay indeksi 0-11)
    const ayIndex = ay - 1;
    const gvIstisnasi = PARAMETRELER_2026.AYLIK_GV_ISTISNALARI[ayIndex] || 0;
    const netGelirVergisi = Math.max(0, hesaplananGelirVergisi - gvIstisnasi);

    // 7. Damga vergisi
    const hesaplananDamgaVergisi = brutMaas * PARAMETRELER_2026.DAMGA_VERGISI_ORANI;
    const dvIstisnasi = PARAMETRELER_2026.AYLIK_DV_ISTISNASI;
    const netDamgaVergisi = Math.max(0, hesaplananDamgaVergisi - dvIstisnasi);

    // 8. Net maaş
    const netMaas = brutMaas - sgkIsciPrimi - issizlikIsciPrimi - netGelirVergisi - netDamgaVergisi;

    // 9. İşveren maliyetleri
    let sgkIsverenPrimi = 0;
    let issizlikIsverenPrimi = 0;

    if (statu === 'YÖNETİCİ') {
        sgkIsverenPrimi = 0;
        issizlikIsverenPrimi = 0;
    } else if (statu === 'EMEKLİ') {
        sgkIsverenPrimi = sgkPrimMatrahi * PARAMETRELER_2026.ISVEREN_SGK_ORANI_EMEKLI;
        issizlikIsverenPrimi = 0;
    } else {
        // Normal çalışan
        const sgkOran = hazineTesvikiVar
            ? PARAMETRELER_2026.ISVEREN_SGK_ORANI_TESVIKLI
            : PARAMETRELER_2026.ISVEREN_SGK_ORANI;
        sgkIsverenPrimi = sgkPrimMatrahi * sgkOran;
        issizlikIsverenPrimi = sgkPrimMatrahi * PARAMETRELER_2026.ISVEREN_ISSIZLIK_ORANI;
    }

    const toplamIsverenPayi = sgkIsverenPrimi + issizlikIsverenPrimi;
    const toplamIsverenMaliyeti = brutMaas + toplamIsverenPayi;

    return {
        ay,
        yil: 2026,
        brutMaas,
        sgkPrimMatrahi,
        gelirVergisiMatrahi,
        kumulatifGelirVergisiMatrahi: kumulatifMatrah + gelirVergisiMatrahi,
        sgkIsciPrimi,
        issizlikIsciPrimi,
        hesaplananGelirVergisi,
        hesaplananDamgaVergisi,
        asgariUcretGelirVergisiIstisnasi: gvIstisnasi,
        asgariUcretDamgaVergisiIstisnasi: dvIstisnasi,
        netGelirVergisi,
        netDamgaVergisi,
        netMaas,
        sgkIsverenPrimi,
        issizlikIsverenPrimi,
        toplamIsverenPayi,
        toplamIsverenMaliyeti
    };
}
