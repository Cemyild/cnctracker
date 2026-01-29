
// 2026 Parametreleri - Kaynak: turkey_payroll_2026.md

// 1. Asgari Ücret
export const MIN_WAGE_GROSS_2026 = 33030.00;
export const MIN_WAGE_NET_2026 = 28075.50; // Bilgi amaçlı

// 2. SGK Limitleri
export const SGK_CEILING_2026 = 297270.00;

// 3. Vergi Dilimleri (Madde 4.1)
export const TAX_BRACKETS_2026 = [
  { limit: 190000.00, rate: 0.15 },
  { limit: 400000.00, rate: 0.20 },
  { limit: 1500000.00, rate: 0.27 },
  { limit: 5300000.00, rate: 0.35 },
  { limit: Infinity, rate: 0.40 },
];

// 4. Oranlar
export const STAMP_TAX_RATE = 0.00759;

// Çalışan Kesintileri
export const WORKER_SGK_RATE = 0.14;
export const WORKER_UNEMPLOYMENT_RATE = 0.01;

// Emekli Çalışan Kesintileri (Dosyada yok ama standart SGDP)
export const RETIRED_WORKER_SGK_RATE = 0.075;
export const RETIRED_WORKER_UNEMPLOYMENT_RATE = 0.00;

// İşveren Oranları (Dosya Madde 3.2 ve 3.3)
export const EMPLOYER_SGK_RATE_BASE = 0.2175; // İndirimsiz
export const EMPLOYER_UNEMPLOYMENT_RATE = 0.02;

// İndirimler
export const DISCOUNT_5510_POINTS = 0.02; // Dosyada "2,00" yazıyor (Madde 3.3)

// Asgari Ücret Vergi İstisnaları (Madde 6)
export const MIN_WAGE_EXEMPTIONS_2026 = [
    { month: 1, income: 4211.33, stamp: 250.70 },
    { month: 2, income: 4211.33, stamp: 250.70 },
    { month: 3, income: 4211.33, stamp: 250.70 },
    { month: 4, income: 4211.33, stamp: 250.70 },
    { month: 5, income: 4211.33, stamp: 250.70 },
    { month: 6, income: 4211.33, stamp: 250.70 },
    { month: 7, income: 4537.75, stamp: 250.70 },
    { month: 8, income: 5615.10, stamp: 250.70 },
    { month: 9, income: 5615.10, stamp: 250.70 },
    { month: 10, income: 5615.10, stamp: 250.70 },
    { month: 11, income: 5615.10, stamp: 250.70 },
    { month: 12, income: 5615.10, stamp: 250.70 },
];

export interface CalculationParams {
  employeeType: "normal" | "retired";
  hasBes: boolean;
  disabilityDegree: 0 | 1 | 2 | 3;
  isTreasuryIncentiveApplied?: boolean; // 5510 %2 İndirimi
}

export interface SalaryResult {
  month: number;
  gross: number;
  sgkBase: number;
  sgkWorker: number;
  unemploymentWorker: number;
  incomeTaxBase: number; 
  cumulativeTaxBase: number; 
  incomeTax: number;
  minWageTaxExemption: number;
  payableTax: number;
  stampTax: number;
  minWageStampExemption: number;
  payableStampTax: number;
  besDeduction: number;
  net: number;
  employerCost: number; 
}

// Engellilik İndirimleri (Dosyada yok, E eski koddan alıyoruz veya 0 varsayıyoruz, 
// kullanıcı özellikle belirtmedi ama UI'da var. Standart devam.)
export const DISABILITY_DEDUCTIONS = {
    0: 0,
    1: 6900, // Varsayılan
    2: 4000,
    3: 1700
};

// --- HESAPLAMA MOTORU ---

function calculateIncomeTax(base: number, cumulativeBase: number): number {
  let tax = 0;
  let currentBase = base;
  let currentCumulative = cumulativeBase;

  for (const bracket of TAX_BRACKETS_2026) {
    if (currentBase <= 0) break;
    const limit = bracket.limit;
    
    // Dilim aşılmış mı?
    if (currentCumulative >= limit) continue;

    // Dilim içi kullanılabilir alan
    const remainingInBracket = limit - currentCumulative;
    const amountInBracket = Math.min(currentBase, remainingInBracket);

    tax += amountInBracket * bracket.rate;

    currentBase -= amountInBracket;
    currentCumulative += amountInBracket;
  }
  return tax;
}

