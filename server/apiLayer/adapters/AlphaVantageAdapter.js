
const BaseAdapter = require('./BaseAdapter');
require('dotenv').config();

class AlphaVantageAdapter extends BaseAdapter {
    constructor() {
        super('ALPHA_VANTAGE', process.env.ALPHA_VANTAGE_KEY);
        this.baseUrl = 'https://www.alphavantage.co/query';
    }
    async getPrice(symbol) {
        return this.getQuote(symbol);
    }

    async getQuote(symbol) {
        const url = `${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`;
        try {
            const resp = await this.fetchWithTimeout(url);
            if (resp.status === 403) {
                console.warn(`[ALPHA_VANTAGE] 403 Forbidden for ${symbol}. (Plan Restriction)`);
                return 'FORBIDDEN';
            }
            if (!resp.ok) return null;

            const data = await resp.json();
            const quote = data['Global Quote'];
            if (!quote || !quote['05. price']) return null;

            return this.standardize({
                price: parseFloat(quote['05. price']),
                volume: parseInt(quote['06. volume']),
                timestamp: Date.now()
            });
        } catch (e) {
            return null;
        }
    }

    async getIndicators(symbol) {
        const url = `${this.baseUrl}?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${this.apiKey}`;
        try {
            const resp = await this.fetchWithTimeout(url);
            if (!resp.ok) return null;

            const data = await resp.json();
            const series = data['Technical Analysis: RSI'];
            if (!series) return null;

            const latestDate = Object.keys(series)[0];
            return {
                rsi: parseFloat(series[latestDate]['RSI']),
                timestamp: Date.now()
            };
        } catch (e) {
            return null;
        }
    }
}

module.exports = AlphaVantageAdapter;
