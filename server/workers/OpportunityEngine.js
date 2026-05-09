/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11] PROMETHEUS OPPORTUNITY ENGINE v2.0
 * ══════════════════════════════════════════════════════════════
 *
 * Phase 11 upgrades:
 * - Regime suppression: hostile/dead-market conditions produce empty board
 * - Market entropy gate: high entropy blocks all signals
 * - Breadth filter: low market breadth suppresses signal generation
 * - Richer board meta states
 * - Sector flow conflict detection
 * - StaleSymbol filtering from board
 *
 * BOARD META STATES:
 * - RARE_HIGH_CONVICTION_SETUP
 * - HIGH_CONVICTION
 * - STANDARD_MARKET
 * - DEFENSIVE_REGIME
 * - HIGH_ENTROPY_MARKET
 * - LOW_LIQUIDITY_ENVIRONMENT
 * - NO_ACTIONABLE_SIGNALS
 *
 * DO NOT force signals every cycle.
 */

'use strict';

const MIN_BOARD_SCORE = 35;

// ─── Regimes that suppress the opportunity board ─────────────────────────────
const SUPPRESSED_REGIMES = new Set(['PANIC', 'LIQUIDITY_SQUEEZE']);
const DEFENSIVE_REGIMES  = new Set(['MEAN_REVERSION', 'TRENDING_BEAR', 'SECTOR_ROTATION']);

// ─── Entropy threshold: above this → market is too chaotic for signals ────────
const HIGH_ENTROPY_THRESHOLD = 0.72;

// ─── Breadth threshold: below this → market too weak ─────────────────────────
const LOW_BREADTH_THRESHOLD  = 0.30;

// ─── Minimum average VR for a healthy liquidity environment ──────────────────
const LOW_LIQUIDITY_VR_THRESHOLD = 0.45;

// ──────────────────────────────────────────────────────────────────────────────