export function calculateNetFromGross(
  grossSalary: number,
  cumulativeTaxBase: number,
  monthIndex: number, // 0-11
  params: CalculationParams
): SalaryResult {
    const { employeeType, hasBes, disabilityDegree, isTreasuryIncentiveApplied } = params;

    // 1. SGK Taban/Tavan Kontrolü
    const sgkBase = Math.min(grossSalary, SGK_CEILING_2026);

    // 2. Prim Oranları
    let workerSgkRate = WORKER_SGK_RATE;
    let workerUnempRate = WORKER_UNEMPLOYMENT_RATE;
    
    if (employeeType === "retired") {
        workerSgkRate = RETIRED_WORKER_SGK_RATE; // 7.5%
        workerUnempRate = RETIRED_WORKER_UNEMPLOYMENT_RATE; // 0%
    }

    const sgkWorker = sgkBase * workerSgkRate;
    const unemploymentWorker = sgkBase * workerUnempRate;

    // 3. Gelir Vergisi Matrahı
    const disability = DISABILITY_DEDUCTIONS[disabilityDegree] || 0;
    const rawIncomeBase = grossSalary - (sgkWorker + unemploymentWorker);
    const taxableBase = Math.max(0, rawIncomeBase - disability);

    // 4. Vergi Hesaplama
    const calculatedIncomeTax = calculateIncomeTax(taxableBase, cumulativeTaxBase);
    
    // 5. Vergi İstisnaları
    const exemptions = MIN_WAGE_EXEMPTIONS_2026[monthIndex];
    // Emekli için istisna var mı? Kanunen var.
    // İstisna tutarı hesaplanan vergiden büyük olamaz.
    const exemptionTax = Math.min(calculatedIncomeTax, exemptions.income);
    const payableTax = calculatedIncomeTax - exemptionTax;

    // 6. Damga Vergisi
    const calculatedStamp = grossSalary * STAMP_TAX_RATE;
    const exemptionStamp = Math.min(calculatedStamp, exemptions.stamp);
    const payableStamp = calculatedStamp - exemptionStamp;

    // 7. BES
    const besDeudction = hasBes ? grossSalary * 0.03 : 0;

    // 8. NET
    const net = grossSalary - sgkWorker - unemploymentWorker - payableTax - payableStamp - besDeudction;

    // 9. İşveren Maliyeti
    let employerSgkRate = EMPLOYER_SGK_RATE_BASE; // 21.75%
    let employerUnempRate = EMPLOYER_UNEMPLOYMENT_RATE; // 2%
    
    if (employeeType === "retired") {
        employerSgkRate = 0.2475; // SGDP İşveren Standart (24.75%)
        employerUnempRate = 0;
    } else {
        // Normal Çalışan
        if (isTreasuryIncentiveApplied) {
            // Dosyada: Standart İndirim %2 -> İndirimli Oran %19.75
            // Base 21.75 - 2.00 = 19.75
            employerSgkRate = 0.1975;
        }
    }
    
    // İşveren Tavanı
    const employerSgkCost = sgkBase * employerSgkRate;
    const employerUnempCost = sgkBase * employerUnempRate;
    const employerCost = grossSalary + employerSgkCost + employerUnempCost;

    return {
        month: monthIndex + 1,
        gross: grossSalary,
        sgkBase,
        sgkWorker,
        unemploymentWorker,
        incomeTaxBase: taxableBase,
        cumulativeTaxBase: cumulativeTaxBase + taxableBase,
        incomeTax: calculatedIncomeTax,
        minWageTaxExemption: exemptionTax,
        payableTax,
        stampTax: calculatedStamp,
        minWageStampExemption: exemptionStamp,
        payableStampTax: payableStamp,
        besDeduction: besDeudction,
        net,
        employerCost
    };
}

export function findGrossFromNet(
  targetNet: number,
  cumulativeTaxBase: number,
  monthIndex: number,
  params: CalculationParams
): SalaryResult {
    let low = targetNet;
    let high = targetNet * 4;
    
    let bestResult: SalaryResult | null = null;
    let minDiff = Infinity;
    
    for(let i=0; i<60; i++) {
        const mid = (low + high) / 2;
        const res = calculateNetFromGross(mid, cumulativeTaxBase, monthIndex, params);
        const diff = res.net - targetNet;
        
        if (Math.abs(diff) < 0.01) {
            bestResult = res;
            break;
        }
        
        if(Math.abs(diff) < minDiff) {
            minDiff = Math.abs(diff);
            bestResult = res;
        }

        if (diff < 0) low = mid; else high = mid;
    }
    return bestResult!;
}

// 12 Aylık Hesaplayıcı
export function calculateYearlySalary(
    monthlyNetSalaries: number[], 
    params: CalculationParams
): SalaryResult[] {
    const results: SalaryResult[] = [];
    let currentCumulativeTaxBase = 0;

    for (let i = 0; i < 12; i++) {
        const targetNet = monthlyNetSalaries[i] || 0;
        let result: SalaryResult;

        if (targetNet > 0) {
            result = findGrossFromNet(targetNet, currentCumulativeTaxBase, i, params);
        } else {
            result = calculateNetFromGross(0, currentCumulativeTaxBase, i, params);
        }
        
        results.push(result);
        currentCumulativeTaxBase = result.cumulativeTaxBase;
    }
    
    return results;
}
