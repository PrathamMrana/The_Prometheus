'use strict';

/**
 * 🔱 PROMETHEUS — TRADE TAGGER (Research Metadata Engine)
 *
 * Attaches structured, IMMUTABLE research metadata to every trade.
 * Tags survive WAL replay, crash recovery, and analytics aggregation.
 *
 * Rules:
 *  - Tags are frozen on creation (Object.freeze)
 *  - Missing fields are explicitly NULL, never omitted
 *  - Tags are pure functions of input — no side effects
 */

// ── Time Bucket Utilities ─────────────────────────────────────────────────────

function getEntryTimeBucket(ts) {
    const d = new Date(ts);
    const h = d.getHours();
    const m = d.getMinutes();
    const totalMin = h * 60 + m;
    // IST market: 9:15 - 15:30
    if (totalMin < 9 * 60 + 15)  return 'PRE_MARKET';
    if (totalMin < 9 * 60 + 45)  return 'OPEN_SURGE';      // First 30 min
    if (totalMin < 11 * 60 + 30) return 'MORNING';
    if (totalMin < 13 * 60 + 0) return 'MIDDAY';
    if (totalMin < 14 * 60 + 30) return 'AFTERNOON';
    if (totalMin < 15 * 60 + 0) return 'PRE_CLOSE';
    if (totalMin < 15 * 60 + 30) return 'CLOSE_AUCTION';
    return 'AFTER_MARKET';
}

function getMarketSessionPhase(ts) {
    const d = new Date(ts);
    const day = d.getDay();
    if (day === 0 || day === 6) return 'WEEKEND';
    const h = d.getHours();
    if (h < 9)                   return 'PRE_MARKET';
    if (h < 12)                  return 'AM_SESSION';
    if (h < 14)                  return 'MIDDAY_SESSION';
    return 'PM_SESSION';
}

function getConfidenceBucket(score) {
    if (score == null) return null;
    if (score >= 85) return 'VERY_HIGH';
    if (score >= 70) return 'HIGH';
    if (score >= 55) return 'MEDIUM';
    if (score >= 40) return 'LOW';
    return 'VERY_LOW';
}

function getMomentumState(momentum) {
    if (momentum == null) return null;
    if (momentum > 3)   return 'STRONG_BULL';
    if (momentum > 1)   return 'BULL';
    if (momentum > -1)  return 'NEUTRAL';
    if (momentum > -3)  return 'BEAR';
    return 'STRONG_BEAR';
}

function getVolatilityCluster(atr, price) {
    if (!atr || !price) return null;
    const atrPct = (atr / price) * 100;
    if (atrPct > 3)   return 'HIGH_VOL';
    if (atrPct > 1.5) return 'MEDIUM_VOL';
    return 'LOW_VOL';
}

function getHoldDurationBucket(sec) {
    if (sec == null || sec < 0) return null;
    if (sec < 300)         return 'SCALP_5M';
    if (sec < 1800)        return 'SHORT_30M';
    if (sec < 3600)        return 'INTRADAY_1H';
    if (sec < 14400)       return 'INTRADAY_4H';
    if (sec < 86400)       return 'INTRADAY_FULL';
    if (sec < 86400 * 5)   return 'SWING_WEEK';
    return 'SWING_MULTI';
}

/**
 * Build entry-time research tags. Call when a BUY is confirmed.
 * @param {Object} params
 * @returns {Object} frozen tradeTags
 */
function buildEntryTags(params = {}) {
    const {
        regime, sector, score, breakoutType, momentum, atr, price,
        breadthState, signalType, entrySpreadPct, slippageEstimate,
        smartMoneyClassification, executionLatencyMs, riskRewardRatio,
        timestamp = Date.now()
    } = params;

    const tags = {
        // ── Market Context ──────────────────────────────────────────────────
        regime:                  regime                          ?? null,
        sector:                  sector                          ?? null,
        breadthState:            breadthState                    ?? null,
        marketSessionPhase:      getMarketSessionPhase(timestamp),
        entryTimeBucket:         getEntryTimeBucket(timestamp),

        // ── Signal Quality ──────────────────────────────────────────────────
        signalType:              signalType                      ?? null,
        breakoutType:            breakoutType                    ?? null,
        confidenceBucket:        getConfidenceBucket(score),
        confidenceScore:         score                           ?? null,

        // ── Price / Volatility ──────────────────────────────────────────────
        momentumState:           getMomentumState(momentum),
        volatilityCluster:       getVolatilityCluster(atr, price),

        // ── Smart Money ─────────────────────────────────────────────────────
        smartMoneyClassification: smartMoneyClassification       ?? null,

        // ── Execution Realism ───────────────────────────────────────────────
        entrySpreadPct:          entrySpreadPct                  ?? null,
        slippageEstimate:        slippageEstimate                ?? null,
        executionLatencyMs:      executionLatencyMs              ?? null,
        riskRewardRatio:         riskRewardRatio                 ?? null,

        // ── Exit (filled at exit time) ───────────────────────────────────────
        holdDurationSec:         null,
        holdDurationBucket:      null,

        // ── Metadata ────────────────────────────────────────────────────────
        entryTimestamp:          timestamp,
        exitTimestamp:           null,
        tagsVersion:             1
    };

    return Object.freeze(tags);
}

/**
 * Merge exit-time data into existing entry tags.
 * Returns a NEW frozen object — original is immutable.
 */
function mergeExitTags(entryTags = {}, exitParams = {}) {
    const { exitTimestamp = Date.now() } = exitParams;
    const entryTs = entryTags.entryTimestamp || exitTimestamp;
    const holdSec = Math.round((exitTimestamp - entryTs) / 1000);

    return Object.freeze({
        ...entryTags,
        holdDurationSec:    holdSec,
        holdDurationBucket: getHoldDurationBucket(holdSec),
        exitTimestamp
    });
}

module.exports = {
    buildEntryTags,
    mergeExitTags,
    getEntryTimeBucket,
    getMarketSessionPhase,
    getConfidenceBucket,
    getMomentumState,
    getVolatilityCluster,
    getHoldDurationBucket
};
