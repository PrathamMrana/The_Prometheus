/**
 * symbolMapper - Resolves symbols for specific exchanges and providers.
 */
class SymbolMapper {
    constructor() {
        this.indianStocks = [
            'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'ITC', 'LT', 'BAJFINANCE',
            'TATAMOTORS', 'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'MARUTI', 'HINDUNILVR',
            'AXISBANK', 'ADANIENT', 'ASIANPAINT', 'SUNPHARMA', 'TITAN', 'BAJAJ-AUTO'
        ];

        // GLOBAL -> PROVIDER Mapping Logic
        this.mappings = {
            'TWELVE_DATA': {
                '^NSEI': 'NSEI',
                '^BSESN': 'BSESN',
                '^NSEBANK': 'NSEBANK',
                '^NSMIDCP50': 'NSMIDCP50',
                '^GSPC': 'SPX', // Twelve Data uses SPX for S&P 500
                '^IXIC': 'IXIC'
            },
            'FINNHUB': {
                '^GSPC': 'SPY', // ETF fallback for indices
                '^IXIC': 'QQQ',
                '^NSEI': 'NIFTY50.NS'
            }
        };
    }

    resolve(symbol, provider) {
        if (!symbol) return symbol;
        const upperSym = symbol.toUpperCase();

        // 1. INDEX MAPPING
        if (upperSym === "^NSEI") {
            return provider === "TWELVE_DATA" ? "NSEI" : "^NSEI";
        }
        if (upperSym === "^BSESN") {
            return provider === "TWELVE_DATA" ? "BSESN" : "^BSESN";
        }
        if (upperSym === "^IXIC") return "^IXIC";
        if (upperSym === "^GSPC") return "^GSPC";

        // 2. INDIAN STOCK MAPPING (.NS extension)
        if (upperSym.endsWith(".NS")) {
            if (provider === "TWELVE_DATA") {
                return upperSym.replace(".NS", "");
            }
            return upperSym;
        }

        // 3. Fallback for TwelveData NSE suffix if base resolve fails
        const base = upperSym.split('.')[0].split(':')[0];
        if (provider === 'TWELVE_DATA' && this.indianStocks.includes(base)) {
            return `${base}:NSE`;
        }

        return upperSym;
    }
}

module.exports = new SymbolMapper();
