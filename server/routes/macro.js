const express = require('express');
const router = express.Router();
const fetchWithRetry = require('../utils/fetchWithRetry');
const cache = require('../cache');

router.get('/pulse', async (req, res) => {
    const cacheKey = `macro_pulse`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    try {
        const apiKey = process.env.FRED_KEY;
        // Series IDs: FEDFUNDS (Interest Rate), GDP (GDP), CPIAUCSL (Inflation)
        const series = ['FEDFUNDS', 'GDP', 'CPIAUCSL'];
        const results = {};

        for (const s of series) {
            const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s}&sort_order=desc&limit=1&file_type=json&api_key=${apiKey}`;
            const resp = await fetchWithRetry(url, {}, 2, 5000);
            const data = await resp.json();
            results[s] = parseFloat(data.observations?.[0]?.value || 0);
        }

        const payload = {
            interest_rate: results['FEDFUNDS'],
            gdp: results['GDP'],
            inflation: results['CPIAUCSL'],
            timestamp: new Date().toISOString()
        };

        cache.set(cacheKey, payload, 86400); // 24 hour cache for macro
        res.json({ success: true, data: payload });
    } catch (e) {
        console.error("FRED fetch failed:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
