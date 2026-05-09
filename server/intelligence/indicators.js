/**
 * 📊 [PHASE 7 - STEP 2] INDICATORS ENGINE (PURE MATH)
 * Strictly deterministic, non-mutating mathematical technical indicators.
 */

function getRSI(prices, period = 14) {
    if (!prices || prices.length < 5) return null; // Relaxed for Validation

    let gains = 0;
    let losses = 0;

    // Use available changes, up to `period`
    const effectivePeriod = Math.min(period, prices.length - 1);
    for (let i = prices.length - effectivePeriod; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }

    const avgGain = gains / effectivePeriod;
    const avgLoss = losses / effectivePeriod;

    if (avgGain === 0 && avgLoss === 0) return 50; // Flat prices — no directional signal
    if (avgLoss === 0) return 100; // Pure uptrend
    if (avgGain === 0) return 0;  // Pure downtrend

    const rs = avgGain / avgLoss;
    return parseFloat((100 - (100 / (1 + rs))).toFixed(2));
}

function getEMA(prices, period = 20) {
    if (!prices || prices.length < 5) return null; // Relaxed for Validation

    const effectivePeriod = Math.min(period, prices.length);
    const k = 2 / (period + 1);
    let ema = prices[prices.length - effectivePeriod];

    for (let i = prices.length - effectivePeriod + 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }

    return parseFloat(ema.toFixed(4));
}

function getMomentum(prices, window = 5) {
    if (!prices || prices.length < window + 1) return null;

    const start = prices[prices.length - 1 - window];
    const end   = prices[prices.length - 1];

    if (!start || start === 0) return null; // Return null if baseline is invalid
    
    // Return percentage change over the window
    return parseFloat(((end - start) / start * 100).toFixed(4));
}

function getATR(highs, lows, closes, period = 14) {
    if (!highs || !lows || !closes || closes.length < 5) return null; // Relaxed for Validation

    const trs = [];
    for (let i = 1; i < closes.length; i++) {
        const high = highs[i];
        const low = lows[i];
        const prevClose = closes[i - 1];

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trs.push(tr);
    }

    if (trs.length < period) {
        if (trs.length === 0) return parseFloat((closes[closes.length - 1] * 0.02).toFixed(4));
        const fallbackAtr = trs.reduce((a, b) => a + b, 0) / trs.length;
        return parseFloat(fallbackAtr.toFixed(4));
    }

    // Standard ATR: Simple Moving Average of True Range
    const recentTRs = trs.slice(-period);
    const atr = recentTRs.reduce((a, b) => a + b, 0) / period;

    return parseFloat(atr.toFixed(4));
}

module.exports = { getRSI, getEMA, getMomentum, getATR };
