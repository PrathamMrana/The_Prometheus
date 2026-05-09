/**
 * 🔱 [PROMETHEUS] Backend Market Status Utility
 */

function isMarketOpen() {
    const now = new Date();
    const IST_OFFSET = 5.5 * 60; // minutes
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utcMs + IST_OFFSET * 60000);

    const day = ist.getDay(); 
    if (day === 0 || day === 6) return false; // Weekend

    const h = ist.getHours();
    const m = ist.getMinutes();
    const totalMin = h * 60 + m;

    const OPEN  = 9 * 60 + 15;   // 9:15 AM IST
    const CLOSE = 15 * 60 + 30;  // 3:30 PM IST

    return totalMin >= OPEN && totalMin < CLOSE;
}

module.exports = { isMarketOpen };
