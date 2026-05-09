/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11] PROMETHEUS INSTITUTIONAL ORDER QUEUE v2.0
 * ══════════════════════════════════════════════════════════════
 *
 * Phase 11 upgrades:
 * - Queue saturation dynamics (depth → latency/slippage/rejection)
 * - Market-pressure rejection model (no clock modulo)
 * - Execution congestion telemetry
 * - FailureSimulator integration
 * - ExecutionJournal integration
 * - TelemetryEngine integration
 */

'use strict';

const ExecJournal      = require('../persistence/ExecutionJournal');
const TelemetryEngine  = require('../telemetry/TelemetryEngine');
const { isActive, getInjection } = require('../testing/FailureSimulator');

// ─── Throughput cap model ─────────────────────────────────────────────────────
// Max orders/minute capacity as a function of volatility
function computeThroughputCap(volatilityScore) {
    // Normal: 10 orders/min capacity. High vol: throttle to 4/min.
    const volFactor = Math.max(0.3, 1 - (volatilityScore / 100) * 0.7);
    return Math.max(1, Math.round(10 * volFactor));
}

// ─── Queue pressure model ─────────────────────────────────────────────────────
// Returns congestion state + pressure multiplier (>1 = worse execution)
function computeQueuePressure(queueDepth, throughputCap) {
    const utilization = Math.min(2, queueDepth / Math.max(1, throughputCap));
    const label = utilization > 1.5 ? 'SATURATED'
        : utilization > 1.0 ? 'ELEVATED'
        : utilization > 0.5 ? 'MODERATE'
        : 'CLEAR';

    // Pressure multiplier: 1.0 at CLEAR, up to 2.5 at SATURATED
    const pressure = 1.0 + Math.min(1.5, utilization * 0.8);

    return { label, utilization: parseFloat(utilization.toFixed(2)), pressure };
}

// ─── Execution latency model (deterministic) ──────────────────────────────────
// No Math.random(). Jitter comes from natural timestamp variation.
function computeExecutionLatency(volatilityScore, vr, regime, queuePressure) {
    let base = 80;
    const volAdder    = Math.min(200, volatilityScore * 2.5);
    const liqPenalty  = vr < 0.5 ? 150 : vr < 0.8 ? 80 : 0;
    const regimePenalty = ['VOLATILE', 'PANIC', 'RISK_OFF'].includes(regime) ? 120 : 0;
    const congestionAdder = (queuePressure.pressure - 1.0) * 150;

    // Deterministic micro-jitter: timestamp mod gives natural variation
    const microJitter = (Date.now() % 89); // 0–88ms, changes naturally

    return Math.min(600, Math.round(base + volAdder + liqPenalty + regimePenalty + congestionAdder + microJitter));
}

// ─── Slippage model ───────────────────────────────────────────────────────────
function applySlippage(price, side, volatilityScore, vr, queuePressure) {
    const volFactor     = Math.max(0.0005, volatilityScore / 20_000);
    const spreadFactor  = 0.0015;
    const liqPenalty    = vr < 0.5 ? 2.5 : vr < 0.8 ? 1.5 : 1.0;
    const congestionFactor = queuePressure.pressure; // wider spread when congested

    const slippagePct = volFactor * spreadFactor * liqPenalty * congestionFactor;
    const adjustment  = side === 'BUY' ? (1 + slippagePct) : (1 - slippagePct);
    return parseFloat((price * adjustment).toFixed(2));
}

// ─── Partial fill model ───────────────────────────────────────────────────────
function computeFillProfile(requestedQty, vr, volatilityScore, queuePressure) {
    // Full fill: good liquidity, non-volatile, no congestion
    if (vr >= 0.9 && volatilityScore < 55 && queuePressure.label === 'CLEAR') {
        return { partial: false, filledQty: requestedQty, reason: null };
    }

    // Fill ratio degrades with: low VR + high vol + saturation
    const liquidityFactor = Math.max(0.5, Math.min(1.0, vr));
    const volFactor       = Math.max(0.6, 1 - (volatilityScore / 200));
    const congFactor      = Math.max(0.5, 1 / queuePressure.pressure);

    const fillRatio = liquidityFactor * volFactor * congFactor;
    const filledQty = Math.max(1, Math.floor(requestedQty * fillRatio));
    const reason    = vr < 0.5 ? 'INSUFFICIENT_LIQUIDITY'
        : queuePressure.label === 'SATURATED' ? 'QUEUE_FRAGMENTATION'
        : 'HIGH_VOLATILITY_FILL';

    return { partial: filledQty < requestedQty, filledQty, reason };
}

