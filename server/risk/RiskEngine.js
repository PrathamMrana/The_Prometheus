/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11] PROMETHEUS INSTITUTIONAL RISK ENGINE v1.0
 * ══════════════════════════════════════════════════════════════
 *
 * Centralized orchestration layer. ALL execution must pass through
 * RiskEngine.evaluate() before routing to OrderQueue.
 *
 * Architecture:
 *   RiskEngine (this) → wraps existing RiskManager (per-symbol)
 *                     → adds portfolio-level, regime-level, feed-level gates
 *
 * Input:  { signal, portfolio, marketState, feedState, symbolState }
 * Output: { approved, adjustedQty, riskScore, riskFlags, rejectionReason,
 *           exposureAfterTrade, sectorExposure, drawdownState }
 */

'use strict';

const feedState   = require('../utils/feedState');

// ─── Regime risk multipliers ─────────────────────────────────────────────────
// How much regime affects sizing and confidence thresholds
const REGIME_PROFILES = {
    TRENDING_BULL:       { sizeMultiplier: 1.00, confRequired: 50, blockAll: false },
    BREAKOUT_EXPANSION:  { sizeMultiplier: 0.90, confRequired: 55, blockAll: false },
    SIDEWAYS:            { sizeMultiplier: 0.80, confRequired: 60, blockAll: false },
    RECOVERY:            { sizeMultiplier: 0.70, confRequired: 65, blockAll: false },
    VOLATILE:            { sizeMultiplier: 0.50, confRequired: 70, blockAll: false },
    RISK_OFF:            { sizeMultiplier: 0.40, confRequired: 72, blockAll: false },
    MEAN_REVERSION:      { sizeMultiplier: 0.30, confRequired: 75, blockAll: false },
    PANIC:               { sizeMultiplier: 0.00, confRequired: 999, blockAll: true  },
    LIQUIDITY_SQUEEZE:   { sizeMultiplier: 0.20, confRequired: 80, blockAll: false },
};

// ─── Sector concentration limits ─────────────────────────────────────────────
const SECTOR_HARD_CAP   = 0.35; // 35% max per sector
const PORTFOLIO_HARD_CAP = 0.80; // 80% max total deployed

// ─── Daily drawdown protection ────────────────────────────────────────────────
const MAX_DAILY_DRAWDOWN = -0.08; // -8% portfolio triggers defensive mode
const ABSOLUTE_DRAWDOWN  = -0.15; // -15% triggers full halt

