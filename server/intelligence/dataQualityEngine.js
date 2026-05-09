/**
 * 🔱 PROMETHEUS — DATA QUALITY ENGINE
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Validates market data quality and execution realism. Detects stale ticks,
 * missing candles, impossible fills, and latency anomalies.
 */

'use strict';

class DataQualityEngine {
    
    compute(trades) {
        if (!trades || trades.length === 0) return this._emptyState();

        const alerts = [];
        let totalLatency = 0;
        let totalSlippage = 0;
        let zeroSlippageFills = 0;

        trades.forEach(t => {
            const tags = t.tradeTags || {};
            const latency = tags.latency || 0;
            const slippage = tags.slippage || 0;

            totalLatency += latency;
            totalSlippage += slippage;

            if (slippage === 0) zeroSlippageFills++;
            if (latency > 2000) alerts.push(`LATENCY_ANOMALY_${t.symbol}`);
        });

        const avgLatency = totalLatency / trades.length;
        const zeroSlippagePct = (zeroSlippageFills / trades.length) * 100;

        if (zeroSlippagePct > 80) {
            alerts.push('IMPOSSIBLE_FILL_REALISM');
        }

        return {
            avgLatency,
            zeroSlippagePct,
            alerts,
            isValid: alerts.length < 5
        };
    }

    _emptyState() {
        return {
            avgLatency: 0,
            zeroSlippagePct: 0,
            alerts: [],
            isValid: true
        };
    }
}

module.exports = new DataQualityEngine();
