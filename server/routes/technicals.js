const express = require('express');
const router = express.Router();
const fetchWithRetry = require('../utils/fetchWithRetry');
const cache = require('../cache');

router.get('/indicators', async (req, res) => {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Symbol required' });

    const cacheKey = `tech_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    try {
        const apiKey = process.env.ALPHA_VANTAGE_KEY;
        // Institutional Rule (Layer 7): Alpha Vantage uses .BSE for Indian symbols
        const cleanSym = symbol.includes('.NS') ? symbol.replace('.NS', '.BSE') : symbol;
        
        // Fetch RSI
        const rsiUrl = `https://www.alphavantage.co/query?function=RSI&symbol=${cleanSym}&interval=daily&time_period=14&series_type=close&apikey=${apiKey}`;
        // Fetch MACD
        const macdUrl = `https://www.alphavantage.co/query?function=MACD&symbol=${cleanSym}&interval=daily&series_type=close&apikey=${apiKey}`;

        const [rsiResp, macdResp] = await Promise.all([
            fetchWithRetry(rsiUrl, {}, 2, 5000),
            fetchWithRetry(macdUrl, {}, 2, 5000)
        ]);

        const rsiData = await rsiResp.json();
        const macdData = await macdResp.json();

        const latestRsiDate = Object.keys(rsiData['Technical Analysis: RSI'] || {})[0];
        const latestMacdDate = Object.keys(macdData['Technical Analysis: MACD'] || {})[0];

        const result = {
            symbol: cleanSym,
            rsi: parseFloat(rsiData['Technical Analysis: RSI']?.[latestRsiDate]?.RSI || 0),
            macd: parseFloat(macdData['Technical Analysis: MACD']?.[latestMacdDate]?.MACD || 0),
            macdSignal: parseFloat(macdData['Technical Analysis: MACD']?.[latestMacdDate]?.MACD_Signal || 0),
            macdHist: parseFloat(macdData['Technical Analysis: MACD']?.[latestMacdDate]?.MACD_Hist || 0),
            timestamp: new Date().toISOString()
        };

        cache.set(cacheKey, result, 60); // 60 sec institutional cache (Layer 8)
        res.json({ success: true, data: result });
    } catch (e) {
        console.error("Alpha Vantage fetch failed:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
