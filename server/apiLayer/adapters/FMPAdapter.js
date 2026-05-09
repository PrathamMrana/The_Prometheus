/**
 * FMPAdapter - Institutional-Grade Fundamentals & Quotes.
 */
const BaseAdapter = require('./BaseAdapter');
require('dotenv').config();

class FMPAdapter extends BaseAdapter {
    constructor() {
        super('FMP', process.env.FMP_KEY);
        this.baseUrl = 'https://financialmodelingprep.com/api/v3';
    }

    async getPrice(symbol) {
        const url = `${this.baseUrl}/quote/${symbol}?apikey=${this.apiKey}`;
        try {
            const resp = await this.fetchWithTimeout(url);
            if (resp.status === 403) {
                console.warn(`[FMP] 403 Forbidden for ${symbol}. Plan restriction or invalid key.`);
                return 'PLAN_RESTRICTED';
            }
            if (!resp.ok) return null;

            const data = await resp.json();
            if (!data[0]) return null;

            return this.standardize({
                price: data[0].price,
                volume: data[0].volume,
                timestamp: Date.now()
            });
        } catch (e) {
            return null;
        }
    }

    async getFundamentals(symbol) {
        const url = `${this.baseUrl}/profile/${symbol}?apikey=${this.apiKey}`;
        try {
            const resp = await this.fetchWithTimeout(url);
            if (!resp.ok) return null;

            const data = await resp.json();
            if (!data[0]) return null;

            return {
                marketCap: data[0].mktCap,
                pe: data[0].pe,
                description: data[0].description,
                timestamp: Date.now()
            };
        } catch (e) {
            return null;
        }
    }
}

module.exports = FMPAdapter;