// ─── Market-pressure rejection model ─────────────────────────────────────────
// Replaces clock-based rejection (no % prime, no Math.random())
// Score is purely derived from market conditions + queue state + risk.
function evaluateRejectionRisk(signal, regime, vr, volatilityScore, queuePressure, feedAge) {
    let rejectionScore = 0;

    // Spread widening penalty (simulated via volatility proxy)
    const spreadPenalty = Math.max(0, (volatilityScore - 50) / 50); // 0–1
    rejectionScore += spreadPenalty * 25;

    // Volatility spike penalty
    const volPenalty = volatilityScore > 70 ? (volatilityScore - 70) / 30 : 0; // 0–1
    rejectionScore += volPenalty * 20;

    // Queue overload penalty
    const queuePenalty = Math.max(0, queuePressure.utilization - 1.0); // 0–1
    rejectionScore += queuePenalty * 30;

    // Liquidity stress penalty
    const liqPenalty = vr < 0.5 ? (0.5 - vr) / 0.5 : 0; // 0–1
    rejectionScore += liqPenalty * 20;

    // Stale market conditions penalty
    const stalePenalty = feedAge > 30_000 ? Math.min(1, (feedAge - 30_000) / 30_000) : 0;
    rejectionScore += stalePenalty * 15;

    // Hostile regime penalty
    const hostileRegimes = ['PANIC', 'MEAN_REVERSION', 'RISK_OFF', 'VOLATILE'];
    if (hostileRegimes.includes(regime)) rejectionScore += 15;

    // Low edge penalty
    const edgePenalty = (signal.confidenceScore ?? 50) < 40 ? 10 : 0;
    rejectionScore += edgePenalty;

    // Threshold: rejection fires at score > 70
    const REJECTION_THRESHOLD = 70;
    if (rejectionScore > REJECTION_THRESHOLD) {
        const reason = queuePenalty > 0.5 ? 'QUEUE_OVERLOAD_REJECTION'
            : stalePenalty > 0.5 ? 'STALE_MARKET_REJECTION'
            : liqPenalty > 0.5   ? 'LIQUIDITY_EXHAUSTED'
            : volPenalty > 0.5   ? 'VOLATILITY_SPIKE_REJECTION'
            : 'MARKET_PRESSURE_REJECTION';
        return { shouldReject: true, reason, rejectionScore };
    }

    return { shouldReject: false, reason: null, rejectionScore };
}

// ══════════════════════════════════════════════════════════════════════════════

class OrderQueue {
    constructor() {
        this._queue        = new Map();  // orderId → OrderRecord
        this._cooldowns    = new Map();  // symbol → lastExecMs
        this._COOLDOWN_MS  = 5_000;
        this._broadcastFn  = null;

        // Phase 11: queue saturation state
        this._queueDepth        = 0;
        this._avgQueueWaitMs    = 0;
        this._waitSamples       = [];
        this._fillsThisMinute   = [];

        // Prune terminal orders every 30min
        setInterval(() => this.prune(3_600_000), 30 * 60_000);
    }

    setBroadcast(fn) { this._broadcastFn = fn; }

    get queueDepth() {
        return Array.from(this._queue.values())
            .filter(o => !['FILLED', 'REJECTED'].includes(o.state)).length;
    }

