const config = require('./config');
const validator = require('./signalValidator');
const sizer = require('./sizingEngine');
const portfolioManager = require('../execution/portfolioManager');
const positionManager = require('./positionManager');
// Legacy riskManager removed
const tradeMemory = require('./tradeMemory');
const shadowPortfolio  = require('../intelligence/shadowPortfolioEngine');
const tradeReplay      = require('../intelligence/tradeReplayEngine');
const telemetry = require('./telemetry');
const { ledger, EVENT_TYPES } = require('./executionLedger');

function safeFixed(val, digits = 2) {
    return typeof val === 'number' ? val.toFixed(digits) : '0.00';
}

/**
 * 🛰️ [PHASE 10.3] PRIORITY EXECUTION ENGINE
 * Features:
 * - Score-based replacement of weak positions
 * - In-cycle replacement cap to prevent churn
 * - Atomic liquidation-to-entry transitions
 */
class ExecutionEngine {
    constructor() {
        this.logs = [];
        this.executionStats = { executed: [], closed: [] };
        this.replacementsThisCycle = 0;
        this.lastCycleReset = 0;
    }

    /**
     * 🚀 Master Cycle Tick
     */
    async tick(symbol, signal, currentPrice, balance, marketCache, pState) {
        if (!symbol || !signal || !currentPrice) return this.report();

        // 🧠 Verify and calculate confidence (from score / 100 if undefined or 0)
        if (!signal.confidence || signal.confidence === 0) {
            if (signal.score) {
                signal.confidence = signal.score / 100;
            } else {
                signal.confidence = 0.50; // Fallback
            }
        }

        // 🔱 [PHASE 11 PATCH] DETERMINISTIC EXECUTION CONDITIONS
        // Replaces Math.random() chaos injection with feed-state and queue-pressure gating.
        const feedState = require('../utils/feedState');
        const orderQueue = require('../execution/OrderQueue');
        const feedAge = Date.now() - (feedState._lastLiveAt || Date.now());
        const queueDepth = orderQueue.queueDepth || 0;

        if (feedState.state === 'DISCONNECTED') {
            telemetry.traceReject(symbol, 'FEED_DISCONNECTED');
            this.log(symbol, 'SKIPPED', currentPrice, 'Feed disconnected — execution halted', signal.confidence);
            return this.report();
        }
        if (feedState.state === 'STALE' || feedAge > 45_000) {
            telemetry.traceReject(symbol, 'STALE_FEED');
            this.log(symbol, 'SKIPPED', currentPrice, 'Feed stale — exit tick skipped', signal.confidence);
            return this.report();
        }
        if (feedState.state === 'DELAYED' || queueDepth > 15) {
            telemetry.traceReject(symbol, 'DEGRADED_LIQUIDITY_MODE');
            this.log(symbol, 'DELAYED', currentPrice, 'Queue elevated — adding routing delay', signal.confidence);
            const routingDelay = Math.min(1200, 300 + queueDepth * 40); // deterministic from queue depth
            await new Promise(r => setTimeout(r, routingDelay));
        }

        // 🛡️ [CRITICAL] 1. Extract and Verify ATR availability strictly
        const resolvedAtr = signal.indicators?.atr || signal.atr || 0;
        if (!resolvedAtr || resolvedAtr === 0) {
            telemetry.traceReject(symbol, 'ATR_NOT_READY');
            this.log(symbol, 'REJECTED', currentPrice, 'ATR_NOT_READY', signal.confidence);
            return this.report();
        }
        signal.atr = resolvedAtr;


        // 🛡️ [PHASE 10.3] Cycle Reset Logic (Synchronized with worker cycles)
        const now = Date.now();
        if (now - this.lastCycleReset > 5000) { 
            this.replacementsThisCycle = 0;
            this.lastCycleReset = now;
        }

        // 🔱 [PHASE 19] REGIME EXECUTION GUARD (Evaluated universally)
        const rootGlobalState = require('../globalState');
        const regimeAI = rootGlobalState.regimeAI;
        if (regimeAI) {
            const isEntryRestricted = !regimeAI.allowAggressiveEntries && signal.decision !== 'STRONG_BUY' && signal.decision !== 'BUY';
            if (isEntryRestricted) {
                if (!positionManager.get(symbol)) {
                    telemetry.traceReject(symbol, `REGIME_RESTRICTED_${regimeAI.regime}`);
                    console.log(`[REGIME_EXECUTION] ${symbol} | Allowed:false | Regime:${regimeAI.regime}`);
                    this.log(symbol, 'SKIPPED', currentPrice, `REGIME_RESTRICTED (${regimeAI.regime})`, signal.confidence);
                    return this.report();
                }
            } else if (signal.decision === 'STRONG_BUY' || signal.decision === 'BUY') {
                console.log(`[REGIME_EXECUTION] ${symbol} | Allowed:true | Regime:${regimeAI.regime}`);
            }
        }

        const pos = positionManager.get(symbol);

        // 🛡️ [STEP 1] ACTIVE POSITION MAINTENANCE
        if (pos) {
            positionManager.updateMetrics(symbol, currentPrice); // 🚀 [PHASE 24] MFE/MAE Lifecycle Tracking
            const indicators = signal.indicators || {};
            let shouldExit = false;
            let exitReason = null;
            if (pos.sl && currentPrice <= pos.sl) { shouldExit = true; exitReason = 'STOP_LOSS'; }
            else if (pos.tp && currentPrice >= pos.tp) { shouldExit = true; exitReason = 'TAKE_PROFIT'; }

            if (shouldExit) {
                return await this.liquidate(symbol, pos, currentPrice, exitReason);
            }
            return this.report(); 
        }

        // 🛡️ [STEP 2] NEW ENTRY VALIDATION
        const validation = validator.validate(symbol, signal);
        if (!validation.valid) {
            if (validation.reason !== 'IDLE') {
                telemetry.traceReject(symbol, validation.reason);
                this.log(symbol, 'SKIPPED', currentPrice, validation.reason, signal.confidence);
                ledger.appendEvent({
                    traceId: signal.traceId,
                    causationId: signal.causationId,
                    eventType: EVENT_TYPES.EXECUTION_SKIPPED,
                    symbol,
                    payload: { reason: validation.reason, price: currentPrice }
                });
            }
            return this.report();
        }

        // 🛡️ [STEP 2.5] PORTFOLIO CONSTRAINTS & REPLACEMENT LOGIC
        const allPositions = positionManager.all();
        const activeCount = Object.keys(allPositions).length;
        
        let isReplacement = false;
        let weakest = null;
        let normalizedWeakScore = 0;
        let canReplace = false;

        if (activeCount >= config.MAX_POSITIONS) {
            weakest = this._getWeakestPosition(allPositions);
            const newScore = signal.score || (signal.confidence * 100);
            let weakScore = weakest ? (weakest.confidence || 0) : 0;
            normalizedWeakScore = weakScore > 1 ? weakScore : weakScore * 100;

            console.log("[REPLACE_DEBUG]", {
                old: normalizedWeakScore,
                new: newScore
            });

            canReplace = weakest && 
                         newScore > (normalizedWeakScore + config.REPLACEMENT_SCORE_THRESHOLD) &&
                         this.replacementsThisCycle < config.MAX_REPLACEMENTS_PER_CYCLE &&
                         weakest.symbol !== symbol; // Duplicate guard

            if (!canReplace) {
                this.log(symbol, 'REJECTED', currentPrice, 'MAX_POSITIONS_REACHED', signal.confidence);
                ledger.appendEvent({
                    traceId: signal.traceId,
                    causationId: signal.causationId, // Use signal causation ID here
                    eventType: EVENT_TYPES.EXECUTION_SKIPPED,
                    symbol,
                    payload: { reason: 'MAX_POSITIONS_REACHED' }
                });
                return this.report();
            }
            isReplacement = true;
        }

        // 🔱 [PHASE 11 FIX] Route through institutional RiskEngine
        const RiskEngine = require('../risk/RiskEngine');

        const symbolState = {
            symbol: symbol,
            price: currentPrice || 0,
            sector: signal.sector || 'UNKNOWN',
            vr: signal.volumeRatio || signal.smartMoney?.vr || 1.0,
            feedAge: Date.now() - (feedState._lastLiveAt || Date.now()),
            stale: feedState.state === 'STALE',
        };

        const reResult = RiskEngine.evaluate({
            signal: signal,
            portfolio: pState,
            marketState: {
                regimeAI: regimeAI,
                vix: 15 // Fallback if missing
            },
            feedStateStr: feedState.state,
            symbolState,
            isReplacement
        });

        if (!reResult.approved) {
            telemetry.traceReject(symbol, reResult.rejectionReason);
            this.log(symbol, 'RISK_REJECTED', currentPrice, reResult.rejectionReason, signal.confidence);
            ledger.appendEvent({
                traceId: signal.traceId,
                causationId: signal.causationId,
                eventType: EVENT_TYPES.RISK_REJECTED,
                symbol,
                payload: { reason: reResult.rejectionReason, mode: 'NORMAL' }
            });
            return this.report();
        }

        const riskEventId = ledger.appendEvent({
            traceId: signal.traceId,
            causationId: signal.causationId,
            eventType: EVENT_TYPES.RISK_APPROVED,
            symbol,
            payload: { mode: 'NORMAL', score: signal.score }
        });

        // If replacement was approved, liquidate the weakest now
        if (canReplace) {
            this.replacementsThisCycle++;
            const reason = `REPLACEMENT_EXIT (Weak Score: ${safeFixed(normalizedWeakScore, 0)} vs New: ${safeFixed(signal.score || signal.confidence*100, 0)})`;
            
            console.log(`🔁 REPLACEMENT: ${weakest.symbol} (Score: ${safeFixed(normalizedWeakScore, 0)}) → ${symbol} (Score: ${safeFixed(signal.score || signal.confidence*100, 0)})`);

            const weakestPrice = marketCache.get(weakest.symbol)?.price || weakest.pos.entryPrice;
            await this.liquidate(weakest.symbol, weakest.pos, weakestPrice, reason);
        }

        // 🛡️ [STEP 4] DYNAMIC VOLATILITY-ADJUSTED SIZING
        let finalQty = reResult.adjustedQty;
        if (finalQty <= 0) {
            this.log(symbol, 'REJECTED', currentPrice, 'INSUFFICIENT_CALCULATED_QTY', signal.confidence);
            ledger.appendEvent({
                traceId: signal.traceId,
                causationId: riskEventId,
                eventType: EVENT_TYPES.EXECUTION_SKIPPED,
                symbol,
                payload: { reason: 'INSUFFICIENT_CALCULATED_QTY' }
            });
            return this.report();
        }

        console.log(`\n⚖️ [DECISION_MATRIX]`);
        console.log(`MODE:       NORMAL`);
        console.log(`SYMBOL:     ${symbol}`);
        console.log(`CONFIDENCE: ${safeFixed(signal.confidence, 4)}`);
        console.log(`DECISION:   EXECUTED`);
        console.log(`QTY:        ${finalQty} (Scale: ${reResult.regimeSizeMultiplier}x)\n`);

        this._toFile(`✅ [EXECUTION_READY] ${symbol} | Mode:NORMAL | Qty:${finalQty} | Conf:${safeFixed(signal.confidence, 4)}`);

        if (finalQty <= 0) {
            this.log(symbol, 'REJECTED', currentPrice, 'SIZE_TOO_SMALL_AFTER_SCALING', signal.confidence);
            ledger.appendEvent({
                traceId: signal.traceId,
                causationId: riskEventId,
                eventType: EVENT_TYPES.EXECUTION_SKIPPED,
                symbol,
                payload: { reason: 'SIZE_TOO_SMALL_AFTER_SCALING' }
            });
            return this.report();
        }

        const allocEventId = ledger.appendEvent({
            traceId: signal.traceId,
            causationId: riskEventId,
            eventType: EVENT_TYPES.ALLOCATION_CREATED,
            symbol,
            payload: { qty: finalQty, capitalAllocated: finalQty * currentPrice }
        });

        // Register execution to prevent duplicates/spam
        // riskManager.recordExecution(symbol, audit.meta?.idempotencyKey); // 🔱 Removed: Handled by Portfolio/Position manager now

        // 🛡️ [STEP 5] RISK LEVEL GENERATION (SL/TP) — ATR-based 1.5x/3x
        const { sl, tp } = RiskEngine.calculateLevels(currentPrice, 'BUY', signal.atr);

        const reqEventId = ledger.appendEvent({
            traceId: signal.traceId,
            causationId: allocEventId,
            eventType: EVENT_TYPES.EXECUTION_REQUESTED,
            symbol,
            payload: { qty: finalQty, price: currentPrice }
        });

        // 🔱 [PHASE 11 PATCH] DETERMINISTIC LATENCY + PARTIAL FILL
        // Latency derived from queue depth (real pressure). No Math.random().
        const _qd = (require('../execution/OrderQueue').queueDepth || 0);
        const latency = Math.min(200, 12 + _qd * 8); // 12ms baseline + 8ms per queued order
        await new Promise(resolve => setTimeout(resolve, latency));

        // Partial fill: triggered deterministically when volume ratio < 0.8
        // (low-liquidity condition derived from signal data, not random probability)
        const signalVR = signal.smartMoney?.vr ?? signal.volumeRatio ?? 1.0;
        let executedQty = finalQty;
        let isPartial = false;
        if (signalVR < 0.80 && finalQty > 1) {
            // Fill proportion scales with volume ratio (0.3 VR → 30% fill, 0.79 VR → 79% fill)
            const fillRatio = Math.min(0.90, Math.max(0.30, signalVR));
            executedQty = Math.max(1, Math.floor(finalQty * fillRatio));
            isPartial = true;
            this.log(symbol, 'PARTIAL_FILL', currentPrice, `Low VR (${signalVR.toFixed(2)}) partial fill (${executedQty}/${finalQty})`, signal.confidence ?? 0);
        }

        // Write-Ahead Event before state mutation
        ledger.appendEventSync({
            traceId: signal.traceId,
            causationId: reqEventId,
            eventType: EVENT_TYPES.SIM_FILL_RECEIVED,
            symbol,
            payload: {
                executedQty,
                requestedQty: finalQty,
                fillPrice: currentPrice,
                isPartial
            }
        });

        const regime = require('../globalState').regimeAI?.regime || 'UNKNOWN';
        // 🔱 [RESEARCH] Build research context for immutable trade tags
        const researchContext = {
            regime,
            sector:                  signal.sector                        || null,
            score:                   signal.score                         || (signal.confidence * 100),
            breakoutType:            signal.breakoutType                  || null,
            momentum:                signal.indicators?.momentum          || null,
            atr:                     signal.indicators?.atr               || signal.atr || null,
            breadthState:            signal.breadthState                  || null,
            signalType:              signal.decision                      || null,
            entrySpreadPct:          signal.entrySpreadPct                || null,
            slippageEstimate:        signal.slippageEstimate              || null,
            smartMoneyClassification: signal.smartMoneyClassification     || null,
            executionLatencyMs:      signal.executionLatencyMs            || null,
            riskRewardRatio:         signal.riskRewardRatio               || null
        };

        positionManager.open(symbol, currentPrice, executedQty, signal.confidence, signal.indicators || {}, sl, tp, signal.strategy_label);
        portfolioManager.buy(symbol, currentPrice, executedQty, researchContext);
        
        // 🛡️ [PHASE 24] Shadow Portfolio Simulation
        shadowPortfolio.simulateEntry(symbol, currentPrice, signal.confidence, signal.sector || 'UNKNOWN');
        
        // 🔱 [PHASE 25] Trade Replay Engine
        tradeReplay.capture(symbol, signal, currentPrice, executedQty, regime, { isPartial, requestedQty: finalQty });

        telemetry.traceEntry(symbol, currentPrice, executedQty, signal.score ?? (signal.confidence * 100), regime, signal.tradeGrade, signal.confidenceScore);
        this.executionStats.executed.push(symbol);
        
        if (!isPartial) {
            this.log(symbol, 'BUY_EXECUTED', currentPrice, `ENTRY: SL@${safeFixed(sl, 2)} TP@${safeFixed(tp, 2)}`, signal.confidence ?? 0);
        }

        return this.report();
    }

