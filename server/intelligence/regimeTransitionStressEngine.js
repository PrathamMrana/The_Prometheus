/**
 * 🔱 PROMETHEUS — REGIME TRANSITION STRESS ENGINE
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Analyzes whether edge collapses during market transitions
 * and persists transition replay forensics.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TRANSITIONS_DIR = path.join(__dirname, '../data/research/transitions');

class RegimeTransitionStressEngine {
    constructor() {
        if (!fs.existsSync(TRANSITIONS_DIR)) fs.mkdirSync(TRANSITIONS_DIR, { recursive: true });
    }

    compute(trades) {
        if (!trades || trades.length < 5) return this._emptyState();

        const transitions = {};
        const alerts = [];
        let totalTransitions = 0;
        let failedTransitions = 0;

        for (let i = 1; i < trades.length; i++) {
            const prevTrade = trades[i - 1];
            const currTrade = trades[i];

            const prevRegime = prevTrade.tradeTags?.regime || 'UNKNOWN';
            const currRegime = currTrade.tradeTags?.regime || 'UNKNOWN';

            if (prevRegime !== currRegime && prevRegime !== 'UNKNOWN' && currRegime !== 'UNKNOWN') {
                const key = `${prevRegime} → ${currRegime}`;
                if (!transitions[key]) {
                    transitions[key] = { key, count: 0, pnlSum: 0, wins: 0 };
                }

                transitions[key].count++;
                transitions[key].pnlSum += currTrade.pnl;
                if (currTrade.pnl > 0) transitions[key].wins++;

                totalTransitions++;

                // Transition Replay Forensic Log
                this._logReplay(prevRegime, currRegime, currTrade, prevTrade);
            }
        }

        const stressMatrix = Object.values(transitions).map(t => {
            const winRate = (t.wins / t.count) * 100;
            const avgPnl = t.pnlSum / t.count;
            
            // Directive explicit checks
            const transitionPF = t.pnlSum < 0 ? 0 : 1; // Simplified PF for single transition map
            const isCollapse = t.count >= 2 && winRate < 30 && avgPnl < 0;

            if (isCollapse) {
                failedTransitions++;
                if (t.key.includes('PANIC')) alerts.push('PANIC_REGIME_BREAKDOWN');
                else alerts.push('TRANSITION_EDGE_COLLAPSE');
            }

            return {
                ...t,
                winRate,
                avgPnl,
                isCollapse,
                status: isCollapse ? 'FAIL' : 'PASS'
            };
        }).sort((a, b) => b.count - a.count);

        if (failedTransitions > 2) alerts.push('REGIME_TRANSITION_FAILURE');

        const state = {
            matrix: stressMatrix,
            totalTransitions,
            failedTransitions,
            survivalRate: totalTransitions > 0 ? ((totalTransitions - failedTransitions) / totalTransitions) * 100 : 100,
            alerts,
            isValid: failedTransitions === 0
        };

        this._persistMatrix(state.matrix);

        return state;
    }

    _logReplay(from, to, currTrade, prevTrade) {
        try {
            const replay = {
                id: `TRANSITION_${Date.now()}_${from}_${to}`,
                timestamp: Date.now(),
                preTransitionState: prevTrade,
                postTransitionOutcome: currTrade,
                symbol: currTrade.symbol,
                fromRegime: from,
                toRegime: to,
                executionLatency: currTrade.tradeTags?.latency || 0,
                slippage: currTrade.tradeTags?.slippage || 0
            };
            const filename = path.join(TRANSITIONS_DIR, `${replay.id}.json`);
            fs.writeFileSync(filename, JSON.stringify(replay, null, 2));
        } catch (e) {
            console.error('[REGIME_STRESS] Failed to save transition replay:', e.message);
        }
    }

    _persistMatrix(matrix) {
        try {
            fs.writeFileSync(path.join(TRANSITIONS_DIR, 'transition_matrix.json'), JSON.stringify(matrix, null, 2));
        } catch (e) {
            console.error('[REGIME_STRESS] Failed to save transition matrix:', e.message);
        }
    }

    _emptyState() {
        return {
            matrix: [],
            totalTransitions: 0,
            failedTransitions: 0,
            survivalRate: 100,
            alerts: [],
            isValid: true
        };
    }
}

module.exports = new RegimeTransitionStressEngine();
