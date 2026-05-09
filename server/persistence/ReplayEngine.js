/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11] PROMETHEUS REPLAY ENGINE v1.0
 * ══════════════════════════════════════════════════════════════
 *
 * Exposes archive data for institutional inspection and replay.
 * Provides router with endpoints for cycle/symbol replay.
 *
 * Endpoints:
 *   GET /replay/cycle/:id        → full cycle snapshot
 *   GET /replay/cycle/:id/signals → signals from that cycle
 *   GET /replay/symbol/:symbol   → signal history for symbol
 *   GET /replay/summary          → rolling system health summary
 *   GET /replay/confidence       → confidence distribution audit
 *   GET /replay/execution        → execution journal entries
 */

'use strict';

const express       = require('express');
const router        = express.Router();
const CycleArchive  = require('./CycleArchive');
const SignalArchive  = require('./SignalArchive');
const ExecJournal   = require('./ExecutionJournal');

// ── GET /replay/cycle/:id ─────────────────────────────────────────────────────
router.get('/cycle/:id', (req, res) => {
    try {
        const cycleId = req.params.id;
        const cycle   = CycleArchive.get(cycleId);
        if (!cycle) return res.status(404).json({ success: false, error: 'CYCLE_NOT_FOUND', cycleId });

        const signals = SignalArchive.forCycle(cycleId);
        res.json({ success: true, cycle, signals, signalCount: signals.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /replay/cycles ────────────────────────────────────────────────────────
router.get('/cycles', (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const regime = req.query.regime;
        const cycles = regime
            ? CycleArchive.byRegime(regime, limit)
            : CycleArchive.recent(limit);
        res.json({ success: true, cycles, count: cycles.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /replay/symbol/:symbol ────────────────────────────────────────────────
router.get('/symbol/:symbol', (req, res) => {
    try {
        const symbol  = req.params.symbol.toUpperCase();
        const limit   = Math.min(parseInt(req.query.limit) || 30, 100);
        const signals = SignalArchive.forSymbol(symbol, limit);
        const orders  = ExecJournal.forSymbol(symbol, 20);
        res.json({
            success: true,
            symbol,
            signalHistory: signals,
            executionHistory: orders,
            signalCount: signals.length,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /replay/summary ───────────────────────────────────────────────────────
router.get('/summary', (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        res.json({
            success: true,
            cycleStats:    CycleArchive.stats(limit),
            execStats:     ExecJournal.stats(),
            recentCycles:  CycleArchive.recent(5),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /replay/confidence ────────────────────────────────────────────────────
router.get('/confidence', (req, res) => {
    try {
        res.json({
            success: true,
            distribution: SignalArchive.confidenceDistribution(),
            gradeDistribution: SignalArchive.gradeDistribution(),
            recent: SignalArchive.recent(20),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /replay/execution ─────────────────────────────────────────────────────
router.get('/execution', (req, res) => {
    try {
        const symbol = req.query.symbol;
        const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
        const entries = symbol
            ? ExecJournal.forSymbol(symbol.toUpperCase(), limit)
            : ExecJournal.recent(limit);
        res.json({
            success: true,
            entries,
            stats: ExecJournal.stats(),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
