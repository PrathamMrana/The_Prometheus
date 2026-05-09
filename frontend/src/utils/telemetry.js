/**
 * 🔱 [PHASE 21] INSTITUTIONAL TELEMETRY ENGINE
 * Centralized logic for market data calculations and validation.
 */

/**
 * Calculates the percentage change between current price and reference price.
 * Formula: ((current - reference) / reference) * 100
 * 
 * @param {number} currentPrice 
 * @param {number} referencePrice (Previous Close)
 * @returns {number|null} Calculated percentage or null if inputs are invalid.
 */
export const calculatePercentageChange = (currentPrice, referencePrice) => {
    if (!Number.isFinite(currentPrice) || !Number.isFinite(referencePrice) || referencePrice <= 0) {
        return null;
    }
    
    const pct = ((currentPrice - referencePrice) / referencePrice) * 100;
    
    // 🛡️ [TELEMETRY VALIDATION] Reject impossible spikes (> 1000% or < -99%)
    if (pct > 1000 || pct < -99.9) {
        console.warn(`[TELEMETRY_ENGINE] Rejected outlier calculation: ${pct}% for Price:${currentPrice} Ref:${referencePrice}`);
        return null;
    }
    
    return parseFloat(pct.toFixed(4));
};

/**
 * Determines if a market is currently in a session that requires a frozen baseline.
 * @param {string} status - Market status (LIVE, CLOSED, etc.)
 * @returns {boolean}
 */
export const isBaselineFrozen = (status) => {
    const frozenStates = ['CLOSED', 'WEEKEND', 'STALE'];
    return frozenStates.includes(status?.toUpperCase());
};

/**
 * Returns a human-readable synchronization message if data is missing.
 */
export const getSyncMessage = (price, prevClose) => {
    if (!price || !prevClose) {
        return "Synchronizing market baseline...";
    }
    return null;
};

/**
 * Validates telemetry source timestamps to detect stale reference data.
 */
export const isTelemetryStale = (timestamp, maxAgeMs = 60000) => {
    if (!timestamp) return true;
    return (Date.now() - timestamp) > maxAgeMs;
};
