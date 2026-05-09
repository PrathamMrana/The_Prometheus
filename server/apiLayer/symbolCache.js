/**
 * symbolCache.js - Caching Mapped Symbols for Performance
 */

class SymbolCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Gets or sets a mapped symbol for a specific provider.
     */
    get(symbol, provider, resolverFn) {
        const key = `${symbol}:${provider}`;
        if (this.cache.has(key)) return this.cache.get(key);

        const mapped = resolverFn(symbol, provider);
        this.cache.set(key, mapped);
        return mapped;
    }

    clear() {
        this.cache.clear();
    }
}

module.exports = new SymbolCache();
