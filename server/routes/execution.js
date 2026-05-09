const express = require('express');
const router = express.Router();
const OrderEngine = require('../execution/orderEngine');
const PortfolioManager = require('../execution/portfolioManager');
const Persistence = require('../utils/persistence');
const { normalizeSymbol } = require('../utils/symbol');
const SignalEngine = require('../engine/signalEngine');
const rootGlobalState = require('../globalState');
const orderQueue = require('../execution/OrderQueue');
const feedState  = require('../utils/feedState');
const { predict } = require('../ml/predictor');
const { StrategyManager } = require('../intelligence/strategyManager');
const RiskEngine = require('../risk/RiskEngine');
const { getIndustry } = require('../intelligence/industryMapping');

const REASON_MAP = {
    UNKNOWN_SECTOR_BLOCK: "Sector risk restriction triggered",
    DUPLICATE_POSITION: "Already holding this asset",
    HIGH_VOLATILITY: "Market too volatile",
    LOW_CONFIDENCE: "Model confidence below threshold",
    TOO_MANY_ORDERS: "Spam protection triggered",
    SECTOR_CAP_EXCEEDED: "Maximum sector exposure reached",
    LOW_RISK_SCORE: "Inadequate risk/reward profile",
    FAIL_SAFE_BLOCK: "System integrity protect",
    LOGIC_SAFE: "Parameters within safe bounds"
};

/**
 * 🚀 Submission: Place a new order (MARKET | LIMIT)
 * [Hardened] Enforces strict Number() casting and NaN validation.
 */