    /**
     * Submit an order. Returns PENDING acknowledgement immediately.
     * Phase 11: considers queue saturation for latency and fill profile.
     */
    enqueue(order, marketSignal, globalState) {
        const orderId = order.id || `OQ_${Date.now()}_${order.symbol.slice(0, 4)}`;

        // ── Cooldown ──────────────────────────────────────────────────────────
        const lastExec = this._cooldowns.get(order.symbol) || 0;
        if (Date.now() - lastExec < this._COOLDOWN_MS && !order.manual) {
            return { success: false, orderId: null, state: 'REJECTED',
                reason: 'COOLDOWN_ACTIVE', cooldownRemainingMs: this._COOLDOWN_MS - (Date.now() - lastExec) };
        }

        // ── FailureSimulator: execution timeout injection ──────────────────
        const execTimeout = isActive('EXECUTION_TIMEOUT') ? getInjection('EXECUTION_TIMEOUT') : null;
        const volOverride = isActive('HIGH_VOLATILITY') ? (getInjection('HIGH_VOLATILITY')?.volOverride ?? null) : null;
        const vrOverride  = isActive('LIQUIDITY_COLLAPSE') ? (getInjection('LIQUIDITY_COLLAPSE')?.vrOverride ?? null) : null;

        const record = {
            orderId,
            symbol:      order.symbol,
            side:        order.side,
            type:        order.type,
            qty:         order.qty,
            requestedQty: order.qty,
            price:       order.price || 0,
            fillPrice:   null,
            filledQty:   null,
            state:       'PENDING',
            submittedAt: Date.now(),
            validatedAt: null,
            routedAt:    null,
            filledAt:    null,
            regime:      globalState?.regimeAI?.regime || 'SIDEWAYS',
            volatilityScore: volOverride ?? (marketSignal?.volatilityScore ?? 50),
            vr:          vrOverride  ?? (marketSignal?.smartMoney?.vr ?? 1.0),
            slippage:    null,
            rejectionReason: null,
            partial:     false,
            metadata: {
                score:      marketSignal?.confidenceScore ?? 0,
                grade:      marketSignal?.confidenceGrade ?? 'D',
                conviction: marketSignal?.conviction ?? 'LOW',
                rarity:     marketSignal?.rarity?.label ?? 'LOW_CONVICTION',
            },
        };

        this._queue.set(orderId, record);
        this._emit('ORDER_QUEUE_UPDATE', { orderId, state: 'PENDING', record });

        // Open journal entry
        ExecJournal.open(orderId, {
            symbol:           order.symbol,
            side:             order.side,
            qty:              order.qty,
            requestedPrice:   order.price,
            estimatedSlippage: marketSignal?.slippage?.pct || 0,
            regime:           record.regime,
            feedState:        globalState?.feedState || 'LIVE',
            riskScore:        marketSignal?.riskScore || 0,
            metadata:         record.metadata,
        });

        // Start async state machine (non-blocking)
        this._progressOrder(orderId, marketSignal, globalState, execTimeout);

        return { success: true, orderId, state: 'PENDING' };
    }

