const express = require('express');
const router = express.Router();
const fetchWithRetry = require('../utils/fetchWithRetry');
const cache = require('../cache');

router.get('/', async (req, res) => {
    const cached = cache.get('social_sentiment');
    if (cached) return res.json(cached);

    try {
        // Fetching top 50 trending tickers from WallStreetBets via Tradestie
        const resp = await fetchWithRetry('https://tradestie.com/api/v1/apps/reddit', {}, 3, 8000);
        if (!resp.ok) throw new Error(`Tradestie API error: ${resp.status}`);
        
        const data = await resp.json();
        
        // Format: { ticker, sentiment, sentiment_score, no_of_comments }
        const formatted = data.slice(0, 10).map(item => ({
            symbol: item.ticker,
            sentiment: item.sentiment,
            score: item.sentiment_score,
            comments: item.no_of_comments
        }));

        const payload = { success: true, data: formatted };
        cache.set('social_sentiment', payload, 300); // 5 min cache for social data
        res.json(payload);
    } catch (e) {
        console.error("WSB Social fetch failed:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
