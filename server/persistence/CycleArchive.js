/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11] PROMETHEUS CYCLE ARCHIVE v1.0
 * ══════════════════════════════════════════════════════════════
 *
 * Stores per-cycle system summaries for operational auditability.
 * Survives restarts. Supports replay and reviewer inspection.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ARCHIVE_FILE  = path.join(__dirname, '../../data/cycle_archive.json');
const MAX_CYCLES    = 200; // 200 cycle summaries rolling window

class CycleArchive {
    constructor() {
        this._cycles = this._load();
        this._dirty  = false;
        setInterval(() => this._flush(), 45_000);
    }

    /**
     * Record a completed cycle summary.
     * Call at end of each worker cycle.
     */
    record({
        cycleId,
        cycleNumber,
        regime,
        feedState,
        signalsGenerated,
        tradableSignals,
        executedOrders,
        rejectedOrders,
        avgLatencyMs,
        staleSymbols,
        queueDepth,
        queueCongestion,
        marketContext,
        avgConfidence,
        topSignal,
        cycleDurationMs,
        marketOpen,
        breadth,
        entropy,
    }) {
        const summary = {
            cycleId:          cycleId || `CYC_${Date.now()}`,
            cycleNumber:      cycleNumber || 0,
            regime,
            feedState,
            signalsGenerated: signalsGenerated || 0,
            tradableSignals:  tradableSignals  || 0,
            executedOrders:   executedOrders   || 0,
            rejectedOrders:   rejectedOrders   || 0,
            avgLatencyMs:     avgLatencyMs     || 0,
            staleSymbols:     staleSymbols     || 0,
            queueDepth:       queueDepth       || 0,
            queueCongestion:  queueCongestion  || 'LOW',
            marketContext:    marketContext     || 'STANDARD_MARKET',
            avgConfidence:    avgConfidence     || 0,
            topSignal:        topSignal         || null,
            cycleDurationMs:  cycleDurationMs   || 0,
            marketOpen:       marketOpen        || false,
            breadth:          breadth           || 0.5,
            entropy:          entropy           || 0,
            recordedAt:       Date.now(),
        };

        this._cycles.unshift(summary);
        if (this._cycles.length > MAX_CYCLES) this._cycles.pop();
        this._dirty = true;

        return summary;
    }

    /**
     * Get a specific cycle by ID.
     */
    get(cycleId) {
        return this._cycles.find(c => c.cycleId === cycleId);
    }

    /**
     * Get the N most recent cycles.
     */
    recent(limit = 20) {
        return this._cycles.slice(0, limit);
    }

    /**
     * Get cycles filtered by regime.
     */
    byRegime(regime, limit = 30) {
        return this._cycles.filter(c => c.regime === regime).slice(0, limit);
    }

    /**
     * Aggregate stats across recent N cycles.
     */
    stats(limit = 50) {
        const window = this._cycles.slice(0, limit);
        if (!window.length) return {};

        const avgConf    = window.reduce((s, c) => s + c.avgConfidence, 0) / window.length;
        const avgLatency = window.reduce((s, c) => s + c.avgLatencyMs, 0) / window.length;
        const avgExec    = window.reduce((s, c) => s + c.executedOrders, 0) / window.length;
        const avgTradable = window.reduce((s, c) => s + c.tradableSignals, 0) / window.length;
        const totalStale = window.reduce((s, c) => s + c.staleSymbols, 0);

        const regimeCounts = {};
        for (const c of window) {
            regimeCounts[c.regime] = (regimeCounts[c.regime] || 0) + 1;
        }
        const dominantRegime = Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

        return {
            windowSize:      window.length,
            avgConfidence:   parseFloat(avgConf.toFixed(1)),
            avgLatencyMs:    parseFloat(avgLatency.toFixed(0)),
            avgExecutedPerCycle: parseFloat(avgExec.toFixed(1)),
            avgTradablePerCycle: parseFloat(avgTradable.toFixed(1)),
            totalStaleSymbols: totalStale,
            dominantRegime,
            regimeCounts,
        };
    }

    _load() {
        try {
            if (fs.existsSync(ARCHIVE_FILE)) {
                return JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
            }
        } catch (e) {
            console.warn('[CYCLE_ARCHIVE] Load failed, starting fresh:', e.message);
        }
        return [];
    }

    _flush() {
        if (!this._dirty) return;
        try {
            const dir = path.dirname(ARCHIVE_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(this._cycles), 'utf8');
            this._dirty = false;
        } catch (e) {
            console.error('[CYCLE_ARCHIVE] Flush failed:', e.message);
        }
    }
}

module.exports = new CycleArchive();