router.post('/order', async (req, res) => {
    try {
        const cache = Persistence.getInstance();

        // 🛡️ [PHASE 10.7] INPUT HARDENING
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ success: false, error: "MISSING_JSON_HEADER_OR_BODY_ (Use -H 'Content-Type: application/json')" });
        }

        // 🛡️ [PHASE 15.2] STRICT SCHEMA VALIDATION
        const { symbol: rawSymbol, side, type, qty, limitPrice, manual } = req.body;
        const isManual = (manual === true || manual === 'true');

        if (isManual) console.log(`\n🚨 [MANUAL_OVERRIDE_INIT] Symbol: ${rawSymbol} | Time: ${new Date().toLocaleTimeString()}`);

        if (!rawSymbol || typeof rawSymbol !== "string") return res.status(400).json({ success: false, error: "INVALID_SYMBOL" });
        if (!["BUY", "SELL"].includes(side)) return res.status(400).json({ success: false, error: "INVALID_SIDE (Use BUY or SELL)" });
        if (!["MARKET", "LIMIT"].includes(type)) return res.status(400).json({ success: false, error: "INVALID_TYPE (Use MARKET or LIMIT)" });
        if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ success: false, error: "INVALID_QTY (Must be positive integer)" });

        // 🔱 [PHASE 10] FEED STATE GATE — enforce trading rules at API boundary
        if (!isManual) {
            const fs = feedState.state;
            if (fs === 'DISCONNECTED') {
                return res.status(503).json({ success: false, error: 'FEED_DISCONNECTED', reason: 'Data pipeline disconnected — all execution halted' });
            }
            if (fs === 'STALE' && side === 'BUY') {
                return res.status(503).json({ success: false, error: 'STALE_FEED', reason: 'Feed stale >30s — new entries blocked, exits allowed' });
            }
        }

        const symbol = rawSymbol.includes(".") ? rawSymbol.toUpperCase() : `${rawSymbol.toUpperCase()}.NS`;
        const orderData = { symbol, side, type, qty, limitPrice: Number(limitPrice || 0), manual: isManual };

        // 1. Fetch History for ML Factors (6mo range for EMA stability)
        const historyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`;
        const historyRes = await fetch(historyUrl).then(r => r.json());
        const history = [];
        if (historyRes.chart?.result?.[0]) {
            const resData = historyRes.chart.result[0];
            const timestamps = resData.timestamp || [];
            const quotes = resData.indicators.quote[0] || {};
            const volumes = quotes.volume || [];
            for (let i = 0; i < timestamps.length; i++) {
                if (quotes.close[i] !== null) {
                    history.push({
                        close: quotes.close[i],
                        high: quotes.high[i] !== null ? quotes.high[i] : quotes.close[i],
                        low: quotes.low[i] !== null ? quotes.low[i] : quotes.close[i],
                        volume: volumes[i] || 0
                    });
                }
            }
        }

        if (history.length === 0) {
            console.error(`🛡️ [EXECUTION_REJECTED] No market data for ${symbol}`);
            return res.status(404).json({ success: false, error: "SYMBOL_NOT_FOUND", reason: "Cannot fetch market data for this ticker." });
        }

        const currentVolume = history[history.length - 1]?.volume || 0;
        const avgVolume = history.slice(-20).reduce((a, b) => a + (b.volume || 0), 0) / 20;

        const portfolio = PortfolioManager.load();
        const holdings = portfolio?.holdings || {};
        const existingPosition = holdings[symbol] || holdings[symbol.replace('.NS', '')];
        
        let previousSignal = StrategyManager.getLastSignal(symbol);
        if (previousSignal === "HOLD") {
            previousSignal = StrategyManager.getLastSignal(symbol.replace('.NS', ''));
        }

        if (previousSignal === "HOLD" && existingPosition) {
            previousSignal = "BUY";
        }

        const prediction = await predict(symbol, history, { currentVolume, avgVolume }, previousSignal);

        let mlUsed = prediction.success;
        let mlConfidence = prediction.success ? prediction.confidence : 0.45;
        let signal = prediction.success ? prediction.signal : "HOLD";
        let label = prediction.success ? prediction.signal : "NEUTRAL";

        let metrics = cache.get(symbol) || { price: history[history.length - 1]?.close || 0, atr: 15 };

        if (mlUsed === false) {
            console.warn(`⚠️ [ML_ENGINE_FAILED] Symbol: ${symbol} | Falling back to strategy rules`);
        }

        // 📊 [PRODUCTION LOGGING] Structured Format
        console.log(JSON.stringify({
            type: "ML_DECISION",
            symbol,
            side,
            confidence: mlConfidence,
            signal: signal,
            timestamp: Date.now()
        }));

        if (mlConfidence < 0.35 && mlUsed) {
            console.warn(`🛡️ [ML_REJECTED] ${symbol} | Confidence: ${mlConfidence}`);
            return res.status(422).json({ success: false, error: "RISK_REJECTED", reason: `Model confidence too low (${(mlConfidence * 100).toFixed(1)}%)` });
        }

        // 🛡️ [PHASE 14] DYNAMIC RISK AUDIT
        const pState = PortfolioManager.getLiveMetrics(PortfolioManager.load(), cache);

        // 🔱 [PHASE 17 CRITICAL FIX] EXECUTION GATE = strategy ∩ risk
        const p17Signal = StrategyManager.getPhase17Signal(symbol, history, rootGlobalState, prediction);
        const strategyAllows = p17Signal.decision !== "REJECT";

        // 🎯 [P21] Inject strategy score for conviction-weighted position sizing
        const enrichedMetrics = { ...metrics, score: p17Signal.score ?? 50 };

        // 🔱 [PHASE 11 PATCH] Route through institutional RiskEngine
        const symbolState = {
            symbol: orderData.symbol,
            price: enrichedMetrics.price || 0,
            sector: p17Signal.sector || 'UNKNOWN',
            vr: enrichedMetrics.volumeRatio || 1.0,
            feedAge: enrichedMetrics.feedAge || 0,
            stale: false,
        };

        const reResult = RiskEngine.evaluate({
            signal: p17Signal,
            portfolio: pState,
            marketState: rootGlobalState,
            feedStateStr: feedState.state,
            symbolState
        });

        const riskCheck = {
            allowed: reResult.approved,
            reason: reResult.rejectionReason || 'UNKNOWN',
            meta: {
                riskScore: reResult.riskScore,
                allocatedQty: reResult.adjustedQty,
                exposure: reResult.sectorExposure,
            }
        };

        const executionAllowed = (strategyAllows && riskCheck.allowed) || isManual;
        const readableReason = isManual ? "MANUAL_OVERRIDE" : (REASON_MAP[riskCheck.reason] || riskCheck.reason || "Risk conditions not satisfied");

        const aiTrace = {
            score: p17Signal.score,
            decision: isManual ? "MANUAL_BUY" : p17Signal.decision,
            breakout: p17Signal.breakout,
            sectorFlow: p17Signal.sectorFlow,
            slippage: p17Signal.slippage,
            entryGuard: p17Signal.entryGuard,
            orderRouting: p17Signal.orderRouting,
            autoExit: p17Signal.autoExit,
            model: p17Signal.model,
            trendStrength: p17Signal.trendStrength,
            volumeProfile: p17Signal.volumeProfile,
            scorePulse: p17Signal.scorePulse,
            learningAdjustment: p17Signal.learningAdjustment,
            ml: {
                signal,
                confidence: mlConfidence,
                factors: prediction.factors,
                state: prediction.success ? prediction.state : 'UNKNOWN',
                label: p17Signal.decision,
            },
            riskStatus: (riskCheck.allowed || isManual) ? "passed" : "failed",
            riskReason: readableReason,
            finalDecision: executionAllowed ? "EXECUTED" : "REJECTED",
            risk: {
                passed: riskCheck.allowed || isManual,
                reason: readableReason,
                riskScore: riskCheck.meta?.riskScore || 0,
                checks: {
                    duplicate: isManual || riskCheck.reason !== 'DUPLICATE_POSITION',
                    confidence: isManual || riskCheck.reason !== 'WEAK_ML_CONFIDENCE',
                    volatility: isManual || riskCheck.reason !== 'HIGH_VOLATILITY',
                    exposure: isManual || !['SECTOR_CAP_EXCEEDED', 'UNKNOWN_SECTOR_BLOCK'].includes(riskCheck.reason)
                }
            },
            final: executionAllowed ? "APPROVED" : "REJECTED"
        };

        if (!executionAllowed) {
            console.log(`[RISK RESULT] → REJECTED: ${riskCheck.reason}`);
            const currentPortfolio = PortfolioManager.load();
            currentPortfolio.orders = currentPortfolio.orders || [];
            currentPortfolio.orders.push({
                id: `REJ_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                symbol: orderData.symbol,
                side: orderData.side,
                type: orderData.type,
                qty: orderData.qty,
                price: metrics.price || 0,
                status: 'REJECTED',
                reason: readableReason,
                timestamp: Date.now(),
                confidence: mlConfidence,
                score: p17Signal.score,
                intelligence: {
                    penalties: p17Signal.learningAdjustment?.penalties || [],
                    alignment: p17Signal.learningAdjustment?.alignmentFactor
                },
                riskScore: riskCheck.meta?.riskScore || 0
            });
            PortfolioManager.save(currentPortfolio);

            return res.status(400).json({
                success: false,
                error: "RISK_REJECTED",
                reason: readableReason,
                trace: aiTrace
            });
        }

        if (riskCheck.meta && riskCheck.meta.allocatedQty) {
            orderData.qty = Math.min(orderData.qty, riskCheck.meta.allocatedQty);
        }

        // 🚀 [PHASE 14] Technical & Risk Metadata Handoff
        const levels = RiskEngine.calculateLevels(metrics.price, orderData.side, metrics.atr);
        const result = OrderEngine.placeOrder({
            ...orderData,
            sl: levels.sl,
            tp: levels.tp,
            score: p17Signal.score,
            riskScore: riskCheck.meta.riskScore || 0,
            label: label,
            atr: metrics.atr,
            confidence: mlConfidence,
            intelligence: {
                penalties: p17Signal.learningAdjustment?.penalties || [],
                alignment: p17Signal.learningAdjustment?.alignmentFactor
            },
            manual: orderData.manual || false,
            sector: getIndustry(normalizeSymbol(orderData.symbol)) || null,
            queued: orderData.type === 'MARKET',
        }, cache);

        if (result.success) {
            if (orderData.type === 'MARKET') {
                const marketSymbol = orderData.symbol.split('.')[0].toUpperCase();
                const cachedEntry = cache.get(marketSymbol) || cache.get(orderData.symbol);
                const marketSignal = cachedEntry?.signal || null;

                const queueResult = orderQueue.enqueue(
                    { ...result.order, price: result.order.price },
                    marketSignal,
                    rootGlobalState
                );

                return res.json({
                    success: true,
                    orderId: queueResult.orderId,
                    state: queueResult.state,
                    order: result.order,
                    trace: aiTrace,
                    risk: {
                        signal: signal,
                        confidence: mlConfidence,
                        riskScore: riskCheck.meta.riskScore,
                        reason: riskCheck.reason,
                    },
                    executionMode: 'QUEUED',
                });
            }

            return res.json({
                success: true,
                order: result.order,
                trace: aiTrace,
                risk: {
                    signal: signal,
                    confidence: mlConfidence,
                    riskScore: riskCheck.meta.riskScore,
                    reason: riskCheck.reason,
                },
            });
        } else {
            return res.status(400).json({ success: false, error: result.error, trace: aiTrace });
        }
    } catch (err) {
        console.error("[EXECUTION API] Order Error:", err.message);
        res.status(500).json({ success: false, error: "PIPELINE_ERROR" });
    }
});

