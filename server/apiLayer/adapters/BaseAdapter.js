/**
 * BaseAdapter - Standardized interface for all Prometheus Data Sources.
 */
class BaseAdapter {
    constructor(name, apiKey) {
        this.name = name;
        this.apiKey = apiKey;
        this.timeout = 5000; // Relaxed to 5s for institutional resilience
    }

    // ── CORE INTERFACE ──────────────────────────────────────────────────────

    async getPrice(symbol) { throw new Error(`getPrice not implemented for ${this.name}`); }
    async getQuote(symbol) { throw new Error(`getQuote not implemented for ${this.name}`); }
    async getIndicators(symbol) { throw new Error(`getIndicators not implemented for ${this.name}`); }
    async getFundamentals(symbol) { throw new Error(`getFundamentals not implemented for ${this.name}`); }
    
    // ── UTILS ───────────────────────────────────────────────────────────────

    /**
     * Standardized symbol encoder for URL safety (e.g. M&M -> M%26M)
     */
    encode(symbol) {
        return encodeURIComponent(symbol);
    }

    /**
     * Standardized standardizer for API responses.
     */
    standardize(data, symbol) {
        return {
            ...data, // 🛡️ PRESERVE ALL FIELDS (prevClose, percent, etc.)
            price: data.price || 0,
            volume: data.volume || 0,
            symbol: symbol,
            timestamp: data.timestamp || Date.now(),
            source: this.name,
            status: 'LIVE'
        };
    }

    /**
     * Wrap fetch with mandatory timeout.
     */
    async fetchWithTimeout(url, options = {}) {
        console.log(`[NETWORK] Fetching: ${url.replace(/token=[^&]+|apikey=[^&]+|Authorization: Bearer [^&]+/g, 'KEY=REDACTED')}`);
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            if (!response.ok) {
                console.warn(`[NETWORK] Request failed with status ${response.status}: ${url}`);
            }
            return response;
        } catch (e) {
            clearTimeout(id);
            console.error(`[NETWORK] Critical Error fetching ${url}: ${e.message}`);
            throw e;
        }
    }
}

module.exports = BaseAdapter;
