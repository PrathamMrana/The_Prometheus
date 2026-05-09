const { EVENT_TYPES } = require('./executionLedger');

/**
 * 🔱 PROMETHEUS — PHASE 1D EVENT REDUCER
 * 
 * The ultimate architectural transition. This file proves that the system 
 * can entirely destroy its live mutable memory and reconstruct the exact 
 * truth (Portfolio, Risk, PnL) strictly from the immutable disk ledger.
 * 
 * Core Rules:
 * 1. Pure Function: NO globals, NO db calls, NO side effects.
 * 2. Monotonic Ordering: Uses process.hrtime.bigint() to avoid clock drift bugs.
 * 3. Idempotent: Can be run 1x or 1000x with identical output.
 * 4. Hard Assertions: Fails loudly if causality or state constraints break.
 */
class ExecutionReducer {
    
    /**
     * Initializes a clean portfolio slate.
     */
    static getInitialState(initialCash = 100000) {
        return {
            cash: initialCash,
            realizedPnL: 0,
            openPositions: {},
            exposure: 0,
            tradeCount: 0
        };
    }

    /**
     * Reconstructs the portfolio truth deterministically.
     * @param {Array} events - Raw JSON objects from execution_ledger.jsonl
     * @param {number} initialCash - Starting capital
     * @returns {Object} Deterministic state { cash, realizedPnL, openPositions, exposure, tradeCount }
     */
    static reconstructPortfolio(events, initialCash = 100000) {
        const state = ExecutionReducer.getInitialState(initialCash);
        
        // 1. Deterministic Monotonic Sorting
        const sortedEvents = [...events].sort((a, b) => {
            // Fallback to wall-clock if monotonic is missing (e.g., legacy test events)
            if (!a.monotonicTs || !b.monotonicTs) return a.wallClockTs - b.wallClockTs;
            
            const bigA = BigInt(a.monotonicTs);
            const bigB = BigInt(b.monotonicTs);
            return bigA > bigB ? 1 : (bigA < bigB ? -1 : 0);
        });

        // 2. Event Sourcing Reduction
        for (const event of sortedEvents) {
            ExecutionReducer._applyEvent(state, event);
        }

        // 3. Reconstruct derived metrics
        state.exposure = Object.values(state.openPositions)
            .reduce((sum, pos) => sum + (pos.qty * pos.entryPrice), 0);

        return state;
    }

    /**
     * Internal state mutator. Fails hard on invalid causality.
     */
    static _applyEvent(state, event) {
        const { eventType, symbol, payload } = event;

        switch (eventType) {
            case EVENT_TYPES.SIM_FILL_RECEIVED: {
                if (!symbol) throw new Error(`[REDUCER_ERROR] SIM_FILL_RECEIVED missing symbol. Event: ${event.eventId}`);
                
                const { executedQty, fillPrice } = payload;
                if (!executedQty || !fillPrice) {
                    throw new Error(`[REDUCER_ERROR] Malformed SIM_FILL payload. Event: ${event.eventId}`);
                }

                // Idempotent/Averaging check
                if (state.openPositions[symbol]) {
                    const pos = state.openPositions[symbol];
                    const totalQty = pos.qty + executedQty;
                    const avgPrice = ((pos.qty * pos.entryPrice) + (executedQty * fillPrice)) / totalQty;
                    pos.qty = totalQty;
                    pos.entryPrice = avgPrice;
                } else {
                    state.openPositions[symbol] = {
                        symbol,
                        qty: executedQty,
                        entryPrice: fillPrice,
                        timestamp: event.wallClockTs
                    };
                }

                // Hard Assertion: Conservation of Capital
                const cost = executedQty * fillPrice;
                // Temporarily disabling cash constraint exception during sandbox testing,
                // but institutional logic demands a strict crash here.
                if (state.cash < cost) {
                    throw new Error(`[REDUCER_FATAL] Capital exhaustion. Attempted to spend $${cost} with $${state.cash} available.`);
                }
                
                state.cash -= cost;
                state.tradeCount++;
                break;
            }

            case EVENT_TYPES.POSITION_CLOSED: {
                if (!symbol) throw new Error(`[REDUCER_ERROR] POSITION_CLOSED missing symbol. Event: ${event.eventId}`);
                
                // Hard Assertion: Causality enforcement
                if (!state.openPositions[symbol]) {
                    throw new Error(`[REDUCER_FATAL] Orphan Close. Attempted to close non-existent position: ${symbol}`);
                }

                const position = state.openPositions[symbol];
                const closePrice = payload.closePrice;
                const closeQty = payload.qty || position.qty;

                // Hard Assertion: Conservation of mass
                if (closeQty > position.qty) {
                    throw new Error(`[REDUCER_FATAL] Naked Shorting Error. Attempted to close ${closeQty} but only hold ${position.qty} of ${symbol}.`);
                }

                const pnl = (closePrice - position.entryPrice) * closeQty;
                state.cash += (closePrice * closeQty);
                state.realizedPnL += pnl;

                position.qty -= closeQty;
                if (position.qty <= 0) {
                    delete state.openPositions[symbol];
                }
                break;
            }

            // Passive events that don't directly mutate portfolio but log presence
            case EVENT_TYPES.EXECUTION_SKIPPED:
            case EVENT_TYPES.RISK_APPROVED:
            case EVENT_TYPES.RISK_REJECTED:
            case EVENT_TYPES.TICK_RECEIVED:
            case EVENT_TYPES.SIGNAL_GENERATED:
            case EVENT_TYPES.ALLOCATION_CREATED:
                break;
                
            default:
                // Unrecognized events don't break state, but can be logged in debug mode
                break;
        }
    }
}

module.exports = ExecutionReducer;
