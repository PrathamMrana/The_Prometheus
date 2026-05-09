/**
 * DataQualityEvaluator - Institutional Grade Integrity Scoring
 * Calculates 0-100 score based on freshness, source authority, and field completeness.
 */

class DataQualityEvaluator {
    /**
     * Calculates data quality score (0-100)
     * @param {Object} data - The tick data object
     * @param {string} primarySource - The expected primary source (default: YFINANCE)
     */
    static calculate(data, primarySource = 'YFINANCE') {
        if (!data) return 0;

        let score = 100;
        const now = Date.now();
        const age = now - (data.timestamp || 0);

        // 🛡️ Rule 1: Source Authority Check (-20 if not primary)
        if (data.source !== primarySource) {
            score -= 20;
        }

        // 🛡️ Rule 2: Freshness Check (-30 if older than institutional 5s window)
        // Note: For CLOSED markets, we relax this since data is intentionally static.
        if (data.status !== 'CLOSED' && age > 5000) {
            score -= 30;
        }

        // 🛡️ Rule 3: Recovery Fallback Check (-50 if using LKG/Historical cache)
        if (data.status === 'RECOVERY_MODE' || data.status === 'LKG' || data.is_lkg) {
            score -= 50;
        }

        // 🛡️ Rule 4: Field Completeness Check (-20 if critical fields missing)
        if (data.price === null || data.price === undefined || data.percent === undefined) {
            score -= 20;
        }

        // 🛡️ Rule 5: Negative Drift Guard
        if (age < 0) {
            score -= 10; // Clock drift penalty
        }

        return Math.max(0, score);
    }

    /**
     * Maps score to institutional health status
     */
    static getStatus(score) {
        if (score >= 90) return 'OPTIMAL';
        if (score >= 70) return 'GOOD';
        if (score >= 40) return 'DEGRADED';
        return 'CRITICAL';
    }
}

module.exports = DataQualityEvaluator;
