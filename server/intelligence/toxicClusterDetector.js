/**
 * 🔱 PROMETHEUS — TOXIC CLUSTER DETECTOR
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Identifies hidden failure zones where losses cluster together across
 * multi-dimensional conditions (e.g., HIGH_VOL + LOW_BREADTH).
 */

'use strict';

class ToxicClusterDetector {
    
    compute(trades) {
        if (!trades || trades.length < 10) return this._emptyState();

        const clusters = {};

        trades.forEach(t => {
            const tags = t.tradeTags || {};
            const regime = tags.regime || 'UNKNOWN';
            const sector = tags.sector || 'UNKNOWN';
            
            // Derive some basic bucket keys
            const clusterKey = `${regime} + ${sector}`;
            
            if (!clusters[clusterKey]) {
                clusters[clusterKey] = {
                    key: clusterKey,
                    trades: 0,
                    losses: 0,
                    pnlSum: 0
                };
            }

            clusters[clusterKey].trades++;
            clusters[clusterKey].pnlSum += t.pnl;
            if (t.pnl < 0) clusters[clusterKey].losses++;
        });

        const analyzedClusters = Object.values(clusters).map(c => {
            const winRate = c.trades > 0 ? ((c.trades - c.losses) / c.trades) * 100 : 0;
            const avgPnl = c.trades > 0 ? c.pnlSum / c.trades : 0;
            const isToxic = c.trades >= 3 && winRate < 30 && avgPnl < 0;

            return {
                ...c,
                winRate,
                avgPnl,
                isToxic,
                survivability: isToxic ? 'FAIL' : (winRate > 50 ? 'PASS' : 'WARNING')
            };
        });

        const toxicClusters = analyzedClusters.filter(c => c.isToxic).sort((a,b) => a.pnlSum - b.pnlSum);

        let alert = null;
        if (toxicClusters.length > 0) alert = 'TOXIC_REGIME_CLUSTER';

        return {
            clusters: analyzedClusters.sort((a,b) => b.trades - a.trades),
            toxicClusters,
            alert,
            status: alert || 'NO_TOXIC_CLUSTERS'
        };
    }

    _emptyState() {
        return {
            clusters: [],
            toxicClusters: [],
            alert: null,
            status: 'UNKNOWN'
        };
    }
}

module.exports = new ToxicClusterDetector();
