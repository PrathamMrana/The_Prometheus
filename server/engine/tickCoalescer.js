/**
 * 🔱 PROMETHEUS — PERFORMANCE HARDENING LAYER 1 & 2
 * 
 * Tick Coalescing + Priority Scheduler
 * 
 * TICK COALESCING:
 *   Under burst volatility, many ticks arrive for the same symbol
 *   before the signal engine processes them. Only the LATEST tick
 *   per symbol survives into compute. Older ticks are discarded.
 *   
 *   This eliminates:
 *   - stale compute on outdated prices
 *   - queue buildup under burst conditions
 *   - latency cascades from backlog processing
 * 
 * PRIORITY SCHEDULER:
 *   Not all symbols deserve equal compute budget.
 *   High-priority symbols (open positions, high-signal) get
 *   scheduled first and consume more compute headroom.
 * 
 *   Priority tiers:
 *     P0 (CRITICAL)  — open positions (exit monitoring)
 *     P1 (HIGH)      — recent high-score signals (>= 70)
 *     P2 (NORMAL)    — active watchlist symbols
 *     P3 (LOW)       — indices (informational only)
 */

const os = require('os');

// Priority tier constants
const PRIORITY = {
    CRITICAL: 0,   // Open positions — must always be computed
    HIGH: 1,       // High-signal candidates
    NORMAL: 2,     // Standard watchlist
    LOW: 3         // Indices / informational
};

class TickCoalescer {
    constructor() {
        // Latest tick map: symbol -> { price, percent, volume, timestamp, ingestTs, seq }
        this._latestTicks = new Map();
        
        // Monotonic sequence counter for ingest ordering
        this._seq = 0n;
        
        // Priority queue: tier -> Set of symbols
        this._priorityQueues = {
            [PRIORITY.CRITICAL]: new Set(),
            [PRIORITY.HIGH]:     new Set(),
            [PRIORITY.NORMAL]:   new Set(),
            [PRIORITY.LOW]:      new Set()
        };

        // Metrics
        this._stats = { received: 0, dropped: 0, processed: 0 };
        this._dropsBySymbol = new Map(); // symbol -> drop count (for observability)
        this._ledger = null; // Injected lazily to avoid circular require at module load
    }

    /**
     * Lazily injects the ledger singleton to emit drop observability events.
     * Called once from worker.js after both modules are loaded.
     */
    attachLedger(ledger, EVENT_TYPES) {
        this._ledger = ledger;
        this._EVENT_TYPES = EVENT_TYPES;
    }

    /**
     * Ingest a raw tick from the API response.
     * Only the latest tick per symbol is retained (coalescing).
     * @param {string} symbol - Canonical symbol
     * @param {Object} data   - Raw cache entry from portfolioCache
     */
    ingest(symbol, data) {
        const now = Date.now();
        this._seq++;
        this._stats.received++;

        const existing = this._latestTicks.get(symbol);

        // Coalescing: drop if we already have a newer tick
        // (in practice ticks in the same batch are the same age, this guards against
        //  websocket feed bursts where a symbol arrives 3x in rapid succession)
        if (existing && existing.ingestSeq >= this._seq - 1n && existing.price === data.price) {
            this._stats.dropped++;
            this._dropsBySymbol.set(symbol, (this._dropsBySymbol.get(symbol) || 0) + 1);
            return; // Exact duplicate in same window — discard
        }

        this._latestTicks.set(symbol, {
            symbol,
            price:      data.price,
            percent:    data.percent,
            volume:     data.volume,
            timestamp:  data.timestamp || now,
            ingestTs:   now,
            ingestSeq:  this._seq,
            is_lkg:     data.is_lkg || false
        });
    }

    /**
     * Sets the compute priority for a symbol.
     * Called by the execution engine and position manager.
     */
    setPriority(symbol, tier) {
        // Remove from all other queues first
        for (const queue of Object.values(this._priorityQueues)) {
            queue.delete(symbol);
        }
        if (this._priorityQueues[tier] !== undefined) {
            this._priorityQueues[tier].add(symbol);
        }
    }

    /**
     * Returns a priority-ordered list of symbols that have pending ticks.
     * CRITICAL symbols always come first; LOW symbols are computed only if
     * CPU budget permits.
     * 
     * @param {number} maxSymbols - Max symbols to compute this cycle (budget cap)
     * @returns {string[]} Ordered list of symbols to process
     */
    drainPriorityQueue(maxSymbols = Infinity) {
        const result = [];
        const pendingSymbols = new Set(this._latestTicks.keys());

        // Walk tiers in priority order: CRITICAL → HIGH → NORMAL → LOW
        for (const tier of [PRIORITY.CRITICAL, PRIORITY.HIGH, PRIORITY.NORMAL, PRIORITY.LOW]) {
            for (const symbol of this._priorityQueues[tier]) {
                if (pendingSymbols.has(symbol)) {
                    result.push(symbol);
                    pendingSymbols.delete(symbol);
                    if (result.length >= maxSymbols) return result;
                }
            }
        }

        // Remaining symbols not explicitly prioritized (NORMAL by default)
        for (const symbol of pendingSymbols) {
            result.push(symbol);
            if (result.length >= maxSymbols) break;
        }

        return result;
    }

    /**
     * Retrieves the coalesced tick for a symbol and removes it from the buffer.
     * Returns null if no tick is pending.
     */
    consume(symbol) {
        const tick = this._latestTicks.get(symbol);
        if (tick) {
            this._latestTicks.delete(symbol);
            this._stats.processed++;
        }
        return tick || null;
    }

    /**
     * Peek at a tick without consuming it.
     */
    peek(symbol) {
        return this._latestTicks.get(symbol) || null;
    }

    /**
     * How many symbols currently have pending ticks.
     */
    pendingCount() {
        return this._latestTicks.size;
    }

    /**
     * Returns and resets the ingestion statistics.
     * If drops occurred and a ledger is attached, emits an aggregated observability event.
     */
    flushStats() {
        const s = { 
            ...this._stats,
            topDropped: this._getTopDropped(5)
        };
        
        // Emit aggregated drop event to WAL (not per-tick — only per-cycle summary)
        if (s.dropped > 0 && this._ledger && this._EVENT_TYPES) {
            this._ledger.appendEvent({
                eventType: this._EVENT_TYPES.COALESCED_TICK_DROPPED,
                payload: { dropped: s.dropped, received: s.received, topDropped: s.topDropped }
            });
        }

        this._stats = { received: 0, dropped: 0, processed: 0 };
        this._dropsBySymbol.clear();
        return s;
    }

    /**
     * Returns the top N symbols by drop count this cycle.
     */
    _getTopDropped(n = 5) {
        return [...this._dropsBySymbol.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([sym, count]) => ({ symbol: sym, dropped: count }));
    }
}

// Compute Budget: Reserve 2 cores for GC, heartbeat, and websocket flush.
// Never saturate 100% of CPUs — that stalls the event loop.
const RESERVED_CORES = 2;
const TOTAL_CORES = os.cpus().length;
const COMPUTE_CORES = process.env.NODE_ENV === 'production' ? 1 : Math.max(1, TOTAL_CORES - RESERVED_CORES);

module.exports = {
    TickCoalescer,
    PRIORITY,
    COMPUTE_CORES,
    RESERVED_CORES
};
