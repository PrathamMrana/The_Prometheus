/**
 * 🔱 PROMETHEUS — TRADE ANALYTICS ENGINE (Statistical Defense Layer)
 * 
 * PHASE: STATISTICAL DISCIPLINE & OVERFITTING DEFENSE
 */

'use strict';

const COST_MODEL = {
    brokeragePct:     0.0003,   
    stt_buy:          0.0000,   
    stt_sell:         0.001,    
    exchangeTxnPct:   0.0000345,
    gst:              0.18,     
    sebiPct:          0.000001, 
    stampDutyBuy:     0.00015,  
    defaultSpreadPct: 0.001,    
    defaultSlippagePct: 0.0005  
};

const MIN_SAMPLE_SIZE = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeTransactionCost(buyPrice, sellPrice, qty) {
    const buyTurnover  = buyPrice  * qty;
    const sellTurnover = sellPrice * qty;
    const spreadCost = (buyPrice * COST_MODEL.defaultSpreadPct + sellPrice * COST_MODEL.defaultSpreadPct) * qty;
    const slippageCost = (buyPrice * COST_MODEL.defaultSlippagePct + sellPrice * COST_MODEL.defaultSlippagePct) * qty;
    const brokerage = Math.min(20, buyTurnover * COST_MODEL.brokeragePct) + Math.min(20, sellTurnover * COST_MODEL.brokeragePct);
    const txnCharge = (buyTurnover + sellTurnover) * COST_MODEL.exchangeTxnPct;
    const stt = sellTurnover * COST_MODEL.stt_sell;
    const totalCost = spreadCost + slippageCost + brokerage + txnCharge + stt;
    return { totalCost: parseFloat(totalCost.toFixed(4)) };
}

function computeExpectancy(trades) {
    if (!trades || trades.length === 0) return { expectancy: 0, expectancyPerTrade: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0 };
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
    const sumWins = wins.reduce((s, t) => s + t.pnl, 0);
    const sumLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    return {
        expectancyPerTrade: parseFloat((totalPnL / trades.length).toFixed(4)),
        wins: wins.length,
        losses: losses.length,
        winRate: parseFloat(((wins.length / trades.length) * 100).toFixed(2)),
        profitFactor: sumLoss > 0 ? parseFloat((sumWins / sumLoss).toFixed(4)) : (sumWins > 0 ? 9.9 : 0)
    };
}

// ── Overfitting Defense Modules ──────────────────────────────────────────────

/**
 * Task 1: Sample Quality Engine
 */
function computeSampleQuality(closedTrades, durability) {
    const n = closedTrades.length;
    if (n === 0) return { score: 0, status: 'NO_DATA' };

    // 1. Sample Size (Target 500)
    const sizeScore = Math.min(1, n / 500) * 40;

    // 2. Regime Distribution (Entropy proxy)
    const regimes = Object.values(durability.durability || {});
    const regimeCount = regimes.length;
    const diversityScore = Math.min(1, regimeCount / 5) * 30;

    // 3. Trade Concentration (Herfindahl Index proxy)
    const totalVolume = closedTrades.reduce((s, t) => s + (t.avgCost * t.qty), 0);
    const concentration = closedTrades.reduce((s, t) => s + Math.pow((t.avgCost * t.qty) / totalVolume, 2), 0);
    const concentrationScore = (1 - concentration) * 30;

    const totalScore = sizeScore + diversityScore + concentrationScore;

    return {
        score: parseFloat(totalScore.toFixed(2)),
        sizeScore: parseFloat(sizeScore.toFixed(2)),
        diversityScore: parseFloat(diversityScore.toFixed(2)),
        concentrationScore: parseFloat(concentrationScore.toFixed(2)),
        status: totalScore > 70 ? 'HIGH_QUALITY' : totalScore > 40 ? 'MEDIUM_QUALITY' : 'LOW_QUALITY_SAMPLE'
    };
}

/**
 * Task 2: Outlier Dependency Detector
 */
