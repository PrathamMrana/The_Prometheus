/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 10] PROMETHEUS SIGNAL PROCESSOR v1.0
 * ══════════════════════════════════════════════════════════════
 *
 * Extracted from worker.js monolith.
 * Responsible for: per-symbol tick processing — payload assembly,
 * interval volume calculation, strategy run, signal normalization,
 * history update, and cycleBuffer contribution.
 *
 * worker.js delegates each symbol to this module.
 * This keeps worker.js as a thin orchestrator.
 */

'use strict';

const { processTick } = require('../intelligence/intelligenceCore');
const { StrategyManager, updateSectorVolume } = require('../intelligence/strategyManager');
const indicatorEngine = require('../intelligence/incrementalIndicators');
const SignalNormalizer = require('../core/SignalNormalizer');
const rootGlobalState = require('../globalState');
const { ledger, EVENT_TYPES } = require('../engine/executionLedger');
const { isSymbolDesynced } = require('../testing/FailureSimulator');

const NON_TRADABLE_SECTORS = new Set(['INDEX', 'MACRO']);

// ─── Symbol-level feed health thresholds ─────────────────────────────────────
// Each symbol carries its own health state independent of global feed state.
// Stale symbol ≠ global STALE — partial market operation is allowed.
const SYMBOL_HEALTH = {
    LIVE:         { maxAgeMs: 10_000, tradeable: true  },
    DELAYED:      { maxAgeMs: 30_000, tradeable: true  },  // warn but allow
    STALE:        { maxAgeMs: 60_000, tradeable: false },   // block entries
    DISCONNECTED: { maxAgeMs: Infinity, tradeable: false }, // complete block
};

function classifySymbolHealth(feedAge) {
    if (feedAge === null || feedAge < 0)          return 'LIVE';      // no timestamp yet
    if (feedAge < SYMBOL_HEALTH.LIVE.maxAgeMs)    return 'LIVE';
    if (feedAge < SYMBOL_HEALTH.DELAYED.maxAgeMs) return 'DELAYED';
    if (feedAge < SYMBOL_HEALTH.STALE.maxAgeMs)   return 'STALE';
    return 'DISCONNECTED';
}

/**
 * processSingleSymbol — handles one symbol tick end-to-end.
 *
 * @param {string} rawSym          - Raw symbol (e.g. 'INFY.NS')
 * @param {Map}    portfolioCache  - Shared cache singleton
 * @param {Map}    priceHistory    - Price history map
 * @param {object} globalState     - Current global state snapshot
 * @param {boolean} marketClosed   - Whether NSE is currently closed
 * @param {number}  now            - Cycle start timestamp
 *
 * @returns {object|null} result:
 *   { enriched, normalizedSignal, cycleEntry, changed: true }
 *   or null if symbol should be skipped
 */
