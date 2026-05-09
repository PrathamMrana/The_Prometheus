const dataFusion = require('./dataFusion');

class MarketState {
    constructor() {
        this.state = {
            regime: "STABLE", // TRENDING | SIDEWAYS | VOLATILE
            liquidity: "NORMAL", // TIGHT | NORMAL | LOOSE
            sentiment: "NEUTRAL", // BULLISH | NEUTRAL | BEARISH
            stability: "STABLE" // STABLE | FRAGILE
        };
    }

    // Logic to calculate regime based on fused data
    calculate(symbol = "^NSEI") {
        const data = dataFusion.get(symbol);
        if (!data) return this.state;

        // 🧠 Intelligence Logic: Regime Switch Detection
        // Simulating regime based on volatility and price action if available
        const price = data.price || 0;
        const vol = data.volume || 0;
        const rsi = data.rsi || 50;

        if (rsi > 70 || rsi < 30) this.state.regime = "TRENDING";
        else if (rsi > 45 && rsi < 55) this.state.regime = "SIDEWAYS";
        else this.state.regime = "STABLE";

        if (vol > 10000000) this.state.liquidity = "LOOSE";
        else this.state.liquidity = "NORMAL";

        // Sentiment from AI/Macro
        this.state.sentiment = data.sentiment === "BULLISH" ? "BULLISH" : "NEUTRAL";

        return this.state;
    }

    getState() {
        return this.state;
    }
}

module.exports = new MarketState();
