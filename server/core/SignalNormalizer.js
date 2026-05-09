/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11] PROMETHEUS CANONICAL SIGNAL NORMALIZER v2.0
 * ══════════════════════════════════════════════════════════════
 *
 * ONE centralized normalized signal object per symbol.
 * ALL frontend components consume ONLY this output.
 * No duplicate calculations. No frontend derivations. One source of truth.
 *
 * Phase 11 upgrade: Risk-adjusted confidence engine.
 * TARGET DISTRIBUTION:
 *   0–25   catastrophic/no-trade (hostile regime, disconnected feed, panic)
 *   25–45  weak (low breadth, thin volume, high entropy)
 *   45–65  moderate (standard market, mixed signals)
 *   65–80  strong (aligned regime, good liquidity, confirmed trend)
 *   80–92  rare institutional alignment (all factors converge)
 *   92+    exceptional anomaly (A+ setup, requires 5+ confirmations)
 *
 * High scores REQUIRE: aligned regime + high VR + low entropy +
 *   smart money confirmation + volatility control + breadth support.
 *
 * Input:  raw strategy output from StrategyManager.generate()
 * Output: canonical NormalizedSignal object
 */

'use strict';

// ─── Confidence grade thresholds (Phase 11 wider distribution) ──────────────
// 0–25   → catastrophic/no-trade (grade: F-)
// 25–45  → weak                  (grade: F/D)
// 45–65  → moderate              (grade: C/B)
// 65–80  → strong                (grade: B/A)
// 80–92  → rare institutional    (grade: A)
// 92+    → exceptional anomaly   (grade: A+)
const GRADE_THRESHOLDS = [
    { min: 92, grade: 'A+', conviction: 'EXCEPTIONAL' },
    { min: 80, grade: 'A',  conviction: 'STRONG'      },
    { min: 65, grade: 'B',  conviction: 'MODERATE'    },
    { min: 45, grade: 'C',  conviction: 'LOW'         },
    { min: 25, grade: 'D',  conviction: 'WEAK'        },
    { min:  0, grade: 'F',  conviction: 'NO_EDGE'     },
];

// ─── Risk-adjusted scaling multipliers ───────────────────────────────────────
// These multiplicatively compress/expand the confidence score.
// A score must pass through ALL multipliers to stay high.
// LABELS MUST match marketRegimeAI canonical enum exactly.
// Unknown regime → falls back to SIDEWAYS (0.82) with a warning log.
const REGIME_MULTIPLIERS = {
    TRENDING_BULL:      1.00,  // Aligned bull — full confidence pass
    MOMENTUM_EXPANSION: 0.95,  // Expansion with momentum confirmation
    SECTOR_ROTATION:    0.88,  // Rotation — moderate suppression
    SIDEWAYS:           0.82,  // No clear trend — light suppression
    MEAN_REVERSION:     0.42,  // Hostile mean-rev — heavy suppression
    TRENDING_BEAR:      0.35,  // Macro bear — entries strongly penalized
    LIQUIDITY_SQUEEZE:  0.30,  // Severe illiquidity — near-block
    PANIC:              0.20,  // Panic — confidence floor enforced
};

function gradeFromScore(score) {
    const s = Math.max(0, Math.min(100, score));
    for (const t of GRADE_THRESHOLDS) {
        if (s >= t.min) return { grade: t.grade, conviction: t.conviction };
    }
    return { grade: 'F', conviction: 'NO_EDGE' };
}

// ─── Market entropy calculator ────────────────────────────────────────────────
// High entropy = many conflicting signals = suppress confidence
// Phase 11 Patch: prefer deterministic entropy from regimeAI if available.
// Fallback: derive from regime label + VIX + breadth.
function computeMarketEntropy(globalState) {
    // Prefer pre-computed deterministic entropy from MarketRegimeAI
    if (typeof globalState?.regimeAI?.entropy === 'number') {
        return globalState.regimeAI.entropy;
    }

    const regime  = globalState?.regimeAI?.regime || 'SIDEWAYS';
    const vix     = globalState?.vix || 15;
    const breadth = globalState?.regimeAI?.breadth || 0.5;

    // Canonical enum — PANIC, LIQUIDITY_SQUEEZE, MEAN_REVERSION, TRENDING_BEAR = high entropy
    const HIGH_ENTROPY_REGIMES = ['PANIC', 'LIQUIDITY_SQUEEZE', 'MEAN_REVERSION', 'TRENDING_BEAR'];
    const regimeFactor = HIGH_ENTROPY_REGIMES.includes(regime) ? 1 : 0;

    // VIX above 20 = elevated, above 30 = crisis
    const vixFactor = vix > 30 ? 1 : vix > 20 ? 0.5 : 0;

    // Breadth near 0.5 = market indecision = higher entropy
    const breadthFactor = (breadth > 0.35 && breadth < 0.65) ? 0.5 : 0;

    const entropy = Math.min(1, regimeFactor * 0.5 + vixFactor * 0.3 + breadthFactor * 0.2);
    return entropy; // 0 = ordered market, 1 = chaotic
}

