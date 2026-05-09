/**
 * workerProxy - Safe Wrap for Data Loop logic.
 */
const apiManager = require('./apiLayer/apiManager');

class WorkerProxy {
    constructor() {
        this.status = 'READY';
    }

    /**
     * Institutional Fetch: Routing via Universal API Layer.
     */
    async getQuote(symbol, priority = 1) {
        return await apiManager.fetch('PRICE', symbol, priority);
    }

    /**
     * Batch Institutional Fetch: Standardized Multi-Symbol Pulse.
     */
    async getQuotes(symbols, priority = 1) {
        const results = await Promise.all(
            symbols.map(s => this.getQuote(s, priority))
        );
        return results.filter(r => r !== null);
    }

    /**
     * Multi-Factor Enrichment: Indicators & Fundamentals.
     */
    async enrich(symbol) {
        const indicators = await apiManager.fetch('INDICATORS', symbol, 1);
        const fundamentals = await apiManager.fetch('FUNDAMENTALS', symbol, 1);
        
        return {
            rsi: indicators ? indicators.rsi : null,
            macd: indicators ? indicators.macd : null,
            pe: fundamentals ? fundamentals.pe : null,
            marketCap: fundamentals ? fundamentals.marketCap : null
        };
    }

    getHealth() {
        return apiManager.getHealth();
    }
}

module.exports = new WorkerProxy();
