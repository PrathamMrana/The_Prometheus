/**
 * 🔱 PROMETHEUS — RESEARCH COMMAND CENTER API
 * PHASE: VERIFICATION & VALIDATION CAMPAIGN
 *
 * Aggregates ALL institutional truth layers into one unified API.
 * This is the truth panel. No features. No optimization. Only evidence.
 *
 * LOCKED: PROMETHEUS_V5_LOCKED = TRUE
 */

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Persistence = require('../utils/persistence');

// ─── Intelligence Engines ─────────────────────────────────────────────────────
const tradeAnalytics             = require('../intelligence/tradeAnalytics');
const edgeDecayMonitor           = require('../intelligence/edgeDecayMonitor');
const shadowPortfolio            = require('../intelligence/shadowPortfolioEngine');
const positionManager            = require('../engine/positionManager');
const portfolioManager           = require('../execution/portfolioManager');
const calibrationEngine          = require('../intelligence/calibrationEngine');
const falseDiscoveryAnalyzer     = require('../intelligence/falseDiscoveryAnalyzer');
const toxicClusterDetector       = require('../intelligence/toxicClusterDetector');
const survivabilityEngine        = require('../intelligence/survivabilityTimelineEngine');
const transitionStressEngine     = require('../intelligence/regimeTransitionStressEngine');
const verdictEngine              = require('../intelligence/researchVerdictEngine');
const campaignIntegrity          = require('../intelligence/campaignIntegrityEngine');
const statisticalConfidence      = require('../intelligence/statisticalConfidenceEngine');
const dataQuality                = require('../intelligence/dataQualityEngine');
const counterfactualEngine       = require('../intelligence/counterfactualSimulationEngine');
const snapshotGenerator          = require('../intelligence/researchSnapshotGenerator');
const killSwitch                 = require('../intelligence/deploymentKillSwitch');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadClosedTrades(portfolioState) {
    return (portfolioState.orders || []).filter(
        o => o.side === 'SELL' && o.status === 'FILLED' && typeof o.pnl === 'number'
    );
}

// ─── GET /api/research ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const portfolioState = portfolioManager.load();
        const closedTrades   = loadClosedTrades(portfolioState);
        const globalState    = require('../globalState');
        const analytics      = tradeAnalytics.computeFullAnalytics(
            portfolioState, Persistence.getInstance()
        );

        // 1. Infrastructure Health
        const mem = process.memoryUsage();
        const infraHealth = {
            heapUsedMB:      parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2)),
            rssMB:           parseFloat((mem.rss / 1024 / 1024).toFixed(2)),
            heartbeatStatus: global.SYSTEM_STATE?.SAFE_MODE ? 'DEGRADED' : 'HEALTHY',
            crashCount:      global.SYSTEM_STATE?.API_FAILURES || 0,
        };

        // 2. Core Campaign Metrics
        const shadowState        = shadowPortfolio.state;
        const cascades           = shadowState.metrics?.cascadingLosses || 0;
        const probabilityOfRuin  = cascades > 5 ? 99 : cascades * 15;
        const alphaRetention     = analytics.execution?.alphaRetentionPct || 0;

        const coreMetrics = {
            totalTrades:      analytics.meta?.tradeCount || 0,
            currentRegime:    globalState.regimeAI?.regime || 'UNKNOWN',
            liveExpectancy:   analytics.expectancy?.expectancyPerTrade || 0,
            profitFactor:     analytics.expectancy?.profitFactor || 0,
            maxDrawdown:      shadowState.maxDrawdownPct || 0,
            winRate:          analytics.expectancy?.winRate || 0,
            alphaRetention,
            probabilityOfRuin,
        };

        // 3. Regime Matrix
        const regimeStats = Object.keys(analytics.diversity?.regimeStats || {}).map(regime => {
            const s = analytics.diversity.regimeStats[regime];
            return {
                regime,
                trades:     s.count,
                expectancy: s.count > 0 ? (s.grossProfit || 0) / s.count : 0,
                pf:         s.profitFactor || 0,
                survival:   (s.profitFactor || 0) > 1.2 ? 'PASS' : 'FAIL'
            };
        });

        // 4. Edge Decay Monitor
        const decayStatus = edgeDecayMonitor.compute(closedTrades);

        // 5. All Institutional Truth Layers (computed in parallel, no mutations)
        const calibration      = calibrationEngine.compute(closedTrades);
        const falseDiscovery   = falseDiscoveryAnalyzer.compute(closedTrades, analytics);
        const toxicClusters    = toxicClusterDetector.compute(closedTrades);
        const survivability    = survivabilityEngine.compute(closedTrades);
        const transitionStress = transitionStressEngine.compute(closedTrades);
        const statConfidence   = statisticalConfidence.compute(closedTrades);
        const dqStatus         = dataQuality.compute(closedTrades);
        const counterfactual   = counterfactualEngine.compute(closedTrades);
        const integrity        = campaignIntegrity.check(closedTrades);

        // 6. Master Verdict
        const verdict = verdictEngine.compute({
            calibration,
            falseDiscovery,
            toxicClusters,
            survivability,
            transitionStress,
            coreMetrics: { totalTrades: coreMetrics.totalTrades }
        });

        // 7. Kill Switch Evaluation
        const killSwitchState = killSwitch.evaluate(verdict, survivability);

        // 8. Auto-generate snapshot if we have enough trades
        if (coreMetrics.totalTrades >= 50) {
            snapshotGenerator.generate(verdict, survivability, coreMetrics);
        }

        res.json({
            status: 'success',
            data: {
                coreMetrics,
                infraHealth,
                regimeStats,
                decayStatus,
                shadowMetrics:  shadowState.metrics,
                calibration,
                falseDiscovery,
                toxicClusters,
                survivability,
                transitionStress,
                statConfidence,
                dataQuality:    dqStatus,
                counterfactual,
                integrity,
                verdict,
                killSwitch:     killSwitchState,
            }
        });

    } catch (e) {
        console.error('[RESEARCH_API] Error:', e.message, e.stack);
        res.status(500).json({ status: 'error', error: e.message });
    }
});

// ─── GET /api/research/verdict ────────────────────────────────────────────────
router.get('/verdict', (req, res) => {
    try {
        const verdictPath = path.join(__dirname, '../data/research/verdict/verdict.json');
        if (!fs.existsSync(verdictPath)) {
            return res.json({ status: 'pending', verdict: 'RESEARCH_ONLY', score: 0 });
        }
        const verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
        res.json({ status: 'success', data: verdict });
    } catch (e) {
        res.status(500).json({ status: 'error', error: e.message });
    }
});

// ─── GET /api/research/integrity ─────────────────────────────────────────────
router.get('/integrity', (req, res) => {
    try {
        const logPath = path.join(__dirname, '../data/research/integrity_alerts.jsonl');
        const alerts  = fs.existsSync(logPath)
            ? fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).slice(-50)
            : [];
        res.json({ status: 'success', data: { alerts } });
    } catch (e) {
        res.status(500).json({ status: 'error', error: e.message });
    }
});

// ─── GET /api/research/survivability ─────────────────────────────────────────
router.get('/survivability', (req, res) => {
    try {
        const statePath = path.join(__dirname, '../data/research/survivability/trend_state.json');
        if (!fs.existsSync(statePath)) return res.json({ status: 'pending' });
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        res.json({ status: 'success', data: state });
    } catch (e) {
        res.status(500).json({ status: 'error', error: e.message });
    }
});

module.exports = router;
