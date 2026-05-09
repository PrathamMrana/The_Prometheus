/**
 * RateLimiter - Global Priority-Aware Throttling.
 */
class RateLimiter {
    constructor() {
        this.limits = {
            'FINNHUB': { window: 60000, max: 60, current: 0, lastReset: Date.now() },
            'ALPHA_VANTAGE': { window: 60000, max: 5, current: 0, lastReset: Date.now() }, // Standard tier
            'FMP': { window: 60000, max: 250, current: 0, lastReset: Date.now() },
            'TWELVE_DATA': { window: 60000, max: 8, current: 0, lastReset: Date.now() }
        };
        this.isTwelveDataDisabled = false;
        this.resetTime = null;
    }

    disableTwelveData() {
        if (!this.isTwelveDataDisabled) {
            console.error('[LIMITER] TWELVE_DATA DISABLED (24H COOLDOWN TRIGGERED)');
            this.isTwelveDataDisabled = true;
            this.resetTime = Date.now() + 24 * 60 * 60 * 1000;
        }
    }

    canUseTwelveData() {
        if (this.isTwelveDataDisabled && Date.now() > this.resetTime) {
            console.log('[LIMITER] TWELVE_DATA COOLDOWN EXPIRED. Re-enabling.');
            this.isTwelveDataDisabled = false;
            this.resetTime = null;
        }
        return !this.isTwelveDataDisabled;
    }

    async check(source, priority = 1) {
        if (source === 'TWELVE_DATA' && !this.canUseTwelveData()) return false;
        
        const limit = this.limits[source];
        if (!limit) return true;

        const now = Date.now();
        if (now - limit.lastReset > limit.window) {
            limit.current = 0;
            limit.lastReset = now;
        }

        // Institutional Grade: 80% Quota Enforcement
        // Keep 20% buffer for spikes/retries
        const usagePct = (limit.current / limit.max) * 100;
        
        // Priority 3: Ultra Critical (Price) -> Allowed up to 95%
        // Priority 2: Critical (Indicators) -> Allowed up to 80%
        // Priority 1: Standard (Sentiment/News) -> Allowed up to 60%
        
        if (priority === 1 && usagePct >= 60) {
            console.warn(`[LIMITER] ${source} at 60% capacity. Rejecting low-priority Sentiment/News.`);
            return false;
        }
        if (priority === 2 && usagePct >= 80) {
            console.warn(`[LIMITER] ${source} at 80% capacity. Rejecting medium-priority Indicators.`);
            return false;
        }
        if (priority === 3 && usagePct >= 95) {
            console.error(`[LIMITER] ${source} reaching absolute limit (95%). Protecting last 5% for critical price recovery.`);
            return false;
        }

        if (limit.current >= limit.max) {
            console.error(`[LIMITER] ${source} HARD LIMIT EXCEEDED.`);
            return false;
        }

        limit.current++;
        return true;
    }
    /**
     * Institutional Diagnostic: Check if a source is currently allowed without incrementing usage.
     * @param {string} source 
     * @param {number} priority 
     * @returns {boolean}
     */
    isAllowed(source, priority = 1) {
        if (source === 'TWELVE_DATA' && !this.canUseTwelveData()) return false;

        const limit = this.limits[source];
        if (!limit) return true;
        
        const usagePct = (limit.current / limit.max) * 100;
        if (priority === 1 && usagePct >= 60) return false;
        if (priority === 2 && usagePct >= 80) return false;
        if (priority === 3 && usagePct >= 95) return false;
        return limit.current < limit.max;
    }

    getStats() {
        return Object.fromEntries(
            Object.entries(this.limits).map(([k, v]) => [k, { usage: v.current, max: v.max }])
        );
    }
}

module.exports = new RateLimiter();
