/**
 * fallbackTimer - Monitors system fallback duration and triggers alerts if data stays stale.
 */

class FallbackTimer {
    constructor() {
        this.fallbackStartTime = null;
        this.STALE_THRESHOLD = 60000; // 60 seconds
        this.isStale = false;
    }

    /**
     * Records that the system is currently using a fallback.
     */
    notifyFallback() {
        if (!this.fallbackStartTime) {
            this.fallbackStartTime = Date.now();
        }

        const duration = Date.now() - this.fallbackStartTime;
        if (duration > this.STALE_THRESHOLD) {
            if (!this.isStale) {
                console.error(`[SYSTEM_HEALTH] 🚨 DATA STALE — Fallback duration exceeded 60s (${Math.floor(duration/1000)}s)`);
                this.isStale = true;
            }
        }
    }

    /**
     * Records that the system has recovered live data.
     */
    notifyLive() {
        if (this.fallbackStartTime) {
            // console.log(`[SYSTEM_HEALTH] System recovered live data after ${Math.floor((Date.now() - this.fallbackStartTime)/1000)}s`);
            this.fallbackStartTime = null;
            this.isStale = false;
        }
    }

    /**
     * Returns the current fallback state.
     */
    getStatus() {
        return {
            isStale: this.isStale,
            duration: this.fallbackStartTime ? Date.now() - this.fallbackStartTime : 0
        };
    }
}

module.exports = new FallbackTimer();
