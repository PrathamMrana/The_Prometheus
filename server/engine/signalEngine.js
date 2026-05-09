/**
 * 🛰️ [PHASE 11] SIGNAL ENGINE & ALPHA SCORING
 * Deterministic decision layer above Risk Management.
 */
class SignalEngine {

    /**
     * Determines the trade direction based on technical indicators.
     */
    getSignal(symbol, indicators) {
        if (!indicators || indicators.rsi === undefined) return 'NO_SIGNAL';

        const { rsi, ema20, ema50, momentum } = indicators;

        // BUY Signal Rules
        if (rsi < 35 && ema20 > ema50 && momentum > 0) {
            return 'BUY';
        }

        // SELL Signal Rules (Future-ready)
        if (rsi > 65 && ema20 < ema50 && momentum < 0) {
            return 'SELL';
        }

        return 'NO_SIGNAL';
    }

    /**
     * Calculates Alpha Score (0-5) and Confidence (STRONG, MODERATE, WEAK).
     * [Hardened] Requires all indicators to be present or returns ALPHA_DATA_MISSING.
     */
    getScore(indicators) {
        // [INSTITUTIONAL DATA GUARD] Ensure all critical indicators are present
        if (
            !indicators ||
            indicators.rsi === undefined || indicators.rsi === null ||
            indicators.ema20 === undefined || indicators.ema20 === null ||
            indicators.ema50 === undefined || indicators.ema50 === null ||
            indicators.momentum === undefined || indicators.momentum === null
        ) {
            return { success: false, error: 'ALPHA_DATA_MISSING' };
        }

        const { rsi, ema20, ema50, momentum } = indicators;
        let score = 0;

        // Metric 1: Oversold RSI (High weight: +2)
        if (rsi < 35) score += 2;

        // Metric 2: EMA Trend Alignment (High weight: +2)
        if (ema20 > ema50) score += 2;

        // Metric 3: Positive Momentum (Standard weight: +1)
        if (momentum > 0) score += 1;

        // Determine Confidence Label
        let label = 'WEAK';
        if (score >= 4) label = 'STRONG';
        else if (score >= 2) label = 'MODERATE';

        return { success: true, score, label };
    }
}

module.exports = new SignalEngine();
