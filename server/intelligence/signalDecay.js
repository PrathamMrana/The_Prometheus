class SignalDecay {
    constructor() {
        this.decayThresholds = {
            ANOMALY: 300000, // 5 mins
            INSIGHT: 3600000, // 1 hour
            SENTIMENT: 1800000 // 30 mins
        };
    }

    isFading(type, timestamp) {
        const threshold = this.decayThresholds[type] || 3600000;
        const age = Date.now() - timestamp;
        
        if (age > threshold) return "FADING";
        if (age > threshold / 2) return "ACTIVE";
        return "FRESH";
    }

    getReport(signals) {
        return signals.map(s => ({
            ...s,
            status: this.isFading(s.type, s.timestamp)
        })).filter(s => s.status !== "FADING");
    }
}

module.exports = new SignalDecay();
