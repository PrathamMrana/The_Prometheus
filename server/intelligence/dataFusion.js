const SOURCE_PRIORITY = {
    price: "FINNHUB",
    indicators: "ALPHA_VANTAGE",
    fundamentals: "FMP",
    sentiment: "MARKETAUX",
    macro: "FRED"
};

const SYNC_THRESHOLD = 5000; // 5 seconds

class DataFusion {
    constructor() {
        this.fusedData = new Map();
    }

    fuse(symbol, incomingData, source) {
        let current = this.fusedData.get(symbol) || { _meta: { syncStatus: "OK", lastUnifiedTs: Date.now() } };

        Object.keys(incomingData).forEach(key => {
            const fieldSource = SOURCE_PRIORITY[key] || "DEFAULT";
            
            // 🛡️ Source Priority Conflict Resolution
            if (!current[key] || fieldSource === source) {
                current[key] = incomingData[key];
                current[`${key}_source`] = source;
                current[`${key}_ts`] = Date.now();
            }
        });

        // 🛰️ Unified Timestamp Consistency
        const timestamps = Object.keys(current)
            .filter(k => k.endsWith('_ts'))
            .map(k => current[k]);
        
        const latestTs = Math.max(...timestamps);
        const earliestTs = Math.min(...timestamps);
        
        if (latestTs - earliestTs > SYNC_THRESHOLD) {
            current._meta.syncStatus = "TEMPORAL_MISMATCH";
        } else {
            current._meta.syncStatus = "OK";
        }
        current._meta.lastUnifiedTs = latestTs;

        this.fusedData.set(symbol, current);
        return current;
    }

    get(symbol) {
        return this.fusedData.get(symbol) || null;
    }
}

module.exports = new DataFusion();
