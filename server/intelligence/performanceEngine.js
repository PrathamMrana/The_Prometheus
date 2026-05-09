/**
 * 📊 PROMETHEUS Phase 18 — Performance Analytics Engine
 * Computes real Sharpe ratio, win rate, equity curve, trade breakdown,
 * strategy DNA, and predictive intelligence from actual order history.
 *
 * Inputs: portfolio.json orders array (real trades with pnl on SELL orders).
 * Zero hardcoded values — shows "N/A" or 0 when data is absent.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const std = (arr) => {
    const mean = avg(arr);
    const variance = avg(arr.map(v => (v - mean) ** 2));
    return Math.sqrt(variance);
};
const slope = (arr) => {
    if (arr.length < 2) return 0;
    const n = arr.length;
    const xMean = (n - 1) / 2;
    const yMean = avg(arr);
    const num = arr.reduce((s, y, x) => s + (x - xMean) * (y - yMean), 0);
    const den = arr.reduce((s, _, x) => s + (x - xMean) ** 2, 0);
    return den !== 0 ? num / den : 0;
};

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Compute full performance analytics from portfolio order history.
 * @param {object} portfolio - Loaded portfolio.json
 * @returns {object}
 */
function compute(portfolio) {
    const orders = portfolio.orders || [];

    // ── 1. Separate BUY vs SELL (SELL orders carry pnl from portfolioManager.liquidate) ──
    const closedTrades = orders.filter(o =>
        o.side === 'SELL' && o.status === 'FILLED' && typeof o.pnl === 'number'
    );
    const openBuys = orders.filter(o => o.side === 'BUY' && o.status === 'FILLED');

    // ── 2. Basic trade stats ──────────────────────────────────────────────
    const total  = closedTrades.length;
    const wins   = closedTrades.filter(o => o.pnl > 0);
    const losses = closedTrades.filter(o => o.pnl <= 0);

    const winRate     = total > 0 ? (wins.length / total) * 100 : 0;
    const avgWin      = wins.length   ? avg(wins.map(o => o.pnl))   : 0;
    const avgLoss     = losses.length ? avg(losses.map(o => o.pnl)) : 0;
    const sumWins     = wins.reduce((s, o) => s + o.pnl, 0);
    const sumLosses   = Math.abs(losses.reduce((s, o) => s + o.pnl, 0));
    const profitFactor = sumLosses > 0 ? sumWins / sumLosses : sumWins > 0 ? Infinity : 0;
    const expectancy  = (winRate / 100) * avgWin + ((1 - winRate / 100)) * avgLoss;

    // ── 3. Hold time approximation ────────────────────────────────────────
    // Match SELL orders to BUY orders for same symbol (FIFO)
    const buysBySymbol = {};
    for (const o of openBuys) {
        if (!buysBySymbol[o.symbol]) buysBySymbol[o.symbol] = [];
        buysBySymbol[o.symbol].push(o.timestamp);
    }
    const holdTimes = [];
    for (const sell of closedTrades) {
        const buys = buysBySymbol[sell.symbol];
        if (buys && buys.length > 0) {
            const buyTs = buys.shift(); // FIFO
            holdTimes.push(sell.timestamp - buyTs);
        }
    }
    const avgHoldMs  = holdTimes.length ? avg(holdTimes) : 0;
    const avgHoldStr = avgHoldMs > 0
        ? avgHoldMs < 3600000 ? `${Math.round(avgHoldMs / 60000)}m`
          : avgHoldMs < 86400000 ? `${(avgHoldMs / 3600000).toFixed(1)}h`
          : `${(avgHoldMs / 86400000).toFixed(1)}d`
        : 'N/A';

    // ── 4. Equity curve (running balance from real trades) ─────────────────
    const startingBalance = portfolio.balance + (portfolio.realizedPnL || 0) +
        Object.values(portfolio.holdings || {}).reduce((s, h) => s + h.totalCost, 0);

    const sortedTrades = [...closedTrades].sort((a, b) => a.timestamp - b.timestamp);
    let runningEquity  = startingBalance - (portfolio.realizedPnL || 0); // approx start
    const equityCurve  = [];
    let peak = runningEquity;
    let maxDrawdown = 0;

    for (const trade of sortedTrades) {
        runningEquity += trade.pnl;
        if (runningEquity > peak) peak = runningEquity;
        const drawdown = peak > 0 ? ((peak - runningEquity) / peak) * 100 : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        equityCurve.push({
            timestamp: trade.timestamp,
            date:      new Date(trade.timestamp).toISOString().split('T')[0],
            equity:    parseFloat(runningEquity.toFixed(2)),
            drawdown:  parseFloat(drawdown.toFixed(2)),
            pnl:       trade.pnl,
            symbol:    trade.symbol
        });
    }

    // ── 5. Sharpe Ratio (annualised, assuming daily-level trades) ──────────
    const returns    = closedTrades.filter(o => o.price && o.qty).map(o => o.pnl / (o.price * o.qty));
    const meanReturn = avg(returns);
    const stdReturn  = std(returns);
    
    // 🛡️ [PHASE 21.8] Institutional Guardrails
    const MIN_STD = 0.0001; 
    let sharpe = 0;
    
    if (returns.length > 0) {
        if (stdReturn > MIN_STD) {
            sharpe = (meanReturn / stdReturn) * Math.sqrt(252);
        } else if (meanReturn !== 0) {
            // zero variance but non-zero return (e.g. constant loss)
            sharpe = meanReturn > 0 ? 10 : -10;
        }
    }
    
    // Clamp to sane institutional bounds
    sharpe = Math.max(-10, Math.min(10, sharpe));

    // ── 6. Best & Worst trades ─────────────────────────────────────────────
    const sortedByPnl = [...closedTrades].sort((a, b) => b.pnl - a.pnl);
    const bestTrade   = sortedByPnl[0]  ?? null;
    const worstTrade  = sortedByPnl[sortedByPnl.length - 1] ?? null;

    // ── 7. Confidence trend (slope of last 10 trade outcomes +1/-1) ───────
    const recentOutcomes = sortedTrades.slice(-10).map(o => o.pnl > 0 ? 1 : -1);
    const confidenceTrendSlope = slope(recentOutcomes);
    const confidenceTrend =
        confidenceTrendSlope >  0.05 ? 'IMPROVING'  :
        confidenceTrendSlope < -0.05 ? 'DECREASING' : 'STABLE';

    // ── 8. Predictive layer ────────────────────────────────────────────────
    const tradesPerDay = sortedTrades.length > 1
        ? sortedTrades.length /
          ((sortedTrades[sortedTrades.length - 1].timestamp - sortedTrades[0].timestamp) / 86400000 || 1)
        : 1;
    const next10Estimate = expectancy * 10;
    const drawdownRisk   = maxDrawdown < 5  ? 'LOW'
                         : maxDrawdown < 15 ? 'MEDIUM' : 'HIGH';

    const prediction = {
        next10Trades:    total >= 5
            ? `${next10Estimate >= 0 ? '+' : ''}₹${next10Estimate.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
            : 'Insufficient trade history (need ≥5)',
        drawdownRisk,
        drawdownRiskPct: parseFloat(maxDrawdown.toFixed(2)),
        confidenceTrend,
        tradesPerDay:    parseFloat(tradesPerDay.toFixed(2)),
    };

    // ── 9. Trade breakdown by symbol ───────────────────────────────────────
    const bySymbol = {};
    for (const trade of closedTrades) {
        if (!bySymbol[trade.symbol]) bySymbol[trade.symbol] = { trades: 0, pnl: 0, wins: 0 };
        bySymbol[trade.symbol].trades++;
        bySymbol[trade.symbol].pnl += trade.pnl;
        if (trade.pnl > 0) bySymbol[trade.symbol].wins++;
    }

    return {
        summary: {
            totalTrades:   total,
            winRate:       parseFloat(winRate.toFixed(1)),
            sharpe:        parseFloat(sharpe.toFixed(2)),
            maxDrawdown:   parseFloat(maxDrawdown.toFixed(2)),
            profitFactor:  isFinite(profitFactor) ? parseFloat(profitFactor.toFixed(2)) : null,
            expectancy:    parseFloat(expectancy.toFixed(2)),
            avgHold:       avgHoldStr,
            avgWin:        parseFloat(avgWin.toFixed(2)),
            avgLoss:       parseFloat(avgLoss.toFixed(2)),
            realizedPnL:   portfolio.realizedPnL || 0,
        },
        equityCurve,
        bestTrade:  bestTrade
            ? { symbol: bestTrade.symbol, pnl: bestTrade.pnl, date: new Date(bestTrade.timestamp).toISOString().split('T')[0] }
            : null,
        worstTrade: worstTrade
            ? { symbol: worstTrade.symbol, pnl: worstTrade.pnl, date: new Date(worstTrade.timestamp).toISOString().split('T')[0] }
            : null,
        prediction,
        bySymbol,
        recentTrades: sortedTrades.slice(-20).reverse().map(o => ({
            symbol:    o.symbol,
            pnl:       o.pnl,
            price:     o.price,
            qty:       o.qty,
            timestamp: o.timestamp,
            date:      new Date(o.timestamp).toISOString().split('T')[0],
        })),
    };
}

module.exports = { compute };
