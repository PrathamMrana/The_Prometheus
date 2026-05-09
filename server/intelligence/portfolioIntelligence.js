/**
 * 🧠 PROMETHEUS Phase 18 — Portfolio Intelligence Engine
 * Computes AI Portfolio Score, real sector allocation, capital efficiency,
 * rebalancing signals, and explainability breakdown.
 *
 * All inputs: portfolio.json (disk) + portfolioCache (live market).
 * Zero hardcoded values.
 */

const rootGlobalState = require('../globalState');

// Sector exposure cap before flagging as OVER
const SECTOR_CAP_PCT = 20; // 🛡️ Phase 4: Synced with RiskManager

// Safe‐zone thresholds for risk classification
const RISK_SIGNAL_THRESHOLD = 0.45; // riskScore below this → suggest TRIM

// ─── Internal helpers ────────────────────────────────────────────────────────

const avg   = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Resolve live price for a symbol from the market cache (Map).
 */
function livePrice(symbol, cache) {
    const key = symbol.split('.')[0];
    return (cache.get(key) || cache.get(symbol) || cache.get(symbol + '.NS'))?.price ?? null;
}

/**
 * Get the cached signal for a symbol.
 */
function liveSignal(symbol, cache) {
    const key = symbol.split('.')[0];
    return (cache.get(key) || cache.get(symbol))?.signal ?? null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Compute full portfolio intelligence snapshot.
 *
 * @param {object} portfolio   - Loaded portfolio.json
 * @param {Map}    marketCache - portfolioCache from worker
 * @returns {object}
 */
function compute(portfolio, marketCache) {
    const SECTOR_MAP = rootGlobalState.SECTOR_MAP;
    const holdings = portfolio.holdings || {};
    const holdingEntries = Object.entries(holdings);

    // ── 1. Per-position enrichment ─────────────────────────────────────────
    let totalInvested = 0;
    let totalLiveValue = 0;
    const positions = [];

    for (const [symbol, h] of holdingEntries) {
        const price  = livePrice(symbol, marketCache) ?? h.avgPrice;
        const signal = liveSignal(symbol, marketCache);
        const liveVal = price * h.qty;
        const cost    = h.avgPrice * h.qty;
        const pnl     = liveVal - cost;
        const pnlPct  = cost > 0 ? (pnl / cost) * 100 : 0;
        const sector  = SECTOR_MAP[symbol.split('.')[0]] || 'OTHER';

        totalInvested  += cost;
        totalLiveValue += liveVal;

        positions.push({
            symbol,
            qty:       h.qty,
            avgPrice:  h.avgPrice,
            livePrice: price,
            liveValue: liveVal,
            cost,
            pnl,
            pnlPct,
            sector,
            signal: {
                decision:  signal?.decision  ?? 'UNKNOWN',
                score:     signal?.score     ?? 0,
                riskScore: signal?.riskScore ?? null,
                status:    signal?.status    ?? 'COMPUTING',
                trend:     signal?.trendStrength ?? null,
                reasons:   signal?.reasons   ?? [],
                smartMoney: signal?.smartMoney ?? null,
            }
        });
    }

    // ── 2. Sector Allocation (real %) ──────────────────────────────────────
    const sectorBuckets = {};
    for (const pos of positions) {
        sectorBuckets[pos.sector] = (sectorBuckets[pos.sector] || 0) + pos.liveValue;
    }
    const sectorAllocation = {};
    const grandTotal = totalLiveValue || 1;
    for (const [sector, val] of Object.entries(sectorBuckets)) {
        sectorAllocation[sector] = parseFloat(((val / grandTotal) * 100).toFixed(1));
    }

    // ── 3. Capital Efficiency ──────────────────────────────────────────────
    const idle        = portfolio.balance || 0;
    const totalEquity = idle + totalLiveValue;
    const efficiencyScore = totalEquity > 0
        ? clamp((totalLiveValue / totalEquity) * 100, 0, 100)
        : 0;

    // ── 4. Diversification factor ──────────────────────────────────────────
    const sectorPcts       = Object.values(sectorAllocation);
    const largestSectorPct = sectorPcts.length ? Math.max(...sectorPcts) : 0;
    const numSectors       = Object.keys(sectorAllocation).length;

    // 0–1: 1 = perfectly spread, 0 = single sector
    const diversificationFactor = numSectors > 1
        ? clamp(1 - (largestSectorPct / 100), 0, 1)
        : 0;

    // ── 5. Volatility factor (avg signal score proxy) ─────────────────────
    // Higher avg signal score = system has higher conviction = less "unknown" risk
    const scoredPositions = positions.filter(p => p.signal.score > 0);
    const avgScore = scoredPositions.length ? avg(scoredPositions.map(p => p.signal.score)) : 50;
    const volatilityFactor = clamp(avgScore / 100, 0, 1);

    // ── 6. Correlation factor ──────────────────────────────────────────────
    // Approximation: penalise when more than 50% of value is in one sector
    const dominantSectorPct = largestSectorPct / 100;
    const correlationFactor = clamp(1 - dominantSectorPct, 0, 1);

    // ── 7. AI Portfolio Score (0–100) ─────────────────────────────────────
    const portfolioScore = Math.round(
        (diversificationFactor * 30) +
        (volatilityFactor      * 25) +
        (correlationFactor     * 25) +
        (clamp(efficiencyScore / 100, 0, 1) * 20)
    );

    // ── 8. Portfolio Regime ────────────────────────────────────────────────
    let regime;
    if (efficiencyScore > 80 && largestSectorPct > 35) regime = 'AGGRESSIVE';
    else if (efficiencyScore < 40)                      regime = 'DEFENSIVE';
    else                                                 regime = 'BALANCED';

    // ── 9. Explainability breakdown ────────────────────────────────────────
    const explain = {
        diversification: largestSectorPct > 35
            ? `LOW — ${Object.keys(sectorAllocation).find(s => sectorAllocation[s] === largestSectorPct)} exposure at ${largestSectorPct}% (cap: ${SECTOR_CAP_PCT}%)`
            : `GOOD — largest sector at ${largestSectorPct}% (cap: ${SECTOR_CAP_PCT}%)`,
        volatility: avgScore >= 70
            ? `LOW — avg signal conviction ${avgScore.toFixed(0)}/100`
            : avgScore >= 50
            ? `MEDIUM — avg signal conviction ${avgScore.toFixed(0)}/100`
            : `HIGH — avg signal conviction only ${avgScore.toFixed(0)}/100`,
        correlation: dominantSectorPct > 0.4
            ? `HIGH — sector clustering detected (${(dominantSectorPct * 100).toFixed(0)}% in one sector)`
            : `LOW — sector spread acceptable`,
        exposure: efficiencyScore >= 75
            ? `GOOD — ${efficiencyScore.toFixed(0)}% capital deployed`
            : `WEAK — only ${efficiencyScore.toFixed(0)}% capital deployed (${idle.toLocaleString('en-IN')} idle)`,
    };

    // ── 10. AI Rebalancing Signals (multi-factor) ─────────────────────────
    const rebalancingSignals = [];

    for (const pos of positions) {
        const { symbol, sector, signal, pnl, pnlPct } = pos;
        const sectorOver = (sectorAllocation[sector] || 0) > SECTOR_CAP_PCT;

        if (signal.decision === 'REJECT' && pnl > 0) {
            rebalancingSignals.push({
                symbol, action: 'TRIM',
                reason: `Signal: REJECT | PnL: +${pnlPct.toFixed(1)}% — lock gains before reversal`,
                urgency: 'HIGH'
            });
        } else if (sectorOver && signal.score < 55) {
            rebalancingSignals.push({
                symbol, action: 'REDUCE',
                reason: `${sector} at ${sectorAllocation[sector]}% — overcap + weak signal (score: ${signal.score})`,
                urgency: 'MEDIUM'
            });
        } else if (signal.decision === 'BUY' && !sectorOver && signal.score >= 65) {
            rebalancingSignals.push({
                symbol, action: 'ADD',
                reason: `Strong BUY signal (score: ${signal.score}) | ${sector} within limits`,
                urgency: 'LOW'
            });
        }
    }

    // ── 11. Kill Switch Insight ────────────────────────────────────────────
    const totalPnLPct = totalInvested > 0
        ? ((totalLiveValue - totalInvested) / totalInvested) * 100
        : 0;
    const killSwitch = totalPnLPct < -10
        ? { active: true, message: `Portfolio down ${Math.abs(totalPnLPct).toFixed(1)}% — reduce risk exposure immediately` }
        : { active: false, message: null };

    return {
        portfolioScore,
        regime,
        explain,
        sectorAllocation,
        capitalEfficiency: {
            deployed:   parseFloat(totalLiveValue.toFixed(2)),
            idle:       parseFloat(idle.toFixed(2)),
            score:      parseFloat(efficiencyScore.toFixed(1)),
            totalEquity: parseFloat(totalEquity.toFixed(2)),
        },
        positions,
        rebalancingSignals,
        killSwitch,
        meta: {
            positionCount: positions.length,
            realizedPnL:   portfolio.realizedPnL || 0,
            totalPnLPct:   parseFloat(totalPnLPct.toFixed(2)),
        }
    };
}

module.exports = { compute };
