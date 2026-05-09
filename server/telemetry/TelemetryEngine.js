/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11] PROMETHEUS TELEMETRY ENGINE v1.0
 * ══════════════════════════════════════════════════════════════
 *
 * Real operational telemetry. No decorative oscillations.
 * All metrics derived from actual system state.
 *
 * Replaces the Math.random() jitter in engine/telemetry.js.
 * This file is the authoritative telemetry source.
 *
 * Tracked:
 * - websocket client count
 * - avg cycle duration (real timestamps)
 * - avg execution latency (from OrderQueue)
 * - stale symbol count
 * - queue depth
 * - execution throughput (fills/minute)
 * - rejection rate
 * - partial fill rate
 * - market entropy
 * - feed freshness
 */

'use strict';

const MAX_HISTORY = 50; // Bounded ring-buffer

class TelemetryEngine {
    constructor() {
        // Rolling arrays
        this._cycleDurations    = []; // real cycle wall-clock times
        this._execLatencies     = []; // actual order queue latencies
        this._confidenceHistory = [];
        this._rejectReasons     = {};
        this._regimeHistory     = [];
        this._decisions         = {};

        // Counters (since server start)
        this._totalCycles     = 0;
        this._totalFills      = 0;
        this._totalPartials   = 0;
        this._totalRejections = 0;
        this._totalBuys       = 0;

        // Real-time state (set each cycle)
        this._currentQueueDepth   = 0;
        this._currentStaleCount   = 0;
        this._currentEntropy      = 0;
        this._currentFeedState    = 'LIVE';
        this._currentRegime       = 'SIDEWAYS';
        this._currentBreadth      = 0.5;
        this._wsClientCount       = 0;

        // Timing
        this._cycleStartAt        = 0;
        this._lastCycleEndAt      = 0;

        // Fills per minute tracking
        this._fillTimestamps      = []; // ring of fill timestamps for throughput calc
    }

    // ─── Timing ───────────────────────────────────────────────────────────────

    markCycleStart() {
        this._cycleStartAt = Date.now();
    }

    markCycleEnd(regime = 'UNKNOWN') {
        const now = Date.now();
        const duration = this._cycleStartAt > 0 ? (now - this._cycleStartAt) : 0;

        // Only record real, plausible cycle durations (cap at 120s for restart artifacts)
        if (duration > 0 && duration < 120_000) {
            this._push(this._cycleDurations, duration);
        }

        this._push(this._regimeHistory, regime);
        this._currentRegime = regime;
        this._lastCycleEndAt = now;
        this._totalCycles++;
    }

    // ─── Order queue telemetry ────────────────────────────────────────────────

    recordFill(latencyMs, partial = false) {
        if (latencyMs > 0 && latencyMs < 10_000) {
            this._push(this._execLatencies, latencyMs);
        }
        this._totalFills++;
        if (partial) this._totalPartials++;
        this._fillTimestamps.push(Date.now());
        // Keep only timestamps from the last 60s
        const cutoff = Date.now() - 60_000;
        this._fillTimestamps = this._fillTimestamps.filter(t => t > cutoff);
    }

    recordRejection(reason) {
        this._rejectReasons[reason] = (this._rejectReasons[reason] || 0) + 1;
        this._totalRejections++;
    }

    recordDecision(decision) {
        this._decisions[decision] = (this._decisions[decision] || 0) + 1;
        if (decision === 'BUY' || decision === 'STRONG_BUY') this._totalBuys++;
    }

    recordConfidence(score) {
        if (typeof score === 'number' && !isNaN(score)) {
            this._push(this._confidenceHistory, score);
        }
    }

    // ─── Real-time state updates ──────────────────────────────────────────────

    updateSystemState({ queueDepth, staleCount, entropy, feedState, regime, breadth, wsClients }) {
        if (queueDepth  !== undefined) this._currentQueueDepth  = queueDepth;
        if (staleCount  !== undefined) this._currentStaleCount  = staleCount;
        if (entropy     !== undefined) this._currentEntropy     = entropy;
        if (feedState   !== undefined) this._currentFeedState   = feedState;
        if (regime      !== undefined) this._currentRegime      = regime;
        if (breadth     !== undefined) this._currentBreadth     = breadth;
        if (wsClients   !== undefined) this._wsClientCount      = wsClients;
    }