function detectOutlierDependency(closedTrades) {
    if (closedTrades.length < 10) return { isOutlierDominated: false };

    const sorted = [...closedTrades].sort((a, b) => b.pnl - a.pnl);
    const totalPnL = closedTrades.reduce((s, t) => s + t.pnl, 0);
    const top5PnL = sorted.slice(0, 5).reduce((s, t) => s + t.pnl, 0);
    
    const top5ContributionPct = totalPnL > 0 ? (top5PnL / totalPnL) * 100 : 0;
    
    // Trimmed Expectancy (Removing top 5% and bottom 5%)
    const trimCount = Math.max(1, Math.floor(closedTrades.length * 0.05));
    const trimmed = sorted.slice(trimCount, -trimCount);
    const trimmedExp = computeExpectancy(trimmed).expectancyPerTrade;

    const isOutlierDominated = top5ContributionPct > 70 || (totalPnL > 0 && trimmedExp <= 0);

    return {
        top5ContributionPct: parseFloat(top5ContributionPct.toFixed(2)),
        trimmedExpectancy: parseFloat(trimmedExp.toFixed(2)),
        isOutlierDominated,
        status: isOutlierDominated ? 'OUTLIER_DOMINATED_STRATEGY' : 'ROBUST_PNL_DISTRIBUTION'
    };
}

/**
 * Task 3: Walk-Forward Validation (Segmenting by time)
 */
function runWalkForwardValidation(closedTrades) {
    if (closedTrades.length < 20) return { status: 'INSUFFICIENT_DATA' };

    const sorted = [...closedTrades].sort((a, b) => a.timestamp - b.timestamp);
    const splitIdx = Math.floor(sorted.length * 0.7); // 70/30 split
    
    const inSample = sorted.slice(0, splitIdx);
    const outOfSample = sorted.slice(splitIdx);
    
    const isStats = computeExpectancy(inSample);
    const oosStats = computeExpectancy(outOfSample);
    
    const degradation = isStats.expectancyPerTrade > 0 
        ? (isStats.expectancyPerTrade - oosStats.expectancyPerTrade) / isStats.expectancyPerTrade * 100
        : 0;

    return {
        inSample: isStats,
        outOfSample: oosStats,
        degradationPct: parseFloat(degradation.toFixed(2)),
        status: degradation > 50 ? 'OVERFIT_WARNING' : 'FORWARD_STABLE'
    };
}

/**
 * Task 4: Regime Diversity Check
 */
function computeRegimeDiversity(durability) {
    const regimes = Object.entries(durability.durability || {});
    const profitableRegimes = regimes.filter(([r, d]) => d.expectancyPerTrade > 0);
    
    const diversityScore = Math.min(1, profitableRegimes.length / 4) * 100;
    
    return {
        score: parseFloat(diversityScore.toFixed(2)),
        profitableRegimeCount: profitableRegimes.length,
        status: diversityScore > 60 ? 'HIGH_DIVERSITY' : diversityScore > 30 ? 'MODERATE_DIVERSITY' : 'FRAGILE_SINGLE_REGIME_EDGE'
    };
}

/**
 * Task 5: Equity Curve Consistency
 */
function analyzeEquityConsistency(closedTrades) {
    if (closedTrades.length < 10) return { status: 'STABLE' };
    
    const pnls = closedTrades.map(t => t.pnl);
    const avg = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const std = Math.sqrt(pnls.reduce((s, x) => s + Math.pow(x - avg, 2), 0) / pnls.length);
    
    // Sharpe Proxy (Volatility Adjusted Return)
    const sharpe = std > 0 ? avg / std : 0;
    
    // Recovery Time (max trades in drawdown)
    let maxRecoveryTrades = 0, currentDDTrades = 0, peak = 0, equity = 0;
    for (const p of pnls) {
        equity += p;
        if (equity > peak) {
            peak = equity;
            currentDDTrades = 0;
        } else {
            currentDDTrades++;
        }
        maxRecoveryTrades = Math.max(maxRecoveryTrades, currentDDTrades);
    }

    return {
        sharpeProxy: parseFloat(sharpe.toFixed(4)),
        maxRecoveryTrades,
        consistencyScore: Math.min(100, Math.max(0, sharpe * 50)),
        status: sharpe > 0.5 ? 'SMOOTH_EQUITY' : sharpe > 0.2 ? 'STABLE' : 'UNSTABLE_ALPHA'
    };
}

// ── Master Computation ────────────────────────────────────────────────────────

