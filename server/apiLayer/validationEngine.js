/**
 * validationEngine.js - Streamlined Data Validation
 * Rejects price null, NaN, or <= 0.
 */

const lkgCache = require('./lkgCache');

class ValidationEngine {
  /**
   * Validates if the data point is usable.
   * @param {Object} data - The data object to validate.
   * @returns {Object} - { valid: boolean, reason: string }
   */
  static validate(data) {
    if (!data || typeof data !== 'object') {
        return { valid: false, reason: "NULL_OR_INVALID_TYPE" };
    }

    // 1. Critical Price Check (The only mandatory rule)
    if (data.price === undefined || data.price === null || isNaN(data.price) || data.price <= 0) {
      return { valid: false, reason: "INVALID_PRICE_ZERO_OR_NULL" };
    }

    return { valid: true };
  }

  /**
   * Wraps validation with an automatic LKG fallback.
   * @param {string} symbol - The symbol.
   * @param {Object} data - Incoming data.
   * @returns {Object} - Valid data or LKG fallback.
   */
  static secure(symbol, data) {
    const validation = this.validate(data);
    if (!validation.valid) {
        console.warn(`[VALIDATION] Data for ${symbol} rejected: ${validation.reason}. Falling back to LKG.`);
        return lkgCache.lastKnownGood(symbol);
    }
    return data;
  }
}

module.exports = ValidationEngine;
