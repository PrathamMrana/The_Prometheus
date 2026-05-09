/**
 * providerScorer.js - Real-time Provider Performance Tracking
 */

class ProviderScorer {
    constructor() {
        this.stats = new Map();
        // Decay factor for moving averages
        this.ALPHA = 0.3; 
    }

    recordSuccess(provider, latencyMs) {
        const s = this.getStats(provider);
        s.latency = (s.latency * (1 - this.ALPHA)) + (latencyMs * this.ALPHA);
        s.successCount++;
        s.lastSeen = Date.now();
        s.errorStreak = 0;
        this.stats.set(provider, s);
    }

    recordFailure(provider) {
        const s = this.getStats(provider);
        s.errorCount++;
        s.errorStreak++;
        s.lastSeen = Date.now();
        this.stats.set(provider, s);
    }

    getStats(provider) {
        return this.stats.get(provider) || {
            latency: 500,
            successCount: 0,
            errorCount: 0,
            errorStreak: 0,
            lastSeen: 0
        };
    }

    /**
     * Ranks providers based on a composite health score.
     * @param {string[]} providers - List of provider names to rank.
     * @returns {string[]} - Ranked provider names.
     */
    rank(providers) {
        return [...providers].sort((a, b) => {
            const scoreA = this.calculateScore(a);
            const scoreB = this.calculateScore(b);
            return scoreB - scoreA; // High score first
        });
    }

    calculateScore(provider) {
        const s = this.getStats(provider);
        
        // Base score: 100
        let score = 100;

        // Penalty for latency (per 100ms over 200ms)
        const latencyPenalty = Math.max(0, (s.latency - 200) / 100) * 5;
        score -= latencyPenalty;

        // Penalty for recent error streak
        score -= (s.errorStreak * 20);

        // Success rate weight
        const total = s.successCount + s.errorCount;
        if (total > 0) {
            const successRate = s.successCount / total;
            score *= successRate;
        }

        return Math.max(0, score);
    }
}

module.exports = new ProviderScorer();
