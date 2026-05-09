/**
 * sourcePriorityGuard - Ensures high-quality data persists over low-quality fallback data.
 */

const PRIORITY = {
    'FINNHUB': 3,
    'YFINANCE': 3,
    'TWELVE_DATA': 2,
    'FMP': 2,
    'DEFAULT': 0
};

/**
 * Determines if incoming data should overwrite current cached data based on source priority.
 * @param {Object} current - Current cached data object.
 * @param {Object} incoming - New data object being stored.
 * @returns {boolean} - True if it should update, false otherwise.
 */
function shouldUpdate(current, incoming) {
    if (!current) return true;
    if (!incoming) return false;

    const currentPriority = PRIORITY[current.source] || 0;
    const incomingPriority = PRIORITY[incoming.source] || 0;

    // Only update if incoming priority is higher or equal
    return incomingPriority >= currentPriority;
}

module.exports = {
    shouldUpdate,
    PRIORITY
};
