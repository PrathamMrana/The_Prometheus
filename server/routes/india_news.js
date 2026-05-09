const express = require('express');
const router = express.Router();
const fetchWithRetry = require('../utils/fetchWithRetry');
const cache = require('../cache');

router.get('/', async (req, res) => {
    const cached = cache.get('india_news');
    if (cached) return res.json(cached);

    try {
        const tickers = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', '^NSEI', '^BSESN', 'SBI.NS', 'ITC.NS'];
        let allNews = [];
        
        for (const t of tickers) {
            try {
                const resp = await fetchWithRetry(`https://query2.finance.yahoo.com/v1/finance/search?q=${t}&newsCount=3`, {}, 2, 5000);
                if (!resp.ok) continue;
                const result = await resp.json();
                
                if (result.news) {
                    result.news.forEach(n => {
                        allNews.push({
                            ticker: t.replace('.NS', '').replace('^', ''),
                            headline: n.title,
                            link: n.link,
                            time: n.providerPublishTime || Date.now()
                        });
                    });
                }
            } catch (err) {
                // ignore single ticker errors
            }
        }
        
        // Sort by time descending and remove duplicate headlines
        allNews.sort((a,b) => b.time - a.time);

        
        const uniqueNews = [];
        const seen = new Set();
        for (const n of allNews) {
            if (!seen.has(n.headline)) {
                seen.add(n.headline);
                uniqueNews.push(n);
            }
        }
        
        const payload = { success: true, data: uniqueNews.slice(0, 15) };
        cache.set('india_news', payload, 30); // 30 sec cache for blazing fast updates
        res.json(payload);
    } catch (e) {
        console.error("India News fetch failed:", e.message);
        res.status(500).json({ success: false });
    }
});

module.exports = router;
