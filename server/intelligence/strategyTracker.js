/**
 * 🧠 PROMETHEUS Phase 19 — Strategy Tracker & Self-Learning Engine
 *
 * Reads real trade outcomes from portfolio.json, computes factor-level win rates,
 * and adaptively updates strategyState.json weights.
 *
 * Learning loop:
 *   portfolio.json (orders with pnl) → factor attribution → weight adjustment → strategyState.json
 *
 * Zero mock data. Requires SELL orders with pnl field (written by OrderEngine since Phase 18 fix).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const STATE_FILE     = path.join(__dirname, '../data/strategyState.json');
const PORTFOLIO_FILE = path.join(__dirname, '../data/portfolio.json');

// ── Minimum trades required before weights are adjusted
// 15 trades gives enough signal to distinguish factor quality from noise
const MIN_TRADES_FOR_LEARNING = 15;

// ── Weight floor/ceiling — prevents any single factor from dominating or vanishing
const WEIGHT_FLOOR   = 5;
const WEIGHT_CEILING = 55;

// ── Learning rate — how aggressively weights shift per cycle
const LEARNING_RATE = 0.12;

// ─── I/O helpers ─────────────────────────────────────────────────────────────

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (_) { }
    return {
        weights: { trend: 30, momentum: 25, volume: 15, sectorFlow: 20, breakout: 10 },
        lastUpdated: null,
        generation: 0
    };
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('[STRATEGY_TRACKER] Failed to persist state:', e.message);
    }
}

function loadPortfolio() {
    try {
        return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf8'));
    } catch (_) {
        return { orders: [] };
    }
}

// ─── Factor extraction ────────────────────────────────────────────────────────

/**
 * Extract strategy features from a BUY order.
 * As of P20, BUY orders are stamped with: score, atr, confidence, sector by execution.js
 */
function extractFeatures(buyOrder) {
    return {
        score:      buyOrder.score      ?? 0,
        atr:        buyOrder.atr        ?? 0,
        confidence: buyOrder.confidence ?? null,  // real ML confidence at entry
        sector:     buyOrder.sector     ?? null,  // real sector at entry
        sl:         buyOrder.sl         ?? null,
        tp:         buyOrder.tp         ?? null,
        // High-score tier (score field is 0-100 strategy score)
        isHighScore: (buyOrder.score ?? 0) >= 55,
        // High confidence tier
        isHighConf:  (buyOrder.confidence ?? 0) >= 0.65,
        // Breakout — explicit flag or TP/price ratio > 1.5%
        hasBreakout: !!(buyOrder.breakout ||
            (buyOrder.tp && buyOrder.price && (buyOrder.tp / buyOrder.price) > 1.015)),
    };
}

// ─── Normalize weights to sum = 100 ─────────────────────────────────────────

