const express = require('express');
const router = express.Router();
const fetchWithRetry = require('../utils/fetchWithRetry');
const cache = require('../cache');

router.get('/metrics', async (req, res) => {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Symbol required' });

    // FMP usually doesn't need .NS suffix for all endpoints, but let's clean it
    const cleanSym = symbol.replace('.NS', '').replace('.BO', '');
    const cacheKey = `fund_${cleanSym}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    try {
        const apiKey = process.env.FMP_KEY;
        const profileUrl = `https://financialmodelingprep.com/api/v3/profile/${cleanSym}?apikey=${apiKey}`;
        const ratioUrl = `https://financialmodelingprep.com/api/v3/ratios-ticker/${cleanSym}?limit=1&apikey=${apiKey}`;

        const [profileResp, ratioResp] = await Promise.all([
            fetchWithRetry(profileUrl, {}, 2, 5000),
            fetchWithRetry(ratioUrl, {}, 2, 5000)
        ]);

        const profileData = await profileResp.json();
        const ratioData = await ratioResp.json();

        const prof = profileData[0] || {};
        const rat = ratioData[0] || {};

        const result = {
            pe: parseFloat(rat.priceEarningsRatio || 0),
            roe: parseFloat(rat.returnOnEquity || 0),
            marketCap: prof.mktCap || 0,
            revenueGrowth: prof.lastDiv || 0, // Placeholder if growth not in profile
            description: prof.description || '',
            sector: prof.sector || '',
            timestamp: new Date().toISOString()
        };

        cache.set(cacheKey, result, 21600); // 6 hour cache for fundamentals
        res.json({ success: true, data: result });
    } catch (e) {
        console.error("FMP fetch failed:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