router.get('/queue', (req, res) => {
    try {
        const { orderId } = req.query;
        if (orderId) {
            const order = orderQueue.get(orderId);
            if (!order) return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND' });
            return res.json({ success: true, order });
        }
        return res.json({
            success: true,
            telemetry: orderQueue.telemetry(),
            journal: orderQueue.getJournal().slice(0, 20),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'PIPELINE_ERROR' });
    }
});

router.get('/portfolio', (req, res) => {
    try {
        const portfolio = PortfolioManager.load();
        const cache = Persistence.load();

        const enrichedHoldings = Object.entries(portfolio.holdings).map(([symbol, data]) => {
            const normalized = normalizeSymbol(symbol);
            const ticker = cache.get(symbol) || cache.get(normalized) || cache.get(normalized + ".NS");

            const currentPrice = (ticker && ticker.price) ? ticker.price : data.avgPrice;
            const unrealizedPnL = (currentPrice - data.avgPrice) * data.qty;

            return {
                symbol,
                ...data,
                currentPrice: PortfolioManager.clean(currentPrice),
                unrealizedPnL: PortfolioManager.clean(unrealizedPnL),
                percentChange: PortfolioManager.clean(((currentPrice - data.avgPrice) / data.avgPrice * 100))
            };
        });

        res.json({
            success: true,
            balance: portfolio.balance || 0,
            lockedBalance: portfolio.lockedBalance || 0,
            realizedPnL: portfolio.realizedPnL || 0,
            holdings: enrichedHoldings,
            pendingOrders: portfolio.pendingOrders || [],
            orders: (portfolio.orders || []).slice(-100)
        });
    } catch (err) {
        console.error("[EXECUTION API] Portfolio Error:", err.message);
        res.status(500).json({ success: false, error: "PIPELINE_ERROR" });
    }
});

