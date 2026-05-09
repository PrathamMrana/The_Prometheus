/**
 * FinnhubAdapter - Standardized US/Global Stock Data.
 */
const BaseAdapter = require('./BaseAdapter');
require('dotenv').config();

class FinnhubAdapter extends BaseAdapter {
    constructor() {
        super('FINNHUB', process.env.FINNHUB_API_KEY);
        this.baseUrl = 'https://finnhub.io/api/v1';
    }

    async getPrice(symbol) {
        // Finnhub supports .NS but sometimes prefers uppercase
        const cleanSym = symbol.toUpperCase();
        const encoded = this.encode(symbol);
        const url = `https://finnhub.io/api/v1/quote?symbol=${encoded}&token=${this.apiKey}`;
        
        try {
            const resp = await this.fetchWithTimeout(url);
            
            if (resp.status === 403) {
                console.warn(`[FINNHUB] 403 Forbidden for ${symbol}. (Plan Restriction)`);
                return 'FORBIDDEN';
            }

            const data = await resp.json();
            if (!data.c || data.v === 0) {
                console.error(`[FINNHUB] No data/zero volume for ${symbol}. (Check Symbol Format)`);
                return null;
            }

            console.log(`[NETWORK] Finnhub SUCCESS: ${symbol} @ ${data.c}`);
            return this.standardize({
                price: data.c,
                previousClose: data.pc,
                pct: data.dp,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error(`[FINNHUB] Critical Error for ${symbol}: ${e.message}`);
            return null;
        }
    }

    async getQuote(symbol) {
        return this.getPrice(symbol); // Same endpoint for Finnhub
    }
}

module.exports = FinnhubAdapter;
