'use strict';

/**
 * 🔱 PROMETHEUS — PHASE 19 EXECUTION TELEMETRY ENGINE
 *
 * Provides:
 *   - Structured LIVE_EXEC_TRACE logs (every symbol reaching evaluation)
 *   - REJECT_TRACE (every rejection with exact reason)
 *   - EXECUTION_LATENCY (cycle/signal/execution durations)
 *   - Rolling 50-cycle metrics cache (bounded, no memory leaks)
 *   - JSON-serializable metrics snapshot for WebSocket broadcast
 */

const MAX_HISTORY = 50; // Bounded ring-buffer

class ExecutionTelemetry {
    constructor() {
        // Rolling metrics (bounded arrays)
        this._cycleDurations    = [];  // last 50 cycle durations (ms)
        this._edgeScores        = [];  // last 50 edge scores
        this._buyConversions    = [];  // last 50: true=BUY, false=no-trade
        this._rejectReasons     = {};  // histogram: { reason: count }
        this._regimeHistory     = [];  // last 50 regime names
        this._smClassifications = {}; // histogram: { class: count }
        this._signalDecisions   = {};  // histogram: { decision: count }

        // 🔱 [PHASE 20] Confidence telemetry (bounded)
        this._confidenceHistory = [];  // last 50 confidence scores (0-100)
        this._tradeGradeCounts  = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0 }; // grade histogram
        this._executionQuality  = [];  // last 50: confidenceScore at execution time

        // Live counters (reset each report call if desired)
        this.cycleCount       = 0;
        this.buyCount         = 0;
        this.strongBuyCount   = 0;
        this.rejectCount      = 0;
        this.holdCount        = 0;

        // Latency tracking
        this._cycleStart      = 0;
        this._signalStart     = 0;
        this._execStart       = 0;

        this._lastEmit        = 0; // throttle latency log to once/cycle
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIMING HOOKS
    // ─────────────────────────────────────────────────────────────────────────

    markCycleStart() {
        this._cycleStart   = Date.now();
        this._signalStart  = Date.now();
    }

    markSignalEnd() {
        this._signalDuration = Date.now() - this._signalStart;
    }

    markExecStart() {
        this._execStart = Date.now();
    }

    markExecEnd() {
        this._execDuration = Date.now() - this._execStart;
    }

