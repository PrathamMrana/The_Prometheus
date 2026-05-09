class ImpactEngine {
    constructor() {}

    // 🧬 Real-World Impact (Macro Linkages)
    analyze(signal) {
        const effects = [];
        
        if (signal.symbol === "OIL" && signal.change > 2) {
            effects.push("Inflation pressure rising | Potential rate-sensitive sector risk.");
        }
        
        if (signal.symbol === "USDINR" && signal.change > 1) {
            effects.push("Rupee weakness | Export-oriented stocks (IT/Pharma) tailwind.");
        }

        if (signal.symbol === "US10Y" && signal.change > 0.05) {
            effects.push("US Bond Yields rising | IT sector valuation pressure detected.");
        }

        return effects;
    }
}

module.exports = new ImpactEngine();