    // ─── Snapshot ─────────────────────────────────────────────────────────────

    snapshot() {
        const durations  = this._cycleDurations;
        const latencies  = this._execLatencies;
        const confs      = this._confidenceHistory;

        const avgCycle   = this._avg(durations);
        const avgLatency = this._avg(latencies);
        const avgConf    = this._avg(confs);

        const totalSettled = this._totalFills + this._totalRejections;
        const fillRate     = totalSettled > 0
            ? parseFloat((this._totalFills / totalSettled * 100).toFixed(1)) : 0;
        const partialRate  = this._totalFills > 0
            ? parseFloat((this._totalPartials / this._totalFills * 100).toFixed(1)) : 0;
        const rejRate      = totalSettled > 0
            ? parseFloat((this._totalRejections / totalSettled * 100).toFixed(1)) : 0;

        // Fills per minute (last 60s ring)
        const throughput = this._fillTimestamps.length; // count in last 60s

        // Feed freshness: 100 = live, 0 = disconnected
        const feedFreshness = this._currentFeedState === 'LIVE'        ? 100
                            : this._currentFeedState === 'DELAYED'     ?  70
                            : this._currentFeedState === 'STALE'       ?  30
                            : 0;

        // Queue congestion label
        const queueCongestion = this._currentQueueDepth > 10 ? 'SATURATED'
            : this._currentQueueDepth > 5 ? 'ELEVATED'
            : this._currentQueueDepth > 2 ? 'MODERATE'
            : 'CLEAR';

        return {
            // Infrastructure
            wsClients:            this._wsClientCount,
            feedState:            this._currentFeedState,
            feedFreshnessPct:     feedFreshness,
            queueDepth:           this._currentQueueDepth,
            queueCongestion,
            staleSymbolCount:     this._currentStaleCount,

            // Cycle performance (real durations)
            totalCycles:          this._totalCycles,
            avgCycleDurationMs:   Math.round(avgCycle),
            lastCycleAgoMs:       this._lastCycleEndAt > 0 ? (Date.now() - this._lastCycleEndAt) : 0,

            // Execution metrics
            avgExecLatencyMs:     Math.round(avgLatency),
            fillsPerMinute:       throughput,
            totalFills:           this._totalFills,
            totalRejections:      this._totalRejections,
            totalPartials:        this._totalPartials,
            fillRate,
            partialRate,
            rejectionRate:        rejRate,
            rejectReasons:        { ...this._rejectReasons },

            // Intelligence metrics
            avgConfidenceScore:   parseFloat(avgConf.toFixed(1)),
            decisions:            { ...this._decisions },
            totalBuys:            this._totalBuys,

            // Market state
            regime:               this._currentRegime,
            dominantRegime:       this._currentRegime, // 🔱 [FIX] UI Compatibility alias
            marketEntropy:        parseFloat((this._currentEntropy * 100).toFixed(1)),
            breadth:              parseFloat(this._currentBreadth.toFixed(3)),
            regimeHistory:        this._regimeHistory.slice(-10),

            timestamp:            Date.now(),
        };
    }

    // ─── Backward compat — kept for engine/telemetry.js callers ──────────────
    markSignalEnd()  {}  // no-op — timing delegated to markCycleEnd
    markExecStart()  {}
    markExecEnd()    {}
    traceExecution() {}  // detailed trace still in engine/telemetry.js
    traceReject(symbol, reason) { this.recordRejection(reason); }
    traceEntry()     {}
    traceExit()      {}
    traceConfidence(score) { this.recordConfidence(score); }

    // ─── Internal ─────────────────────────────────────────────────────────────

    _push(arr, val) {
        arr.push(val);
        if (arr.length > MAX_HISTORY) arr.shift();
    }

    _avg(arr) {
        if (!arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
}

module.exports = new TelemetryEngine();
