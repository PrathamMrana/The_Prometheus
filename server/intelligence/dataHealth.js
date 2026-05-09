const path = require('path');
const fs = require('fs');

class DataHealth {
    constructor() {
        this.status = {
            state: "LIVE", // LIVE | DEGRADED | STALE
            latency: 0,
            lastPulse: Date.now(),
            confidence: 0.95,
            sources: {
                FINNHUB: "OK",
                MARKETAUX: "OK",
                FMP: "OK",
                POLYGON: "OK"
            }
        };
    }

    update(latency, sourceMap = {}) {
        this.status.latency = latency;
        this.status.lastPulse = Date.now();
        this.status.sources = { ...this.status.sources, ...sourceMap };
        
        // Logical state determination
        const okCount = Object.values(this.status.sources).filter(s => s === "OK").length;
        if (okCount === 0) this.status.state = "STALE";
        else if (okCount < 4) this.status.state = "DEGRADED";
        else this.status.state = "LIVE";

        this.status.confidence = (okCount / 4).toFixed(2);
    }

    getStatus() {
        return {
            ...this.status,
            freshness: (Date.now() - this.status.lastPulse) / 1000 + "s"
        };
    }
}

module.exports = new DataHealth();
