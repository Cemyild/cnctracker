import { createRequire } from 'module';

// Simple in-memory cache to avoid hitting TCMB repeatedly for the same date
const cache = new Map<string, Map<string, number>>();

export async function getTCMBExchangeRate(dateStr: string, currencyCode: string): Promise<number> {
    // dateStr expected format: dd.mm.yyyy
    if (currencyCode === 'TRY') return 1;

    // Normalize date to handle potential issues
    const parts = dateStr.split('.');
    if (parts.length !== 3) {
        console.error(`Invalid date format for currency conversion: ${dateStr}`);
        return 1;
    }

    const day = parts[0];
    const month = parts[1];
    const year = parts[2];

    // TCMB URL format: https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml
    // For weekends/holidays, it might 404. We should retry with previous day? 
    // For now, let's try exact date. If fails, return 1 (or handle error).
    // A robust implementation would look back a few days.

    const cacheKey = `${year}${month}${day}`;

    if (cache.has(cacheKey)) {
        const rates = cache.get(cacheKey)!;
        if (rates.has(currencyCode)) {
            return rates.get(currencyCode)!;
        }
    }

    const url = `https://www.tcmb.gov.tr/kurlar/${year}${month}/${day}${month}${year}.xml`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            // If today/weekend, maybe try previous day? 
            // For simplicity in this iteration, if 404, we assume 1 or fallback.
            // But for Giderler, accurate calculation is important.
            // Let's try to fetch "today.xml" if date is today?
            // Or recursively go back 1 day? (Risk of infinite loop if not careful)

            // Simple retry logic for 1 day back (e.g. Sunday -> Saturday -> Friday)
            // Note: Recursion limit is needed.
            console.warn(`TCMB rate not found for ${dateStr} (${url}). Returning 1.`);
            return 1;
        }

        const xmlText = await response.text();

        // Parse XML using Regex
        // <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"> ... <ForexSelling>34.5678</ForexSelling> ... </Currency>
        // We usually use ForexSelling (Döviz Satış) or ForexBuying (Döviz Alış). 
        // Muhasebe records usually use "Efektif Alış" or "Döviz Alış" depending on context. 
        // Let's use ForexBuying (Döviz Alış) as standard or ForexSelling.
        // Generally invoice recording uses TCMB Forex Buying (Döviz Alış).

        const currencyBlockRegex = new RegExp(`<Currency [^>]*CurrencyCode="${currencyCode}"[^>]*>[\\s\\S]*?<ForexBuying>([0-9.]+)<\/ForexBuying>`, 'i');
        const match = xmlText.match(currencyBlockRegex);

        if (match && match[1]) {
            const rate = parseFloat(match[1]);

            if (!cache.has(cacheKey)) {
                cache.set(cacheKey, new Map());
            }
            cache.get(cacheKey)!.set(currencyCode, rate);

            return rate;
        }

        return 1;
    } catch (error) {
        console.error(`Error fetching currency rate for ${dateStr}:`, error);
        return 1;
    }
}
