/**
 * 🛰️ Prometheus Symbol Normalization Utility
 * Single source of truth for canonical symbol mapping.
 */

/**
 * 🛠️ Normalize a symbol by removing Indian NSE suffixes (.NS)
 * @param {string} symbol - Raw symbol from UI or API
 * @returns {string} Normalized canonical symbol
 */
const normalizeSymbol = (symbol = "") => {
    if (typeof symbol !== 'string') return "";
    return symbol.trim().toUpperCase().replace('.NS', '');
};

module.exports = {
    normalizeSymbol
};
