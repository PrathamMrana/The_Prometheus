/**
 * CacheManager - Multi-Layer TTL Memory & Disk Cache.
 */
const Persistence = require('../utils/persistence');

class CacheManager {
    constructor() {
        this.hotCache = new Map(); // Price (3s)
        this.warmCache = new Map(); // Indicators (60s)
        this.ttls = {
            HOT: 3000,
            WARM: 60000,
            COLD: 3600000 // 1h
        };
    }

    get(symbol, layer = 'HOT') {
        const cache = layer === 'HOT' ? this.hotCache : this.warmCache;
        const entry = cache.get(symbol);

        if (entry && (Date.now() - entry.timestamp < this.ttls[layer])) {
            return entry.data;
        }

        // Check Persistence (Cold Layer fallback)
        const diskCache = Persistence.load();
        const diskEntry = diskCache.get(symbol);
        if (diskEntry && layer === 'COLD') return diskEntry;

        return null;
    }

    set(symbol, data, layer = 'HOT') {
        const cache = layer === 'HOT' ? this.hotCache : this.warmCache;
        cache.set(symbol, {
            data,
            timestamp: Date.now()
        });

        // Sync price data to persistence for cross-layer stability
        if (layer === 'HOT') {
            const diskCache = Persistence.load();
            diskCache.set(symbol, { ...data, timestamp: Date.now() });
            Persistence.save(diskCache);
        }
    }
}

module.exports = new CacheManager();
