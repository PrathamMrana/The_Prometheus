class ConfidenceEngine {
    constructor() {
        this.factorWeights = {
            momentum: 0.4,
            volume: 0.3,
            sentiment: 0.3
        };
    }

    // 🧠 Weighted Confidence (Elite Refinement)
    calculate(symbolData) {
        if (!symbolData) return 0.50;
        
        const mSignal = (symbolData.rsi > 60 || symbolData.rsi < 40) ? 1 : 0.5;
        const vSignal = symbolData.volume > 1000000 ? 1 : 0.5;
        const sSignal = symbolData.sentiment === "BULLISH" ? 1 : 0.5;

        const weighted = (mSignal * this.factorWeights.momentum) + 
                         (vSignal * this.factorWeights.volume) + 
                         (sSignal * this.factorWeights.sentiment);
        
        return weighted.toFixed(2);
    }
}

module.exports = new ConfidenceEngine();