function buildOpportunityBoard(portfolioCache, regimeName, feedStateName, globalState = {}) {
    const board = [];
    let totalSignals  = 0;
    let tradableCount = 0;
    let confidenceSum = 0;
    let staleCount    = 0;
    let vrSum         = 0;
    let vrCount       = 0;

    // ── Regime suppression gate ───────────────────────────────────────────────
    if (SUPPRESSED_REGIMES.has(regimeName)) {
        return _emptyBoard(regimeName, feedStateName, 'DEFENSIVE_REGIME', 0, 0, 0);
    }
    if (feedStateName === 'DISCONNECTED') {
        return _emptyBoard(regimeName, feedStateName, 'NO_ACTIONABLE_SIGNALS', 0, 0, 0);
    }

    // ── Market entropy gate ───────────────────────────────────────────────────
    const marketEntropy = globalState?.entropy ?? globalState?.regimeAI?.entropy ?? 0;
    if (marketEntropy > HIGH_ENTROPY_THRESHOLD) {
        return _emptyBoard(regimeName, feedStateName, 'HIGH_ENTROPY_MARKET', 0, 0, 0);
    }

    // ── Market breadth gate ───────────────────────────────────────────────────
    const breadth = globalState?.breadth ?? globalState?.regimeAI?.breadth ?? 0.5;
    if (breadth < LOW_BREADTH_THRESHOLD && DEFENSIVE_REGIMES.has(regimeName)) {
        return _emptyBoard(regimeName, feedStateName, 'NO_ACTIONABLE_SIGNALS', 0, 0, 0);
    }

    // ── Scan cache ────────────────────────────────────────────────────────────
    for (const [sym, cached] of portfolioCache.entries()) {
        if (!cached?.signal) continue;

        const sig  = cached.signal;
        const conf = sig.confidenceScore ?? sig.adjustedScore ?? sig.score ?? null;
        if (conf === null || !Number.isFinite(conf)) continue;

        totalSignals++;
        confidenceSum += conf;

        // Track liquidity across all signals
        const vr = sig.smartMoney?.vr ?? sig.vr ?? null;
        if (vr !== null) { vrSum += vr; vrCount++; }

        // Stale symbols filtered from board (still counted for telemetry)
        if (cached.stale || cached.feedAge > 30_000) { staleCount++; continue; }

        // Below minimum edge threshold
        if (conf < MIN_BOARD_SCORE) continue;

        tradableCount++;
        board.push({
            symbol:      sym,
            confidence:  parseFloat(conf.toFixed(1)),
            grade:       sig.tradeGrade    || sig.confidenceGrade || 'D',
            score:       parseFloat((sig.score ?? sig.rawScore ?? 0).toFixed(1)),
            edge:        parseFloat((sig.edgeScore ?? sig.edge ?? 0).toFixed(1)),
            regime:      regimeName,
            smartMoney:  sig.smartMoney?.flowType || sig.smartMoney?.classification || 'NEUTRAL',
            decision:    sig.decision || 'HOLD',
            rarity:      sig.rarity?.label || 'LOW_CONVICTION',
            riskFlags:   sig.riskFlags || [],
            conviction:  sig.conviction || 'LOW',
            execEligible: sig.executionEligible ?? true,
            execBlock:   sig.execBlock?.code || null,
            feedAge:     cached.feedAge || 0,
            stale:       cached.stale   || false,
            vr:          vr ?? 1.0,
        });
    }

    const avgConf  = totalSignals > 0 ? confidenceSum / totalSignals : 0;
    const avgVR    = vrCount > 0 ? vrSum / vrCount : 1.0;

    // Sort descending by confidence
    board.sort((a, b) => b.confidence - a.confidence);
    const top10 = board.slice(0, 10);

    // ── Market context determination ──────────────────────────────────────────
    let marketContext;

    if (feedStateName === 'STALE') {
        marketContext = 'HIGH_ENTROPY_MARKET';
    } else if (DEFENSIVE_REGIMES.has(regimeName) && top10.length <= 2) {
        marketContext = 'DEFENSIVE_REGIME';
    } else if (avgVR < LOW_LIQUIDITY_VR_THRESHOLD) {
        marketContext = 'LOW_LIQUIDITY_ENVIRONMENT';
    } else if (top10.length === 0) {
        marketContext = 'NO_ACTIONABLE_SIGNALS';
    } else if (top10[0]?.grade === 'A+' && top10[0]?.confidence > 85) {
        marketContext = 'RARE_HIGH_CONVICTION_SETUP';
    } else if (top10[0]?.grade === 'A') {
        marketContext = 'HIGH_CONVICTION';
    } else {
        marketContext = 'STANDARD_MARKET';
    }

    const meta = {
        regime:        regimeName,
        feedState:     feedStateName,
        totalScanned:  totalSignals,
        tradable:      tradableCount,
        avgConfidence: parseFloat(avgConf.toFixed(1)),
        avgVR:         parseFloat(avgVR.toFixed(2)),
        marketContext,
        boardSize:     top10.length,
        staleSymbols:  staleCount,
        entropy:       parseFloat(marketEntropy.toFixed(3)),
        breadth:       parseFloat(breadth.toFixed(3)),
        timestamp:     Date.now(),
    };

    return { board: top10, meta };
}

function _emptyBoard(regime, feedState, marketContext, totalScanned, staleSymbols, entropy) {
    return {
        board: [],
        meta: {
            regime,
            feedState,
            totalScanned,
            tradable:      0,
            avgConfidence: 0,
            avgVR:         0,
            marketContext,
            boardSize:     0,
            staleSymbols,
            entropy:       parseFloat((entropy || 0).toFixed(3)),
            breadth:       0,
            timestamp:     Date.now(),
        },
    };
}

/**
 * Structured cycle summary — replaces per-symbol log noise.
 */
function logCycleSummary(cycleCount, totalSignals, tradable, top10, avgConf, regimeName, feedStateName) {
    const topStr = top10[0]
        ? `${top10[0].symbol}(${top10[0].confidence}/${top10[0].grade}/${top10[0].rarity})`
        : 'NONE';

    console.log(`\n[CYCLE_SUMMARY] #${cycleCount}`);
    console.log(`  [SIGNAL]  Scanned:${totalSignals}  Tradable:${tradable}  AvgConf:${avgConf.toFixed(1)}`);
    console.log(`  [REGIME]  ${regimeName}`);
    console.log(`  [HEALTH]  Feed:${feedStateName}`);
    console.log(`  [TOP]     ${topStr}`);
}

module.exports = { buildOpportunityBoard, logCycleSummary };
