/**
 * dataFusionEngine.js - Institutional-Grade Data Fusion
 * Merges partial data from multiple providers based on field quality.
 */

class DataFusionEngine {
    constructor() {
        // Field priority: Which fields are 'native' to certain providers
        this.fieldPriority = {
            'price': ['TWELVE_DATA', 'FINNHUB', 'ALPHA_VANTAGE'],
            'pct': ['TWELVE_DATA', 'FINNHUB', 'ALPHA_VANTAGE'],
            'volume': ['FINNHUB', 'ALPHA_VANTAGE'],
            'rsi': ['FINNHUB', 'TWELVE_DATA'],
            'macd': ['FINNHUB', 'TWELVE_DATA']
        };
    }

    /**
     * Merges a new partial result into an existing aggregate.
     * @param {Object} current - The current aggregated data.
     * @param {Object} incoming - New data from a provider.
     * @param {string} source - The name of the incoming source.
     */
    fuse(current, incoming, source) {
        if (!incoming || typeof incoming !== 'object') return current;
        if (!current) return { ...incoming, source, fused_sources: [source] };

        const fused = { ...current };
        fused.fused_sources = fused.fused_sources || [current.source];
        
        if (!fused.fused_sources.includes(source)) {
            fused.fused_sources.push(source);
        }

        // Field-level merging logic
        Object.keys(incoming).forEach(key => {
            const isCritical = ['price', 'symbol', 'timestamp'].includes(key);
            const currentHasValue = fused[key] !== undefined && fused[key] !== null;
            
            // 🛡️ Rule 1: Fill missing values
            if (!currentHasValue) {
                fused[key] = incoming[key];
                return;
            }

            // 🛡️ Rule 2: Override based on priority (if defined)
            const priority = this.fieldPriority[key] || [];
            const currentSourceIndex = priority.indexOf(fused.source);
            const incomingSourceIndex = priority.indexOf(source);

            if (incomingSourceIndex !== -1 && (currentSourceIndex === -1 || incomingSourceIndex < currentSourceIndex)) {
                // If the new source has higher priority (lower index), and it's not a downgrade
                if (incoming[key] !== undefined && incoming[key] !== null) {
                    fused[key] = incoming[key];
                }
            }
        });

        return fused;
    }
}

module.exports = new DataFusionEngine();
