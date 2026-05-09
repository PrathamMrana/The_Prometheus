const { getRSI, getEMA, getMomentum, getATR } = require('../intelligence/indicators');

/**
 * 🧠 [PHASE 13] ML Feature Engineering
 * Safely computes features and labels for the RandomForest pipeline.
 */

function extractFeatures(history) {
    if (!history || history.length < 25) return null; // 🛠️ Fix 1: Relaxed from 50 to 25

    const closes = history.map(h => h.close);
    const highs = history.map(h => h.high);
    const lows = history.map(h => h.low);
    const price = closes[closes.length - 1];

    const rsi = getRSI(closes);
    if (rsi === null) return null;

    const ema20 = getEMA(closes, 20);
    const ema50 = getEMA(closes, Math.min(closes.length, 50));
    const momentum = getMomentum(closes);
    const atr = getATR(highs, lows, closes, 14);

    if (ema20 === null || ema50 === null || momentum === null || atr === null) {
        return null; // Insufficient data to calculate valid indicators
    }

    const emaDist20 = ((price - ema20) / ema20) * 100;
    const emaDist50 = ((price - ema50) / ema50) * 100;

    return {
        rsi: parseFloat(rsi.toFixed(2)),
        ema20: parseFloat(ema20.toFixed(2)),
        ema50: parseFloat(ema50.toFixed(2)),
        emaDist20: parseFloat(emaDist20.toFixed(2)),
        emaDist50: parseFloat(emaDist50.toFixed(2)),
        momentum: parseFloat(momentum.toFixed(2)),
        atr: parseFloat(atr.toFixed(2)),
        price: parseFloat(price.toFixed(2))
    };
}

/**
 * Generates training rows from historical data
 * Target Label: 1 if next_close > current_close else 0
 */
function buildTrainingData(history) {
    const dataset = [];

    // Need to look ahead by 1 for the label, so we stop at length - 1
    for (let i = 25; i < history.length - 1; i++) {
        // Build a slice of history up to the current instance
        const slice = history.slice(0, i + 1);
        const features = extractFeatures(slice);
        
        if (!features) continue;

        const currentClose = history[i].close;
        const nextClose = history[i + 1].close;

        // Label: 1 (BUY) if price goes up, 0 (SELL) otherwise
        const label = nextClose > currentClose ? 1 : 0;

        dataset.push({
            features,
            label
        });
    }

    return dataset;
}

module.exports = {
    extractFeatures,
    buildTrainingData
};
