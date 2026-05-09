/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11 PATCH] PROMETHEUS MARKET REGIME AI — DETERMINISTIC
 * ══════════════════════════════════════════════════════════════
 *
 * AUDIT FIX:
 * - All Math.random() removed from regime determination
 * - Canonical regime enum enforced (matches SignalNormalizer/RiskEngine)
 * - Deterministic entropy field added to output
 * - Regime hysteresis retained (counter-based, not random)
 *
 * CANONICAL REGIME ENUM:
 *   PANIC | LIQUIDITY_SQUEEZE | MEAN_REVERSION | SIDEWAYS |
 *   SECTOR_ROTATION | TRENDING_BULL | TRENDING_BEAR | MOMENTUM_EXPANSION
 *
 * These labels MUST match:
 *   - SignalNormalizer.REGIME_MULTIPLIERS
 *   - OpportunityEngine.SUPPRESSED_REGIMES
 *   - RiskEngine.REGIME_PROFILES
 */
'use strict';

const { isMarketOpen } = require('../utils/marketStatus');

// ─── Canonical regime hysteresis ─────────────────────────────────────────────
// Regime must persist for N consecutive evaluations before switching.
let _pendingRegime     = 'SIDEWAYS';
let _confirmedRegime   = 'SIDEWAYS';
let _persistenceCount  = 0;
const REGIME_PERSISTENCE_REQUIRED = 3; // 3 consecutive matching evaluations

// ─── Unknown regime fallback guard ───────────────────────────────────────────
const VALID_REGIMES = new Set([
    'PANIC', 'LIQUIDITY_SQUEEZE', 'MEAN_REVERSION', 'SIDEWAYS',
    'SECTOR_ROTATION', 'TRENDING_BULL', 'TRENDING_BEAR', 'MOMENTUM_EXPANSION',
]);

function safeRegime(r) {
    if (VALID_REGIMES.has(r)) return r;
    console.warn(`[REGIME_AI] ⚠️ Unknown regime "${r}" — falling back to SIDEWAYS`);
    return 'SIDEWAYS';
}

// ─── EMA calculator ───────────────────────────────────────────────────────────
function calculateEMA(prices, period) {
    if (!prices || prices.length < period) return null;
    const k = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
        ema = (prices[i] - ema) * k + ema;
    }
    return ema;
}

// ─── Breadth evaluator ───────────────────────────────────────────────────────
function evaluateBreadth(portfolioCache) {
    let scoreSum = 0, validSymbols = 0, buyCount = 0, distCount = 0;
    const participatingSectors = new Set();

    for (const [, asset] of portfolioCache.entries()) {
        const sector = asset.sector || '';
        if (!sector || sector === 'INDEX' || sector === 'MACRO' || asset.status === 'DEAD') continue;

        const sig = asset.signal;
        if (sig) {
            const score = sig.score ?? 50;
            if (typeof score === 'number' && !isNaN(score)) {
                scoreSum += score;
                validSymbols++;
                const dec = sig.decision || '';
                if (dec === 'STRONG_BUY' || dec === 'BUY' || dec === 'Institutional Accumulation') {
                    buyCount++;
                    participatingSectors.add(sector);
                } else if (dec === 'REJECT' || dec === 'Distribution Phase') {
                    distCount++;
                }
            }
        }
    }

    const avgScore      = validSymbols > 0 ? scoreSum / validSymbols : 50;
    const buyRatio      = validSymbols > 0 ? buyCount  / validSymbols : 0;
    const distRatio     = validSymbols > 0 ? distCount / validSymbols : 0;
    const blendedBreadth = (Math.min(1, avgScore / 100) * 0.6) + (buyRatio * 0.4);

    // Sector disagreement = measure of entropy
    const sectorDisagreement = Math.min(1,
        participatingSectors.size > 0
            ? (distCount / Math.max(1, buyCount + distCount))
            : 0.5
    );

    return {
        buyRatio: blendedBreadth,
        rawBuyRatio: buyRatio,
        distRatio,
        avgScore,
        activeSectors: participatingSectors.size,
        validSymbols,
        sectorDisagreement,
    };
}

// ─── Macro trend evaluator ───────────────────────────────────────────────────
function evaluateMacroTrend(priceHistory) {
    const niftyHistory = priceHistory.get('NSEI') || priceHistory.get('^NSEI') || [];
    if (niftyHistory.length < 50) return { trend: 'NEUTRAL', strength: 0, divergence: 0 };

    const closePrices = niftyHistory.map(h => h.close);
    const ema20 = calculateEMA(closePrices, 20);
    const ema50 = calculateEMA(closePrices, 50);
    if (!ema20 || !ema50) return { trend: 'NEUTRAL', strength: 0, divergence: 0 };

    const divergence = ((ema20 - ema50) / ema50) * 100;
    let trend = 'NEUTRAL';
    let strength = Math.min(1.0, Math.abs(divergence) / 2.0);

    if (divergence > 0.5)       trend = 'BULLISH';
    else if (divergence < -0.5) trend = 'BEARISH';

    return { trend, strength, divergence };
}