function computeFullAnalytics(portfolio, portfolioCache = null) {
    const closedTrades = (portfolio.orders || []).filter(o => o.side === 'SELL' && o.status === 'FILLED' && typeof o.pnl === 'number');
    
    const expectancy = computeExpectancy(closedTrades);
    const execution  = computeExecutionQuality(closedTrades);
    const durability = computeRegimeDurability(closedTrades);
    const calibration = computeConfidenceCalibration(closedTrades);
    const failures    = detectFailureClusters(closedTrades);

    // Defense Layers
    const sampleQuality = computeSampleQuality(closedTrades, durability);
    const outliers      = detectOutlierDependency(closedTrades);
    const walkForward   = runWalkForwardValidation(closedTrades);
    const diversity     = computeRegimeDiversity(durability);
    const consistency   = analyzeEquityConsistency(closedTrades);

    const analytics = {
        meta: { 
            tradeCount: closedTrades.length, 
            generatedAt: new Date().toISOString(),
            sampleQualityScore: sampleQuality.score 
        },
        expectancy,
        execution,
        durability,
        calibration,
        failures,
        
        // Defense Metrics
        sampleQuality,
        outliers,
        walkForward,
        diversity,
        consistency,
        
        verdict: generateDefenseVerdict(expectancy, execution, sampleQuality, outliers, walkForward, diversity)
    };

    return analytics;
}

function generateDefenseVerdict(exp, exe, sq, out, wf, div) {
    if (sq.score < 30) return 'EDGE_UNCONFIRMED';
    if (exp.expectancyPerTrade <= 0) return 'EDGE_DESTROYED';
    if (out.isOutlierDominated) return 'OUTLIER_DOMINATED_STRATEGY';
    if (wf.status === 'OVERFIT_WARNING') return 'OVERFIT_DETECTED';
    if (div.score < 30) return 'FRAGILE_SINGLE_REGIME_EDGE';
    
    if (sq.score > 70 && wf.status === 'FORWARD_STABLE' && div.score > 60) return 'EDGE_STATISTICALLY_VALID';
    
    return 'EDGE_EMERGING';
}

// Legacy helpers from previous version
function computeExecutionQuality(closedTrades) {
    let totalGrossPnL = 0, totalCosts = 0;
    for (const t of closedTrades) {
        totalGrossPnL += t.pnl;
        const { totalCost } = computeTransactionCost(t.avgCost || t.price, t.price, t.qty || 1);
        totalCosts += totalCost;
    }
    const totalNetPnL = totalGrossPnL - totalCosts;
    const alphaRetention = totalGrossPnL > 0 ? (totalNetPnL / totalGrossPnL) * 100 : 0;
    return { grossPnL: totalGrossPnL, totalCosts, netPnL: totalNetPnL, alphaRetentionPct: alphaRetention };
}

function computeRegimeDurability(closedTrades) {
    const regimes = {};
    for (const t of closedTrades) {
        const r = t.tradeTags?.regime || 'UNKNOWN';
        if (!regimes[r]) regimes[r] = [];
        regimes[r].push(t);
    }
    const result = {};
    for (const [r, trades] of Object.entries(regimes)) result[r] = computeExpectancy(trades);
    return { durability: result };
}

function computeConfidenceCalibration(closedTrades) {
    const buckets = { VERY_HIGH: [], HIGH: [], MEDIUM: [], LOW: [], VERY_LOW: [] };
    for (const t of closedTrades) {
        const b = t.tradeTags?.confidenceBucket || 'UNKNOWN';
        if (buckets[b]) buckets[b].push(t);
    }
    const result = {};
    for (const [name, trades] of Object.entries(buckets)) result[name] = computeExpectancy(trades);
    return { buckets: result };
}

function detectFailureClusters(closedTrades) {
    const losses = closedTrades.filter(t => t.pnl <= 0);
    const patternMap = {};
    for (const t of losses) {
        const tags = t.tradeTags || {};
        const key = `${tags.regime || 'UNK'}|${tags.breakoutType || 'UNK'}|${tags.marketSessionPhase || 'UNK'}`;
        if (!patternMap[key]) patternMap[key] = { count: 0, totalLoss: 0 };
        patternMap[key].count++;
        patternMap[key].totalLoss += Math.abs(t.pnl);
    }
    return { clusters: Object.entries(patternMap).map(([k, d]) => ({ pattern: k, ...d })).slice(0, 5) };
}

module.exports = { computeFullAnalytics, COST_MODEL };
