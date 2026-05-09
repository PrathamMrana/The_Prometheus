const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const { predict } = require('../ml/predictor');

// Optional: LKG Cache for fallback
const cache = new Map();

router.get('/signal', async (req, res) => {
    let symbol = req.query.symbol;
    if (!symbol) {
        return res.status(400).json({ success: false, error: "Missing symbol parameter" });
    }

    symbol = symbol.toUpperCase().trim();
    if (!symbol.includes('.')) symbol += '.NS'; // Assume India for Prometheus

    try {
        console.log(`🤖 [ML_API] Received prediction request for ${symbol}`);
        
        // 1. Fetch live history to generate current features
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`;
        const reqData = await fetch(url);
        const json = await reqData.json();

        const history = [];
        if (json.chart && json.chart.result && json.chart.result[0]) {
            const resData = json.chart.result[0];
            const timestamps = resData.timestamp || [];
            const quotes = resData.indicators.quote[0] || {};
            const volumes = quotes.volume || [];
            
            for (let i = 0; i < timestamps.length; i++) {
                if (quotes.close[i] !== null) {
                    history.push({
                        date: timestamps[i],
                        close: quotes.close[i],
                        high: quotes.high[i] !== null ? quotes.high[i] : quotes.close[i],
                        low: quotes.low[i] !== null ? quotes.low[i] : quotes.close[i],
                        volume: volumes[i] || 0
                    });
                }
            }
        }

        if (history.length < 50) {
            console.warn(`⚠️ [ML_API] Insufficient data for ${symbol} (${history.length} rows)`);
            return res.json({ success: false, error: "INSUFFICIENT_DATA" });
        }

        const currentVolume = history[history.length - 1].volume;
        const recentVolumes = history.slice(-20).map(h => h.volume);
        const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

        const PortfolioManager = require('../execution/portfolioManager');
        const portfolio = PortfolioManager.load();
        const existingPosition = portfolio.holdings[symbol] || portfolio.holdings[symbol.replace('.NS', '')];
        const { StrategyManager } = require('../intelligence/strategyManager');
        let previousSignal = StrategyManager.getLastSignal(symbol);
        if (previousSignal === "HOLD") {
            previousSignal = StrategyManager.getLastSignal(symbol.replace('.NS', ''));
        }
        
        if (previousSignal === "HOLD" && existingPosition) {
            previousSignal = "BUY";
        }

        // 2. Predict using isolated ML engine
        const prediction = await predict(symbol, history, { currentVolume, avgVolume }, previousSignal);
        
        if (prediction.success) {
            // Cache successful prediction
            cache.set(symbol, { ...prediction, timestamp: Date.now() });
            res.json(prediction);
        } else {
            console.error(`🚨 [ML_API] Prediction failed for ${symbol}: ${prediction.error}`);
            res.status(500).json(prediction);
        }
    } catch (e) {
        console.error(`🚨 [ML_API] Fatal Error on /signal:`, e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
