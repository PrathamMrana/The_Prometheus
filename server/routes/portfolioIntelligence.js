/**
 * 🛰️ PROMETHEUS Phase 18 — Portfolio Intelligence API Routes
 *
 * GET  /api/portfolio/intelligence  → AI portfolio score, sector allocation, rebalancing
 * GET  /api/portfolio/signals       → Batch signal snapshot for all held symbols
 * GET  /api/analytics/performance   → Real Sharpe, win rate, equity curve, predictions
 */

const express          = require('express');
const router           = express.Router();
const PortfolioManager = require('../execution/portfolioManager');
const Persistence      = require('../utils/persistence');
const portfolioIntel   = require('../intelligence/portfolioIntelligence');
const performanceEng   = require('../intelligence/performanceEngine');
const tradeAnalytics    = require('../intelligence/tradeAnalytics');
const edgeDecayMonitor  = require('../intelligence/edgeDecayMonitor');
const researchSnapshot  = require('../intelligence/researchSnapshot');
const adversarialEngine = require('../intelligence/adversarialEngine');
const { computeStrategyInsights, loadState } = require('../intelligence/strategyTracker');

// ─── GET /api/portfolio/intelligence ─────────────────────────────────────────
router.get('/intelligence', (req, res) => {
    try {
        const portfolio  = PortfolioManager.load();
        const cache      = Persistence.getInstance();          // portfolioCache Map
        const result     = portfolioIntel.compute(portfolio, cache);
        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('[PORTFOLIO INTEL ERROR]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ─── GET /api/portfolio/signals ───────────────────────────────────────────────
// Batch snapshot of all signals for currently held symbols — avoids per-holding previews
router.get('/signals', (req, res) => {
    try {
        const portfolio = PortfolioManager.load();
        const cache     = Persistence.getInstance();
        const symbols   = Object.keys(portfolio.holdings || {});
        const signals   = {};

        for (const symbol of symbols) {
            const key   = symbol.split('.')[0];
            const entry = cache.get(key) || cache.get(symbol);
            signals[symbol] = entry?.signal ?? { status: 'COMPUTING', score: 0, decision: 'UNKNOWN' };
        }

        return res.json({ success: true, signals });
    } catch (err) {
        console.error('[PORTFOLIO SIGNALS ERROR]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ─── GET /api/analytics/performance ──────────────────────────────────────────
router.get('/performance', (req, res) => {
    try {
        const portfolio = PortfolioManager.load();
        const result    = performanceEng.compute(portfolio);
        return res.json({ success: true, data: result });
    } catch (err) {
        console.error('[PERFORMANCE ENGINE ERROR]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ─── GET /api/analytics/research ─────────────────────────────────────────────
// Full economic validity analytics: expectancy, drawdown (3 types), regime
// attribution, slippage modeling, and Monte Carlo survivability.
// This is the analytically verified truth layer — safe for capital decisions.
router.get('/research', (req, res) => {
    try {
        const portfolio = PortfolioManager.load();
        const cache     = Persistence.getInstance();
        
        // 1. Compute verified analytics
        const analytics = tradeAnalytics.computeFullAnalytics(portfolio, cache);
        
        // 2. Compute rolling edge decay status
        const closedTrades = (portfolio.orders || []).filter(o => o.side === 'SELL' && o.status === 'FILLED' && typeof o.pnl === 'number');
        const decayStatus  = edgeDecayMonitor.compute(closedTrades);
        
        // 3. Generate today's snapshot (idempotent)
        researchSnapshot.generateDailySnapshot(analytics, decayStatus);

        return res.json({ 
            success: true, 
            data: {
                ...analytics,
                decay: decayStatus
            }
        });
    } catch (err) {
        console.error('[RESEARCH ANALYTICS ERROR]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ─── GET /api/analytics/adversarial ─────────────────────────────────────────
// Full adversarial validation suite: synthetic attacks, Monte Carlo, parameter
// stability, execution hostility, false discovery, and final research gate.
router.get('/adversarial', async (req, res) => {
    try {
        const portfolio  = PortfolioManager.load();
        const cache      = Persistence.getInstance();
        const analytics  = tradeAnalytics.computeFullAnalytics(portfolio, cache);
        const results    = adversarialEngine.runFullAdversarialSuite(portfolio, analytics);
        return res.json({ success: true, data: results });
    } catch (err) {
        console.error('[ADVERSARIAL ENGINE ERROR]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ─── GET /api/strategy/insights ──────────────────────────────────────────────
// Computes factor attribution, updates weights, returns full learning snapshot
router.get('/insights', (req, res) => {
    try {
        const portfolio = PortfolioManager.load();
        const insights  = computeStrategyInsights(portfolio);
        return res.json({ success: true, data: insights });
    } catch (err) {
        console.error('[STRATEGY TRACKER ERROR]', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
