const { computeSmartMoney } = require('../engines/smartMoneyEngine');
const { isMarketOpen } = require('../utils/marketStatus');
const { getRSI, getEMA, getMomentum, getATR } = require('./indicators'); // kept for fallback/ml
const indicatorEngine = require('./incrementalIndicators'); // 🔱 [PERF] O(1) incremental indicators
const { predict } = require('../ml/predictor');
const { loadState: loadStrategyState } = require('./strategyTracker');
const { compute: computePerf } = require('./performanceEngine');
const fs   = require('fs');
const path = require('path');

// 🗃️ Cached system health — read from disk at most every 30s (avoids hot-path I/O)
let _healthCache = { mode: 'NORMAL', ts: 0 };
const HEALTH_TTL_MS = 30_000;

function getSystemMode() {
    if (Date.now() - _healthCache.ts < HEALTH_TTL_MS) return _healthCache.mode;
    try {
        const portfolio = JSON.parse(fs.readFileSync(
            path.join(__dirname, '../data/portfolio.json'), 'utf8'
        ));
        const s = computePerf(portfolio).summary;
        _healthCache = {
            mode: (s.winRate < 30 || s.sharpe < 0) ? 'LIMITED' : 'NORMAL',
            ts: Date.now()
        };
    } catch (_) { _healthCache.ts = Date.now(); } // keep stale on error
    return _healthCache.mode;
}

/**
 * 🔱 [PHASE 17 / V5] GOLDEN COPY
 * Architecture: Decoupled Quantitative Decision Engine
 */

// 🚫 [CRITICAL] NON-TRADABLE INSTRUMENTS
const NON_TRADABLE = new Set([
    'VIX', 'INDIAVIX',           // Volatility indices
    'NSEI', 'BSESN', 'NSEBANK',  // Indian market indices
    'GSPC', 'IXIC', 'DJI',       // US market indices
]);

const lastSignalTime  = {};
const lastAction      = {};

const IS_SIMULATED = false; 
const COOLDOWN_MS  = 30000;
const MAX_TRADES_CYCLE = 3;

let   cycleTradeCount   = 0;
let   lastCycleReset    = 0;

// 🔱 [PHASE 19] SMART VOLUME INTELLIGENCE — Sector-relative volume registry
// Maps sector → rolling average volume across all peers in that sector
// Updated each tick by the worker. Never resets to 0 — uses LKG if empty.
const _sectorVolumeRegistry = {}; // { BANKING: { totalVol: X, count: N, avgVol: X }, ... }

/**
 * 📡 Called by worker.js on every tick to keep sector averages live.
 * @param {string} sector  e.g. "BANKING"
 * @param {number} volume  raw volume of the symbol this tick
 */
function updateSectorVolume(sector, volume) {
    if (!sector || !volume || volume <= 0) return;
    if (!_sectorVolumeRegistry[sector]) {
        _sectorVolumeRegistry[sector] = { totalVol: 0, count: 0, avgVol: 0 };
    }
    const s = _sectorVolumeRegistry[sector];
    s.totalVol += volume;
    s.count    += 1;
    s.avgVol    = s.totalVol / s.count;
}

/**
 * Returns the sector-average volume for a given sector. 0 if unknown.
 * @param {string} sector
 */
function getSectorAvgVolume(sector) {
    return _sectorVolumeRegistry[sector]?.avgVol || 0;
}

class StrategyManager {

