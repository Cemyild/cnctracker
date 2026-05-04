// Simple in-memory cache to avoid hitting TCMB repeatedly for the same date
const cache = new Map<string, Map<string, number>>();

// Para birimi yazılım/format farklarını kanonik koda eşler.
// Excel'de "Euro", "EURO", "EUR ", "TL", "Dolar" gibi varyantlar gelebiliyor.
export function normalizeCurrencyCode(raw: unknown): string {
    if (raw == null) return "TRY";
    const u = String(raw).trim().toUpperCase();
    if (!u || u === "TL" || u === "TRY" || u === "TÜRK LİRASI" || u === "TURK LIRASI") return "TRY";
    if (u === "EUR" || u === "EURO" || u === "AVRO") return "EUR";
    if (u === "USD" || u === "DOLAR" || u === "DOLLAR" || u === "$") return "USD";
    if (u === "GBP" || u === "STERLİN" || u === "STERLIN" || u === "POUND") return "GBP";
    if (u === "CHF" || u === "İSVİÇRE FRANGI") return "CHF";
    if (u === "JPY" || u === "JAPON YENİ" || u === "YEN") return "JPY";
    return u;
}

// dd.mm.yyyy → bir gün öncesinin dd.mm.yyyy'si (UTC, ay/yıl sınırlarını korur)
function previousDayString(dateStr: string): string | null {
    const parts = dateStr.split('.');
    if (parts.length !== 3) return null;
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() - 1);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = String(date.getUTCFullYear());
    return `${day}.${month}.${year}`;
}

const MAX_FALLBACK_DAYS = 7;

export async function getTCMBExchangeRate(
    dateStr: string,
    currencyCode: string,
    retriesLeft: number = MAX_FALLBACK_DAYS,
): Promise<number> {
    // dateStr expected format: dd.mm.yyyy
    const code = normalizeCurrencyCode(currencyCode);
    if (code === 'TRY') return 1;

    const parts = dateStr.split('.');
    if (parts.length !== 3) {
        console.error(`Invalid date format for currency conversion: ${dateStr}`);
        return 1;
    }
    const [day, month, year] = parts;

    const cacheKey = `${year}${month}${day}`;
    if (cache.has(cacheKey)) {
        const rates = cache.get(cacheKey)!;
        if (rates.has(code)) {
            return rates.get(code)!;
        }
    }

    // TCMB URL format: https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml
    // Hafta sonu / resmi tatil → 404. Bir önceki iş gününe gerile (TR muhasebe pratiği).
    const url = `https://www.tcmb.gov.tr/kurlar/${year}${month}/${day}${month}${year}.xml`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404 && retriesLeft > 0) {
                const prev = previousDayString(dateStr);
                if (prev) {
                    return await getTCMBExchangeRate(prev, code, retriesLeft - 1);
                }
            }
            console.warn(`TCMB rate not found for ${dateStr} (${url}) after ${MAX_FALLBACK_DAYS - retriesLeft} retries. Returning 1.`);
            return 1;
        }

        const xmlText = await response.text();

        // ForexBuying (Döviz Alış) — fatura kayıtlarında standart
        const currencyBlockRegex = new RegExp(
            `<Currency [^>]*CurrencyCode="${code}"[^>]*>[\\s\\S]*?<ForexBuying>([0-9.]+)<\/ForexBuying>`,
            'i',
        );
        const match = xmlText.match(currencyBlockRegex);

        if (match && match[1]) {
            const rate = parseFloat(match[1]);
            if (!cache.has(cacheKey)) cache.set(cacheKey, new Map());
            cache.get(cacheKey)!.set(code, rate);
            return rate;
        }

        // XML alındı ama bu para birimi kodu içinde yok — fallback yapma, 1 dön.
        console.warn(`TCMB XML for ${dateStr} has no entry for currency '${code}'. Returning 1.`);
        return 1;
    } catch (error) {
        console.error(`Error fetching currency rate for ${dateStr}:`, error);
        return 1;
    }
}
