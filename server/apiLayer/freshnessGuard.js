/**
 * freshnessGuard.js - Bloomberg-Level TTL Enforcement
 * Ensures that data older than TTL is never labeled as LIVE.
 */

const TTL_CONFIG = {
  HIGH: 10000,    // 10s for Price
  MEDIUM: 60000, // 60s for Indicators
  LOW: 300000    // 5m for Sentiment/Macro
};

class FreshnessGuard {
  static isFresh(data, priority = "HIGH") {
    if (!data || !data.timestamp) return false;
    
    const now = Date.now();
    const age = now - new Date(data.timestamp).getTime();
    const limit = TTL_CONFIG[priority] || TTL_CONFIG.HIGH;
    
    return age <= limit;
  }

  static getStatus(data, priority = "HIGH") {
    if (!data) return "OFFLINE";
    return this.isFresh(data, priority) ? "LIVE" : "STALE";
  }
}

module.exports = FreshnessGuard;