// ─── Regime multiplier lookup with unknown-guard ──────────────────────────────
function getRegimeMult(regime) {
    if (REGIME_MULTIPLIERS[regime] !== undefined) return REGIME_MULTIPLIERS[regime];
    console.warn(`[SIGNAL_NORMALIZER] ⚠️ Unknown regime "${regime}" — using SIDEWAYS multiplier`);
    return REGIME_MULTIPLIERS.SIDEWAYS;
}

// ─── Smart Money derivation ───────────────────────────────────────────────────
// Derive from real market signals: volume ratio, candle spread, price displacement
function deriveSmartMoney(strategy, entry) {
    const sm = strategy?.smartMoney || {};
    const vr = sm.vr ?? entry?.volumeRatio ?? 1.0;
    const classification = sm.classification || 'NEUTRAL';
    const consistency = sm.consistency ?? 0.5;

    // Accumulation: rising price + high VR + consistent upside
    const accumulationScore = Math.min(100,
        (vr > 1.5 ? 40 : vr > 1.2 ? 20 : 0) +
        (classification === 'ACCUMULATION' ? 30 : 0) +
        (consistency > 0.6 ? 30 : consistency > 0.4 ? 15 : 0)
    );

    // Distribution: declining price + high VR + consistent downside
    const distributionScore = Math.min(100,
        (vr > 1.5 && classification === 'DISTRIBUTION' ? 50 : 0) +
        (classification === 'DISTRIBUTION' ? 30 : 0) +
        (consistency < 0.4 ? 20 : 0)
    );

    // Institutional bias: net of accumulation vs distribution
    const institutionalBias = accumulationScore > distributionScore ? 'LONG'
        : distributionScore > accumulationScore ? 'SHORT'
        : 'NEUTRAL';

    // Participation strength from VR
    const participationStrength = vr > 2.0 ? 'VERY_HIGH'
        : vr > 1.5 ? 'HIGH'
        : vr > 1.0 ? 'NORMAL'
        : 'LOW';

    // Liquidity sweep: extreme VR spike with classification
    const liquiditySweepDetected = vr > 2.5 && classification !== 'NEUTRAL';

    return {
        flowType: classification,
        accumulationScore: parseFloat(accumulationScore.toFixed(1)),
        distributionScore: parseFloat(distributionScore.toFixed(1)),
        participationStrength,
        liquiditySweepDetected,
        institutionalBias,
        vr: parseFloat(vr.toFixed(2)),
        score: sm.score ?? parseFloat(((accumulationScore + vr * 10) / 2).toFixed(1)),
    };
}

// ─── Slippage model ───────────────────────────────────────────────────────────
// slippage = volatility * spreadFactor * liquidityPenalty
function estimateSlippage(volatilityScore, vr, price) {
    const volFactor = Math.max(0.001, volatilityScore / 100);
    const spreadFactor = 0.0015; // 15bps base
    const liquidityPenalty = vr < 0.5 ? 2.5 : vr < 0.8 ? 1.5 : 1.0;

    const slippagePct = volFactor * spreadFactor * liquidityPenalty * 100;
    const slippageRs = price ? parseFloat((price * slippagePct / 100).toFixed(2)) : 0;
    return {
        pct: parseFloat(slippagePct.toFixed(4)),
        rs: slippageRs,
        rating: slippagePct > 0.5 ? 'HIGH' : slippagePct > 0.15 ? 'MODERATE' : 'LOW',
    };
}