    markCycleEnd(regime = 'UNKNOWN') {
        const rawDuration = Date.now() - this._cycleStart;
        // Cap at 120s — cross-restart artifacts produce spurious durations
        const cycleDuration = rawDuration > 0 && rawDuration < 120_000 ? rawDuration : 0;

        // 🔱 [PHASE 11] REAL cycle duration — no Math.random() jitter
        // Actual wall-clock time reflects true system load.
        if (cycleDuration > 0) {
            this._push(this._cycleDurations, cycleDuration);
        }
        this._push(this._regimeHistory, regime);
        this.cycleCount++;

        const sig   = this._signalDuration || 0;
        const exec  = this._execDuration   || 0;

        const now = Date.now();
        if (now - this._lastEmit > 10000) { // log at most once per 10s
            console.log(`[EXECUTION_LATENCY] Cycle:${cycleDuration}ms | Signals:${sig}ms | Execution:${exec}ms | Regime:${regime}`);
            this._lastEmit = now;
        }

        this._signalDuration = 0;
        this._execDuration   = 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRACE EMITTERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * LIVE_EXEC_TRACE — emitted for EVERY symbol reaching execution evaluation.
     * Grep-friendly. Single structured line.
     */
    traceExecution({ symbol, score, edge, breakout, momentum, regime, smartMoney, decision, rejectReason }) {
        const sm = typeof smartMoney === 'object'
            ? (smartMoney.classification || smartMoney.signal || 'UNKNOWN')
            : (smartMoney || 'UNKNOWN');

        console.log(
            `[LIVE_EXEC_TRACE] ${String(symbol).padEnd(12)} | ` +
            `Score:${(score ?? 0).toFixed(1)} | ` +
            `Edge:${(edge ?? 0).toFixed(1)} | ` +
            `Breakout:${(breakout ?? 0).toFixed(1)} | ` +
            `Momentum:${(momentum ?? 0).toFixed(1)} | ` +
            `SM:${sm.padEnd(20)} | ` +
            `Regime:${(regime || 'UNKNOWN').padEnd(20)} | ` +
            `Decision:${decision || 'UNKNOWN'}` +
            (rejectReason ? ` | Reject:${rejectReason}` : '')
        );

        // Update histograms
        const dec = decision || 'UNKNOWN';
        this._signalDecisions[dec] = (this._signalDecisions[dec] || 0) + 1;
        this._push(this._edgeScores, edge ?? 0);
        this._push(this._buyConversions, dec === 'BUY' || dec === 'STRONG_BUY');

        // Update SM histogram
        this._smClassifications[sm] = (this._smClassifications[sm] || 0) + 1;

        // Update counters
        if (dec === 'STRONG_BUY') this.strongBuyCount++;
        else if (dec === 'BUY')   this.buyCount++;
        else if (dec === 'HOLD')  this.holdCount++;
    }

    /**
     * REJECT_TRACE — emitted for EVERY rejected trade with exact reason.
     */
    traceReject(symbol, reason) {
        console.log(`[REJECT_TRACE] ${String(symbol).padEnd(12)} | ${reason}`);
        this._rejectReasons[reason] = (this._rejectReasons[reason] || 0) + 1;
        this.rejectCount++;
    }

    /**
     * traceEntry — emitted when a position is successfully opened.
     */
    traceEntry(symbol, price, qty, score, regime, grade, confidenceScore) {
        const gradeStr = grade ? ` | Grade:${grade}` : '';
        const confStr  = confidenceScore != null ? ` | Conf:${confidenceScore.toFixed(1)}` : '';
        console.log(
            `[ENTRY_CONFIRMED] ${String(symbol).padEnd(12)} | ` +
            `Price:${price.toFixed(2)} | Qty:${qty} | Score:${score.toFixed(1)}` +
            `${gradeStr}${confStr} | Regime:${regime || 'UNKNOWN'}`
        );
        // Track execution quality
        if (confidenceScore != null) {
            this._push(this._executionQuality, confidenceScore);
        }
        if (grade && this._tradeGradeCounts[grade] !== undefined) {
            this._tradeGradeCounts[grade]++;
        }
    }

    /**
     * traceExit — emitted when a position is successfully closed.
     */
    traceExit(symbol, entryPrice, exitPrice, pnlPct, reason) {
        const sign = pnlPct >= 0 ? '+' : '';
        console.log(
            `[EXIT_CONFIRMED] ${String(symbol).padEnd(12)} | ` +
            `Entry:${entryPrice?.toFixed(2) ?? 'N/A'} → Exit:${exitPrice.toFixed(2)} | ` +
            `PnL:${sign}${pnlPct.toFixed(2)}% | Reason:${reason}`
        );
    }

    /**
     * 🔱 [PHASE 20] traceConfidence — record a confidence score observation.
     */
    traceConfidence(confidenceScore) {
        if (typeof confidenceScore === 'number' && !isNaN(confidenceScore)) {
            this._push(this._confidenceHistory, confidenceScore);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // METRICS SNAPSHOT (for WebSocket broadcast)
    // ─────────────────────────────────────────────────────────────────────────

    snapshot() {
        const durations = this._cycleDurations;
        const edges     = this._edgeScores;
        const buys      = this._buyConversions;

        const avgCycle  = durations.length ? Math.round(durations.reduce((a,b)=>a+b,0) / durations.length) : 0;
        const avgEdge   = edges.length     ? parseFloat((edges.reduce((a,b)=>a+b,0) / edges.length).toFixed(1)) : 0;
        const buyRate   = buys.length      ? parseFloat(((buys.filter(Boolean).length / buys.length) * 100).toFixed(1)) : 0;

        const dominantRegime = this._regimeHistory.length
            ? this._regimeHistory[this._regimeHistory.length - 1]
            : 'UNKNOWN';

        return {
            cycleCount:         this.cycleCount,
            avgCycleDurationMs: avgCycle,
            avgEdgeScore:       avgEdge,
            buyConversionRate:  buyRate,
            buyCount:           this.buyCount,
            strongBuyCount:     this.strongBuyCount,
            holdCount:          this.holdCount,
            rejectCount:        this.rejectCount,
            rejectReasons:      { ...this._rejectReasons },
            regimeHistory:      [...this._regimeHistory].slice(-10),
            dominantRegime,
            signalDecisions:    { ...this._signalDecisions },
            smClassifications:  { ...this._smClassifications },
            // 🔱 [PHASE 20] confidence metrics
            avgConfidenceScore: this._confidenceHistory.length
                ? parseFloat((this._confidenceHistory.reduce((a,b)=>a+b,0) / this._confidenceHistory.length).toFixed(1))
                : 0,
            tradeGradeCounts:   { ...this._tradeGradeCounts },
            avgExecutionQuality: this._executionQuality.length
                ? parseFloat((this._executionQuality.reduce((a,b)=>a+b,0) / this._executionQuality.length).toFixed(1))
                : 0,
            lastUpdated:        Date.now()
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL
    // ─────────────────────────────────────────────────────────────────────────

    _push(arr, val) {
        arr.push(val);
        if (arr.length > MAX_HISTORY) arr.shift(); // bounded ring-buffer
    }
}

module.exports = new ExecutionTelemetry();
