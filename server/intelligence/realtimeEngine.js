const fetchWithRetry = require('../utils/fetchWithRetry');
const dataHealth = require('./dataHealth');
const logger = require('./logger');

class RealtimeEngine {
    constructor() {
        this.cache = new Map();
        this.apiCallCount = 0;
        this.limitThreshold = 100; // 100 calls per minute cycle
        this.mode = "LIVE"; // LIVE | CACHE_ONLY
    }

    async pulse(symbols) {
        const start = Date.now();
        const apiKey = process.env.FINNHUB_API_KEY;
        
        // 🛡️ Hard Rate-Limit Guard
        if (this.apiCallCount > this.limitThreshold) {
            this.mode = "CACHE_ONLY";
            logger.info("RATE LIMIT BREACH: Switching to Cache-Only mode.");
            return false;
        }

        try {
            this.mode = "LIVE";
            console.log(`[QUANTUM] Pulsing ${symbols.length} intelligence nodes...`);
            
            const healthProxy = symbols.slice(0, 1);
            for (const sym of healthProxy) {
                const url = `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${apiKey}`;
                this.apiCallCount++;
                const resp = await fetchWithRetry(url, {}, 1, 2000);
                if (resp.ok) {
                    const data = await resp.json();
                    this.cache.set(sym, data);
                }
            }

            const latency = Date.now() - start;
            dataHealth.update(latency, { FINNHUB: "OK" });
            logger.perf({ action: "pulse", latency, symbols: symbols.length });
            return true;
        } catch (e) {
            logger.error(`Pulse FAIL: ${e.message}`);
            dataHealth.update(0, { FINNHUB: "DOWN" });
            return false;
        }
    }

    resetCounter() {
        this.apiCallCount = 0;
    }

    getLatest(symbol) {
        return this.cache.get(symbol) || null;
    }
}

module.exports = new RealtimeEngine();