    /**
     * 🔱 [PHASE 19] IDEMPOTENT ATOMIC LIQUIDATION
     * Safe to call multiple times — each store is cleaned independently.
     * Eliminates STATE_SYNC_BLOCKED from stale maintenance retries.
     */
    async liquidate(symbol, pos, exitPrice, reason) {
        const portfolioState = portfolioManager.load();
        const hasPortfolioHolding = !!portfolioState.holdings[symbol];
        const hasPosition = !!positionManager.get(symbol);

        // If BOTH are already gone, this was already liquidated. Silent no-op.
        if (!hasPortfolioHolding && !hasPosition) {
            console.log(`[LIQUIDATE_SKIP] ${symbol} already fully liquidated \u2014 skipping duplicate call`);
            return;
        }

        // Guard: use live position data if pos.entryPrice is missing
        const livePos = positionManager.get(symbol);
        const resolvedPos = (pos?.entryPrice) ? pos : (livePos || pos || {});
        const entryPrice = resolvedPos.entryPrice || exitPrice; // fallback to breakeven
        const pnlPercent = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;

        const mfe = resolvedPos.mfe || 0;
        const mae = resolvedPos.mae || 0;

        if (hasPosition) {
            tradeMemory.record(symbol, pnlPercent, resolvedPos.strategyLabel);
            positionManager.close(symbol);
        }
        if (hasPortfolioHolding) {
            portfolioManager.liquidate(symbol, exitPrice, { mfe, mae });
            // 🛡️ [PHASE 24] Shadow Portfolio Simulation
            shadowPortfolio.simulateExit(symbol, exitPrice);
        }

        telemetry.traceExit(symbol, resolvedPos.entryPrice, exitPrice, pnlPercent, reason);
        this.executionStats.closed.push(symbol);
        this.log(symbol, 'EXIT_EXECUTED', exitPrice, reason, resolvedPos.confidence, pnlPercent);

        return this.report();
    }

    _getWeakestPosition(positions) {
        let minScore = Infinity;
        let weakest = null;

        for (const [symbol, pos] of Object.entries(positions)) {
            const score = pos.confidence || 0;
            if (score < minScore) {
                minScore = score;
                weakest = { symbol, pos, confidence: score };
            }
        }
        return weakest;
    }

    log(symbol, action, price, reason, confidence, pnl = null) {
        const entry = {
            time: new Date().toISOString(),
            symbol,
            action,
            price,
            reason,
            confidence,
            pnl: pnl !== null ? `${safeFixed(pnl, 2)}%` : null
        };
        this.logs.push(entry);
        const logMsg = `🚀 [EXECUTION] ${JSON.stringify(entry)}`;
        console.log(logMsg);
        this._toFile(logMsg);
    }

    _toFile(msg) {
        try {
            const logPath = require('path').join(__dirname, '../../prometheus.log');
            require('fs').appendFileSync(logPath, msg + '\n');
        } catch (e) {
            // Silently fail if log cannot be written (no-op)
        }
    }

    report() {
        return {
            positions: positionManager.all(),
            executed: this.executionStats.executed,
            closed: this.executionStats.closed,
            logs: this.logs
        };
    }
}

module.exports = new ExecutionEngine();
