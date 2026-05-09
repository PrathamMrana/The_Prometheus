/**
 * TwelveDataAdapter - High-Performance Real-Time Quotes.
 */
const BaseAdapter = require('./BaseAdapter');
require('dotenv').config();

class TwelveDataAdapter extends BaseAdapter {
    constructor() {
        super('TWELVE_DATA', process.env.TWELVE_DATA_KEY);
        this.baseUrl = 'https://api.twelvedata.com';
    }

    async getPrice(symbol) {
        console.log(`[TWELVE_DATA] getPrice called for ${symbol}`);
        const encoded = this.encode(symbol);
        const url = `https://api.twelvedata.com/price?symbol=${encoded}&apikey=${this.apiKey}`;
        try {
            const resp = await this.fetchWithTimeout(url);

            if (resp.status === 403) {
                console.warn(`[TWELVE_DATA] 403 Forbidden for ${symbol}. (Plan Restriction)`);
                return 'FORBIDDEN';
            }

            const data = await resp.json();
            
            if (data.status === 'error' || !data.price) {
                const msg = data.message || 'No Price';
                console.error(`[TWELVE_DATA] Error for ${symbol}: ${msg}`);
                
                // If it's a plan restriction or invalid symbol (often restricted for indices), trigger the block cache
                if (msg.includes('Grow or Venture plan') || msg.includes('upgrade') || msg.includes('missing or invalid') || msg.includes('API credits')) {
                    return 'PLAN_RESTRICTED'; 
                }
                return null;
            }

            console.log(`[NETWORK] TwelveData SUCCESS: ${symbol} @ ${data.price}`);
            return this.standardize({
                price: parseFloat(data.price),
                timestamp: Date.now()
            });
        } catch (e) {
            return null;
        }
    }

    async getQuote(symbol) {
        const url = `${this.baseUrl}/quote?symbol=${symbol}&apikey=${this.apiKey}`;
        try {
            const resp = await this.fetchWithTimeout(url);
            if (!resp.ok) return null;

            const data = await resp.json();
            if (!data.price) return null;

            return this.standardize({
                price: parseFloat(data.price),
                volume: parseInt(data.volume || 0),
                timestamp: Date.now()
            });
        } catch (e) {
            return null;
        }
    }
}

module.exports = TwelveDataAdapter;