function normalize(weights) {
    const keys  = Object.keys(weights);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    const out   = {};
    for (const k of keys) {
        // Clamp each weight within floor/ceiling AFTER normalization
        out[k] = Math.round(Math.max(WEIGHT_FLOOR, Math.min(WEIGHT_CEILING, (weights[k] / total) * 100)));
    }
    // Re-normalize to exactly 100 by adjusting the largest key
    const sum  = Object.values(out).reduce((a, b) => a + b, 0);
    const diff = 100 - sum;
    if (diff !== 0) {
        const largest = keys.reduce((a, b) => out[a] >= out[b] ? a : b);
        out[largest]  = Math.max(WEIGHT_FLOOR, out[largest] + diff);
    }
    return out;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Computes strategy insights and updates weights based on real trade outcomes.
 * @param {object} [portfolioOverride] - Optional pre-loaded portfolio (skips disk read)
 * @returns {object} Full insights snapshot
 */
function computeStrategyInsights(portfolioOverride) {
    const portfolio  = portfolioOverride ?? loadPortfolio();
    const allOrders  = portfolio.orders ?? [];

    // ── 1. Isolate closed trades (SELL with real pnl) ────────────────────────
    const closedSells = allOrders.filter(o =>
        o.side === 'SELL' && o.status === 'FILLED' && typeof o.pnl === 'number'
    );

    // ── 2. Match each SELL to its BUY (FIFO per symbol) ─────────────────────
    const buysBySymbol = {};
    for (const o of allOrders) {
        if (o.side === 'BUY' && o.status === 'FILLED') {
            const sym = o.symbol;
            if (!buysBySymbol[sym]) buysBySymbol[sym] = [];
            buysBySymbol[sym].push({ ...o });
        }
    }
    // Sort BUYs chronologically so FIFO matching is correct
    for (const sym of Object.keys(buysBySymbol)) {
        buysBySymbol[sym].sort((a, b) => a.timestamp - b.timestamp);
    }

    const trades = [];
    for (const sell of closedSells) {
        const buyQueue = buysBySymbol[sell.symbol];
        const matchedBuy = buyQueue?.find(b => b.timestamp < sell.timestamp);
        if (matchedBuy) {
            // Remove from queue so it's not double-matched
            const idx = buyQueue.indexOf(matchedBuy);
            if (idx !== -1) buyQueue.splice(idx, 1);

            trades.push({
                symbol:   sell.symbol,
                pnl:      sell.pnl,
                isWin:    sell.pnl > 0,
                sellPrice: sell.price,
                sellTs:    sell.timestamp, // 🛡️ CRITICAL RESTORATION
                buyPrice:  matchedBuy.price,
                buyTs:     matchedBuy.timestamp,
                timestamp: sell.timestamp, // Standard accessor
                features:  extractFeatures(matchedBuy),
            });
        }
    }

    const total = trades.length;

    // ── 3. Aggregate stats ───────────────────────────────────────────────────
    if (total === 0) {
        const currentState = loadState();
        return {
            summary: {
                totalTrades: 0, winRate: 0,
                breakoutWinRate: 0, highScoreWinRate: 0, lowScoreWinRate: 0,
                avgScoreWin: 0, avgScoreLoss: 0,
                avgPnLWin: 0, avgPnLLoss: 0,
            },
            weights:       currentState.weights,
            generation:    currentState.generation,
            lastUpdated:   currentState.lastUpdated,
            bestFactor:    null,
            worstFactor:   null,
            recommendation: 'Insufficient trade history for learning (need ≥3 matched BUY+SELL pairs)',
            confidence:    0,
        };
    }

    // Sort chronological: oldest to newest using the sellTs we just restored
    const sortedTrades = [...trades].sort((a, b) => (a.sellTs ?? 0) - (b.sellTs ?? 0));
    // Age is reverse index, so newest = 0
    const tradesWithAge = sortedTrades.map((t, idx) => ({ 
        ...t, 
        age: sortedTrades.length - 1 - idx,
        weight: Math.exp(-(sortedTrades.length - 1 - idx) / 10)
    }));

    const wins   = tradesWithAge.filter(t => t.isWin);
    const losses = tradesWithAge.filter(t => !t.isWin);

    const sumWeights = (arr) => arr.reduce((s, t) => s + t.weight, 0);

    const baseTotalWeight = sumWeights(tradesWithAge);
    const winRate = baseTotalWeight > 0 ? (sumWeights(wins) / baseTotalWeight) * 100 : 0;

    const breakoutTrades  = tradesWithAge.filter(t => t.features.hasBreakout);
    const highScoreTrades = tradesWithAge.filter(t => t.features.isHighScore);
    const lowScoreTrades  = tradesWithAge.filter(t => !t.features.isHighScore);

    const breakoutWinRate = sumWeights(breakoutTrades) > 0
        ? (sumWeights(breakoutTrades.filter(t => t.isWin)) / sumWeights(breakoutTrades)) * 100 : 0;
    const highScoreWinRate = sumWeights(highScoreTrades) > 0
        ? (sumWeights(highScoreTrades.filter(t => t.isWin)) / sumWeights(highScoreTrades)) * 100 : 0;
    const lowScoreWinRate = sumWeights(lowScoreTrades) > 0
        ? (sumWeights(lowScoreTrades.filter(t => t.isWin)) / sumWeights(lowScoreTrades)) * 100 : 0;

    const avg = (arr, fn) => arr.length ? arr.reduce((s, x) => s + fn(x), 0) / arr.length : 0;
    const avgScoreWin  = avg(wins,   t => t.features.score);
    const avgScoreLoss = avg(losses, t => t.features.score);
    const avgPnLWin    = avg(wins,   t => t.pnl);
    const avgPnLLoss   = avg(losses, t => t.pnl);

    // ── 4a. Sector-level win rate attribution (Weighted) ──────────────────────
    const sectorMap = {};
    for (const t of tradesWithAge) {
        const sec = t.features.sector || 'UNKNOWN';
        if (!sectorMap[sec]) sectorMap[sec] = { winsWeight: 0, totalWeight: 0, count: 0 };
        sectorMap[sec].totalWeight += t.weight;
        sectorMap[sec].count++;
        if (t.isWin) sectorMap[sec].winsWeight += t.weight;
    }
    const sectorWR = {};
    for (const [sec, data] of Object.entries(sectorMap)) {
        sectorWR[sec] = data.count >= 2
            ? parseFloat(((data.winsWeight / data.totalWeight) * 100).toFixed(1))
            : null;
    }

    // ── 4b. Bad pattern detection ─────────────────────────────────────────────
    // Pattern 1: High score + low confidence → losing (false conviction)
    const falseConviction = tradesWithAge.filter(t => t.features.isHighScore && !t.features.isHighConf);
    const falseConvictionWR = sumWeights(falseConviction) > 0
        ? (sumWeights(falseConviction.filter(t => t.isWin)) / sumWeights(falseConviction)) * 100 : null;

    // Pattern 2: Sectors with < 25% win rate (enough sample)
    const sectorBlacklist = Object.entries(sectorWR)
        .filter(([, wr]) => wr !== null && wr < 25)
        .map(([sec]) => sec);

    // ── 4c. Win rate trend: last 10 trades vs overall ─────────────────────────
    const last10 = sortedTrades.slice(-10);
    const last10WR = last10.length
        ? (last10.filter(t => t.isWin).length / last10.length) * 100 : 0;
    const winRateTrend = last10.length < 5 ? 'INSUFFICIENT_DATA'
        : last10WR > winRate + 5  ? 'IMPROVING'
        : last10WR < winRate - 5  ? 'DECLINING'
        : 'STABLE';

    // ── 4d. Factor performance map ────────────────────────────────────────────
    const highConfTrades = tradesWithAge.filter(t => t.features.isHighConf);
    const highConfWR = sumWeights(highConfTrades) > 0
        ? (sumWeights(highConfTrades.filter(t => t.isWin)) / sumWeights(highConfTrades)) * 100 : winRate;
    
    // Pattern 3: Low confidence trades doing well?
    const lowConfTrades = tradesWithAge.filter(t => !t.features.isHighConf);
    const lowConfWR = sumWeights(lowConfTrades) > 0
        ? (sumWeights(lowConfTrades.filter(t => t.isWin)) / sumWeights(lowConfTrades)) * 100 : winRate;

    const factorPerf = {
        trend:      highScoreWinRate / 100,  // high score = strong trend signal
        momentum:   winRate / 100,           // overall system momentum quality
        volume:     breakoutWinRate / 100,   // breakout = volume-driven
        sectorFlow: Math.max(...Object.values(sectorWR).filter(v => v !== null), winRate) / 100,
        breakout:   breakoutWinRate / 100,
    };

    // ── 5. Adaptive weight update ────────────────────────────────────────────
    const currentState   = loadState();
    const oldWeights     = { ...currentState.weights };
    const newWeights     = { ...oldWeights };

    if (total >= MIN_TRADES_FOR_LEARNING) {
        // Gradient: if factor win rate > 50% → increase weight, else decrease
        for (const factor of Object.keys(newWeights)) {
            const perf   = factorPerf[factor] ?? 0.5;
            const delta  = (perf - 0.5) * 2 * LEARNING_RATE * newWeights[factor];
            newWeights[factor] = Math.max(WEIGHT_FLOOR, Math.min(WEIGHT_CEILING, newWeights[factor] + delta));
        }

        // Additional rule-based nudges
        if (highScoreWinRate > 60) newWeights.trend     = Math.min(WEIGHT_CEILING, newWeights.trend     + 2);
        if (avgPnLLoss < -500)     newWeights.volume    = Math.max(WEIGHT_FLOOR,   newWeights.volume    - 2);
        if (winRate < 30)          newWeights.momentum  = Math.max(WEIGHT_FLOOR,   newWeights.momentum  - 2);
        if (breakoutWinRate > 55)  newWeights.breakout  = Math.min(WEIGHT_CEILING, newWeights.breakout  + 2);
    }

    // 🛡️ EMA smoothing — move only 20% toward learned weights each call
    // Prevents thrashing when sample size is small or one bad trade distorts the signal
    const EMA_ALPHA = 0.20;
    for (const factor of Object.keys(newWeights)) {
        newWeights[factor] = oldWeights[factor] * (1 - EMA_ALPHA) + newWeights[factor] * EMA_ALPHA;
    }

    const finalWeights = normalize(newWeights);

    // ── 6. Best / worst factor ───────────────────────────────────────────────
    const perfEntries = Object.entries(factorPerf).sort((a, b) => b[1] - a[1]);
    const bestFactor  = perfEntries[0]?.[0]  ?? null;
    const worstFactor = perfEntries[perfEntries.length - 1]?.[0] ?? null;

    // ── 7. Recommendation ────────────────────────────────────────────────────
    let recommendation;
    if (winRate < 30 && total >= MIN_TRADES_FOR_LEARNING)
        recommendation = `Win rate critically low (${winRate.toFixed(1)}%) — reducing momentum weight, increasing trend confirmation`;
    else if (breakoutWinRate > 60)
        recommendation = `Breakout trades outperforming (${breakoutWinRate.toFixed(1)}% WR) — increased breakout + volume weighting`;
    else if (highScoreWinRate > 60)
        recommendation = `High-score trades profitable (${highScoreWinRate.toFixed(1)}% WR) — trend weight boosted`;
    else if (total < MIN_TRADES_FOR_LEARNING)
        recommendation = `Need ${MIN_TRADES_FOR_LEARNING - total} more completed trades before weights adjust`;
    else
        recommendation = `System balanced — weights stable. Win rate: ${winRate.toFixed(1)}%`;

    // ── 8. Confidence (based on sample size and outcome clarity) ────────────
    const sampleConfidence = Math.min(1, total / 20);
    const clarity          = Math.abs(winRate - 50) / 50;
    const confidence       = parseFloat((sampleConfidence * 0.6 + clarity * 0.4).toFixed(3));

    // ── 9. Persist updated state ─────────────────────────────────────────────
    const newState = {
        weights:         finalWeights,
        lastUpdated:     new Date().toISOString(),
        generation:      (currentState.generation ?? 0) + 1,
        // Save bad patterns so riskManager/strategyManager can block them
        sectorBlacklist: sectorBlacklist,
        badPatterns:     {
            falseConviction: falseConvictionWR !== null && falseConvictionWR < 25
        },
        winningPatterns: {
            highConfWR,
            lowConfWR,
            sectorWR,
            breakoutWR: breakoutWinRate
        },
        recentTrend: {
            last10WR,
            isLosing: last10WR < 30,
            isWinning: last10WR > 60
        }
    };
    saveState(newState);

    return {
        summary: {
            totalTrades:      total,
            winRate:          parseFloat(winRate.toFixed(1)),
            breakoutWinRate:  parseFloat(breakoutWinRate.toFixed(1)),
            highScoreWinRate: parseFloat(highScoreWinRate.toFixed(1)),
            lowScoreWinRate:  parseFloat(lowScoreWinRate.toFixed(1)),
            avgScoreWin:      parseFloat(avgScoreWin.toFixed(2)),
            avgScoreLoss:     parseFloat(avgScoreLoss.toFixed(2)),
            avgPnLWin:        parseFloat(avgPnLWin.toFixed(2)),
            avgPnLLoss:       parseFloat(avgPnLLoss.toFixed(2)),
        },
        alphaMetrics: {
            sectorBlacklist,
            falseConvictionWR: falseConvictionWR !== null ? parseFloat(falseConvictionWR.toFixed(1)) : null,
            winRateTrend,
            sectorPerformance: sectorWR
        },
        weights:        finalWeights,
        weightsBefore:  oldWeights,
        generation:     newState.generation,
        lastUpdated:    newState.lastUpdated,
        bestFactor,
        worstFactor,
        recommendation,
        confidence,
    };
}

module.exports = { computeStrategyInsights, loadState };
