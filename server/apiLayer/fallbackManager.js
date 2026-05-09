/**
 * FallbackManager - Retry Logic & Circuit Breaker.
 */
class FallbackManager {
    constructor() {
        this.failures = new Map(); // Source -> Count
        this.threshold = 3; // Institutional Standard: 3 consecutive fails
        this.cooldown = 60000; // 60s cooldown (Bloomberg Standard)
        this.disabled = new Map(); // Source -> Timestamp
    }

    getStatus(source) {
        if (this.isDisabled(source)) return "DEGRADED";
        const count = this.failures.get(source) || 0;
        return count > 0 ? "WARNING" : "LIVE";
    }

    async execute(sources, task) {
        for (const source of sources) {
            if (this.isDisabled(source)) continue;

            try {
                const result = await task(source);
                if (result === 'SKIPPED') continue; // Rate limiter silent skip
                
                if (result) {
                    this.reset(source);
                    return result;
                }
                throw new Error("Empty Result");
            } catch (e) {
                console.warn(`[FALLBACK] ${source} attempt bypassed/failed: ${e.message}.`);
                // Rate limiter uses 'SKIPPED' or a specific error to avoid circuit breaking
                if (e.message !== 'QUOTA_BLOCK') {
                    this.recordFailure(source);
                }
            }
        }
        return null; // All sources failed
    }

    isDisabled(source) {
        const until = this.disabled.get(source);
        if (until && Date.now() < until) {
            return true;
        }
        this.disabled.delete(source);
        return false;
    }

    recordFailure(source) {
        const count = (this.failures.get(source) || 0) + 1;
        this.failures.set(source, count);

        if (count >= this.threshold) {
            console.error(`[CIRCUIT BREAKER] Source ${source} DISABLED for 5 mins.`);
            this.disabled.set(source, Date.now() + this.cooldown);
            this.failures.delete(source);
        }
    }

    reset(source) {
        this.failures.delete(source);
    }
}

module.exports = new FallbackManager();
