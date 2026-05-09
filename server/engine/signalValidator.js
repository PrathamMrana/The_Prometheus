const config = require('./config');

/**
 * 🔱 [PHASE 10.2] SIGNAL VALIDATION ENGINE
 *
 * Philosophy: TRUST THE STRATEGY ENGINE.
 * The StrategyManager already evaluated the 6-factor score, 
 * addressed the 30s per-symbol cooldown, and enforced the cycle trade cap.
 *
 * This validator's remaining job is ONLY to:
 *   1. Ensure signal stability (1 cycle confirmation)
 *   2. Sanity-check for extreme RSI contradictions (Safety Floor)
 */
class SignalValidator {
    constructor() {
        this.signalHistory = new Map();
    }

    validate(symbol, signal, globalState) {
        // IDLE check
        if (!signal || signal.signal === 'HOLD') return { valid: false, reason: "IDLE" };

        // 1. [STABILITY] Lightweight flip guard (1-cycle confirmation)
        const history = this.signalHistory.get(symbol) || [];
        history.push(signal.signal);
        if (history.length > config.STABILITY_CYCLES) history.shift();
        this.signalHistory.set(symbol, history);

        const isStable = history.length >= config.STABILITY_CYCLES &&
                         history.every(s => s === signal.signal);
        
        if (!isStable) {
            return { valid: false, reason: "SIGNAL_FLICKER_GUARD" };
        }

        const { rsi } = signal.indicators || {};

        // 2. [SANITY] Safety Floor (Contradiction Check)
        //    Only block if the signal directly contradicts extreme indicators.
        if (signal.signal === 'BUY') {
            if (rsi !== null && rsi !== undefined && rsi > 85) {
                return { valid: false, reason: `BUY_BLOCKED_EXTREME_OVERBOUGHT_RSI_${rsi?.toFixed(0)}` };
            }
            return { valid: true };
        }

        if (signal.signal === 'SELL') {
            if (rsi !== null && rsi !== undefined && rsi < 15) {
                return { valid: false, reason: `SELL_BLOCKED_EXTREME_OVERSOLD_RSI_${rsi?.toFixed(0)}` };
            }
            return { valid: true };
        }

        return { valid: false, reason: "UNHANDLED_SIGNAL_STATE" };
    }
}

module.exports = new SignalValidator();