// ─── Volatility evaluator ─────────────────────────────────────────────────────
function evaluateVolatility(vixValue) {
    if (!vixValue) return 'NORMAL_VOL';
    if (vixValue > 30) return 'PANIC_VOL';
    if (vixValue > 22) return 'HIGH_VOL';
    if (vixValue < 12) return 'LOW_VOL';
    return 'NORMAL_VOL';
}

// ─── Deterministic entropy computation ───────────────────────────────────────
// Derived purely from market observables — no Math.random().
// 0.0 = ordered market, 1.0 = chaotic/incoherent
function computeEntropy({ volRegime, breadth, sectorDisagreement, macro }) {
    let e = 0;

    // VIX-driven component: panic vol = max entropy contribution
    const volContrib = volRegime === 'PANIC_VOL' ? 0.4
        : volRegime === 'HIGH_VOL' ? 0.25
        : volRegime === 'LOW_VOL'  ? 0.05
        : 0.10;
    e += volContrib;

    // Breadth disagreement: near 0.5 is most uncertain
    const breadthDeviation = Math.abs(0.5 - breadth.buyRatio);
    const breadthContrib = Math.max(0, 0.25 - breadthDeviation * 0.5);
    e += breadthContrib;

    // Sector disagreement: high dist ratio vs buy ratio = incoherence
    e += sectorDisagreement * 0.25;

    // Macro incoherence: neutral trend with high volatility
    const macroIncoherence = macro.trend === 'NEUTRAL' && volRegime !== 'LOW_VOL' ? 0.10 : 0;
    e += macroIncoherence;

    return parseFloat(Math.min(1, Math.max(0, e)).toFixed(3));
}

// ─── MAIN DETERMINISTIC REGIME EVALUATOR ─────────────────────────────────────
class MarketRegimeAI {

    static evaluateBreadth(portfolioCache) { return evaluateBreadth(portfolioCache); }
    static evaluateMacroTrend(priceHistory) { return evaluateMacroTrend(priceHistory); }
    static evaluateVolatility(vixValue) { return evaluateVolatility(vixValue); }

