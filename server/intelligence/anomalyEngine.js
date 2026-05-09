class AnomalyEngine {
    constructor() {
        this.anomalies = [];
    }

    // 🚨 Live Anomaly Detection Radar
    detect(symbol, data) {
        const findings = [];
        
        // 1. Volume Anomaly (>2x avg)
        if (data.volume > (data.avgVolume * 2)) {
            findings.push({
                ticker: symbol,
                type: "VOL_SPIKE",
                severity: "HIGH",
                description: `Institutional absorption: Volume ${Math.round(data.volume/data.avgVolume)}x avg.`,
                confidence: 0.92
            });
        }

        // 2. Price-Sentiment Mismatch
        if (data.pct_change < -2 && data.sentiment === "BULLISH") {
            findings.push({
                ticker: symbol,
                type: "DIVERGENCE",
                severity: "MEDIUM",
                description: `Price-Sentiment divergence detected in ${symbol}.`,
                confidence: 0.85
            });
        }

        // 3. Volatility Compression
        if (data.volatility < 0.01) {
            findings.push({
                ticker: symbol,
                type: "COMPRESSION",
                severity: "INFO",
                description: `Volatility compression in ${symbol} | Expansion imminent.`,
                confidence: 0.75
            });
        }

        return findings;
    }
}

module.exports = new AnomalyEngine();
