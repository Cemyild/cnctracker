// 2024 Payroll Constants (As requested)
const ASGARI_UCRET_BRUT = 20002.50;
const SGK_TAVAN = 150018.75; // 7.5 * 20002.50

// 2024 Income Tax Brackets
const VERGI_DILIMLERI = [
    { limit: 110000, oran: 0.15 },
    { limit: 230000, oran: 0.20 },
    { limit: 870000, oran: 0.27 },
    { limit: 3000000, oran: 0.35 },
    { limit: Infinity, oran: 0.40 }
];

// Helper: Calculate Income Tax given a base and cumulative previous base
export function hesaplaGelirVergisi(matrah: number, kumulatifOnceki: number): number {
    const kumulatifYeni = kumulatifOnceki + matrah;

    function hesaplaToplamVergi(toplamMatrah: number) {
        let vergi = 0;
        let kalanMatrah = toplamMatrah;
        let oncekiLimit = 0;

        for (const dilim of VERGI_DILIMLERI) {
            const dilimMatrahi = Math.min(Math.max(0, dilim.limit - oncekiLimit), kalanMatrah);
            vergi += dilimMatrahi * dilim.oran;
            kalanMatrah -= dilimMatrahi;
            oncekiLimit = dilim.limit;
            if (kalanMatrah <= 0) break;
        }
        return vergi;
    }

    const toplamVergiYeni = hesaplaToplamVergi(kumulatifYeni);
    const toplamVergiOnceki = hesaplaToplamVergi(kumulatifOnceki);
    return Math.max(0, toplamVergiYeni - toplamVergiOnceki);
}

// Helper: Standard Gross-to-Net Calculation (Forward)
export function calculateForward(gross: number, cumulativeBase: number, statu: string) {
    // 1. SGK Workers Share
    const sgkMatrah = Math.min(gross, SGK_TAVAN);
    let sgkIsci = 0;
    let issizlikIsci = 0;

    if (statu === "NORMAL") {
        sgkIsci = sgkMatrah * 0.14;
        issizlikIsci = sgkMatrah * 0.01;
    } else if (statu === "EMEKLİ") {
        sgkIsci = sgkMatrah * 0.075; // SGDP
        issizlikIsci = 0;
    } else if (statu === "YÖNETİM") {
        sgkIsci = 0;
        issizlikIsci = 0;
    }

    // 2. Tax Base (GVM)
    const gvm = (statu === "YÖNETİM") ? gross : (gross - (sgkIsci + issizlikIsci));

    // 3. Raw Income Tax (Aylık Ham Vergi)
    const hamGV = hesaplaGelirVergisi(gvm, cumulativeBase);

    // 4. Min Wage Exemption (GVK 127)
    // September is Month 9. 
    // Cumulative Min Wage Base = (MinWageGross - SGK - Unemp) * 8 (Jan-Aug)
    // But GVK 127 is calculated on the CUMULATIVE Min Wage Base.
    const mvNetMatrah = ASGARI_UCRET_BRUT * 0.85; // 20002.50 - 15%
    // Assuming we are in September (Month 9): Previous cumulative is 8 * mvNetMatrah
    const kumulatifMinWageBase = mvNetMatrah * 8;

    const asgariUcretHamVergi = hesaplaGelirVergisi(mvNetMatrah, kumulatifMinWageBase);
    const asgariUcretDamgaIstisnasi = ASGARI_UCRET_BRUT * 0.00759;

    // 5. Payable Taxes
    const odenecekGV = Math.max(0, hamGV - asgariUcretHamVergi);

    const hamDV = gross * 0.00759;
    // Management sometimes doesn't get DV exemption? User said "apply standard".
    const odenecekDV = Math.max(0, hamDV - asgariUcretDamgaIstisnasi);

    // 6. Net Salary
    const net = gross - (sgkIsci + issizlikIsci + odenecekGV + odenecekDV);

    return {
        gross,
        net,
        sgkIsci,
        issizlikIsci,
        gvm,
        hamGV,
        odenecekGV,
        odenecekDV,
        sgkMatrah,
        cumulativeBase
    };
}

// Core: Reverse Calculation (Net -> Gross)
export function calculateGrossFromNet(targetNet: number, cumulativeBase: number, statu: string) {
    let low = targetNet;
    let high = targetNet * 2.5;

    // Binary Search / Newton-Raphson approximation
    // First, find reasonable bounds
    let calculated = calculateForward(high, cumulativeBase, statu);
    if (calculated.net < targetNet) high = targetNet * 4;

    let iterations = 0;
    while (high - low > 0.01 && iterations < 50) {
        const mid = (low + high) / 2;
        const result = calculateForward(mid, cumulativeBase, statu);
        if (result.net < targetNet) low = mid;
        else high = mid;
        iterations++;
    }

    // Use best match
    const finalGross = high;
    return calculateTaxesFromGross(finalGross, cumulativeBase, statu);
}

// Calculate Taxes from KNOWN Gross (Use this for recalculation)
export function calculateTaxesFromGross(gross: number, cumulativeBase: number, statu: string) {
    const finalResult = calculateForward(gross, cumulativeBase, statu);

    // Add Employer Costs
    let isverenSgk = 0; // 20.75%
    let isverenIssizlik = 0; // 2%
    let tesvik5510 = 0; // 5%

    if (statu === "NORMAL") {
        isverenSgk = finalResult.sgkMatrah * 0.2075;
        isverenIssizlik = finalResult.sgkMatrah * 0.02;
        tesvik5510 = finalResult.sgkMatrah * 0.05;
    } else if (statu === "EMEKLİ") {
        isverenSgk = finalResult.sgkMatrah * 0.245; // SGDP Employer Share
        isverenIssizlik = 0;
        tesvik5510 = 0;
    } else if (statu === "YÖNETİM") {
        isverenSgk = 0;
        isverenIssizlik = 0;
        tesvik5510 = 0;
    }

    const toplamIsveren = gross + isverenSgk + isverenIssizlik - tesvik5510;

    return {
        ...finalResult,
        isverenSgk,
        isverenIssizlik,
        tesvik5510,
        toplamIsveren
    };
}