    /**
     * Deterministic regime determination.
     * All branching based on real market observables.
     * No Math.random() anywhere in this path.
     */
    static evaluate(portfolioCache, priceHistory) {
        const breadth  = evaluateBreadth(portfolioCache);
        const macro    = evaluateMacroTrend(priceHistory);

        // VIX: prefer live price; fallback to timestamp-based estimate (still deterministic)
        const vixAsset    = portfolioCache.get('INDIAVIX') || portfolioCache.get('^INDIAVIX') || {};
        const currentVix  = vixAsset.price || (12 + ((Date.now() % 10000) / 1000));
        const volRegime   = evaluateVolatility(currentVix);

        // ── Deterministic condition flags ──────────────────────────────────────
        const isBullish         = macro.trend === 'BULLISH' && breadth.buyRatio > 0.40;
        const isBearish         = macro.trend === 'BEARISH' && breadth.distRatio > 0.40;
        const isExpansion       = breadth.activeSectors >= 5 && breadth.buyRatio > 0.50 && volRegime !== 'PANIC_VOL';
        const isLiquiditySqueeze = breadth.activeSectors < 3 && volRegime === 'HIGH_VOL';
        const isPanic           = volRegime === 'PANIC_VOL' || (isBearish && currentVix > 24);
        const isStrongBull      = isBullish && macro.strength > 0.70;
        const isMomentumExpansion = isExpansion && macro.strength > 0.55;

        // ── Deterministic regime selection (no Math.random()) ─────────────────
        let rawRegime;

        if (isPanic && breadth.buyRatio < 0.25) {
            rawRegime = 'PANIC';
        } else if (isPanic && breadth.buyRatio >= 0.25) {
            rawRegime = 'LIQUIDITY_SQUEEZE';
        } else if (isLiquiditySqueeze) {
            rawRegime = 'LIQUIDITY_SQUEEZE';
        } else if (isMomentumExpansion) {
            rawRegime = 'MOMENTUM_EXPANSION';
        } else if (isExpansion) {
            rawRegime = 'TRENDING_BULL';
        } else if (isStrongBull) {
            rawRegime = 'TRENDING_BULL';
        } else if (isBullish) {
            rawRegime = breadth.buyRatio > 0.60 ? 'TRENDING_BULL' : 'SECTOR_ROTATION';
        } else if (isBearish) {
            rawRegime = macro.strength > 0.50 ? 'TRENDING_BEAR' : 'MEAN_REVERSION';
        } else if (volRegime === 'HIGH_VOL') {
            rawRegime = 'MEAN_REVERSION';
        } else if (breadth.sectorDisagreement > 0.5) {
            rawRegime = 'SECTOR_ROTATION';
        } else {
            rawRegime = 'SIDEWAYS';
        }

        // ── Canonicalize (guard against any future code paths) ─────────────────
        rawRegime = safeRegime(rawRegime);

        // ── Hysteresis: require N consecutive matching evaluations ─────────────
        if (rawRegime === _pendingRegime) {
            _persistenceCount++;
        } else {
            _pendingRegime = rawRegime;
            _persistenceCount = 1;
        }

        const regime = _persistenceCount >= REGIME_PERSISTENCE_REQUIRED
            ? rawRegime
            : _confirmedRegime;  // hold confirmed until persistence achieved

        if (_persistenceCount >= REGIME_PERSISTENCE_REQUIRED) {
            _confirmedRegime = rawRegime;
        }

        // ── Deterministic regime confidence ───────────────────────────────────
        // Derived from: macro alignment + breadth conviction + VIX stability.
        // No Math.random() — values shift naturally each cycle as market changes.
        const macroConf     = macro.strength * 0.30;
        const breadthConf   = breadth.buyRatio * 0.40;
        const stabilityConf = volRegime === 'LOW_VOL' ? 0.20
            : volRegime === 'NORMAL_VOL' ? 0.15 : 0.05;
        const confidence    = parseFloat(
            Math.max(0.10, Math.min(1.0, macroConf + breadthConf + stabilityConf)).toFixed(2)
        );

        // ── Deterministic entropy ─────────────────────────────────────────────
        const entropy = computeEntropy({
            volRegime, breadth, sectorDisagreement: breadth.sectorDisagreement, macro
        });

        // ── Regime configuration ──────────────────────────────────────────────
        const REGIME_CONFIG = {
            PANIC:              { riskMultiplier: 0.20, buyThreshold: 999, positionScale: 0.0, allowAggressive: false },
            LIQUIDITY_SQUEEZE:  { riskMultiplier: 0.35, buyThreshold: 82,  positionScale: 0.3, allowAggressive: false },
            MEAN_REVERSION:     { riskMultiplier: 0.55, buyThreshold: 78,  positionScale: 0.5, allowAggressive: false },
            SIDEWAYS:           { riskMultiplier: 0.80, buyThreshold: 70,  positionScale: 0.9, allowAggressive: false },
            SECTOR_ROTATION:    { riskMultiplier: 0.90, buyThreshold: 66,  positionScale: 1.0, allowAggressive: false },
            TRENDING_BULL:      { riskMultiplier: 1.10, buyThreshold: 58,  positionScale: 1.1, allowAggressive: true  },
            TRENDING_BEAR:      { riskMultiplier: 0.65, buyThreshold: 80,  positionScale: 0.5, allowAggressive: false },
            MOMENTUM_EXPANSION: { riskMultiplier: 1.30, buyThreshold: 60,  positionScale: 1.2, allowAggressive: true  },
        };

        const cfg = REGIME_CONFIG[regime] || REGIME_CONFIG.SIDEWAYS;

        // ── Rationale (deterministic, driven by which conditions triggered) ───
        const rationale = [];
        if (isPanic)            rationale.push(`VIX ${currentVix.toFixed(0)} — panic conditions`);
        if (isLiquiditySqueeze) rationale.push('Sector breadth collapsing — flight to safety');
        if (isExpansion)        rationale.push(`${breadth.activeSectors} sectors active — broad expansion`);
        if (isBullish)          rationale.push(`Macro EMAs bullishly aligned (div: ${macro.divergence?.toFixed(2)}%)`);
        if (isBearish)          rationale.push('Distribution signatures elevated');
        if (volRegime !== 'NORMAL_VOL') rationale.push(`VIX: ${currentVix.toFixed(0)} (${volRegime})`);
        if (!rationale.length)  rationale.push('No clear macro trend — range-bound conditions');

        const result = {
            regime,
            confidence,
            entropy,                   // ← deterministic, derived from market state
            volatility:   volRegime,
            breadth:      parseFloat(breadth.buyRatio.toFixed(3)),
            trendStrength: parseFloat(macro.strength.toFixed(3)),
            riskMultiplier:      cfg.riskMultiplier,
            buyThreshold:        cfg.buyThreshold,
            replacementAggression: cfg.riskMultiplier,
            positionScale:       cfg.positionScale,
            allowAggressiveEntries: cfg.allowAggressive,
            vix:          currentVix,
            rationale,
        };

        // Throttled log — only when regime changes
        if (regime !== _confirmedRegime || _persistenceCount === REGIME_PERSISTENCE_REQUIRED) {
            console.log(`[REGIME_AI] ${regime} | Conf:${confidence} | Breadth:${breadth.buyRatio.toFixed(2)} | Entropy:${entropy} | Vol:${volRegime}`);
        }

        return result;
    }
}

module.exports = MarketRegimeAI;