// ─── Penalty/Boost engine ─────────────────────────────────────────────────────
function computePenaltiesBoosts(strategy, globalState, dataAge) {
    const regime = globalState?.regimeAI?.regime || 'SIDEWAYS';
    const vr = strategy?.smartMoney?.vr ?? 1.0;
    const volatilityScore = strategy?.volatilityScore ?? 50;
    const classification = strategy?.smartMoney?.classification || 'NEUTRAL';

    const penalties = [];
    const boosts = [];
    let adjustment = 0;

    // ── Regime penalties ────────────────────────────────────────
    if (['VOLATILE', 'RISK_OFF'].includes(regime)) {
        adjustment -= 15;
        penalties.push({ code: 'HIGH_VOL_REGIME', label: 'Volatile Regime', desc: `${regime} regime active — confidence suppressed`, impact: -15 });
    }
    if (['PANIC', 'MEAN_REVERSION'].includes(regime)) {
        adjustment -= 20;
        penalties.push({ code: 'HOSTILE_REGIME', label: 'Hostile Regime', desc: `${regime} — signal reliability severely degraded`, impact: -20 });
    }

    // ── Data freshness ───────────────────────────────────────────
    if (dataAge > 30000) {
        adjustment -= 10;
        penalties.push({ code: 'STALE_DATA', label: 'Stale Feed', desc: `Data is ${Math.floor(dataAge/1000)}s old — signal may be stale`, impact: -10 });
    } else if (dataAge > 15000) {
        adjustment -= 5;
        penalties.push({ code: 'DELAYED_DATA', label: 'Delayed Feed', desc: `Feed delayed ${Math.floor(dataAge/1000)}s — minor confidence penalty`, impact: -5 });
    }

    // ── Liquidity ────────────────────────────────────────────────
    if (vr < 0.5) {
        adjustment -= 12;
        penalties.push({ code: 'LOW_LIQUIDITY', label: 'Low Liquidity', desc: `VR: ${vr.toFixed(2)}x — insufficient market participation`, impact: -12 });
    } else if (vr < 0.8) {
        adjustment -= 6;
        penalties.push({ code: 'THIN_MARKET', label: 'Thin Market', desc: `VR: ${vr.toFixed(2)}x — below-average volume`, impact: -6 });
    }

    // ── Volatility penalty ───────────────────────────────────────
    if (volatilityScore > 70) {
        adjustment -= 8;
        penalties.push({ code: 'HIGH_VOLATILITY', label: 'High Volatility', desc: `ATR-derived volatility ${volatilityScore.toFixed(0)} — execution risk elevated`, impact: -8 });
    }

    // ── Smart money distribution ─────────────────────────────────
    if (classification === 'DISTRIBUTION') {
        adjustment -= 10;
        penalties.push({ code: 'DISTRIBUTION_DETECTED', label: 'Distribution Phase', desc: 'Smart money reducing exposure — long bias contraindicated', impact: -10 });
    }
    if (classification === 'FAKE_BREAKOUT') {
        adjustment -= 8;
        penalties.push({ code: 'FAKE_BREAKOUT', label: 'Fake Breakout', desc: 'Breakout unconfirmed by volume — trap risk elevated', impact: -8 });
    }

    // ── Boosts ────────────────────────────────────────────────────
    if (classification === 'ACCUMULATION') {
        adjustment += 10;
        boosts.push({ code: 'ACCUMULATION', label: 'Accumulation Phase', desc: 'Block order flow confirms institutional buy-side commitment', impact: +10 });
    }
    if (vr > 1.8) {
        adjustment += 8;
        boosts.push({ code: 'ABNORMAL_INFLOW', label: 'Abnormal Inflow', desc: `VR: ${vr.toFixed(2)}x — statistically significant volume spike`, impact: +8 });
    }
    if (strategy?.breakout) {
        adjustment += 6;
        boosts.push({ code: 'BREAKOUT_CONFIRMED', label: 'Breakout Active', desc: 'Price expanding beyond historical range with volume confirmation', impact: +6 });
    }
    if (['TRENDING_BULL', 'BREAKOUT_EXPANSION'].includes(regime)) {
        adjustment += 5;
        boosts.push({ code: 'ALIGNED_REGIME', label: 'Regime Aligned', desc: `${regime} — macro tailwind supporting long signals`, impact: +5 });
    }

    return { penalties, boosts, adjustment };
}

// ─── Execution block reason ───────────────────────────────────────────────────
function deriveExecBlockReason(signal, dataAge, marketOpen) {
    if (!marketOpen)                    return { blocked: true, code: 'MARKET_CLOSED',     label: 'Market Closed',      severity: 'INFO'  };
    if (dataAge > 60000)                return { blocked: true, code: 'DISCONNECTED',      label: 'Feed Disconnected',  severity: 'CRIT'  };
    if (dataAge > 30000)                return { blocked: true, code: 'STALE_FEED',        label: 'Stale Feed',         severity: 'HIGH'  };
    if (dataAge > 15000)                return { blocked: false, code: 'DELAYED_FEED',     label: 'Feed Delayed',       severity: 'WARN'  };
    if (signal.slippage?.rating === 'HIGH') return { blocked: true, code: 'HIGH_SLIPPAGE', label: 'High Slippage',     severity: 'HIGH'  };
    if (signal.liquidityState === 'LOW') return { blocked: true, code: 'LOW_LIQUIDITY',    label: 'Low Liquidity',      severity: 'HIGH'  };
    if (signal.confidenceScore < 35)    return { blocked: true, code: 'LOW_EDGE',          label: 'Insufficient Edge',  severity: 'HIGH'  };
    if (signal.conviction === 'NO_EDGE') return { blocked: true, code: 'NO_EDGE',          label: 'No Valid Edge',      severity: 'HIGH'  };
    return { blocked: false, code: 'ARMED', label: 'Execution Armed', severity: 'OK' };
}

