const express = require('express');
const router = express.Router();
const fetchWithRetry = require('../utils/fetchWithRetry');
const cache = require('../cache');

const BLOCK_PHRASES = [
    'themes that', 'mental health', 'performance coach',
    'lifestyle', 'wellness', 'fitness', 'dating', 'recipe',
    'travel', 'celebrity', 'entertainment', 'sports', 'gaming'
];

const REQUIRE_PHRASES = [
    'stock', 'market', 'share', 'nasdaq', 'nyse', 'nse',
    'nifty', 'sensex', 'fed', 'rate', 'earning', 'revenue',
    'profit', 'investor', 'trade', 'economy', 'financial',
    'bank', 'fund', 'ipo', 'dividend', 'oil', 'gold', 'bond'
];

router.get('/', async (req, res) => {
    const cached = cache.get('news');
    if (cached) return res.json(cached);

    try {
        const resp = await fetchWithRetry(`https://finnhub.io/api/v1/news?category=general&token=${process.env.FINNHUB_API_KEY}`, {}, 3, 8000);
        const data = await resp.json();

        let headlines = [];
        if (data && data.length > 0) {

            const isFinancialNews = (item) => {
                const text = ((item.headline || '') + ' ' + (item.summary || '')).toLowerCase();
                const isBlocked = BLOCK_PHRASES.some(p => text.includes(p));
                const isFinancial = REQUIRE_PHRASES.some(p => text.includes(p));
                return !isBlocked && isFinancial;
            };

            const filtered = data.filter(isFinancialNews);

            const tagHeadline = (hl) => {
                const h = hl.toLowerCase();
                if (h.includes('earn')) return 'EARNINGS';
                if (h.includes('fed') || h.includes('rate')) return 'MACRO';
                if (h.includes('india') || h.includes('rbi')) return 'INDIA';
                if (h.includes('crypto') || h.includes('bitcoin')) return 'CRYPTO';
                return 'MARKET';
            };

            headlines = filtered.slice(0, 20).map(item => ({
                id: item.id,
                title: item.headline.toUpperCase(),
                summary: item.summary?.slice(0, 200) || '',
                source: item.source,
                url: item.url,
                datetime: item.datetime,
                tag: tagHeadline(item.headline)
            }));
        }

        if (headlines.length === 0) {
            headlines = [{ title: "MARKETS AWAITING CATALYST", tag: 'GLOBAL' }];
        }

        const payload = { success: true, data: headlines };
        cache.set('news', payload, 30); // 30 sec TTL for faster updates
        res.json(payload);
    } catch (e) {
        console.error("Finnhub News fetch failed:", e.message);
        res.status(500).json({ success: false });
    }
});

module.exports = router;
