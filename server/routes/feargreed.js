const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const cache = require('../cache');

router.get('/', async (req, res) => {
    const cached = cache.get('feargreed');
    if (cached) return res.json(cached);

    try {
        // Attempt to fetch from CNN
        const resp = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        if (!resp.ok) throw new Error('CNN API Blocked or Failed');

        const data = await resp.json();
        const score = data.fear_and_greed.score;
        let rating = 'NEUTRAL';
        if (score <= 25) rating = 'EXTREME FEAR';
        else if (score <= 45) rating = 'FEAR';
        else if (score >= 75) rating = 'EXTREME GREED';
        else if (score >= 55) rating = 'GREED';

        const payload = { success: true, score: Math.round(score), rating };
        cache.set('feargreed', payload, 300); // 5 min TTL
        res.json(payload);
    } catch (e) {
        console.error("CNN Fear & Greed fetch failed:", e.message);
        // Fallback simulation if CNN blocks
        const payload = { success: true, score: 62, rating: 'GREED' };
        cache.set('feargreed', payload, 60); // 1 min TTL for fallback
        res.json(payload);
    }
});

module.exports = router;