// ─── Max concurrent positions ─────────────────────────────────────────────────
const MAX_POSITIONS = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safeDiv(a, b) { return b > 0 ? a / b : 0; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ══════════════════════════════════════════════════════════════════════════════

class RiskEngine {

    /**
     * Primary entry point. All execution routes through here.
     *
     * @param {object} params
     *   @param {object} signal       - NormalizedSignal from SignalNormalizer
     *   @param {object} portfolio    - Current portfolio state
     *   @param {object} marketState  - globalState (regime, breadth, VIX, etc.)
     *   @param {string} feedStateStr - Current feed state ('LIVE'|'DELAYED'|'STALE'|'DISCONNECTED')
     *   @param {object} symbolState  - { price, sector, vr, feedAge, stale }
     *
     * @returns RiskDecision
     */
    evaluate({ signal, portfolio, marketState, feedStateStr, symbolState }) {
        const riskFlags = [];
        const timestamp = Date.now();

        try {
            const symbol  = signal?.symbol || symbolState?.symbol || 'UNKNOWN';
            const side    = signal?.decision === 'HOLD' ? null : 'BUY';
            const price   = symbolState?.price || 0;
            const sector  = symbolState?.sector || 'UNKNOWN';
            const vr      = symbolState?.vr ?? signal?.smartMoney?.vr ?? 1.0;
            const feedAge = symbolState?.feedAge ?? 0;
            const regime  = marketState?.regimeAI?.regime || marketState?.regime || 'SIDEWAYS';
            const conf    = signal?.confidenceScore ?? 50;

            // ── Layer 0: Feed state gate (hard rules) ────────────────────────
            const fs = feedStateStr || feedState.state;
            if (fs === 'DISCONNECTED') {
                return this._reject(symbol, 'FEED_DISCONNECTED', riskFlags, 0,
                    'Data pipeline disconnected — all execution halted');
            }
            if (fs === 'STALE' && side === 'BUY') {
                riskFlags.push('STALE_FEED');
                return this._reject(symbol, 'STALE_FEED_BLOCKS_ENTRY', riskFlags, 0,
                    'Feed stale >30s — new entries blocked until feed recovers');
            }
            if (fs === 'DELAYED') {
                riskFlags.push('DELAYED_FEED');
                // Non-blocking, but penalizes confidence (handled in normalizer)
            }

            // ── Layer 1: Global halt check ───────────────────────────────────
            if (RiskManager._globalHaltReason) {
                return this._reject(symbol, 'GLOBAL_HALT', riskFlags, 0,
                    `Trading halted globally: ${RiskManager._globalHaltReason}`);
            }

            // ── Layer 2: Regime block ─────────────────────────────────────────
            const regimeProfile = REGIME_PROFILES[regime] || REGIME_PROFILES.SIDEWAYS;
            if (regimeProfile.blockAll && side === 'BUY') {
                riskFlags.push('HOSTILE_REGIME');
                return this._reject(symbol, 'REGIME_EXECUTION_BLOCKED', riskFlags, 0,
                    `${regime} regime blocks all new entries`);
            }
            if (conf < regimeProfile.confRequired && side === 'BUY') {
                riskFlags.push('BELOW_REGIME_THRESHOLD');
                return this._reject(symbol, 'CONFIDENCE_BELOW_REGIME_THRESHOLD', riskFlags, conf,
                    `${regime} requires conf ≥${regimeProfile.confRequired}, got ${conf.toFixed(0)}`);
            }

            // ── Layer 3: Portfolio-level exposure ─────────────────────────────
            const holdings = portfolio?.holdings || {};
            const balance  = portfolio?.balance  || 0;
            const totalEquity = balance + (portfolio?.totalValue || 0);

            const positionCount = Object.keys(holdings).length;
            if (positionCount >= MAX_POSITIONS && side === 'BUY' && !opts.isReplacement) {
                riskFlags.push('MAX_POSITIONS_REACHED');
                return this._reject(symbol, 'MAX_POSITIONS_REACHED', riskFlags, 0,
                    `${positionCount} concurrent positions at limit (${MAX_POSITIONS})`);
            }

            // ── Layer 4: Portfolio-level deployment cap ───────────────────────
            const deployed = Object.values(holdings).reduce((sum, h) =>
                sum + ((h.avgPrice || 0) * (h.qty || 0)), 0);
            const deploymentRatio = safeDiv(deployed, totalEquity);
            if (deploymentRatio > PORTFOLIO_HARD_CAP && side === 'BUY') {
                riskFlags.push('PORTFOLIO_SATURATED');
                return this._reject(symbol, 'PORTFOLIO_SATURATED', riskFlags, 0,
                    `Portfolio ${(deploymentRatio * 100).toFixed(0)}% deployed — at capacity`);
            }

            // ── Layer 5: Drawdown protection ──────────────────────────────────
            const unrealizedPnL = portfolio?.unrealizedPnL || 0;
            const drawdownRatio = safeDiv(unrealizedPnL, totalEquity);
            let drawdownState = 'NORMAL';

            if (drawdownRatio <= ABSOLUTE_DRAWDOWN) {
                riskFlags.push('ABSOLUTE_DRAWDOWN');
                drawdownState = 'CRITICAL';
                return this._reject(symbol, 'ABSOLUTE_DRAWDOWN_HALT', riskFlags, 0,
                    `Portfolio down ${(drawdownRatio * 100).toFixed(1)}% — all execution halted`);
            }
            if (drawdownRatio <= MAX_DAILY_DRAWDOWN) {
                riskFlags.push('DAILY_DRAWDOWN');
                drawdownState = 'DEFENSIVE';
                if (side === 'BUY') {
                    return this._reject(symbol, 'DAILY_DRAWDOWN_BLOCKS_ENTRY', riskFlags, 0,
                        `Daily drawdown ${(drawdownRatio * 100).toFixed(1)}% — entries suspended`);
                }
            }

            // ── Layer 6: Sector concentration ────────────────────────────────
            const sectorValue = Object.entries(holdings).reduce((sum, [sym, h]) => {
                const symSector = h.sector || 'UNKNOWN';
                return symSector === sector ? sum + ((h.avgPrice || 0) * (h.qty || 0)) : sum;
            }, 0);
            const tradeValue = price * this._estimateQty(balance, conf, vr, regime);
            const projectedSectorExposure = safeDiv(sectorValue + tradeValue, totalEquity);

            if (projectedSectorExposure > SECTOR_HARD_CAP && side === 'BUY') {
                riskFlags.push('SECTOR_CONCENTRATION');
                return this._reject(symbol, 'SECTOR_CAP_EXCEEDED', riskFlags, 0,
                    `Sector ${sector} would reach ${(projectedSectorExposure * 100).toFixed(0)}% (cap: ${(SECTOR_HARD_CAP * 100).toFixed(0)}%)`);
            }

            // ── Layer 7: Liquidity-adjusted position sizing ───────────────────
            const rawQty = this._estimateQty(balance, conf, vr, regime);
            const regimeAdjustedQty = Math.floor(rawQty * regimeProfile.sizeMultiplier);

            if (regimeAdjustedQty <= 0 && side === 'BUY') {
                riskFlags.push('INSUFFICIENT_CAPITAL');
                return this._reject(symbol, 'INSUFFICIENT_CAPITAL', riskFlags, 0,
                    'Position size computed to 0 after regime and liquidity adjustment');
            }

            // ── Layer 8: Symbol-level staleness ───────────────────────────────
            if (feedAge > 30_000) {
                riskFlags.push('SYMBOL_STALE');
                if (side === 'BUY') {
                    return this._reject(symbol, 'SYMBOL_FEED_STALE', riskFlags, conf,
                        `${symbol} feed age ${Math.floor(feedAge / 1000)}s — stale data`);
                }
            }

            // ── Layer 9: Risk score computation ───────────────────────────────
            const riskScore = this._computeRiskScore({
                conf, vr, drawdownRatio, regime, feedAge, positionCount
            });

            // ── All checks passed ─────────────────────────────────────────────
            const exposureAfterTrade = safeDiv(deployed + (regimeAdjustedQty * price), totalEquity);

            console.log(`[RISK_ENGINE] ✅ APPROVED | ${symbol} | Qty: ${regimeAdjustedQty} | Risk: ${riskScore.toFixed(2)} | Regime: ${regime} | Flags: [${riskFlags.join(',')}]`);

            return {
                approved: true,
                symbol,
                adjustedQty: regimeAdjustedQty,
                riskScore: parseFloat(riskScore.toFixed(3)),
                riskFlags,
                rejectionReason: null,
                exposureAfterTrade: parseFloat(exposureAfterTrade.toFixed(4)),
                sectorExposure:    parseFloat(projectedSectorExposure.toFixed(4)),
                drawdownState,
                regime,
                regimeSizeMultiplier: regimeProfile.sizeMultiplier,
                timestamp,
            };

        } catch (err) {
            console.error(`[RISK_ENGINE] Critical evaluation failure: ${err.message}`);
            return this._reject('UNKNOWN', 'RISK_ENGINE_FAULT', [], 0,
                `RiskEngine threw: ${err.message}`);
        }
    }

    /**
     * Volatility + liquidity + regime + conviction-adjusted position sizing.
     * Does NOT use Math.random() — fully deterministic.
     */
    _estimateQty(balance, conf, vr, regime) {
        if (!balance || balance <= 0) return 0;

        // Base allocation: 3–12% of balance, modulated by confidence
        const confFactor  = clamp((conf - 35) / 65, 0, 1); // 0 at conf=35, 1 at conf=100
        const baseAlloc   = 0.03 + confFactor * 0.09;       // 3%–12%

        // Liquidity adjustment: low VR → smaller size
        const vrFactor    = clamp(vr / 1.5, 0.4, 1.0);

        // Regime adjustment applied after sizing
        const regimeProfile = REGIME_PROFILES[regime] || REGIME_PROFILES.SIDEWAYS;
        const regimeFactor  = regimeProfile.sizeMultiplier;

        const allocValue = balance * baseAlloc * vrFactor * regimeFactor;
        return Math.max(1, Math.floor(allocValue / 100)); // normalize to ~qty (price unknown here)
    }

    /**
     * Composite risk score 0–1. Higher = MORE risk.
     * Concentration directly inflates the risk score.
     */
    _computeRiskScore({ conf, vr, drawdownRatio, regime, feedAge, positionCount, projectedSectorExposure }) {
        let risk = 0.0;

        // Base risk from lack of confidence
        risk += (100 - conf) / 100 * 0.3; // max 0.3

        // Liquidity risk (low VR = higher risk)
        if (vr < 1.0) risk += 0.2;

        // Drawdown risk
        if (drawdownRatio < -0.05) risk += 0.15;
        if (drawdownRatio < -0.10) risk += 0.25;

        // Regime risk
        const regimeProfile = REGIME_PROFILES[regime] || REGIME_PROFILES.SIDEWAYS;
        risk += (1.0 - regimeProfile.sizeMultiplier) * 0.3;

        // Feed age risk
        if (feedAge > 15_000) risk += 0.15;
        if (feedAge > 30_000) risk += 0.30;

        // 🔱 CAUSALITY: Concentration → Higher Risk Score
        // The more concentrated we are, the higher the fundamental risk exposure
        if (projectedSectorExposure > 0.15) risk += (projectedSectorExposure * 1.5); // Add up to 0.45
        if (positionCount > 4) risk += 0.15;
        if (positionCount > 6) risk += 0.25;

        return clamp(risk, 0, 1);
    }

    _reject(symbol, code, riskFlags, riskScore, message) {
        console.log(`[RISK_ENGINE] ❌ REJECTED | ${symbol} | ${code} | ${message}`);
        return {
            approved: false,
            symbol,
            adjustedQty: 0,
            riskScore: parseFloat((riskScore || 0).toFixed(3)),
            riskFlags,
            rejectionReason: code,
            rejectionMessage: message,
            exposureAfterTrade: 0,
            sectorExposure: 0,
            drawdownState: 'UNKNOWN',
            timestamp: Date.now(),
        };
    }

    _globalHaltReason = null;

    /**
     * Quick check: is trading globally allowed right now?
     * Used by worker before entering signal processing.
     */
    isSystemTradeable() {
        const fs = feedState.state;
        return fs !== 'DISCONNECTED' && !this._globalHaltReason;
    }

    /**
     * Telemetry snapshot for broadcast
     */
    telemetry(portfolio) {
        const holdings = portfolio?.holdings || {};
        const balance  = portfolio?.balance || 0;
        const totalEquity = balance + (portfolio?.totalValue || 0);
        const deployed = Object.values(holdings).reduce((s, h) =>
            s + (h.avgPrice || 0) * (h.qty || 0), 0);

        return {
            positionCount:    Object.keys(holdings).length,
            maxPositions:     MAX_POSITIONS,
            deploymentRatio:  parseFloat(safeDiv(deployed, totalEquity).toFixed(3)),
            portfolioCap:     PORTFOLIO_HARD_CAP,
            feedState:        feedState.state,
            globalHalt:       this._globalHaltReason || null,
            regimeProfiles:   Object.keys(REGIME_PROFILES),
            timestamp:        Date.now(),
        };
    }

    /**
     * 🔱 [PHASE 12] ATR-BASED LEVELS
     * Standardizes SL/TP based on market volatility (1.5x/3x ATR).
     */
    calculateLevels(entryPrice, side, atr) {
        if (!atr || atr <= 0) {
            throw new Error("ATR_INVALID");
        }

        const slDistance = 1.5 * atr;
        const tpDistance = 3 * atr;

        return {
            sl: side === 'BUY' ? entryPrice - slDistance : entryPrice + slDistance,
            tp: side === 'BUY' ? entryPrice + tpDistance : entryPrice - tpDistance
        };
    }
}

module.exports = new RiskEngine();
