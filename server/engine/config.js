/**
 * ⚙️ [PHASE 10] ENGINE CONFIGURATION
 *
 * Risk/Reward: 1:2 (SL=2%, TP=4%)
 * Stability:  Flicker handled in strategyManager (STABILITY_CYCLES=1)
 * Portfolio:  10 positions, ₹500k total exposure cap
 */
const PROMETHEUS_V5_LOCKED = true;

module.exports = {
    PROMETHEUS_V5_LOCKED,
    // 🛡️ Execution Thresholds
    MIN_CONFIDENCE: 50,          // Phase 10.1: lowered to allow oversold entries with flat mom
    STABILITY_CYCLES: 1,         // Single-confirmation (flicker handled upstream)

    // 🛡️ Phase 10.1 Score Gates
    SCORE_STRONG_BUY: 75,        // STRONG BUY threshold
    SCORE_BUY: 55,               // BUY threshold (lowered from 60)
    SCORE_NO_TRADE: 40,          // Below this → NO TRADE

    // 🛡️ Portfolio Constraints
    MAX_POSITIONS: 10,           // Max simultaneous open positions
    MAX_CAPITAL_PER_TRADE: 50000,// Hard ceiling at ₹50,000 per entry
    MAX_PORTFOLIO_RISK: 500000,  // Total mark-to-market exposure ceiling
    REPLACEMENT_SCORE_THRESHOLD: 15, // Score diff required to replace weak position
    MAX_REPLACEMENTS_PER_CYCLE: 1,   // Prevent churn by limiting replacements

    // 🛡️ Risk Management — 1:2 Reward-to-Risk
    STOP_LOSS_PERCENT: 2.0,      // SL = Entry - 2%
    TAKE_PROFIT_PERCENT: 4.0,    // TP = Entry + 4% (1:2 RR)
    MOMENTUM_EXIT_ENABLED: true, // Enables buffered momentum reversal exit

    // 🛡️ Buffered Exit Thresholds
    MOMENTUM_EXIT_CYCLES: 3,     // Consecutive negative momentum cycles before exit
    EMA_EXIT_CYCLES: 2,          // Consecutive EMA bear-cross cycles before exit
    TRAIL_TRIGGER_R: 1.5,        // Lock trailing stop after 1.5R profit

    // 🛡️ Cycle Trade Cap
    MAX_TRADES_PER_CYCLE: 3,     // Only top-3 scoring signals act per cycle

    // 🛡️ Sizing
    ALLOCATION_WEIGHT: 'LINEAR'  // LINEAR | EXPONENTIAL
};
