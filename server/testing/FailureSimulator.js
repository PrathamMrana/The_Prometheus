/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11] PROMETHEUS FAILURE SIMULATOR v1.0
 * ══════════════════════════════════════════════════════════════
 *
 * Graceful degradation testing harness.
 * Simulates real infrastructure failure modes to verify:
 * - Feed state machine transitions
 * - Execution blocking on stale/disconnected feeds
 * - Queue saturation behavior
 * - Symbol-level desync handling
 * - Risk engine defensive modes
 *
 * ACTIVATION: POST /testing/simulate { scenario }
 * Never active in production unless explicitly triggered.
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const feedState = require('../utils/feedState');

// ── Active injections registry ────────────────────────────────────────────────
const activeInjections = new Map(); // name → { active, startedAt, endsAt, params }

// ── Scenario definitions ──────────────────────────────────────────────────────
const SCENARIOS = {

    /**
     * STALE_FEED: Suppress markLiveTick() calls for N seconds.
     * Causes feedState to transition LIVE→DELAYED→STALE.
     */
    STALE_FEED: {
        label:       'Stale Feed Injection',
        description: 'Blocks live tick confirmation for specified duration, triggers DELAYED→STALE transition.',
        defaultDurationMs: 45_000,
        apply: (params, endAt) => {
            activeInjections.set('STALE_FEED', {
                active: true, startedAt: Date.now(), endsAt: endAt,
                params, description: 'Blocking live tick marks'
            });
            console.warn('[FAILURE_SIM] ⚠️  STALE_FEED scenario ACTIVE — markLiveTick suppressed');
        },
        clear: () => {
            activeInjections.delete('STALE_FEED');
            console.log('[FAILURE_SIM] ✅ STALE_FEED scenario cleared');
        }
    },

    /**
     * QUEUE_SATURATION: Spike queue depth counter.
     * Forces OrderQueue to compute high-congestion latencies and slippage.
     */
    QUEUE_SATURATION: {
        label:       'Queue Saturation Injection',
        description: 'Artificially inflates queue depth to trigger saturation dynamics.',
        defaultDurationMs: 30_000,
        apply: (params, endAt) => {
            activeInjections.set('QUEUE_SATURATION', {
                active: true, startedAt: Date.now(), endsAt: endAt,
                syntheticDepth: params.depth || 15,
                params,
            });
            console.warn('[FAILURE_SIM] ⚠️  QUEUE_SATURATION scenario ACTIVE — depth injected');
        },
        clear: () => {
            activeInjections.delete('QUEUE_SATURATION');
            console.log('[FAILURE_SIM] ✅ QUEUE_SATURATION scenario cleared');
        }
    },

    /**
     * SYMBOL_DESYNC: Mark specific symbols as stale.
     * Tests that stale symbols don't block execution of live ones.
     */
    SYMBOL_DESYNC: {
        label:       'Symbol Desync Injection',
        description: 'Marks specified symbols with stale feedAge, verifying partial-market operation.',
        defaultDurationMs: 60_000,
        apply: (params, endAt) => {
            activeInjections.set('SYMBOL_DESYNC', {
                active: true, startedAt: Date.now(), endsAt: endAt,
                symbols: params.symbols || ['INFY', 'TCS'],
                params,
            });
            console.warn(`[FAILURE_SIM] ⚠️  SYMBOL_DESYNC scenario ACTIVE for: ${(params.symbols || ['INFY','TCS']).join(',')}`);
        },
        clear: () => {
            activeInjections.delete('SYMBOL_DESYNC');
            console.log('[FAILURE_SIM] ✅ SYMBOL_DESYNC scenario cleared');
        }
    },

    /**
     * LIQUIDITY_COLLAPSE: Inject very low VR (< 0.3) into signal processing.
     * Triggers: partial fills, high slippage, entry blocks.
     */
    LIQUIDITY_COLLAPSE: {
        label:       'Liquidity Collapse Injection',
        description: 'Injects VR < 0.3 across all signals, causing partial fills and entry blocks.',
        defaultDurationMs: 30_000,
        apply: (params, endAt) => {
            activeInjections.set('LIQUIDITY_COLLAPSE', {
                active: true, startedAt: Date.now(), endsAt: endAt,
                vrOverride: 0.25, params,
            });
            console.warn('[FAILURE_SIM] ⚠️  LIQUIDITY_COLLAPSE scenario ACTIVE — VR forced to 0.25');
        },
        clear: () => {
            activeInjections.delete('LIQUIDITY_COLLAPSE');
            console.log('[FAILURE_SIM] ✅ LIQUIDITY_COLLAPSE scenario cleared');
        }
    },

    /**
     * HIGH_VOLATILITY: Inject volatilityScore = 85 across all signals.
     * Triggers regime suppression, wider spreads, throttled fills.
     */
    HIGH_VOLATILITY: {
        label:       'High Volatility Injection',
        description: 'Forces volatilityScore=85 across all signals, stressing execution throttling.',
        defaultDurationMs: 30_000,
        apply: (params, endAt) => {
            activeInjections.set('HIGH_VOLATILITY', {
                active: true, startedAt: Date.now(), endsAt: endAt,
                volOverride: 85, params,
            });
            console.warn('[FAILURE_SIM] ⚠️  HIGH_VOLATILITY scenario ACTIVE');
        },
        clear: () => {
            activeInjections.delete('HIGH_VOLATILITY');
            console.log('[FAILURE_SIM] ✅ HIGH_VOLATILITY scenario cleared');
        }
    },

    /**
     * EXECUTION_TIMEOUT: Delays all order fills by N seconds.
     * Tests execution timeout handling in queue.
     */
    EXECUTION_TIMEOUT: {
        label:       'Execution Timeout Injection',
        description: 'Delays all queue fills by specified ms to simulate routing timeout.',
        defaultDurationMs: 20_000,
        apply: (params, endAt) => {
            activeInjections.set('EXECUTION_TIMEOUT', {
                active: true, startedAt: Date.now(), endsAt: endAt,
                extraDelayMs: params.delayMs || 3000, params,
            });
            console.warn(`[FAILURE_SIM] ⚠️  EXECUTION_TIMEOUT scenario ACTIVE — extra delay: ${params.delayMs || 3000}ms`);
        },
        clear: () => {
            activeInjections.delete('EXECUTION_TIMEOUT');
            console.log('[FAILURE_SIM] ✅ EXECUTION_TIMEOUT scenario cleared');
        }
    },
};