    async _progressOrder(orderId, marketSignal, globalState, execTimeout) {
        const record = this._queue.get(orderId);
        if (!record) return;

        const regime     = record.regime;
        const vr         = record.vr;
        const volScore   = record.volatilityScore;
        const feedAge    = marketSignal?.feedAge ?? 0;

        // ── Current queue pressure ────────────────────────────────────────────
        let syntheticDepth = 0;
        if (isActive('QUEUE_SATURATION')) {
            syntheticDepth = getInjection('QUEUE_SATURATION')?.syntheticDepth || 0;
        }
        const currentDepth = this.queueDepth + syntheticDepth;
        const throughputCap = computeThroughputCap(volScore);
        const queuePressure = computeQueuePressure(currentDepth, throughputCap);

        // ── Phase 1: VALIDATING ───────────────────────────────────────────────
        await this._delay(100 + volScore * 0.6);
        this._transition(orderId, 'VALIDATING', { queuePressure: queuePressure.label });
        ExecJournal.transition(orderId, 'VALIDATING');

        // ── Phase 2: ROUTING latency ──────────────────────────────────────────
        let routingLatency = computeExecutionLatency(volScore, vr, regime, queuePressure);
        if (execTimeout) routingLatency += execTimeout.extraDelayMs;
        await this._delay(routingLatency);
        this._transition(orderId, 'ROUTING', { routingLatencyMs: routingLatency });
        ExecJournal.transition(orderId, 'ROUTING', { routingLatencyMs: routingLatency });

        // ── Phase 3: Market-pressure rejection check ─────────────────────────
        const rejection = evaluateRejectionRisk(
            marketSignal || {}, regime, vr, volScore, queuePressure, feedAge
        );
        if (rejection.shouldReject) {
            this._reject(orderId, rejection.reason, rejection.rejectionScore);
            ExecJournal.close(orderId, 'REJECTED', { rejectionReason: rejection.reason });
            TelemetryEngine.recordRejection(rejection.reason);
            return;
        }

        // ── Phase 4: Fill profile ─────────────────────────────────────────────
        const marketPrice  = record.price;
        const fillPrice    = applySlippage(marketPrice, record.side, volScore, vr, queuePressure);
        const fillProfile  = computeFillProfile(record.requestedQty, vr, volScore, queuePressure);

        const slippage = {
            pct: parseFloat(((Math.abs(fillPrice - marketPrice) / (marketPrice || 1)) * 100).toFixed(4)),
            rs:  parseFloat(Math.abs(fillPrice - marketPrice).toFixed(2)),
        };

        // ── Phase 5: Partial fill ─────────────────────────────────────────────
        if (fillProfile.partial) {
            this._transition(orderId, 'PARTIAL_FILL', {
                filledQty: fillProfile.filledQty, fillPrice, partial: true, slippage
            });
            ExecJournal.transition(orderId, 'PARTIAL_FILL', { filledQty: fillProfile.filledQty });
            await this._delay(150);
        }

        // ── Phase 6: FILLED ───────────────────────────────────────────────────
        const totalLatencyMs = Date.now() - record.submittedAt;
        this._fill(orderId, fillPrice, fillProfile.filledQty, slippage, totalLatencyMs);

        ExecJournal.close(orderId, fillProfile.partial ? 'PARTIAL' : 'FILLED', {
            fillPrice,
            filledQty:     fillProfile.filledQty,
            actualSlippage: slippage.pct,
            latencyMs:     totalLatencyMs,
            queueWaitMs:   routingLatency,
        });

        TelemetryEngine.recordFill(totalLatencyMs, fillProfile.partial);
        this._recordWaitSample(totalLatencyMs);
        this._cooldowns.set(record.symbol, Date.now());
    }

    _transition(orderId, newState, extra = {}) {
        const record = this._queue.get(orderId);
        if (!record || ['FILLED', 'REJECTED'].includes(record.state)) return;

        const now = Date.now();
        record.state = newState;
        if (newState === 'VALIDATING') record.validatedAt = now;
        if (newState === 'ROUTING')    record.routedAt    = now;
        Object.assign(record, extra);

        this._emit('ORDER_QUEUE_UPDATE', {
            orderId, state: newState,
            latencyMs: now - record.submittedAt,
            queueDepth: this.queueDepth,
            record: this._sanitize(record),
        });

        // Update telemetry
        TelemetryEngine.updateSystemState({ queueDepth: this.queueDepth });
    }