// ─── Signal rarity score ───────────────────────────────────────────────────────
// Strong signals must be genuinely uncommon.
function computeRarity(confidenceScore, grade, smScore) {
    if (grade === 'A+' && smScore > 75) return { label: 'RARE_A_SETUP',    tier: 1 };
    if (grade === 'A'  && smScore > 65) return { label: 'HIGH_CONVICTION', tier: 2 };
    if (grade === 'B'  && smScore > 55) return { label: 'STANDARD',        tier: 3 };
    if (confidenceScore < 35)           return { label: 'WEAK_SIGNAL',     tier: 5 };
    return { label: 'LOW_CONVICTION', tier: 4 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN NORMALIZER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * normalize(strategy, cacheEntry, globalState, dataAge)
 *
 * @param {object} strategy   - Raw output from StrategyManager.generate()
 * @param {object} cacheEntry - portfolioCache entry for this symbol
 * @param {object} globalState - Root global state (regime, VIX, breadth)
 * @param {number} dataAge    - ms since last confirmed live tick
 * @returns {NormalizedSignal}
 */
function normalize(strategy, cacheEntry, globalState, dataAge = 0) {
    if (!strategy || !cacheEntry) return null;

    const symbol = strategy.symbol || cacheEntry.symbol || 'UNKNOWN';
    const price = cacheEntry.price || 0;
    const vr = strategy?.smartMoney?.vr ?? 1.0;
    const volatilityScore = strategy?.volatilityScore ?? 50;

    // ── Phase 11: Risk-adjusted confidence engine ─────────────────
    // Step 1: entropy suppression of raw score
    const entropy = computeMarketEntropy(globalState);
    const rawScore = strategy.score ?? 50;
    const entropyPenalty = entropy * 20; // max -20 pts in chaotic market (widened)
    let baseScore = Math.max(0, rawScore - entropyPenalty);

    // Step 2: Additive penalties/boosts
    const { penalties, boosts, adjustment } = computePenaltiesBoosts(strategy, globalState, dataAge);
    baseScore = Math.max(0, Math.min(100, baseScore + adjustment));

    // Step 3: Multiplicative regime scaling (THIS is what widens the distribution)
    const regime = globalState?.regimeAI?.regime || 'SIDEWAYS';
    const regimeMult = getRegimeMult(regime);

    // Step 4: Liquidity multiplier (low VR compresses confidence significantly)
    const liqMult = vr >= 2.0 ? 1.05    // Abnormal inflow → slight boost
        : vr >= 1.5 ? 1.00
        : vr >= 1.0 ? 0.95
        : vr >= 0.7 ? 0.85
        : vr >= 0.5 ? 0.72
        : 0.55; // Very low liquidity → severe compression

    // Step 5: Breadth multiplier
    const breadth = globalState?.regimeAI?.breadth ?? 0.5;
    const breadthMult = breadth >= 0.7 ? 1.02
        : breadth >= 0.5 ? 1.00
        : breadth >= 0.3 ? 0.90
        : 0.75; // Low breadth → weak market

    // Step 6: Feed freshness penalty
    const feedMult = dataAge > 60_000 ? 0.40
        : dataAge > 30_000 ? 0.70
        : dataAge > 15_000 ? 0.90
        : 1.00;

    // Step 7: Smart money boost/penalty
    const smClass = strategy?.smartMoney?.classification || 'NEUTRAL';
    const smMult = smClass === 'ACCUMULATION' ? 1.08
        : smClass === 'DISTRIBUTION'  ? 0.80
        : smClass === 'FAKE_BREAKOUT' ? 0.75
        : 1.00;

    // Final composite: multiplicative chain ensures high scores are rare
    const compositeMultiplier = regimeMult * liqMult * breadthMult * feedMult * smMult;
    const adjustedScore = Math.max(0, Math.min(100, baseScore * compositeMultiplier));

    // ── Grade and conviction ──────────────────────────────────────
    const { grade, conviction } = gradeFromScore(adjustedScore);

    // ── Smart money ───────────────────────────────────────────────
    const smartMoney = deriveSmartMoney(strategy, cacheEntry);

    // ── Slippage ──────────────────────────────────────────────────
    const slippage = estimateSlippage(volatilityScore, vr, price);

    // ── Liquidity state ───────────────────────────────────────────
    const liquidityState = vr > 1.5 ? 'HIGH' : vr > 0.8 ? 'NORMAL' : 'LOW';

    // ── Rarity ────────────────────────────────────────────────────
    const rarity = computeRarity(adjustedScore, grade, smartMoney.score);

    // ── Trend direction ───────────────────────────────────────────
    const trendDir = strategy.trendDirection
        ?? (strategy.decision === 'BUY' ? 'bullish' : strategy.decision === 'REJECT' ? 'bearish' : 'neutral');

    // ── Execution block ───────────────────────────────────────────
    const isMarketOpen = !globalState?.market_status || globalState.market_status === 'OPEN';
    const execBlock = deriveExecBlockReason({ confidenceScore: adjustedScore, slippage, liquidityState, conviction }, dataAge, isMarketOpen);

    // ── Risk flags ────────────────────────────────────────────────
    const riskFlags = [];
    if (dataAge > 15000) riskFlags.push('STALE_FEED');
    if (slippage.rating === 'HIGH') riskFlags.push('HIGH_SLIPPAGE');
    if (liquidityState === 'LOW') riskFlags.push('LOW_LIQUIDITY');
    if (['PANIC', 'MEAN_REVERSION'].includes(globalState?.regimeAI?.regime)) riskFlags.push('HOSTILE_REGIME');
    if (smartMoney.liquiditySweepDetected) riskFlags.push('LIQUIDITY_SWEEP');

    // ── Rationale ─────────────────────────────────────────────────
    const rawRationale = strategy.rationale ?? [];
    const penaltyRationale = penalties.map(p => p.desc);
    const boostRationale   = boosts.map(b => b.desc);
    const rationale = [...rawRationale, ...penaltyRationale, ...boostRationale].slice(0, 6);

    return {
        // Identity
        symbol,
        timestamp: cacheEntry.timestamp || Date.now(),
        stale: dataAge > 30000,

        // Regime context
        regime: globalState?.regimeAI?.regime || 'SIDEWAYS',
        marketEntropy: parseFloat(entropy.toFixed(3)),

        // Score components (all normalized 0–100)
        momentumScore:   parseFloat((strategy.momentumScore   ?? strategy.score ?? 0).toFixed(1)),
        volatilityScore: parseFloat(volatilityScore.toFixed(1)),
        smartMoneyScore: parseFloat(smartMoney.score.toFixed(1)),
        breakoutScore:   parseFloat((strategy.breakoutScore   ?? (strategy.breakout ? 75 : 30)).toFixed(1)),
        volumeScore:     parseFloat((strategy.volumeScore     ?? (vr * 50)).toFixed(1)),
        edgeScore:       parseFloat((strategy.edgeScore       ?? strategy.edge ?? 0).toFixed(1)),

        // Composite confidence
        rawScore:        parseFloat(rawScore.toFixed(1)),
        entropyPenalty:  parseFloat(entropyPenalty.toFixed(1)),
        adjustedScore:   parseFloat(adjustedScore.toFixed(1)),
        confidenceScore: parseFloat(adjustedScore.toFixed(1)),
        score:           parseFloat(adjustedScore.toFixed(1)), // 🔱 [FIX] UI Compatibility alias
        confidenceGrade: grade,
        conviction,

        // Decision
        decision:       strategy.decision || 'HOLD',
        signal:         strategy.signal   || 'HOLD',
        breakout:       strategy.breakout || false,
        trendDirection: trendDir,

        // Smart money (from real data, not random)
        smartMoney,
        liquidityState,

        // Execution
        slippage,
        executionEligible: !execBlock.blocked,
        execBlock,
        sectorFlow: parseFloat((strategy.sectorFlow ?? 0).toFixed(2)),

        // Explainability
        penalties,
        boosts,
        adjustment:  parseFloat(adjustment.toFixed(1)),
        rationale,
        riskFlags,

        // Grading
        tradeGrade:  grade,
        rarity,

        // Internal pass-through
        status: strategy.status || 'READY',
        traceId: strategy.traceId,
        indicators: strategy.indicators || {},
    };
}

module.exports = { normalize, computeMarketEntropy, gradeFromScore };
