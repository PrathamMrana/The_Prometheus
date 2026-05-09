/**
 * blockedSymbolCache - Prevents repeated calls to restricted symbols.
 */
class BlockedSymbolCache {
    constructor() {
        this.cache = new Map();
        this.BLOCK_DURATION = 120000; // 2 Minutes
    }

    block(symbol, provider, ttlMs = 60000) {
        const key = `${symbol}:${provider}`;
        this.cache.set(key, {
            blockedUntil: Date.now() + ttlMs,
            reason: 'PLAN_RESTRICTED'
        });
        console.log(`[BLOCK_CACHE] Blocked ${symbol} on ${provider} for ${ttlMs / 1000}s`);
    }

    isBlocked(symbol, provider) {
        const key = `${symbol}:${provider}`;
        const entry = this.cache.get(key);
        if (!entry) return false;

        if (Date.now() > entry.blockedUntil) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
}

module.exports = new BlockedSymbolCache();
