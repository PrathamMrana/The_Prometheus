const config = require('./config');

/**
 * 🛰️ [PHASE 9] ADAPTIVE POSITION SIZER
 * Implementation: Confidence-weighted sizing with fixed capital ceilings.
 */
class SizingEngine {
    /**
     * 🚀 [PHASE 10.5] VOLATILITY-ADJUSTED SIZING
     * Formula: Position Size ∝ Score / Volatility
     */
    calculate(symbol, score, price, atr, balance) {
        if (!balance || !price || balance <= 0) return 0;

        // 1. Normalize conviction score (Cap at 100)
        const normalizedScore = Math.min(score, 100);
        const baseCapital = (normalizedScore / 100) * config.MAX_CAPITAL_PER_TRADE;

        // 2. Compute Volatility-Adjustment Factor
        // TARGET_VOL = 0.02 (2% price movement as the benchmark)
        const TARGET_VOL = 0.02;
        let volatility = (atr && price > 0) ? (atr / price) : TARGET_VOL;

        // Clamp volatility to a reasonable institutional range (0.5% - 5.0%)
        volatility = Math.max(0.005, Math.min(volatility, 0.05));

        // 3. Adjust Capital based on Risk (Division safety already handled by clamping)
        const adjustedCapital = baseCapital * (TARGET_VOL / volatility);

        // 4. Multi-Layer Safety Caps
        const finalCapital = Math.min(
            adjustedCapital,
            config.MAX_CAPITAL_PER_TRADE,
            balance * 0.10 // Portfolio Liquidity Cap (10%)
        );

        // 5. Compute Final Quantity
        const qty = Math.floor(finalCapital / price);

        // 🛡️ [PHASE 10.5] Log sizing decision for transparency
        if (qty > 0) {
            console.log(
                `[SIZE_ENGINE] ${symbol.padEnd(10)} | Score:${score} | ATR:${atr?.toFixed(2) || '0.00'} | Vol:${(volatility * 100).toFixed(2)}% | Cap:${Math.round(finalCapital)} | Qty:${qty}`
            );
        }
        
        return qty > 0 ? qty : 0;
    }
}

module.exports = new SizingEngine();
