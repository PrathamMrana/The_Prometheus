const fs = require('fs');
const path = require('path');
const sourcePriorityGuard = require('./sourcePriorityGuard');

const CACHE_FILE = path.join(__dirname, '../lkg_cache.json');

class LKGCache {
    constructor() {
        this.cache = {};
        this.loadFromDisk();
    }

    loadFromDisk() {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                const raw = fs.readFileSync(CACHE_FILE, 'utf8');
                this.cache = JSON.parse(raw);
                console.log(`[LKG PERSISTENCE] Loaded ${Object.keys(this.cache).length} entries from disk.`);
            }
        } catch (e) {
            console.error("[LKG PERSISTENCE] Load Failed:", e.message);
        }
    }

    saveToDisk() {
        try {
            const tempFile = CACHE_FILE + '.tmp';
            fs.writeFileSync(tempFile, JSON.stringify(this.cache, null, 2));
            fs.renameSync(tempFile, CACHE_FILE);
        } catch (e) {
            console.error("[LKG PERSISTENCE] Save Failed:", e.message);
        }
    }

    /**
     * Store data if it's valid (non-zero price).
     */
    store(symbol, data) {
        if (data && data.price && data.price > 0) {
            const current = this.cache[symbol];
            if (sourcePriorityGuard.shouldUpdate(current, data)) {
                this.cache[symbol] = {
                    ...data,
                    lkg_timestamp: Date.now(),
                    is_lkg: true
                };
                this.saveToDisk(); // Atomic Sync
            }
        }
    }

    /**
     * Retrieve the last known good data point.
     */
    lastKnownGood(symbol) {
        if (this.cache[symbol]) {
            return {
                ...this.cache[symbol],
                status: 'RECOVERY_MODE'
            };
        }

        return {
            symbol: symbol,
            price: 0,
            status: 'RECOVERY_MODE',
            skip: true
        };
    }

    clear() {
        this.cache = {};
        this.saveToDisk();
    }
}

module.exports = new LKGCache();
