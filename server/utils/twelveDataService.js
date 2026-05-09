const fetchWithRetry = require('./fetchWithRetry');

class TwelveDataService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.twelvedata.com';
    }

    async getPrice(symbols) {
        try {
            const symStr = Array.isArray(symbols) ? symbols.join(',') : symbols;
            const url = `${this.baseUrl}/price?symbol=${symStr}&apikey=${this.apiKey}`;
            const resp = await fetchWithRetry(url, {}, 1, 3000);
            if (!resp.ok) throw new Error(`TwelveData Error: ${resp.statusText}`);
            return await resp.json();
        } catch (e) {
            console.error("TwelveData REST Error:", e.message);
            return null;
        }
    }

    async getQuote(symbols) {
        try {
            const symStr = Array.isArray(symbols) ? symbols.join(',') : symbols;
            const url = `${this.baseUrl}/quote?symbol=${symStr}&apikey=${this.apiKey}`;
            const resp = await fetchWithRetry(url, {}, 1, 3000);
            if (!resp.ok) throw new Error(`TwelveData Error: ${resp.statusText}`);
            return await resp.json();
        } catch (e) {
            console.error("TwelveData Quote Error:", e.message);
            return null;
        }
    }
}

module.exports = TwelveDataService;
