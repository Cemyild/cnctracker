
// Mocking the required constants and functions from the implementation
// Since we can't import TS files directly in node without compilation, I'll copy the core logic here for validation.

const TAX_BRACKETS_2026 = [
  { limit: 190000.00, rate: 0.15 },
  { limit: 400000.00, rate: 0.20 },
  { limit: 1500000.00, rate: 0.27 },
  { limit: 5300000.00, rate: 0.35 },
  { limit: Infinity, rate: 0.40 },
];
const MIN_WAGE_EXEMPTIONS_2026 = [
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
const STAMP_TAX_RATE = 0.00759;
const WORKER_SGK_RATE = 0.14;
const WORKER_UNEMPLOYMENT_RATE = 0.01;

function calculateIncomeTax(base, cumulativeBase) {
  let tax = 0;
  let currentBase = base;
  let currentCumulative = cumulativeBase;

  for (const bracket of TAX_BRACKETS_2026) {
    if (currentBase <= 0) break;
    const limit = bracket.limit;
    if (currentCumulative >= limit) continue;

    const remainingInBracket = limit - currentCumulative;
    const amountInBracket = Math.min(currentBase, remainingInBracket);

    tax += amountInBracket * bracket.rate;
    currentBase -= amountInBracket;
    currentCumulative += amountInBracket;
  }
  return tax;
}

function calculateNetFromGross(gross, cumulativeTaxBase, monthIndex) {
    const sgkWorker = gross * WORKER_SGK_RATE;
    const unempWorker = gross * WORKER_UNEMPLOYMENT_RATE;
    const incomeBase = gross - sgkWorker - unempWorker;
    
    // Tax
    const calcTax = calculateIncomeTax(incomeBase, cumulativeTaxBase);
    
    // Exemptions
    const ex = MIN_WAGE_EXEMPTIONS_2026[monthIndex];
    const exemptionTax = Math.min(calcTax, ex.income);
    const payableTax = calcTax - exemptionTax;
    
    // Stamp
    const calcStamp = gross * STAMP_TAX_RATE;
    const exStamp = Math.min(calcStamp, ex.stamp);
    const payableStamp = calcStamp - exStamp;
    
    const net = gross - sgkWorker - unempWorker - payableTax - payableStamp;
    
    return { net, gross, newCumul: cumulativeTaxBase + incomeBase, payableTax };
}

function findGross(targetNet, cumBase, monthIndex) {
    let low = targetNet, high = targetNet * 4; 
    let best = null;
    for(let i=0; i<60; i++) {
        let mid = (low+high)/2;
        let res = calculateNetFromGross(mid, cumBase, monthIndex);
        if(Math.abs(res.net - targetNet) < 0.01) return res;
        if(res.net < targetNet) low = mid; else high = mid;
        best = res;
    }
    return best;
}

// TEST 50000 TL
let cum = 0;
console.log("Month | Gross | Tax | CumBase");
for(let i=0; i<12; i++) {
    const res = findGross(50000, cum, i);
    console.log(`${i+1} | ${res.gross.toFixed(2)} | ${res.payableTax.toFixed(2)} | ${cum.toFixed(2)}`);
    cum = res.newCumul;
}
