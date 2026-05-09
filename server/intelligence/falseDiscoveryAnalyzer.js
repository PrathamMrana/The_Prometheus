/**
 * 🔱 PROMETHEUS — FALSE DISCOVERY ANALYZER
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Determines if the edge is statistical luck by comparing it against 
 * random baseline strategies and label shuffling.
 */

'use strict';

class FalseDiscoveryAnalyzer {
    
    /**
     * Compute False Discovery metrics
     * @param {Array} trades Array of closed trades
     * @param {Object} analytics Analytics object with expectancy
     */
    compute(trades, analytics) {
        if (!trades || trades.length < 10) return this._emptyState();

        const realExpectancy = analytics?.expectancy?.expectancyPerTrade || 0;
        
        // 1. Monte Carlo Label Shuffle (Random Expectancy Baseline)
        // Shuffle the outcomes (PnL) while keeping the entries the same to see
        // what expectancy we get purely by chance with the same hit-rate distribution.
        let randomExpectancySum = 0;
        const iterations = 100;
        
        for (let i = 0; i < iterations; i++) {
            const shuffledPnL = this._shuffle(trades.map(t => t.pnl));
            const meanPnL = shuffledPnL.reduce((a, b) => a + b, 0) / shuffledPnL.length;
            randomExpectancySum += meanPnL;
        }
        
        const randomExpectancy = randomExpectancySum / iterations;
        
        // 2. Probability of Backtest Overfitting (PBO) Approximation
        // Simplistic proxy: if real expectancy is less than random expectancy + 1 std dev, high PBO risk.
        // For now, we compare Real vs Random.
        const edgePersistence = realExpectancy - randomExpectancy;
        
        // PBO Risk: 0-100%
        let pboRisk = 0;
        if (realExpectancy <= 0) pboRisk = 99;
        else if (edgePersistence <= 0) pboRisk = 90;
        else {
            // How much better than random is it?
            const advantageRatio = realExpectancy / Math.abs(randomExpectancy || 1);
            pboRisk = advantageRatio > 3 ? 5 : advantageRatio > 1.5 ? 20 : 50;
        }

        // Statistical Significance (simplified z-score proxy)
        const statSignificance = (edgePersistence > 0 && trades.length >= 30) ? 
            Math.min(99, 50 + (edgePersistence * Math.sqrt(trades.length))) : 0;

        let alert = null;
        if (pboRisk > 80) alert = 'FALSE_ALPHA_DETECTED';

        return {
            realExpectancy,
            randomExpectancy,
            edgePersistence,
            pboRisk,
            statSignificance,
            alert,
            status: alert || 'NO_FALSE_DISCOVERY'
        };
    }

    _shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    _emptyState() {
        return {
            realExpectancy: 0,
            randomExpectancy: 0,
            edgePersistence: 0,
            pboRisk: 100,
            statSignificance: 0,
            alert: 'INSUFFICIENT_DATA',
            status: 'UNKNOWN'
        };
    }
}

module.exports = new FalseDiscoveryAnalyzer();