async function processSingleSymbol(rawSym, portfolioCache, priceHistory, globalState, marketClosed, now) {
    const canonical = rawSym.replace('.NS', '').replace('^', '');
    const entry = portfolioCache.get(canonical);
    if (!entry) return null;

    const finalPrice = entry.price;
    const percent    = entry.percent;
    const prevClose  = entry.prevClose;

    if (finalPrice === null || finalPrice <= 0) return null;

    const status = entry.is_lkg ? 'RECOVERY_MODE' : 'LIVE';

    if (!rootGlobalState.SECTOR_MAP[canonical]) return null;

    const symbolSector = rootGlobalState.SECTOR_MAP[canonical] || 'UNKNOWN';
    const isIndex = NON_TRADABLE_SECTORS.has(symbolSector);

    // ── Interval volume calculation ─────────────────────────────────────────
    const history = priceHistory.get(canonical) || [];
    const dailyTotal = entry.volume || 0;
    let intervalVolume = dailyTotal;
    if (history.length > 0) {
        const prevEffectiveTotal = history.reduce((sum, h) => sum + (h.volume || 0), 0);
        intervalVolume = (dailyTotal > prevEffectiveTotal)
            ? (dailyTotal - prevEffectiveTotal)
            : (dailyTotal / (history.length || 1));
    }

    // ── Per-symbol feed age + health classification ─────────────────────────────
    // Phase 11: each symbol carries its own LIVE/DELAYED/STALE/DISCONNECTED state.
    // A stale symbol does NOT poison global system — partial market operation continues.
    const entryTimestamp = entry.timestamp || 0;
    let feedAge = entryTimestamp > 0 ? (now - entryTimestamp) : null;

    // FailureSimulator: desync injection overrides this symbol's feed age
    if (isSymbolDesynced(canonical)) {
        feedAge = 45_000; // 45s → STALE health grade
    }

    const symbolHealth = classifySymbolHealth(feedAge);
    const symbolStale  = feedAge !== null && feedAge > 30_000;
    const symbolTradeable = SYMBOL_HEALTH[symbolHealth]?.tradeable ?? true;

    // ── Tick payload assembly ────────────────────────────────────────────────
    const payload = {
        type:           'TICK',
        symbol:         canonical,
        rawSymbol:      rawSym,
        price:          finalPrice,
        percent,
        pct_change:     percent || entry.pct_change || 0,
        volume:         intervalVolume,
        daily_volume:   dailyTotal,
        volume_history: entry.volume_history || [],
        sparkline:      entry.sparkline || [],
        signal:         entry.signal,
        anomaly:        entry.anomaly || null,
        zscore:         entry.zscore || 0,
        sector:         symbolSector,
        timestamp:      entryTimestamp || now,
        status:         marketClosed ? 'CLOSED' : status,
        source:         entry.source || 'YFINANCE',
        quality:        entry.quality || 0,
        // Phase 11: per-symbol feed health + tradeable flag
        feedAge,
        stale:        symbolStale,
        symbolHealth,          // LIVE | DELAYED | STALE | DISCONNECTED
        symbolTradeable,       // false when STALE or DISCONNECTED
    };

    // Legacy RiskManager.updateTickTime() removed. feedState.markLiveTick() handles this now.

    // ── Incremental indicators O(1) ──────────────────────────────────────────
    indicatorEngine.update(canonical, {
        close:     finalPrice,
        high:      entry.high  || finalPrice,
        low:       entry.low   || finalPrice,
        volume:    intervalVolume,
        timestamp: entry.timestamp || now,
    });

    // ── Execution ledger trace ───────────────────────────────────────────────
    const traceId = ledger.appendEvent({
        eventType: EVENT_TYPES.TICK_RECEIVED,
        symbol:    canonical,
        payload:   { price: finalPrice, percent, volume: intervalVolume, status, feedAge },
    });

    // ── Price history update ─────────────────────────────────────────────────
    if (finalPrice && Number.isFinite(finalPrice)) {
        if (!priceHistory.has(canonical)) priceHistory.set(canonical, []);
        const arr = priceHistory.get(canonical);
        arr.push({
            close:     finalPrice,
            high:      entry.high || finalPrice,
            low:       entry.low  || finalPrice,
            volume:    intervalVolume,
            timestamp: entry.timestamp,
        });
        if (arr.length > 300) arr.shift();
    }

    // ── Sector volume registry ───────────────────────────────────────────────
    if (payload.volume > 0 && payload.sector) {
        updateSectorVolume(payload.sector, payload.volume);
    }

    const updatedHistory = priceHistory.get(canonical);

    // ── Strategy run ─────────────────────────────────────────────────────────────
    // Phase 11: DISCONNECTED symbols skip strategy to avoid stale decisions
    const p17Signal = (isIndex || symbolHealth === 'DISCONNECTED')
        ? { status: 'READY', decision: 'HOLD', score: 0, sectorFlow: 0, breakout: false }
        : await StrategyManager.generate(canonical, updatedHistory, rootGlobalState);

    if (p17Signal && !isIndex) {
        const sigId = ledger.appendEvent({
            traceId,
            causationId: traceId,
            eventType:   EVENT_TYPES.SIGNAL_GENERATED,
            symbol:      canonical,
            payload: {
                decision:   p17Signal.decision,
                confidence: p17Signal.confidenceScore,
                score:      p17Signal.score,
                regime:     rootGlobalState.regimeAI?.regime,
                feedAge,
            },
        });
        p17Signal.traceId    = traceId;
        p17Signal.causationId = sigId;
    }

    // ── Signal normalization ─────────────────────────────────────────────────
    // Phase 10: one canonical signal object for all consumers
    let normalizedSignal = p17Signal;
    if (!isIndex && p17Signal) {
        const dataAge = feedAge ?? 0;
        normalizedSignal = SignalNormalizer.normalize(p17Signal, entry, rootGlobalState, dataAge)
            || p17Signal;
    }

    // ── Intelligence core enrichment ─────────────────────────────────────────
    const enriched = processTick(payload, rootGlobalState);
    if (!enriched || !enriched.symbol || !Number.isFinite(enriched.price)) return null;

    enriched.signal = normalizedSignal;

    // ── Cache update ─────────────────────────────────────────────────────────
    portfolioCache.set(canonical, {
        ...entry,
        price:          payload.price,
        percent:        payload.percent,
        pct_change:     payload.pct_change,
        sector:         payload.sector,
        prevClose,
        timestamp:      payload.timestamp,
        status:         payload.status,
        alerts:         enriched.alerts,
        priority:       enriched.priority,
        signal:         normalizedSignal,
        volume_history: payload.volume_history,
        feedAge,
        stale:          symbolStale,
        symbolHealth,        // Phase 11: per-symbol health grade
        symbolTradeable,     // false when STALE or DISCONNECTED
    });

    // ── CycleBuffer entry (for execution engine) ─────────────────────────────
    let cycleEntry = null;
    if (!isIndex && p17Signal && p17Signal.score >= 30) {
        cycleEntry = {
            symbol:       canonical,
            score:        p17Signal.score,
            price:        enriched.price,
            isSimPulse:   p17Signal.isSimPulse || false,
            traceId:      p17Signal.traceId,
            causationId:  p17Signal.causationId,
            normalizedSignal,
        };
    }

    return { enriched, normalizedSignal, cycleEntry };
}

module.exports = { processSingleSymbol };