router.post('/cancel', (req, res) => {
    try {
        const orderId = String(req.body.orderId || "");
        const result = OrderEngine.cancelOrder(orderId);

        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: result.error });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: "PIPELINE_ERROR" });
    }
});

router.all('/preview', async (req, res) => {
    try {
        const cache = Persistence.getInstance();
        let bodyToUse = { ...req.body, ...req.query };

        if (Object.keys(bodyToUse).length === 1 && Object.keys(bodyToUse)[0].includes('symbol')) {
            try { bodyToUse = { ...bodyToUse, ...JSON.parse(Object.keys(bodyToUse)[0]) }; } catch (e) { }
        }

        let { symbol: rawSymbol, side } = bodyToUse;
        side = (side || 'BUY').toUpperCase();
        const qty = Number(bodyToUse.qty) || 1;
        if (!rawSymbol) return res.status(400).json({ success: false, error: "SYMBOL_REQUIRED" });
        if (!["BUY", "SELL"].includes(side)) return res.status(400).json({ success: false, error: "INVALID_SIDE (Use BUY or SELL)" });

        const symbol = rawSymbol.includes(".") ? rawSymbol.toUpperCase() : `${rawSymbol.toUpperCase()}.NS`;

        const historyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`;
        const historyRes = await fetch(historyUrl).then(r => r.json());
        const history = [];
        if (historyRes.chart?.result?.[0]) {
            const resData = historyRes.chart.result[0];
            const timestamps = resData.timestamp || [];
            const quotes = resData.indicators.quote[0] || {};
            const volumes = quotes.volume || [];
            for (let i = 0; i < timestamps.length; i++) {
                if (quotes.close[i] !== null) {
                    history.push({
                        close: quotes.close[i],
                        high: quotes.high[i] !== null ? quotes.high[i] : quotes.close[i],
                        low: quotes.low[i] !== null ? quotes.low[i] : quotes.close[i],
                        volume: volumes[i] || 0
                    });
                }
            }
        }

        const currentVolume = history[history.length - 1]?.volume || 0;
        const avgVolume = history.slice(-20).reduce((a, b) => a + (b.volume || 0), 0) / 20;

        const portfolio = PortfolioManager.load();
        const existingPosition = portfolio.holdings[symbol] || portfolio.holdings[symbol.replace('.NS', '')];
        
        let previousSignal = StrategyManager.getLastSignal(symbol);
        if (previousSignal === "HOLD") {
            previousSignal = StrategyManager.getLastSignal(symbol.replace('.NS', ''));
        }

        if (previousSignal === "HOLD" && existingPosition) {
            previousSignal = "BUY";
        }

        const prediction = await predict(symbol, history, { currentVolume, avgVolume }, previousSignal);
        const mlConfidence = prediction.success ? prediction.confidence : 0.45;
        const signal = prediction.success ? prediction.signal : "HOLD";

        const metrics = cache.get(symbol) || { price: history[history.length - 1]?.close || 0, atr: 15 };
        const pState = PortfolioManager.getLiveMetrics(PortfolioManager.load(), cache);
        
        const p17Signal = StrategyManager.getPhase17Signal(symbol, history, rootGlobalState, prediction);
        const symbolState = {
            symbol: symbol,
            price: metrics.price || 0,
            sector: p17Signal.sector || 'UNKNOWN',
            vr: metrics.volumeRatio || 1.0,
            feedAge: metrics.feedAge || 0,
            stale: false,
        };

        const reResult = RiskEngine.evaluate({
            signal: p17Signal,
            portfolio: pState,
            marketState: rootGlobalState,
            feedStateStr: feedState.state,
            symbolState
        });

        const riskCheck = {
            allowed: reResult.approved,
            reason: reResult.rejectionReason || 'UNKNOWN',
            meta: {
                riskScore: reResult.riskScore,
                allocatedQty: reResult.adjustedQty,
                exposure: reResult.sectorExposure,
            }
        };

        const readableReason = REASON_MAP[riskCheck.reason] || riskCheck.reason || "Risk conditions not satisfied";
        const strategyAllows = p17Signal.decision !== "REJECT";
        const executionAllowed = strategyAllows && riskCheck.allowed;

        const aiTrace = {
            ...p17Signal,
            ml: {
                signal: side,
                confidence: mlConfidence,
                factors: prediction.factors,
                state: prediction.success ? prediction.state : 'UNKNOWN',
                label: p17Signal.decision,
            },
            decision: p17Signal.decision,
            riskStatus: riskCheck.allowed ? "passed" : "failed",
            riskReason: readableReason,
            finalDecision: executionAllowed ? "APPROVED" : "REJECTED",
            risk: {
                passed: riskCheck.allowed,
                reason: readableReason,
                riskScore: riskCheck.meta?.riskScore || 0,
                checks: {
                    duplicate: riskCheck.reason !== 'DUPLICATE_POSITION',
                    confidence: riskCheck.reason !== 'WEAK_ML_CONFIDENCE',
                    volatility: riskCheck.reason !== 'HIGH_VOLATILITY',
                    exposure: !['SECTOR_CAP_EXCEEDED', 'UNKNOWN_SECTOR_BLOCK'].includes(riskCheck.reason)
                }
            },
            final: executionAllowed ? "APPROVED" : "REJECTED"
        };

        res.json({ success: true, riskCheck, confidence: mlConfidence, allocatedQty: riskCheck.meta?.allocatedQty || 0, trace: aiTrace });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