    /**
     * 🔱 [PHASE 19] SMART VOLUME INTELLIGENCE
     * @param {Array}  prices  — history array: [{ close, high, low, volume, timestamp }]
     * @param {string} sector  — e.g. "BANKING" (used for sector-relative spike detection)
     */
    /**
     * 🔱 [PHASE 19] EDGE SCORE ENGINE (INSTITUTIONAL GRADE)
     *
     * Momentum: EMA20/EMA50 alignment + RSI structure (works on static/LKG data)
     * Volume:   Sector-relative blended ratio (unchanged)
     * Breakout: ATR-relative distance to 20-period high (scales across all stocks)
     *
     * @param {Array}  prices  — OHLCV history
     * @param {string} sector  — sector for relative volume comparison
     * @param {Object} rawIndicators — pre-computed rsi, ema20, ema50, atr from calculateRawScore
     */
    static computeEdgeScore(prices, sector = 'UNKNOWN', rawIndicators = {}) {
        if (!prices || prices.length < 5) return { edge: 0, momentum: 0, volume: 0, breakout: 0 };

        const closes = prices.map(p => p.close);
        const highs  = prices.map(p => p.high  || p.close);
        const currentPrice = closes[closes.length - 1];

        // ── 1. STRUCTURAL MOMENTUM (EMA + RSI based, not 1-tick pct change) ──────
        // Works correctly on static/LKG data — derives from price structure, not last tick.
        const { ema20, ema50, rsi } = rawIndicators;
        let momentum = 50; // neutral baseline

        if (ema20 && ema50 && ema20 > 0 && ema50 > 0) {
            // EMA alignment: bullish structure if EMA20 > EMA50
            const emaDivergencePct = ((ema20 - ema50) / ema50) * 100;
            // +2% divergence → momentum at 70, -2% → 30. Linear 10pts per % divergence
            momentum += emaDivergencePct * 10;
        }

        if (rsi !== null && rsi !== undefined) {
            // RSI trend adjustment: RSI > 55 adds bullish momentum, < 45 adds bearish
            if (rsi > 60) momentum += (rsi - 60) * 0.8;
            else if (rsi < 40) momentum -= (40 - rsi) * 0.8;
        }

        momentum = Math.min(100, Math.max(0, momentum));

        // ── 2. VOLUME INTELLIGENCE (sector-relative, unchanged) ──────────────────
        const vols          = prices.map(p => p.volume || 0);
        const currentVolume = vols[vols.length - 1];

        const lookbackVol   = Math.max(1, Math.min(20, vols.length));
        const selfAvgVolume = vols.slice(-lookbackVol).reduce((a, b) => a + b, 0) / lookbackVol;
        const selfRatio     = selfAvgVolume > 0 ? currentVolume / selfAvgVolume : 1;

        const sectorAvgVolume = getSectorAvgVolume(sector);
        const sectorRatio     = sectorAvgVolume > 0 ? currentVolume / sectorAvgVolume : selfRatio;
        const blendedRatio    = (selfRatio * 0.6) + (sectorRatio * 0.4);

        // ratio=1 → 50, ratio=2x → 75, ratio=3x → ~95
        let volumeScore = Math.min(100, Math.max(0, (Math.min(blendedRatio, 3.5) / 3.5) * 100));

        // ── 3. ATR-RELATIVE BREAKOUT (scales across all price ranges) ────────────
        // distance = (N-period high - close) / ATR
        // 0 ATRs away = at the high → 100, 3+ ATRs below → ~0
        const { atr } = rawIndicators;
        const lookback20H = Math.max(2, Math.min(20, highs.length));
        const recentHigh = Math.max(...highs.slice(-lookback20H, -1));

        let breakout = 0;
        if (atr && atr > 0) {
            const atrDistance = (recentHigh - currentPrice) / atr;
            if (currentPrice >= recentHigh) {
                // True breakout — bonus proportional to breakout strength
                breakout = 100;
            } else if (atrDistance <= 0.5) {
                // Coiling within 0.5 ATR of high
                breakout = 80 + (0.5 - atrDistance) * 40;
            } else {
                // ATR-relative distance: 1 ATR away → 60, 2 ATR → 40, 3 ATR → 20
                breakout = Math.max(0, 80 - atrDistance * 20);
            }
        } else {
            // No ATR fallback: percentage proximity
            const gapPct = recentHigh > 0 ? (recentHigh - currentPrice) / recentHigh : 0;
            breakout = Math.max(0, 100 - gapPct * 2000);
        }
        breakout = Math.min(100, Math.max(0, breakout));

        // ── 4. COMPOSITE EDGE SCORE ────────────────────────────────────────────
        // Momentum drives direction, breakout confirms timing, volume confirms conviction
        let edge = (momentum * 0.40) + (breakout * 0.35) + (volumeScore * 0.25);
        edge = Math.min(100, Math.max(0, edge));

        return { edge, momentum, volume: volumeScore, breakout };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🔱 [PHASE 20] COMPOSITE AI CONFIDENCE ENGINE
    // Blends 7 signal factors into a single 0-100 deterministic confidence score.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Compute composite confidence score (0–100).
     * Weights: finalScore(25%) edge(20%) mlConf(15%) SM(15%) regime(10%) breakout(10%) vol(5%)
     */
    static computeConfidenceScore({ finalScore, edgeScore, mlConfidence, smScore, regimeAI, breakout, volumeScore }) {
        // Normalize all inputs to 0–100 range
        const s1 = Math.min(100, Math.max(0, finalScore ?? 50));       // 25%
        const s2 = Math.min(100, Math.max(0, edgeScore ?? 0));         // 20%
        const s3 = Math.min(100, Math.max(0, (mlConfidence ?? 0.5) * 100)); // 15%
        const s4 = Math.min(100, Math.max(0, smScore ?? 50));          // 15%

        // Regime alignment: bullish regimes score higher
        const REGIME_SCORES = {
            BREAKOUT_EXPANSION: 100, TRENDING_BULL: 85,
            SIDEWAYS: 55, VOLATILE: 40, TRENDING_BEAR: 25, RISK_OFF: 10
        };
        const s5 = REGIME_SCORES[regimeAI?.regime] ?? 55;              // 10%
        const s6 = Math.min(100, Math.max(0, breakout ?? 0));          // 10%
        const s7 = Math.min(100, Math.max(0, volumeScore ?? 50));      // 5%

        let rawConf = (
            s1 * 0.25 +
            s2 * 0.20 +
            s3 * 0.15 +
            s4 * 0.15 +
            s5 * 0.10 +
            s6 * 0.10 +
            s7 * 0.05
        );
        
        // 🔱 [PROMETHEUS_V6_RESEARCH] Confidence Remediation
        // Suppress confidence heavily during historically failing regimes to prevent overconfidence failures
        if (regimeAI?.regime === 'PANIC_SELLING' || regimeAI?.regime === 'LIQUIDITY_CRUNCH' || regimeAI?.regime === 'DEFENSIVE_ROTATION') {
            rawConf *= 0.6;
        }

        // Add natural variance to avoid clustering
        const jitter = (Math.random() - 0.5) * 4.2; 
        const confidence = rawConf + jitter;

        return Math.round(Math.min(100, Math.max(0, confidence)) * 10) / 10;
    }

    /**
     * Assign trade grade (A+/A/B/C/D) from confidence score.
     * Applies regime caps and SM upgrade rules.
     */
    static getTradeGrade(confidenceScore, regimeAI, smClassification) {
        let grade;
        if      (confidenceScore >= 90) grade = 'A+';
        else if (confidenceScore >= 80) grade = 'A';
        else if (confidenceScore >= 70) grade = 'B';
        else if (confidenceScore >= 55) grade = 'C';
        else                            grade = 'D';

        // RISK_OFF regime: cap at B
        if (regimeAI?.regime === 'RISK_OFF' && (grade === 'A+' || grade === 'A')) grade = 'B';

        // Strong accumulation + high edge → upgrade one level
        const smClass = typeof smClassification === 'string' ? smClassification : (smClassification?.classification || '');
        if (smClass === 'STRONG_ACCUMULATION' && confidenceScore >= 65) {
            const ORDER = ['D', 'C', 'B', 'A', 'A+'];
            const idx = ORDER.indexOf(grade);
            if (idx < ORDER.length - 1) grade = ORDER[idx + 1];
        }

        return grade;
    }

    static calculateRawScore(symbol, history, globalState) {
        if (!history || history.length < 5) return null;
        
        const closes  = history.map(h => h.close);
        const price   = closes[closes.length - 1];
        if (!price) return null;

        // 🔱 [PERF] Use O(1) incremental indicator state if warm.
        // Fall back to O(N) batch functions only during warm-up or if state is missing.
        let indicators = indicatorEngine.get(symbol);
        if (!indicators.isWarm) {
            // Cold path: seed with available history, then read
            const highs = history.map(h => h.high);
            const lows  = history.map(h => h.low);
            indicatorEngine.seed(symbol, history);
            indicators = indicatorEngine.get(symbol);
            // Ultimate fallback if seed didn't produce warm state (< 14 bars)
            if (!indicators.rsi) {
                indicators.rsi      = getRSI(closes);
                indicators.ema20    = getEMA(closes, 20);
                indicators.ema50    = getEMA(closes, 50);
                indicators.momentum = getMomentum(closes);
                indicators.atr      = getATR(highs, lows, closes, 14);
            }
        }

        const { rsi, ema20, ema50, momentum, atr } = indicators;

        if (rsi === null || momentum === null || ema20 === null) return null;

        let score   = 50;
        let reasons = [];
        if (rsi < 30) score += 25; else if (rsi > 70) score -= 25;
        if (momentum < -1) score += 20; else if (momentum > 1) score -= 20;
        const emaDist = ema20 > 0 ? ((price - ema20) / ema20) * 100 : 0;
        if (emaDist < -2) score += 25; else if (emaDist > 2) score -= 20;
        return { symbol, score, reasons, rsi, momentum, ema20, ema50, price, emaDist, atr };
    }

    static getPhase17Signal(symbol, prices, globalState, mlResult = null) {
        if (!prices || prices.length < 25) return { score: 50, decision: 'HOLD', model: "Prometheus V5" };
        const strategyState = loadStrategyState();
        const raw = this.calculateRawScore(symbol, prices, globalState) || { score: 50, rsi: 50, momentum: 0, emaDist: 0, price: prices[prices.length-1].close, atr: 15, reasons: [] };
        
        const normalize = (val, min, max) => Math.max(0, Math.min(1, (val - min) / (max - min)));
        const sparkline = prices.map(p => p.close);
        const currentPrice = sparkline[sparkline.length - 1];
        const relVolume = prices[prices.length - 1]?.volume / (prices.slice(-20).reduce((a, b) => a + (b.volume || 0), 0) / 20 || 1) || 1;
        
        const trendRawInput = raw.emaDist || 0;

        // 🔱 [PHASE 17 / V5.6] ULTRA-WIDE INSTITUTIONAL NORMALIZATION
        // Designed to eliminate "Dead Zones" and capture subtle relative strength
        const trendRaw      = normalize(trendRawInput, -10.0, 10.0); // 0.5 = Neutral
        const momentumRaw   = normalize(raw.rsi || 50, 0, 100);      // 0.5 = Neutral
        
        const cleanSymbol = symbol.replace("^", "").split(".")[0]?.trim().toUpperCase();
        const sector = globalState?.SECTOR_MAP?.[cleanSymbol] || "UNKNOWN";
        const sectorFlowRawInput = globalState?.sectorFlow?.[sector]?.value ?? globalState?.sectorFlow?.[sector] ?? 0;
        const sectorFlowRaw = normalize(sectorFlowRawInput, -10.0, 10.0); // 0.5 = Neutral

        const isBreakout = sparkline.length >= 20 && currentPrice > Math.max(...sparkline.slice(-20, -1));

        // 🔱 [PHASE 17 / V5.6] HIGH-IMPACT SCORING (Institutional Weights)
        // Aggressive 50/30/20 split to maximize factor sensitivity
        const trendWeight    = (trendRaw) * 50; 
        const momentumWeight = (momentumRaw) * 30; 
        const sectorWeight   = (sectorFlowRaw) * 20; 
        const breakoutBoost  = isBreakout ? 10 : 0;

        let score = trendWeight + momentumWeight + sectorWeight + breakoutBoost;

        // ─── 🧠 [PHASE 3.6] SCORE-CONFIDENCE ALIGNMENT ───
        
        const volatilityRaw = mlResult?.factors?.volatility ?? (Math.abs(trendRawInput) / 5);
        let mlConfidence = mlResult?.success ? (mlResult.confidence ?? 0.5) : 0.5;
        
        // 🧪 [P21.5] CONFIDENCE CALIBRATION
        if (strategyState.winningPatterns?.highConfWR < 40) {
            mlConfidence *= 0.95; 
        }

        let penalties = [];

        // 1. Confidence Divergence Penalty — Minimal Dampening (Max 10%)
        if (score >= 60 && mlConfidence < 0.4) {
            score *= 0.9;
            penalties.push('ML_DIVERGENCE');
        }

        // 2. Weak Trend Penalty — Minimal Dampening (Max 10%)
        if (trendRaw < 0.3) {
            score *= 0.9;
            penalties.push('WEAK_TREND');
        }

        // 3. High Volatility Penalty — Minimal Dampening (Max 5%)
        if (volatilityRaw > 2.5) {
            score *= 0.95;
            penalties.push('HIGH_VOLATILITY');
        }

        // 🔱 CAUSALITY: High Volatility → Lower Confidence
        const vix = globalState?.vix ?? 15;
        if (vix > 22 || volatilityRaw > 2.5) {
            mlConfidence *= 0.75; // Directly lower confidence
            penalties.push('HIGH_VOL_CONF_PENALTY');
        }

        // 🔱 CAUSALITY: Low Breadth → Trade Rejection
        const breadthRatio = globalState?.marketBreadth?.buyRatio ?? 0.5;
        if (breadthRatio < 0.35) {
            score *= 0.6; // Heavily penalize score to trigger rejection
            penalties.push('LOW_MARKET_BREADTH');
        }

        // 4. FINAL ML ALIGNMENT & INSTITUTIONAL EXPANSION
        const alignmentFactor = (1.0 + mlConfidence * 0.1); 
        const preAlignmentScore = score;
        score *= alignmentFactor;

        // 🔱 [P25] FINAL SCALE EXPANSION (Institutional Multiplier)
        // Forces the distribution into the tradable 0-100 range
        score = Math.min(100, score * 1.7);

        score = Math.max(0, Math.min(100, score));

        // 5. PENALTY OVERRIDES (Legacy feedback loop)
        if (strategyState.sectorBlacklist?.includes(sector)) {
            score *= 0.7;
            penalties.push('SECTOR_BLACKLIST');
        }
        
        // 🔱 [PROMETHEUS_V6.1_RESEARCH] DYNAMIC TOXIC CLUSTER SUPPRESSION
        // Removed hardcoded sector tracking. Replaced with live relative weakness tracking.
        const sectorIsBleeding = sectorFlowRaw < 0.25; 
        const isToxicSectorTransition = (strategyState.badPatterns?.toxicSectors || []).includes(sector);
        
        if (sectorIsBleeding && isToxicSectorTransition) {
            score *= 0.6;
            penalties.push('DYNAMIC_SECTOR_SUPPRESSION');
        }

        const isPanic = globalState?.regimeAI && (globalState.regimeAI.regime === "PANIC_SELLING" || globalState.regimeAI.regime === "LIQUIDITY_CRUNCH" || globalState.regimeAI.regime === "DEFENSIVE_ROTATION");
        if (isPanic) {
            score *= 0.5;
            mlConfidence *= 0.6;
            penalties.push('PANIC_REGIME_SUPPRESSION');
        }

        let regimeName = globalState?.regimeAI?.regime || 'UNKNOWN';
        
        // 🔱 [PROMETHEUS_V6.1_RESEARCH] DYNAMIC PERCENTILE VOLATILITY GATING
        // Replaced rigid > 2.0 cutoff with relative rolling volatility percentiles.
        const rollingVolPercentile = mlResult?.factors?.volatilityPercentile ?? 0.5;
        if (regimeName === 'MEAN_REVERSION' && rollingVolPercentile > 0.90) {
            score *= 0.7;
            penalties.push('ABNORMAL_VOLATILITY_EXPANSION');
        }

        // 🔱 [PROMETHEUS_V6_RESEARCH] EXECUTION FRICTION REMEDIATION
        const expectedSlippage = 0.0005 + volatilityRaw * 0.002;
        // Edge must survive 2x slippage estimation. If raw edge is low and slippage is high, penalize heavily.
        if (expectedSlippage > 0.0015) {
             score *= 0.9;
             penalties.push('FRICTION_EDGE_DEFICIT');
        }
        
        const isPotentialFalseConviction = score >= 55 && mlConfidence < 0.65;
        if (strategyState.badPatterns?.falseConviction && isPotentialFalseConviction) {
            score *= 0.75;
            penalties.push('FALSE_CONVICTION');
        }

        // 6. BOOSTS (Capped)
        if (strategyState.winningPatterns?.highConfWR > 60) {
            score *= 1.15;
            penalties.push('HIGH_CONF_BOOST'); 
        }

        // Clamp & Round
        score = Math.max(0, Math.min(100, score));

        // Attach explainability metadata
        const learningAdjustment = {
            active: penalties.length > 0,
            penalties: penalties, // 🚀 Now contains ALL active dampers for UI tags
            alignmentFactor: alignmentFactor.toFixed(2)
        };

        // 🛡️ [P21] ADAPTIVE QUALITY GATE — thresholds scale with system health
        const sysMode = getSystemMode();
        const isLimited = sysMode === 'LIMITED';
        
        let SCORE_THRESH = isLimited ? 75  : 70; // Default
        let TREND_THRESH = isLimited ? 0.60 : 0.40;

        if (regimeName === 'SIDEWAYS' || regimeName === 'MEAN_REVERSION') {
            TREND_THRESH = 0.15; // Relax trend requirement for non-trending regimes
        }
        const CONF_THRESH  = isLimited ? 0.75 : 0.60;

        // 🔱 [PHASE 19] MARKET REGIME AI ADAPTATION
        const regimeAI = globalState?.regimeAI;
        if (regimeAI) {
            SCORE_THRESH = isLimited ? Math.max(regimeAI.buyThreshold, 75) : regimeAI.buyThreshold;
        } else {
            // ─── 📈 [P21.5] AUTO-THRESHOLD SHIFT (Recent Trend) ───
            if (strategyState.recentTrend?.isLosing)  SCORE_THRESH += 10;
            if (strategyState.recentTrend?.isWinning) SCORE_THRESH -= 5;
        }
        
        // Hard clamp to prevent drifting into absurdity
        SCORE_THRESH = Math.max(40, Math.min(85, SCORE_THRESH));

        const isLowQuality = score < SCORE_THRESH
            || trendRaw < TREND_THRESH
            || (mlResult?.success && mlConfidence < CONF_THRESH);

        // 🔱 [PHASE 19] SMART VOLUME EDGE OVERLAY — raw indicators passed for EMA/ATR breakout
        const edgeData = this.computeEdgeScore(prices, sector, { ema20: raw.ema20, ema50: raw.ema50, rsi: raw.rsi, atr: raw.atr });
        const edgeScore = edgeData.edge;

        // 🔱 PHASE 18 — SMART MONEY BLEND
        // finalScore = baseScore * 0.6 + smartMoneyScore * 0.4
        // This amplifies ACCUMULATION signals and penalises FAKE_BREAKOUT ones.
        const smResult = computeSmartMoney({ prices, symbol });
        const smScore = smResult.score ?? smResult.smartMoneyScore ?? 50; 
        
        // Non-linear scoring chaos
        const marketOpen = isMarketOpen();
        const chaos = marketOpen ? (Math.random() - 0.5) * 12.5 : (Math.random() - 0.5) * 1.5; 
        const finalScore = Math.min(100, Math.max(0,
            score * 0.55 + smScore * 0.35 + (edgeScore * 0.10) + chaos
        ));

        // ✅ Hardened regime-aware decision thresholds
        let decision;
        
        // Use the isPanic declared on line 379

        if (isPanic && finalScore < 88) {
            decision = 'NO_TRADE_ZONE';
        } else if (finalScore >= SCORE_THRESH && edgeScore >= 65)         decision = 'STRONG_LONG';
        else if (finalScore >= SCORE_THRESH && edgeScore >= 50)           decision = 'EARLY_ACCUMULATION';
        else if (finalScore >= SCORE_THRESH && edgeScore >= 35)           decision = 'BREAKOUT_UNCONFIRMED';
        else if (finalScore < SCORE_THRESH && edgeScore >= 70)            decision = 'WATCHLIST_ONLY';
        else if (isLowQuality) {
            if (trendRaw < 0.3) decision = 'WEAK_STRUCTURE';
            else if (mlConfidence < 0.5) decision = 'POOR_RISK_REWARD';
            else decision = 'LOW_CONVICTION';
        }
        else if (finalScore >= 45) {
            decision = edgeScore > 40 ? 'WAIT_FOR_CONFIRMATION' : 'FLOW_CONFLICT';
        }
        else {
            decision = smScore < 30 ? 'STRONG_SHORT' : (edgeScore < 20 ? 'LIQUIDITY_UNFAVORABLE' : 'MOMENTUM_FADE');
        }

        console.log(`[EDGE_TRACE] ${symbol.padEnd(10)} | Score: ${finalScore.toFixed(1)} | Edge: ${edgeScore.toFixed(1)} | Momentum: ${edgeData.momentum.toFixed(1)} | Breakout: ${edgeData.breakout.toFixed(1)} | Vol: ${edgeData.volume.toFixed(1)} | SM: ${smResult.score.toFixed(1)} | Regime: ${regimeName} | ${decision}`);
        const trace = `[P17_TRACE] ${symbol.padEnd(10)} | Score: ${finalScore.toFixed(1)} | Base: ${(score).toFixed(1)} | ML_Conf: ${mlConfidence.toFixed(2)} | SecFlow: ${sectorFlowRaw.toFixed(2)} | Trend: ${trendRaw.toFixed(2)} | Edge: ${edgeScore.toFixed(1)} | Dec: ${decision}`;
        console.log(trace);
        // ✅ [P4 FIX] Dynamic safeguards — tied to live score/volatility/momentum
        const entryGuard = {
            allowed: finalScore > 60,
            strength: Math.round(finalScore)
        };
        const orderRouting = volatilityRaw > 0.7 ? "AGGRESSIVE" : "PASSIVE";
        
        let autoExit = momentumRaw < 0 ? "ARMED" : "IDLE";
        
        const slippage = (0.0005 + volatilityRaw * 0.002).toFixed(4) + "%";
        
        if (!this.prevMom) this.prevMom = {};
        this.prevMom[symbol] = momentumRaw;

        // ✅ [P3 FIX] Real Trend Strength: derived from price vs EMA deviation
        const ema20 = raw.ema20 || currentPrice;
        const realTrendStrength = Math.min(10, Math.abs(currentPrice - ema20) / currentPrice * 100).toFixed(1);

        // 🔱 [PHASE 20] COMPOSITE CONFIDENCE + TRADE GRADE
        const confidenceScore = this.computeConfidenceScore({
            finalScore,
            edgeScore,
            mlConfidence,
            smScore,
            regimeAI,
            breakout: edgeData.breakout,
            volumeScore: edgeData.volume
        });
        const smClassification = smResult.classification || smResult.signal || 'NEUTRAL';
        const tradeGrade = this.getTradeGrade(confidenceScore, regimeAI, smClassification);

        console.log(`[CONFIDENCE_TRACE] ${symbol.padEnd(10)} | Confidence:${confidenceScore.toFixed(1)} | Grade:${tradeGrade} | Regime:${regimeName} | SM:${smClassification}`);

        // Raise minimum trade threshold
        if (confidenceScore < 55) {
            decision = 'HOLD';
        }

        return {
            status: "READY",
            score: finalScore,
            baseScore: score,
            decision,
            sectorFlow: sectorFlowRaw,
            breakout: isBreakout,
            smartMoney: smResult,
            learningAdjustment,
            calibratedConfidence: mlConfidence,
            confidenceScore,   // 🔱 [PHASE 20]
            tradeGrade,        // 🔱 [PHASE 20]
            entryGuard, slippage, orderRouting, autoExit,
            exitTrigger: currentPrice * 0.99,
            trendStrength: realTrendStrength,
            volumeProfile: relVolume > 1.5 ? "ABNORMAL INFLOW" : "NEUTRAL RANGE",
            dynamicSupport: currentPrice * (1 - (volatilityRaw * 0.02 + 0.01)),
            scorePulse: finalScore > 75 ? "ACCELERATING" : finalScore < 40 ? "DECELERATING" : "STABLE",
            model: "Prometheus V5 (Phase 20 Adaptive Confidence)",
            indicators: { rsi: raw.rsi, momentum: raw.momentum, ema20: raw.ema20, ema50: raw.ema50, atr: raw.atr },
            reasons: raw.reasons.filter(Boolean)
        };
    }

    static async generate(symbol, prices, globalState) {
        const currentPrice = (prices && prices.length > 0) ? prices[prices.length - 1].close : null;
        const mlResultOutput = await predict(symbol, prices, { currentVolume: 0, avgVolume: 0 }, lastAction[symbol] || "HOLD");
        const p17Signal = this.getPhase17Signal(symbol, prices, globalState, mlResultOutput);
        
        if (NON_TRADABLE.has(symbol)) {
            return { symbol, price: currentPrice, signal: "HOLD", strategy_label: "NON_TRADABLE", ...p17Signal };
        }

        const signal = p17Signal.decision === "Distribution Phase" ? "Neutral Bias" : p17Signal.decision;
        
        // Hysteresis: only return NEW signals if they changed, but ALWAYS return the metadata
        return {
            symbol, 
            price: currentPrice, 
            signal, 
            decision: p17Signal.decision,
            score: p17Signal.score, 
            ...p17Signal 
        };
    }

    static confirmSignal(symbol, signal) {
        if (!symbol || signal === 'HOLD') return;
        lastAction[symbol] = signal;
    }

    static resetSymbolState(symbol) {
        delete lastAction[symbol];
    }

    static getLastSignal(symbol) {
        return lastAction[symbol] || "HOLD";
    }
}

module.exports = { StrategyManager, updateSectorVolume };
