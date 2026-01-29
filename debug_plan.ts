
export const MIN_WAGE_GROSS_2026 = 33030; // From Excel
export const TAX_BRACKETS_2026 = [
  { limit: 190000, rate: 0.15 }, // From Excel Month 3-4 transition
  { limit: 400000, rate: 0.20 }, // From Excel Month 7-8 transition
  { limit: 2000000, rate: 0.27 }, // Estimated cap
  { limit: Infinity, rate: 0.35 }
];

export const SGK_WORKER_RATE = 0.14;
export const UNEMPLOYMENT_WORKER_RATE = 0.01;
export const STAMP_TAX_RATE = 0.00759;

// Employer Costs (Derived from 21.75% effective rate in Excel)
// Standard: 20.5 (SGK) + 2 (Unemp) = 22.5%
// Excel shows 21.75% with "Yes" to incentive. 
// Discrepancy: Maybe Short Term Insurance is 2%? 
// 22.5 - 5 = 17.5. 
// Why 21.75? 
// Let's use the explicit rates found:
// With Incentive: 1.2175
// Without Incentive: 1.2675 (Assumed +5%)
export const EMPLOYER_COST_RATE_WITH_INCENTIVE = 0.2175;
export const EMPLOYER_COST_RATE_NO_INCENTIVE = 0.2675;

// Helper to calc Min Wage cumulative stats for exemptions
export function getMinWageExemptions(
    month: number, 
    cumulativeMinWageBase: number
): { incomeTaxExemption: number, stampTaxExemption: number, newCumulativeBase: number } {
    const gross = MIN_WAGE_GROSS_2026;
    const sgk = gross * 0.15; // 14+1
    const base = gross - sgk;
    
    // Calculate Tax on Min Wage Base
    const tax = calculateIncomeTax(base, cumulativeMinWageBase);
    const stamp = gross * STAMP_TAX_RATE;
    
    return {
        incomeTaxExemption: tax,
        stampTaxExemption: stamp,
        newCumulativeBase: cumulativeMinWageBase + base
    };
}
