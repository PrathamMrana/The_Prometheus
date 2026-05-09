/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11] PROMETHEUS EXECUTION JOURNAL v1.0
 * ══════════════════════════════════════════════════════════════
 *
 * Institutional-grade audit trail for every order lifecycle event.
 * Append-only flat JSON file. No DB required.
 *
 * Every order is stored with full state transition history.
 * Survives server restarts. Supports replay inspection.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const JOURNAL_FILE = path.join(__dirname, '../../data/execution_journal.json');
const MAX_ENTRIES  = 1000; // Rolling window — oldest dropped when limit reached

class ExecutionJournal {
    constructor() {
        this._entries = this._load();
        this._dirty   = false;

        // Periodic flush every 30s — avoids write per-order in hot path
        setInterval(() => this._flush(), 30_000);
    }

    /**
     * Create a new journal entry when an order is submitted.
     * Call this immediately when an order enters PENDING state.
     */
    open(orderId, { symbol, side, qty, requestedPrice, estimatedSlippage, regime, feedState, riskScore, metadata = {} }) {
        const entry = {
            orderId,
            symbol,
            side,
            qty,
            requestedPrice,
            estimatedSlippage,
            fillPrice:        null,
            filledQty:        null,
            actualSlippage:   null,
            latencyMs:        null,
            queueWaitMs:      null,
            rejectionReason:  null,
            partial:          false,
            regime,
            feedState,
            riskScore,
            metadata,
            stateTransitions: [{ state: 'PENDING', at: Date.now() }],
            submittedAt:      Date.now(),
            settledAt:        null,
            outcome:          null, // 'FILLED' | 'REJECTED' | 'PARTIAL'
        };

        this._entries.unshift(entry);
        if (this._entries.length > MAX_ENTRIES) this._entries.pop();
        this._dirty = true;

        return entry;
    }

    /**
     * Append a state transition to an existing entry.
     */
    transition(orderId, state, extra = {}) {
        const entry = this._find(orderId);
        if (!entry) return;

        entry.stateTransitions.push({ state, at: Date.now(), ...extra });
        Object.assign(entry, extra);
        this._dirty = true;
    }

    /**
     * Close a journal entry with fill details or rejection.
     */
    close(orderId, outcome, { fillPrice, filledQty, actualSlippage, latencyMs, queueWaitMs, rejectionReason } = {}) {
        const entry = this._find(orderId);
        if (!entry) return;

        entry.outcome        = outcome;
        entry.fillPrice      = fillPrice      ?? null;
        entry.filledQty      = filledQty      ?? null;
        entry.actualSlippage = actualSlippage ?? null;
        entry.latencyMs      = latencyMs      ?? null;
        entry.queueWaitMs    = queueWaitMs    ?? null;
        entry.rejectionReason = rejectionReason ?? null;
        entry.settledAt      = Date.now();
        entry.partial        = filledQty != null && filledQty < entry.qty;

        entry.stateTransitions.push({ state: outcome, at: Date.now() });
        this._dirty = true;

        console.log(`[EXEC_JOURNAL] ${outcome} | ${entry.symbol} ${entry.side} | ` +
            `Fill: ${fillPrice ?? 'N/A'} | Latency: ${latencyMs ?? '?'}ms | ` +
            `Slippage: ${actualSlippage ? `${actualSlippage.toFixed(4)}%` : 'N/A'}`);
    }

    /**
     * Get recent journal entries (last N).
     */
    recent(limit = 50) {
        return this._entries.slice(0, limit);
    }

    /**
     * Get entries for a specific symbol.
     */
    forSymbol(symbol, limit = 20) {
        return this._entries
            .filter(e => e.symbol === symbol || e.symbol === symbol.split('.')[0])
            .slice(0, limit);
    }

    /**
     * Aggregate execution statistics.
     */
    stats() {
        const settled = this._entries.filter(e => e.outcome);
        const filled  = settled.filter(e => e.outcome === 'FILLED' || e.outcome === 'PARTIAL');
        const rejected = settled.filter(e => e.outcome === 'REJECTED');
        const partial  = settled.filter(e => e.partial);

        const avgLatency = filled.length
            ? filled.reduce((s, e) => s + (e.latencyMs || 0), 0) / filled.length : 0;
        const avgSlippage = filled.length
            ? filled.reduce((s, e) => s + (e.actualSlippage || 0), 0) / filled.length : 0;

        return {
            total:         this._entries.length,
            settled:       settled.length,
            filled:        filled.length,
            rejected:      rejected.length,
            partial:       partial.length,
            fillRate:      settled.length ? parseFloat((filled.length / settled.length * 100).toFixed(1)) : 0,
            partialRate:   filled.length  ? parseFloat((partial.length / filled.length * 100).toFixed(1)) : 0,
            rejectionRate: settled.length ? parseFloat((rejected.length / settled.length * 100).toFixed(1)) : 0,
            avgLatencyMs:  parseFloat(avgLatency.toFixed(0)),
            avgSlippagePct: parseFloat(avgSlippage.toFixed(4)),
        };
    }

    _find(orderId) {
        return this._entries.find(e => e.orderId === orderId);
    }

    _load() {
        try {
            if (fs.existsSync(JOURNAL_FILE)) {
                return JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf8'));
            }
        } catch (e) {
            console.warn('[EXEC_JOURNAL] Failed to load journal, starting fresh:', e.message);
        }
        return [];
    }

    _flush() {
        if (!this._dirty) return;
        try {
            const dir = path.dirname(JOURNAL_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(JOURNAL_FILE, JSON.stringify(this._entries), 'utf8');
            this._dirty = false;
        } catch (e) {
            console.error('[EXEC_JOURNAL] Flush failed:', e.message);
        }
    }
}

module.exports = new ExecutionJournal();
