'use strict';

const { ledger, EVENT_TYPES } = require('../engine/executionLedger');

const THRESHOLDS = {
    expectancyWarning:    -50,   
    winRateWarning:        30,   
    profitFactorWarning:  0.7,   
    consecutiveDecay:       3    
};

/**
 * 🔱 PROMETHEUS — EDGE STABILITY MONITOR
 * 
 * Task 5: Add longitudinal statistical tracking.
 * Detects silent edge degradation BEFORE catastrophic collapse.
 */
class EdgeDecayMonitor {
    constructor() {
        this._windows20  = [];   
        this._windows50  = [];   
        this._decayCount = 0;
    }

    compute(closedTrades) {
        if (!closedTrades || closedTrades.length === 0) {
            return { status: 'INSUFFICIENT_DATA', trades: 0 };
        }

        const sorted = [...closedTrades].sort((a, b) => a.timestamp - b.timestamp);
        const roll20 = this._rollingWindow(sorted, 20);
        const roll50 = this._rollingWindow(sorted, 50);

        // ── Task 5: Longitudinal Tracking ───────────────────────────────────
        
        // Rolling Expectancy Drift
        const expectancyDrift = roll20.expectancy - roll50.expectancy;
        
        // Rolling Sharpe Proxy (Avg PnL / StdDev PnL)
        const sharpeProxy = this._computeSharpeProxy(sorted.slice(-50));
        
        // Profit Factor Compression
        const pfCompression = roll50.profitFactor && roll20.profitFactor 
            ? roll20.profitFactor / roll50.profitFactor 
            : 1;

        this._windows20.push(roll20.expectancy);
        if (this._windows20.length > 10) this._windows20.shift();

        const last3 = this._windows20.slice(-3);
        const sustainedDecay = last3.length >= 3 && last3.every(e => e < THRESHOLDS.expectancyWarning);

        if (sustainedDecay) {
            this._decayCount++;
        } else {
            this._decayCount = Math.max(0, this._decayCount - 1);
        }

        const status = sustainedDecay && this._decayCount >= THRESHOLDS.consecutiveDecay
            ? 'EDGE_DECAY_WARNING'
            : roll20.expectancy < THRESHOLDS.expectancyWarning
                ? 'EDGE_DEGRADING'
                : roll20.expectancy < 0
                    ? 'EDGE_NEGATIVE'
                    : 'EDGE_HEALTHY';

        if (status === 'EDGE_DECAY_WARNING') {
            try {
                ledger.appendEvent({
                    eventType: 'EDGE_DECAY_WARNING',
                    payload: {
                        roll20Expectancy: roll20.expectancy,
                        drift: expectancyDrift,
                        sharpe: sharpeProxy
                    }
                });
            } catch (e) {}
        }

        return {
            status,
            roll20,
            roll50,
            longitudinal: {
                expectancyDrift: parseFloat(expectancyDrift.toFixed(4)),
                sharpeProxy: parseFloat(sharpeProxy.toFixed(4)),
                pfCompression: parseFloat(pfCompression.toFixed(4)),
                isCompressing: pfCompression < 0.8
            },
            consecutiveDecayWindows: this._decayCount,
            totalTrades: sorted.length,
            regimeLosses: this._detectRegimeStreak(sorted)
        };
    }

    _rollingWindow(sorted, windowSize) {
        const slice = sorted.slice(-windowSize);
        const n = slice.length;
        if (n === 0) return { expectancy: 0, winRate: 0, profitFactor: 0 };

        const wins = slice.filter(t => t.pnl > 0);
        const losses = slice.filter(t => t.pnl <= 0);
        const sumWins = wins.reduce((s, t) => s + t.pnl, 0);
        const sumLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

        const Pw = wins.length / n;
        const Pl = losses.length / n;
        const avgWin  = wins.length   ? sumWins / wins.length   : 0;
        const avgLoss = losses.length ? sumLoss / losses.length : 0;

        return {
            expectancy: parseFloat(((Pw * avgWin) - (Pl * avgLoss)).toFixed(4)),
            winRate: parseFloat((Pw * 100).toFixed(2)),
            profitFactor: sumLoss > 0 ? parseFloat((sumWins / sumLoss).toFixed(4)) : (sumWins > 0 ? Infinity : 0)
        };
    }

    _computeSharpeProxy(trades) {
        if (trades.length < 5) return 0;
        const pnls = trades.map(t => t.pnl);
        const avg = pnls.reduce((s, x) => s + x, 0) / pnls.length;
        const variance = pnls.reduce((s, x) => s + Math.pow(x - avg, 2), 0) / pnls.length;
        const stdDev = Math.sqrt(variance);
        return stdDev > 0 ? avg / stdDev : 0;
    }

    _detectRegimeStreak(sorted) {
        const last20 = sorted.slice(-20);
        const byRegime = {};
        for (const t of last20) {
            const r = t.tradeTags?.regime || 'UNKNOWN';
            if (!byRegime[r]) byRegime[r] = { trades: 0, losses: 0 };
            byRegime[r].trades++;
            if (t.pnl <= 0) byRegime[r].losses++;
        }
        const warnings = [];
        for (const [regime, data] of Object.entries(byRegime)) {
            if (data.trades >= 3 && data.losses / data.trades >= 0.8) {
                warnings.push({ regime, lossRate: (data.losses / data.trades * 100).toFixed(1) });
            }
        }
        return warnings;
    }

    reset() {
        this._windows20 = [];
        this._windows50 = [];
        this._decayCount = 0;
    }
}

module.exports = new EdgeDecayMonitor();
