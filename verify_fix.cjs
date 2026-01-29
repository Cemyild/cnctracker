
const TAX_BRACKETS_2026 = [
  { limit: 190000, rate: 0.15 },
  { limit: 400000, rate: 0.20 },
  { limit: 3000000, rate: 0.27 }, 
  { limit: Infinity, rate: 0.35 }
];

const MIN_WAGE_GROSS_2026 = 33030;
const SGK_WORKER_RATE = 0.14; 
const UNEMPLOYMENT_WORKER_RATE = 0.01; 
const STAMP_TAX_RATE = 0.00759; 

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

function calculateNetFromGross(gross, cumulativeTaxBase, cumulativeMinWageTaxBase) {
    // 1. Employee Deductions
    const sgk = gross * 0.14;
    const unemp = gross * 0.01;
    const base = gross - sgk - unemp;

    // 2. Tax (Raw)
    const calcTax = calculateIncomeTax(base, cumulativeTaxBase);
    
    // 3. Min Wage Exemption
    // Min Wage Base = 33030 * 0.85 = 28075.5
    const mwBase = MIN_WAGE_GROSS_2026 * 0.85;
    const mwTax = calculateIncomeTax(mwBase, cumulativeMinWageTaxBase);
    
    const exemption = Math.min(calcTax, mwTax);
    const payableTax = calcTax - exemption;

    // 4. Stamp Tax
    const calcStamp = gross * STAMP_TAX_RATE;
    const mwStamp = MIN_WAGE_GROSS_2026 * STAMP_TAX_RATE;
    const payableStamp = Math.max(0, calcStamp - mwStamp);
    
    // 5. Net
    const net = gross - sgk - unemp - payableTax - payableStamp;
    
    return { 
        net, gross, payableTax, payableStamp, 
        newCumulBase: cumulativeTaxBase + base,
        newCumulMwBase: cumulativeMinWageTaxBase + mwBase
    };
}

function findGross(targetNet, cumBase, cumMwBase) {
    let low = targetNet, high = targetNet * 4;
    let best = null, minDiff = Infinity;
    
    for(let i=0; i<60; i++) {
        let mid = (low+high)/2;
        let res = calculateNetFromGross(mid, cumBase, cumMwBase);
        let diff = res.net - targetNet;
        if(Math.abs(diff) < 0.01) return res;
        if(Math.abs(diff) < minDiff) { minDiff = Math.abs(diff); best = res; }
        if(diff < 0) low = mid; else high = mid;
    }
    return best;
}

// SIMULATE 12 MONTHS
let cumBase = 0;
let cumMwBase = 0;
console.log("Month | Gross | Tax | Stamp | Net");
for(let i=1; i<=12; i++) {
    const res = findGross(50000, cumBase, cumMwBase);
    console.log(`${i} | ${res.gross.toFixed(2)} | ${res.payableTax.toFixed(2)} | ${res.payableStamp.toFixed(2)} | ${res.net.toFixed(2)}`);
    cumBase = res.newCumulBase;
    cumMwBase = res.newCumulMwBase;
}
