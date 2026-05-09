/**
 * 🔱 PROMETHEUS — SURVIVABILITY TIMELINE ENGINE
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Monitors rolling performance deterioration and structural alpha decay over time.
 * Enforces immutable append-only logging to server/data/research/survivability.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SURVIVABILITY_DIR = path.join(__dirname, '../data/research/survivability');

class SurvivabilityTimelineEngine {
    constructor() {
        if (!fs.existsSync(SURVIVABILITY_DIR)) fs.mkdirSync(SURVIVABILITY_DIR, { recursive: true });
    }

    compute(trades) {
        if (!trades || trades.length < 20) return this._emptyState();

        const lifetime = this._calcMetrics(trades);
        
        // Rolling Windows
        const rolling20 = this._calcMetrics(trades.slice(-20));
        const rolling50 = trades.length >= 50 ? this._calcMetrics(trades.slice(-50)) : rolling20;
        const rolling100 = trades.length >= 100 ? this._calcMetrics(trades.slice(-100)) : rolling50;

        // Structural Decay Detection
        const alerts = [];
        let status = 'STABLE';

        if (rolling50.expectancy < (lifetime.expectancy * 0.6)) {
            alerts.push('EXPECTANCY_COLLAPSE');
        }
        
        if (rolling50.profitFactor < 1.0) {
            alerts.push('PROFIT_FACTOR_DEGRADATION');
        }

        if (rolling50.drawdown > lifetime.drawdown * 1.25) {
            alerts.push('DRAWDOWN_ACCELERATION');
        }

        // Trend Logic
        if (rolling50.profitFactor < 1.0 && rolling50.expectancy < 0 && rolling50.drawdown > lifetime.drawdown) {
            status = 'COLLAPSING';
        } else if (alerts.length > 0) {
            status = 'DECAYING';
        } else if (rolling20.expectancy > lifetime.expectancy * 1.1 && rolling50.profitFactor > 1.2) {
            status = 'IMPROVING';
        } else {
            status = 'STABLE';
        }

        if (status === 'DECAYING' && alerts.length >= 2) {
            alerts.push('STRUCTURAL_EDGE_DECAY');
        }

        const state = {
            timestamp: Date.now(),
            lifetime,
            rolling20,
            rolling50,
            rolling100,
            trendDirection: status,
            trendConfidence: status === 'STABLE' ? 80 : 95,
            alerts,
            isValid: status !== 'COLLAPSING'
        };

        this._persist(state);
        return state;
    }

    _calcMetrics(subset) {
        if (!subset || subset.length === 0) return { expectancy: 0, profitFactor: 0, winRate: 0, drawdown: 0, sharpe: 0 };
        
        let wins = 0;
        let grossProfit = 0;
        let grossLoss = 0;
        let pnlSum = 0;
        let pnlArr = [];

        subset.forEach(t => {
            if (t.pnl > 0) {
                wins++;
                grossProfit += t.pnl;
            } else {
                grossLoss += Math.abs(t.pnl);
            }
            pnlSum += t.pnl;
            pnlArr.push(t.pnl);
        });

        const winRate = (wins / subset.length) * 100;
        const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : (grossProfit / grossLoss);
        const expectancy = pnlSum / subset.length;

        const meanPnL = expectancy;
        const variance = pnlArr.reduce((acc, p) => acc + Math.pow(p - meanPnL, 2), 0) / subset.length;
        const stdDev = Math.sqrt(variance);
        const sharpe = stdDev > 0 ? (meanPnL / stdDev) * Math.sqrt(252) : 0; // rough proxy

        // Simplified Drawdown
        let peak = 0;
        let current = 0;
        let maxDD = 0;
        subset.forEach(t => {
            current += t.pnl;
            if (current > peak) peak = current;
            const dd = peak > 0 ? ((peak - current) / peak) * 100 : 0;
            if (dd > maxDD) maxDD = dd;
        });

        return {
            expectancy,
            profitFactor,
            winRate,
            drawdown: maxDD,
            sharpe
        };
    }

    _persist(state) {
        try {
            fs.writeFileSync(path.join(SURVIVABILITY_DIR, 'trend_state.json'), JSON.stringify(state, null, 2));
            fs.appendFileSync(path.join(SURVIVABILITY_DIR, 'rolling_metrics.jsonl'), JSON.stringify({ ts: state.timestamp, ...state.rolling50 }) + '\n');
            if (state.alerts.length > 0) {
                fs.appendFileSync(path.join(SURVIVABILITY_DIR, 'survivability_alerts.jsonl'), JSON.stringify({ ts: state.timestamp, alerts: state.alerts }) + '\n');
            }
        } catch (e) {
            console.error('[SURVIVABILITY_ENGINE] Persist Error:', e.message);
        }
    }

    _emptyState() {
        return {
            lifetime: {}, rolling20: {}, rolling50: {}, rolling100: {},
            trendDirection: 'INSUFFICIENT_DATA',
            trendConfidence: 0,
            alerts: [],
            isValid: false
        };
    }
}

module.exports = new SurvivabilityTimelineEngine();
