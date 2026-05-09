/**
 * MetricsLogger - Tracking API Health & Latency.
 */
class MetricsLogger {
    constructor() {
        this.metrics = []; // Sliding window of last 100 calls
    }

    log(source, latency, status = "LIVE") {
        this.metrics.push({
            source,
            latency,
            status,
            timestamp: Date.now()
        });

        if (this.metrics.length > 100) this.metrics.shift();
    }

    getHealth() {
        const stats = {};
        this.metrics.forEach(m => {
            if (!stats[m.source]) stats[m.source] = { total: 0, sum: 0, failures: 0 };
            stats[m.source].total++;
            stats[m.source].sum += m.latency;
            if (m.status !== "LIVE") stats[m.source].failures++;
        });

        return Object.entries(stats).map(([source, s]) => ({
            source,
            avgLatency: `${(s.sum / s.total).toFixed(2)}s`,
            successRate: `${((s.total - s.failures) / s.total * 100).toFixed(0)}%`,
            status: s.failures > 2 ? "DEGRADED" : "LIVE"
        }));
    }
}

module.exports = new MetricsLogger();