    _fill(orderId, fillPrice, filledQty, slippage, latencyMs) {
        const record = this._queue.get(orderId);
        if (!record) return;

        const now = Date.now();
        Object.assign(record, {
            state: 'FILLED', fillPrice, filledQty,
            filledAt: now, slippage,
        });

        console.log(`[ORDER_QUEUE] ✅ FILLED | ${record.symbol} ${record.side} | Qty:${filledQty} | Fill:${fillPrice} | Slip:${slippage.pct}% | Lat:${latencyMs}ms`);

        // 🔱 [PHASE 11 FIX] Resolve portfolio contradiction
        try {
            const PortfolioManager = require('./portfolioManager');
            const OrderEngine = require('./orderEngine');
            const db = require('../data/dbProvider');
            const portfolio = PortfolioManager.load();
            const orderIdx = portfolio.pendingOrders.findIndex(o => o.id === orderId);
            
            if (orderIdx > -1) {
                const pendingOrder = portfolio.pendingOrders[orderIdx];
                pendingOrder.qty = filledQty; // Apply partial fill adjustments
                const result = OrderEngine.executeFilledOrder(portfolio, pendingOrder, fillPrice);
                if (result.success) {
                    portfolio.pendingOrders.splice(orderIdx, 1);
                    db.saveTrade(result.order, portfolio);
                    PortfolioManager.save(portfolio);
                }
            }
        } catch (e) {
            console.error('[ORDER_QUEUE] Portfolio sync failed on fill', e);
        }

        this._emit('ORDER_FILLED', {
            orderId, symbol: record.symbol, side: record.side,
            qty: filledQty, fillPrice, slippage, latencyMs,
            partial: record.partial, record: this._sanitize(record),
        });
    }

    _reject(orderId, reason, rejectionScore) {
        const record = this._queue.get(orderId);
        if (!record) return;

        Object.assign(record, { state: 'REJECTED', rejectionReason: reason });
        console.log(`[ORDER_QUEUE] ❌ REJECTED | ${record.symbol} | ${reason} | Score:${rejectionScore?.toFixed(0)}`);

        // 🔱 [PHASE 11 FIX] Release reserved capital/shares
        try {
            const OrderEngine = require('./orderEngine');
            OrderEngine.cancelOrder(orderId);
        } catch (e) {
            console.error('[ORDER_QUEUE] Portfolio sync failed on reject', e);
        }

        this._emit('ORDER_REJECTED', {
            orderId, symbol: record.symbol, side: record.side,
            reason, rejectionScore, record: this._sanitize(record),
        });
    }

    _emit(type, payload) {
        if (this._broadcastFn) this._broadcastFn({ type, payload });
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(50, Math.round(ms))));
    }

    _sanitize(record) {
        const { ...safe } = record;
        return safe;
    }

    _recordWaitSample(ms) {
        this._waitSamples.push(ms);
        if (this._waitSamples.length > 20) this._waitSamples.shift();
        this._avgQueueWaitMs = this._waitSamples.reduce((a, b) => a + b, 0) / this._waitSamples.length;
    }

    telemetry() {
        const orders = Array.from(this._queue.values());
        const byState = {};
        for (const o of orders) byState[o.state] = (byState[o.state] || 0) + 1;

        const depth = this.queueDepth;
        const volGuess = 50; // default for throughput calc
        const throughputCap = computeThroughputCap(volGuess);
        const { label: congestion, utilization } = computeQueuePressure(depth, throughputCap);

        // Fills in last 60s
        const now = Date.now();
        const recentFills = orders.filter(o => o.state === 'FILLED' && o.filledAt && (now - o.filledAt) < 60_000).length;

        return {
            totalQueued:         orders.length,
            queueDepth:          depth,
            byState,
            routeCongestion:     congestion,
            throughputUtilization: utilization,
            throughputCap,
            avgQueueWaitMs:      Math.round(this._avgQueueWaitMs),
            fillsLastMinute:     recentFills,
            lastUpdated:         now,
        };
    }

    get(orderId)  { return this._queue.get(orderId); }

    getJournal() {
        return Array.from(this._queue.values())
            .filter(o => ['FILLED', 'REJECTED'].includes(o.state))
            .sort((a, b) => b.submittedAt - a.submittedAt);
    }

    prune(maxAgeMs) {
        const cutoff = Date.now() - maxAgeMs;
        let pruned = 0;
        for (const [id, r] of this._queue.entries()) {
            if (['FILLED', 'REJECTED'].includes(r.state) && r.submittedAt < cutoff) {
                this._queue.delete(id);
                pruned++;
            }
        }
        if (pruned > 0) console.log(`[ORDER_QUEUE] Pruned ${pruned} terminal orders`);
    }
}

const orderQueue = new OrderQueue();
module.exports = orderQueue;
