const express = require('express');
const router = express.Router();
const marketState = require('../intelligence/marketState');
const scoringEngine = require('../intelligence/scoringEngine');
const anomalyEngine = require('../intelligence/anomalyEngine');
const impactEngine = require('../intelligence/impactEngine');
const dataHealth = require('../intelligence/dataHealth');
const Persistence = require('../utils/persistence');

const AgentManager = require('../intelligence/agentManager');

// 🛰️ [ELITE] Quantum Intelligence API Endpoints
router.post('/agent/run', async (req, res) => {
    try {
        const { sector } = req.body;
        if (!sector) return res.status(400).json({ success: false, error: 'SECTOR_REQUIRED' });

        // 🛡️ [PHASE 16.9] API TIMEOUT GUARD (20s)
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("SCOUT_TIMEOUT")), 20000)
        );

        const results = await Promise.race([AgentManager.runScout({ sector }), timeout]);
        res.json({ success: true, data: results });
    } catch (e) {
        console.error(`🚨 [AGENT_API_ERROR]`, e.message);
        
        if (e.message === "SCOUT_TIMEOUT") {
            return res.status(504).json({ success: false, error: 'AGENT_TIMEOUT', message: 'Synchronization timed out.' });
        }
        if (e.message === "SCOUT_BLOCKED_NO_DATA") {
            return res.status(503).json({ success: false, error: 'DATA_UNAVAILABLE', message: 'Market data stabilization in progress.' });
        }

        res.status(500).json({ success: false, error: 'AGENT_ENGINE_FAIL' });
    }
});
router.get('/state', (req, res) => {
    const cache = Persistence.load();
    const state = marketState.getState();
    
    // 🛡️ [FIX] Filter out ghost symbols that failed to fetch completely (e.g. 404 delisted)
    const validPrices = {};
    for (const [key, value] of cache.entries()) {
        if (value && typeof value.price === 'number' && value.price > 0) {
            validPrices[key] = value;
        }
    }

    res.json({ 
        success: true, 
        data: {
            ...state,
            prices: validPrices
        } 
    });
});

router.get('/insights', (req, res) => {
    // Top 3 Priority Insights
    const topInsights = [
        "Regime stabilization confirmed with institutional liquidity.",
        "Anomaly cluster detected in IT sector volume profile.",
        "Adaptive scoring favors dividend yielders in current volatility."
    ];
    res.json({ success: true, data: topInsights });
});

router.get('/anomalies', (req, res) => {
    const cache = Persistence.load();
    const allAnomalies = [];
    
    // Scan core symbols for anomalies
    ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'AAPL', 'NVDA'].forEach(sym => {
        const data = cache.get(sym);
        if (data) {
            const findings = anomalyEngine.detect(sym, {
                ...data,
                avgVolume: data.volume / 1.5,
                sentiment: 'BULLISH'
            });
            allAnomalies.push(...findings);
        }
    });

    res.json({ success: true, data: allAnomalies });
});

router.get('/impact', (req, res) => {
    // Sample cross-asset causality
    const impacts = [
        { source: "BRENT", target: "INDIA IT", correlation: 0.85, delay: "T+1" },
        { source: "US10Y", target: "TECH SECTOR", correlation: -0.92, delay: "REALTIME" }
    ];
    res.json({ success: true, data: impacts });
});

router.get('/signal-decay', (req, res) => {
    // Current active signals for timeline
    const signals = [
        { ticker: "RELIANCE", signal: "BULLISH BREAKOUT", strength: 0.92, type: "ANOMALY", timestamp: Date.now() },
        { ticker: "TCS", signal: "ACCUMULATION", strength: 0.78, type: "INSIGHT", timestamp: Date.now() - 100000 }
    ];
    res.json({ success: true, data: signals });
});

router.get('/health', (req, res) => {
    res.json({ success: true, data: dataHealth.getStatus() });
});

module.exports = router;
