/**
 * 🔱 [PROMETHEUS] Market Status Utility
 * Single source of truth for market open/closed state and data freshness.
 * Used by all dashboard components to avoid false STALE/DEAD states.
 */

/**
 * Returns true if NSE is currently open (Mon-Fri, 9:15 AM – 3:30 PM IST).
 * IST = UTC+5:30
 */
export function isMarketOpen() {
    const now = new Date();
    // Convert to IST
    const IST_OFFSET = 5.5 * 60; // minutes
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utcMs + IST_OFFSET * 60000);

    const day = ist.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false; // Weekend

    const h = ist.getHours();
    const m = ist.getMinutes();
    const totalMin = h * 60 + m;

    const OPEN  = 9 * 60 + 15;   // 9:15 AM IST
    const CLOSE = 15 * 60 + 30;  // 3:30 PM IST

    return totalMin >= OPEN && totalMin < CLOSE;
}

/**
 * Returns the data freshness label and color for a given timestamp.
 * Market-aware: when closed, all data is "CLOSED" (never STALE/DEAD).
 *
 * @param {number} timestamp - Unix ms timestamp of the data
 * @param {string} status    - 'CLOSED' | 'LIVE' | undefined
 * @returns {{ label: string, color: string, isValid: boolean }}
 */
export function getFreshnessState(timestamp, status) {
    const isClosed = status === 'CLOSED' || !isMarketOpen();

    if (isClosed) {
        // Market is closed — closing price IS the valid data. Never show stale.
        return { label: 'CLOSED', color: 'text-muted', isValid: true };
    }

    // Market is open — measure actual data age
    const age = timestamp ? Math.max(0, Date.now() - timestamp) : Infinity;
    if (age < 90000)  return { label: 'LIVE',    color: 'text-bull', isValid: true };
    if (age < 180000) return { label: 'DELAYED', color: 'text-gold', isValid: true };
    return { label: 'STALE', color: 'text-bear', isValid: false };
}

/**
 * Returns a display string like "LIVE" or "28m ago" or "CLOSED"
 * for use in component headers.
 */
export function getFreshnessDisplay(latestTimestamp, anyStatus) {
    const isClosed = anyStatus === 'CLOSED' || !isMarketOpen();
    if (isClosed) return { text: 'MARKET CLOSED · Showing Friday Close', color: 'text-muted/60' };

    const secsAgo = latestTimestamp ? Math.floor((Date.now() - latestTimestamp) / 1000) : null;
    if (secsAgo === null) return { text: 'CONNECTING...', color: 'text-gold animate-pulse' };
    if (secsAgo < 90)  return { text: `Updated ${secsAgo}s ago`, color: 'text-bull' };
    if (secsAgo < 300) return { text: `Updated ${Math.floor(secsAgo/60)}m ago`, color: 'text-gold' };
    return { text: `STALE · ${Math.floor(secsAgo/60)}m ago`, color: 'text-bear' };
}