// ── Auto-expiry checker ───────────────────────────────────────────────────────
setInterval(() => {
    const now = Date.now();
    for (const [name, inj] of activeInjections.entries()) {
        if (inj.endsAt && now > inj.endsAt) {
            const scenario = SCENARIOS[name];
            if (scenario) scenario.clear();
            else activeInjections.delete(name);
        }
    }
}, 5_000);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check if a specific injection is active.
 * Used by OrderQueue, SignalProcessor, etc.
 */
function isActive(scenarioName) {
    return activeInjections.has(scenarioName);
}

/**
 * Get injection params for a scenario.
 */
function getInjection(scenarioName) {
    return activeInjections.get(scenarioName) || null;
}

/**
 * Check if a symbol is desync-injected.
 */
function isSymbolDesynced(symbol) {
    const inj = activeInjections.get('SYMBOL_DESYNC');
    if (!inj) return false;
    const sym = symbol.split('.')[0].toUpperCase();
    return (inj.symbols || []).includes(sym);
}

// ── REST endpoints ────────────────────────────────────────────────────────────

// POST /testing/simulate — activate a scenario
router.post('/simulate', (req, res) => {
    const { scenario, durationMs, params = {} } = req.body || {};
    if (!scenario) return res.status(400).json({ error: 'MISSING_SCENARIO' });

    const def = SCENARIOS[scenario];
    if (!def) {
        return res.status(400).json({
            error: 'UNKNOWN_SCENARIO',
            available: Object.keys(SCENARIOS),
        });
    }

    const duration = durationMs || def.defaultDurationMs;
    const endAt    = Date.now() + duration;
    def.apply(params, endAt);

    res.json({
        success: true,
        scenario,
        label:       def.label,
        description: def.description,
        activeUntil: new Date(endAt).toISOString(),
        durationMs:  duration,
    });
});

// DELETE /testing/simulate/:scenario — clear a scenario
router.delete('/simulate/:scenario', (req, res) => {
    const name = req.params.scenario;
    const def  = SCENARIOS[name];
    if (!def) return res.status(404).json({ error: 'UNKNOWN_SCENARIO' });

    def.clear();
    res.json({ success: true, cleared: name });
});

// GET /testing/status — list all active injections
router.get('/status', (req, res) => {
    const status = [];
    for (const [name, inj] of activeInjections.entries()) {
        status.push({
            name,
            active:     inj.active,
            startedAt:  new Date(inj.startedAt).toISOString(),
            endsAt:     inj.endsAt ? new Date(inj.endsAt).toISOString() : null,
            remainingMs: inj.endsAt ? Math.max(0, inj.endsAt - Date.now()) : null,
            params:     inj.params,
        });
    }
    res.json({
        success: true,
        activeInjections: status,
        availableScenarios: Object.entries(SCENARIOS).map(([k, v]) => ({
            name: k, label: v.label, description: v.description
        })),
    });
});

// GET /testing/scenarios — list available scenarios
router.get('/scenarios', (req, res) => {
    res.json({
        success: true,
        scenarios: Object.entries(SCENARIOS).map(([k, v]) => ({
            name: k,
            label: v.label,
            description: v.description,
            defaultDurationMs: v.defaultDurationMs,
        })),
    });
});

module.exports = { router, isActive, getInjection, isSymbolDesynced };
