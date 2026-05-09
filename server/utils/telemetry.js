/**
 * 🔱 [PHASE 21] INSTITUTIONAL TELEMETRY ENGINE (BACKEND)
 * Centralized logic for market data calculations and validation.
 */

/**
 * Calculates the percentage change between current price and reference price.
 * Formula: ((current - reference) / reference) * 100
 * 
 * @param {number} currentPrice 
 * @param {number} referencePrice (Previous Close)
 * @returns {number} Calculated percentage or 0 if inputs are invalid.
 */
const calculatePercentageChange = (currentPrice, referencePrice) => {
    if (!Number.isFinite(currentPrice) || !Number.isFinite(referencePrice) || referencePrice <= 0) {
        return 0;
    }
    
    const pct = ((currentPrice - referencePrice) / referencePrice) * 100;
    
    // 🛡️ [TELEMETRY VALIDATION] Reject impossible spikes (> 1000% or < -99%)
    if (pct > 1000 || pct < -99.9) {
        console.warn(`[TELEMETRY_ENGINE] Rejected outlier calculation: ${pct}% for Price:${currentPrice} Ref:${referencePrice}`);
        return 0;
    }
    
    return parseFloat(pct.toFixed(4));
};

module.exports = {
    calculatePercentageChange
};
