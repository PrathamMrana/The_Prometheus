/**
 * 🔱 PROMETHEUS — TRADE REPLAY ENGINE
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Captures full deterministic snapshots of the exact state 
 * of the engine, market, and adversarial context at the precise
 * moment a trade is executed. Essential for forensic analysis.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPLAYS_DIR = path.join(__dirname, '../data/research/replays');

class TradeReplayEngine {
    constructor() {
        if (!fs.existsSync(REPLAYS_DIR)) {
            fs.mkdirSync(REPLAYS_DIR, { recursive: true });
        }
    }

    /**
     * Captures a full snapshot of the execution state.
     */
    capture(symbol, signal, currentPrice, executedQty, regime, executionContext = {}) {
        try {
            const rootGlobalState = require('../globalState');
            
            // Reconstruct the full state context
            const snapshot = {
                timestamp: new Date().toISOString(),
                tradeId: `REPLAY_${Date.now()}_${symbol}`,
                symbol: symbol,
                execution: {
                    price: currentPrice,
                    qty: executedQty,
                    latencyMs: signal.executionLatencyMs || 0,
                    slippageEstimate: signal.slippageEstimate || 0,
                    context: executionContext
                },
                intelligence: {
                    score: signal.score || 0,
                    confidence: signal.confidence || 0,
                    confidenceScore: signal.confidenceScore || 0,
                    decision: signal.decision || 'UNKNOWN',
                    grade: signal.tradeGrade || 'D',
                    regime: regime || 'UNKNOWN',
                    sector: signal.sector || 'UNKNOWN',
                    smartMoney: signal.smartMoneyClass || 'NEUTRAL',
                    breakoutType: signal.breakoutType || null
                },
                whyDidThisHappen: {
                    topContributingFeatures: signal.indicators ? Object.keys(signal.indicators).slice(0, 3) : [],
                    sectorFlow: signal.sectorFlow || 0,
                    confidenceDrivers: signal.breakoutType ? [signal.breakoutType] : [],
                    adversarialPenalties: signal.penalties || [],
                    macroBreadth: signal.breadthState || 'UNKNOWN'
                },
                rawSignal: signal,
                globalStateSnapshot: {
                    topMovers: rootGlobalState.topMovers,
                    topSignals: rootGlobalState.topSignals,
                    systemMode: rootGlobalState.SYSTEM_MODE || 'UNKNOWN'
                }
            };

            const filename = path.join(REPLAYS_DIR, `${snapshot.tradeId}.json`);
            fs.writeFileSync(filename, JSON.stringify(snapshot, null, 2));

        } catch (e) {
            console.error('[TRADE_REPLAY] Failed to capture forensic snapshot:', e.message);
        }
    }
}

module.exports = new TradeReplayEngine();
