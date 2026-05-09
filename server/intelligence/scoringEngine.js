const marketState = require('./marketState');

class ScoringEngine {
    constructor() {
        this.weights = {
            TRENDING: { momentum: 0.4, volume: 0.3, sentiment: 0.2, macro: 0.1 },
            SIDEWAYS: { momentum: 0.1, volume: 0.4, sentiment: 0.4, macro: 0.1 },
            STABLE: { momentum: 0.25, volume: 0.25, sentiment: 0.25, macro: 0.25 }
        };
    }

    // ⚡ Adaptive Multi-Factor Score (0-100)
    calculate(symbol, data) {
        const state = marketState.calculate(symbol);
        const w = this.weights[state.regime] || this.weights.STABLE;

        // Scoring components (normalized 0-1)
        const mScore = (data.rsi > 70 || data.rsi < 30) ? 0.9 : 0.5;
        const vScore = data.volume > 1000000 ? 0.8 : 0.4;
        const sScore = data.sentiment === "BULLISH" ? 0.9 : 0.5;
        const mcScore = 0.5; // Macro default

        const aggregate = (mScore * w.momentum) + (vScore * w.volume) + (sScore * w.sentiment) + (mcScore * w.macro);
        return Math.min(100, Math.max(0, Math.round(aggregate * 100)));
    }
}

module.exports = new ScoringEngine();
