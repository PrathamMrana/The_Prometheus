/**
 * 🔱 PROMETHEUS — ADVERSARIAL VALIDATION ENGINE
 *
 * PHASE: ADVERSARIAL RESEARCH MODE
 *
 * This module attempts to DISPROVE the existence of edge.
 * The system must survive hostile statistical scrutiny.
 *
 * Tasks:
 *   1. Synthetic Data Attack Suite
 *   2. Monte Carlo Robustness (expanded)
 *   3. Parameter Stability Testing
 *   4. Execution Hostility Simulation
 *   6. False Discovery Detector
 *   7. Final Research Gate
 */

'use strict';

// ── Cost constants (mirrored from tradeAnalytics) ────────────────────────────
const DEFAULT_SPREAD_PCT   = 0.001;
const DEFAULT_SLIPPAGE_PCT = 0.0005;
const DEFAULT_BROKERAGE    = 0.0003;
const STT_SELL             = 0.001;

// ── Helper: compute basic expectancy from a PnL array ───────────────────────
function _exp(pnls) {
    if (!pnls || pnls.length === 0) return 0;
    return pnls.reduce((s, p) => s + p, 0) / pnls.length;
}

function _pf(pnls) {
    const wins  = pnls.filter(p => p > 0).reduce((s, p) => s + p, 0);
    const loss  = Math.abs(pnls.filter(p => p <= 0).reduce((s, p) => s + p, 0));
    return loss > 0 ? wins / loss : wins > 0 ? 9.9 : 0;
}

function _winRate(pnls) {
    if (!pnls.length) return 0;
    return (pnls.filter(p => p > 0).length / pnls.length) * 100;
}

function _maxDD(pnls) {
    let peak = 0, equity = 0, maxDD = 0;
    for (const p of pnls) {
        equity += p;
        if (equity > peak) peak = equity;
        const dd = peak > 0 ? (peak - equity) / peak * 100 : 0;
        if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
}

// ── TASK 1: Synthetic Data Attack Suite ─────────────────────────────────────

/**
 * Generates 8 adversarial synthetic trade sets to probe for false edge detection.
 * @param {number} n - number of synthetic trades per set
 */
function runSyntheticAttackSuite(n = 100) {
    const results = {};

    // 1. Random Walk — pure noise, no edge
    const randomWalk = Array.from({ length: n }, () => (Math.random() - 0.5) * 2000);
    results.randomWalk = _evaluateSyntheticSet('Random Walk', randomWalk);

    // 2. Trend-Only — always wins small, easy mode
    const trendOnly = Array.from({ length: n }, (_, i) => 100 + i * 2 + (Math.random() - 0.4) * 200);
    results.trendOnly = _evaluateSyntheticSet('Trend-Only', trendOnly);

    // 3. Mean-Reverting — small wins with occasional large reversals
    const meanReverting = Array.from({ length: n }, (_, i) => {
        const cycle = Math.sin(i / 5) * 300;
        return cycle + (Math.random() - 0.5) * 100;
    });
    results.meanReverting = _evaluateSyntheticSet('Mean-Reverting', meanReverting);

    // 4. Flash-Crash Volatility — large sudden losses embedded
    const flashCrash = Array.from({ length: n }, (_, i) => {
        if (i % 20 === 0) return -5000; // crash event
        return (Math.random() - 0.45) * 800;
    });
    results.flashCrash = _evaluateSyntheticSet('Flash-Crash', flashCrash);

    // 5. High-Slippage Environment — cost drag destroys gross alpha
    const highSlippage = Array.from({ length: n }, () => {
        const gross = (Math.random() - 0.4) * 500;
        const slippage = Math.abs(gross) * 0.4 + 150; // 40%+ cost drag
        return gross - slippage;
    });
    results.highSlippage = _evaluateSyntheticSet('High-Slippage', highSlippage);

    // 6. Delayed Execution — late entries destroy edge
    const delayedExec = Array.from({ length: n }, () => {
        const signal = (Math.random() - 0.4) * 600;
        const latencyPenalty = Math.random() * 300; // fill quality degrades
        return signal - latencyPenalty;
    });
    results.delayedExec = _evaluateSyntheticSet('Delayed-Execution', delayedExec);

    // 7. Spread Expansion — widening spreads crush net alpha
    const spreadExpansion = Array.from({ length: n }, () => {
        const gross = (Math.random() - 0.3) * 700;
        const spread = (Math.random() * 0.005 + 0.003) * 10000; // 0.3-0.8% spread
        return gross - spread;
    });
    results.spreadExpansion = _evaluateSyntheticSet('Spread-Expansion', spreadExpansion);

    // 8. Outlier-Dependent Fake Profitability — all profits from 3 lucky trades
    const outlierFake = Array.from({ length: n }, (_, i) => {
        if (i < 3) return 15000; // 3 massive winners
        return (Math.random() - 0.55) * 400; // rest are mostly losers
    });
    results.outlierFake = _evaluateSyntheticSet('Outlier-Fake', outlierFake);

    return {
        datasets: results,
        summary: _summarizeSyntheticAttack(results)
    };
}

function _evaluateSyntheticSet(name, pnls) {
    const expectancy   = _exp(pnls);
    const profitFactor = _pf(pnls);
    const winRate      = _winRate(pnls);
    const maxDD        = _maxDD(pnls);

    // Top-5 contribution test (outlier dependency)
    const sorted = [...pnls].sort((a, b) => b - a);
    const top5   = sorted.slice(0, 5).reduce((s, p) => s + p, 0);
    const total  = pnls.reduce((s, p) => s + p, 0);
    const top5Pct = total > 0 ? (top5 / total) * 100 : 100;

    // Verdict: would our analytics correctly detect this as fake/hostile?
    const shouldBeDetectedAsFake = ['Random Walk', 'High-Slippage', 'Delayed-Execution', 'Outlier-Fake'].includes(name);
    const detectedAsFake = expectancy <= 0 || profitFactor < 1 || top5Pct > 75;
    const correctlyClassified = shouldBeDetectedAsFake ? detectedAsFake : !detectedAsFake;

    return {
        name,
        expectancy: parseFloat(expectancy.toFixed(2)),
        profitFactor: parseFloat(profitFactor.toFixed(3)),
        winRate: parseFloat(winRate.toFixed(2)),
        maxDDPct: parseFloat(maxDD.toFixed(2)),
        top5ContributionPct: parseFloat(top5Pct.toFixed(2)),
        shouldBeDetectedAsFake,
        detectedAsFake,
        correctlyClassified
    };
}

function _summarizeSyntheticAttack(results) {
    const all = Object.values(results);
    const correct = all.filter(r => r.correctlyClassified).length;
    return {
        totalTests: all.length,
        correctClassifications: correct,
        detectionAccuracy: parseFloat((correct / all.length * 100).toFixed(1)),
        status: correct === all.length ? 'DETECTION_PERFECT' : correct >= 6 ? 'DETECTION_ADEQUATE' : 'DETECTION_FAILING'
    };
}

// ── TASK 2: Expanded Monte Carlo Robustness ──────────────────────────────────

function runMonteCarlo(closedTrades, iterations = 500) {
    if (!closedTrades || closedTrades.length < 5) {
        return { status: 'INSUFFICIENT_DATA', needed: 5, got: closedTrades?.length || 0 };
    }

    const basePnLs = closedTrades.map(t => t.pnl);
    const baseExp  = _exp(basePnLs);

    const runResults = [];

    for (let i = 0; i < iterations; i++) {
        // Randomize: trade ordering + slippage severity + spread costs
        const slippageMult = 0.5 + Math.random() * 2.5;    // 0.5x–3x slippage
        const spreadMult   = 0.5 + Math.random() * 3.0;    // 0.5x–3.5x spread
        const latencyFrac  = Math.random() * 0.15;          // 0–15% latency decay

        const shuffled = [...basePnLs].sort(() => Math.random() - 0.5).map(p => {
            const hostileCost = Math.abs(p) * (
                DEFAULT_SLIPPAGE_PCT * slippageMult +
                DEFAULT_SPREAD_PCT   * spreadMult   +
                latencyFrac * 0.1
            );
            return p - hostileCost;
        });

        const exp = _exp(shuffled);
        const dd  = _maxDD(shuffled);
        runResults.push({ exp, dd, survived: exp > 0 });
    }

    runResults.sort((a, b) => a.exp - b.exp);

    const survivedCount  = runResults.filter(r => r.survived).length;
    const survivalRate   = (survivedCount / iterations) * 100;
    const ruinThreshold  = -0.2 * (closedTrades[0]?.avgCost || 10000); // 20% capital ruin
    const ruinCount      = runResults.filter(r => r.dd > 30).length;   // >30% drawdown = ruin
    const probabilityOfRuin = (ruinCount / iterations) * 100;

    const p5  = runResults[Math.floor(iterations * 0.05)];
    const p25 = runResults[Math.floor(iterations * 0.25)];
    const p50 = runResults[Math.floor(iterations * 0.50)];
    const p75 = runResults[Math.floor(iterations * 0.75)];
    const p95 = runResults[Math.floor(iterations * 0.95)];

    return {
        iterations,
        survivalRate: parseFloat(survivalRate.toFixed(2)),
        probabilityOfRuin: parseFloat(probabilityOfRuin.toFixed(2)),
        worstCaseDD: parseFloat(Math.max(...runResults.map(r => r.dd)).toFixed(2)),
        distribution: {
            p5:  parseFloat(p5.exp.toFixed(2)),
            p25: parseFloat(p25.exp.toFixed(2)),
            p50: parseFloat(p50.exp.toFixed(2)),
            p75: parseFloat(p75.exp.toFixed(2)),
            p95: parseFloat(p95.exp.toFixed(2))
        },
        verdict: survivalRate >= 65 ? 'ROBUST_UNDER_HOSTILITY'
               : survivalRate >= 40 ? 'FRAGILE_BUT_SURVIVABLE'
               : 'EDGE_DESTROYED_BY_HOSTILITY'
    };
}

// ── TASK 3: Parameter Stability Testing ─────────────────────────────────────

function runParameterStabilityTest(closedTrades) {
    if (!closedTrades || closedTrades.length < 10) {
        return { status: 'INSUFFICIENT_DATA' };
    }

    const basePnLs  = closedTrades.map(t => t.pnl);
    const baseExp   = _exp(basePnLs);
    const perturbations = [];

    // Simulate effect of ±parameter changes on outcomes
    const perturbSpecs = [
        { name: 'confidence_threshold_+5',  factor: 0.92 },
        { name: 'confidence_threshold_-5',  factor: 1.08 },
        { name: 'atr_mult_+10pct',          factor: 0.88 },
        { name: 'atr_mult_-10pct',          factor: 1.12 },
        { name: 'breakout_bounds_+10pct',   factor: 0.90 },
        { name: 'breakout_bounds_-10pct',   factor: 1.10 },
        { name: 'cooldown_window_+20pct',   factor: 0.85 },
        { name: 'cooldown_window_-20pct',   factor: 1.05 },
    ];

    for (const spec of perturbSpecs) {
        // Approximate: tighter thresholds reduce trade count (factor < 1 = fewer trades, filter better)
        // Looser thresholds add noise trades (factor > 1 = more trades, lower quality)
        const perturbedPnLs = basePnLs.map(p => {
            const noise = (Math.random() - 0.5) * Math.abs(p) * Math.abs(1 - spec.factor) * 2;
            return p * spec.factor + noise;
        });

        const perturbedExp = _exp(perturbedPnLs);
        const expChangePct = baseExp !== 0 ? (perturbedExp - baseExp) / Math.abs(baseExp) * 100 : 0;

        perturbations.push({
            name: spec.name,
            baseExpectancy: parseFloat(baseExp.toFixed(2)),
            perturbedExpectancy: parseFloat(perturbedExp.toFixed(2)),
            changePct: parseFloat(expChangePct.toFixed(2)),
            isCatastrophic: Math.abs(expChangePct) > 50 && perturbedExp <= 0
        });
    }

    const catastrophicCount = perturbations.filter(p => p.isCatastrophic).length;
    const fragile = catastrophicCount >= 3;

    return {
        perturbations,
        catastrophicCount,
        fragile,
        status: fragile ? 'PARAMETER_FRAGILITY_WARNING' : 'PARAMETER_STABLE'
    };
}

// ── TASK 4: Execution Hostility Simulation ───────────────────────────────────

function runExecutionHostilitySimulation(closedTrades) {
    if (!closedTrades || closedTrades.length < 5) {
        return { status: 'INSUFFICIENT_DATA' };
    }

    const basePnLs = closedTrades.map(t => t.pnl);
    const baseNet  = basePnLs.reduce((s, p) => s + p, 0);

    const scenarios = [
        {
            name: 'Partial Fills (50% size)',
            apply: pnl => pnl * 0.5,
            description: 'Only half position filled due to thin liquidity'
        },
        {
            name: 'Delayed Fill (+30s slippage)',
            apply: pnl => pnl - Math.abs(pnl) * 0.08,
            description: 'Late fills cost 8% of gross per trade'
        },
        {
            name: 'Slippage Spike (3x normal)',
            apply: pnl => pnl - Math.abs(pnl) * (DEFAULT_SLIPPAGE_PCT * 3),
            description: 'High-volatility slippage environment'
        },
        {
            name: 'Liquidity Drought (50% of trades missed)',
            apply: (pnl, i) => i % 2 === 0 ? 0 : pnl,
            description: 'Half of signals cannot be filled at all'
        },
        {
            name: 'Spread Explosion (5x spread)',
            apply: pnl => pnl - Math.abs(pnl) * (DEFAULT_SPREAD_PCT * 5),
            description: '5x normal bid-ask spread environment'
        },
    ];

    const results = scenarios.map(s => {
        const hostile = basePnLs.map((p, i) => s.apply(p, i));
        const netPnL  = hostile.reduce((a, b) => a + b, 0);
        const alphaRetained = baseNet !== 0 ? (netPnL / baseNet) * 100 : 0;
        return {
            scenario: s.name,
            description: s.description,
            netPnL: parseFloat(netPnL.toFixed(2)),
            alphaRetainedPct: parseFloat(alphaRetained.toFixed(2)),
            survived: netPnL > 0
        };
    });

    const survivedCount = results.filter(r => r.survived).length;
    const minRetention  = Math.min(...results.map(r => r.alphaRetainedPct));

    return {
        scenarios: results,
        survivedScenarios: survivedCount,
        totalScenarios: scenarios.length,
        minAlphaRetentionPct: parseFloat(minRetention.toFixed(2)),
        netAlphaSurvival: parseFloat((survivedCount / scenarios.length * 100).toFixed(1)),
        status: survivedCount >= 4 ? 'EXECUTION_ROBUST'
              : survivedCount >= 2 ? 'EXECUTION_FRAGILE'
              : 'EXECUTION_ALPHA_DESTROYED'
    };
}

// ── TASK 6: False Discovery Detector ─────────────────────────────────────────

function runFalseDiscoveryAnalysis(closedTrades) {
    if (!closedTrades || closedTrades.length < 10) {
        return { status: 'INSUFFICIENT_DATA' };
    }

    const sorted = [...closedTrades].sort((a, b) => a.timestamp - b.timestamp);
    const pnls   = sorted.map(t => t.pnl);
    const n      = pnls.length;

    // 1. Winning Streak Significance (Runs test)
    const winStreak = _longestStreak(pnls, p => p > 0);
    const lossStreak = _longestStreak(pnls, p => p <= 0);
    const winRate = pnls.filter(p => p > 0).length / n;
    const expectedMaxStreak = Math.log(n) / Math.log(1 / winRate);  // E[max streak]
    const streakSignificant = winStreak > expectedMaxStreak * 2;

    // 2. Concentrated Profit Periods (first 20% vs last 80%)
    const firstWindow = pnls.slice(0, Math.floor(n * 0.2));
    const restWindow  = pnls.slice(Math.floor(n * 0.2));
    const firstExp    = _exp(firstWindow);
    const restExp     = _exp(restWindow);
    const profitConcentrated = firstExp > 0 && restExp <= 0;

    // 3. Regime Luck (single regime dominates profits)
    const byRegime = {};
    for (const t of sorted) {
        const r = t.tradeTags?.regime || 'UNKNOWN';
        if (!byRegime[r]) byRegime[r] = [];
        byRegime[r].push(t.pnl);
    }
    const regimePnLs = Object.entries(byRegime).map(([r, ps]) => ({
        regime: r, totalPnL: _exp(ps) * ps.length, pct: 0
    }));
    const totalPnL = pnls.reduce((s, p) => s + p, 0);
    for (const r of regimePnLs) r.pct = totalPnL > 0 ? (r.totalPnL / totalPnL) * 100 : 0;
    regimePnLs.sort((a, b) => b.totalPnL - a.totalPnL);
    const topRegimeDominance = regimePnLs[0]?.pct || 0;
    const regimeLuck = topRegimeDominance > 80 && regimePnLs.length < 3;

    // 4. Lucky Outlier Dependency (already in main analytics, summarised here)
    const top3PnL = [...pnls].sort((a, b) => b - a).slice(0, 3).reduce((s, p) => s + p, 0);
    const top3Pct = totalPnL > 0 ? (top3PnL / totalPnL) * 100 : 100;
    const outlierLucky = top3Pct > 60;

    const flags = [];
    if (streakSignificant) flags.push('WINNING_STREAK_LUCK');
    if (profitConcentrated) flags.push('PROFIT_CONCENTRATED_IN_EARLY_TRADES');
    if (regimeLuck)         flags.push('SINGLE_REGIME_DEPENDENCE');
    if (outlierLucky)       flags.push('OUTLIER_LUCK_DETECTED');

    return {
        winStreak,
        lossStreak,
        expectedMaxStreak: parseFloat(expectedMaxStreak.toFixed(1)),
        streakSignificant,
        profitConcentrated,
        regimeLuck,
        outlierLucky,
        top3ContributionPct: parseFloat(top3Pct.toFixed(2)),
        topRegimeDominancePct: parseFloat(topRegimeDominance.toFixed(2)),
        flags,
        status: flags.length === 0 ? 'NO_FALSE_DISCOVERY' : flags.length <= 1 ? 'MILD_FALSE_DISCOVERY_RISK' : 'HIGH_FALSE_DISCOVERY_RISK'
    };
}

function _longestStreak(arr, predicate) {
    let maxStreak = 0, cur = 0;
    for (const v of arr) {
        if (predicate(v)) { cur++; maxStreak = Math.max(maxStreak, cur); }
        else cur = 0;
    }
    return maxStreak;
}

// ── TASK 7: Final Research Gate ───────────────────────────────────────────────

function evaluateResearchGate(analytics, monteCarlo, syntheticAttack, paramStability, executionHostility, falseDiscovery) {
    const checks = [
        {
            id: 'GATE_1_COSTS',
            label: 'Edge Survives Slippage & Fees',
            passed: analytics.execution?.alphaRetentionPct > 30,
            evidence: `Alpha Retention: ${analytics.execution?.alphaRetentionPct?.toFixed(1)}%`
        },
        {
            id: 'GATE_2_WALK_FORWARD',
            label: 'Edge Survives Walk-Forward Testing',
            passed: analytics.walkForward?.status === 'FORWARD_STABLE',
            evidence: `OOS Degradation: ${analytics.walkForward?.degradationPct?.toFixed(1)}%`
        },
        {
            id: 'GATE_3_SYNTHETIC',
            label: 'Edge Survives Synthetic Hostile Environments',
            passed: syntheticAttack?.summary?.status === 'DETECTION_PERFECT' || syntheticAttack?.summary?.detectionAccuracy >= 75,
            evidence: `Detection Accuracy: ${syntheticAttack?.summary?.detectionAccuracy}%`
        },
        {
            id: 'GATE_4_PARAMETERS',
            label: 'Edge Survives Parameter Perturbation',
            passed: paramStability?.status === 'PARAMETER_STABLE',
            evidence: `Catastrophic Breaks: ${paramStability?.catastrophicCount || 0}/8`
        },
        {
            id: 'GATE_5_MONTE_CARLO',
            label: 'Edge Survives Monte Carlo Reshuffling',
            passed: monteCarlo?.survivalRate >= 55,
            evidence: `Survival Rate: ${monteCarlo?.survivalRate?.toFixed(1)}%`
        },
        {
            id: 'GATE_6_REGIMES',
            label: 'Edge Survives Regime Transitions',
            passed: analytics.diversity?.profitableRegimeCount >= 2,
            evidence: `Profitable Regimes: ${analytics.diversity?.profitableRegimeCount || 0}`
        },
        {
            id: 'GATE_7_EQUITY',
            label: 'Equity Curve Is Statistically Stable',
            passed: analytics.consistency?.status === 'SMOOTH_EQUITY' || analytics.consistency?.status === 'STABLE',
            evidence: `Sharpe Proxy: ${analytics.consistency?.sharpeProxy?.toFixed(3)}`
        },
        {
            id: 'GATE_8_OUTLIERS',
            label: 'Profitability Is NOT Outlier-Dependent',
            passed: !analytics.outliers?.isOutlierDominated,
            evidence: `Trimmed Exp: ₹${analytics.outliers?.trimmedExpectancy?.toFixed(0)}`
        },
        {
            id: 'GATE_9_EXECUTION',
            label: 'Edge Survives Hostile Execution Conditions',
            passed: executionHostility?.survivedScenarios >= 3,
            evidence: `Survived: ${executionHostility?.survivedScenarios}/${executionHostility?.totalScenarios} scenarios`
        },
        {
            id: 'GATE_10_FALSE_DISCOVERY',
            label: 'No False Discovery Detected',
            passed: falseDiscovery?.status === 'NO_FALSE_DISCOVERY',
            evidence: `Flags: ${falseDiscovery?.flags?.join(', ') || 'None'}`
        }
    ];

    const passedCount = checks.filter(c => c.passed).length;
    const totalGates  = checks.length;
    const gateScore   = (passedCount / totalGates) * 100;

    // ── TASK 4: DEPLOYMENT READINESS SCORE ──
    // Weights: 20% statistical validity, 20% adversarial survival, 15% execution realism, 
    // 15% drawdown survivability, 10% calibration quality, 10% regime diversity, 10% operational stability.
    
    // 1. Statistical Validity (20%) - Uses Sample Quality Score & Walk-Forward
    const statValidityScore = ((analytics.sampleQuality?.score || 0) + (analytics.walkForward?.status === 'FORWARD_STABLE' ? 100 : 0)) / 2 * 0.20;
    
    // 2. Adversarial Survival (20%) - Synthetic Attack & False Discovery
    const advSurvivalScore = ((syntheticAttack?.summary?.detectionAccuracy || 0) + (falseDiscovery?.status === 'NO_FALSE_DISCOVERY' ? 100 : falseDiscovery?.status === 'MILD_FALSE_DISCOVERY_RISK' ? 50 : 0)) / 2 * 0.20;
    
    // 3. Execution Realism (15%) - Hostility Sim & Costs
    const execRealismScore = ((executionHostility?.netAlphaSurvival || 0) + (analytics.execution?.alphaRetentionPct > 50 ? 100 : analytics.execution?.alphaRetentionPct > 30 ? 50 : 0)) / 2 * 0.15;
    
    // 4. Drawdown Survivability (15%) - Monte Carlo Ruin & Consistency
    const ddSurvivalScore = ((100 - (monteCarlo?.probabilityOfRuin || 100)) + (analytics.consistency?.consistencyScore || 0)) / 2 * 0.15;
    
    // 5. Calibration Quality (10%)
    const calibScore = (analytics.calibration?.isValid ? 100 : 0) * 0.10;
    
    // 6. Regime Diversity (10%)
    const regimeDivScore = (analytics.diversity?.score || 0) * 0.10;
    
    // 7. Operational Stability (10%) - Parameter Stability
    const opStabilityScore = (paramStability?.status === 'PARAMETER_STABLE' ? 100 : paramStability?.status === 'PARAMETER_FRAGILITY_WARNING' ? 0 : 50) * 0.10;
    
    const readinessScoreRaw = statValidityScore + advSurvivalScore + execRealismScore + ddSurvivalScore + calibScore + regimeDivScore + opStabilityScore;
    const readinessScore = parseFloat(readinessScoreRaw.toFixed(1));

    let deploymentVerdict;
    if (analytics.meta?.tradeCount < 500) {
        deploymentVerdict = 'RESEARCH_CAMPAIGN_ACTIVE'; // Need 500+ trades
    } else if (readinessScore >= 90) {
        deploymentVerdict = 'FULL_PAPER_VALIDATION_PASSED';
    } else if (readinessScore >= 80) {
        deploymentVerdict = 'LIMITED_CAPITAL_ELIGIBLE';
    } else if (readinessScore >= 60) {
        deploymentVerdict = 'RESEARCH_ONLY';
    } else {
        deploymentVerdict = 'NOT_DEPLOYABLE';
    }


    return {
        checks,
        passedCount,
        totalGates,
        gateScore: parseFloat(gateScore.toFixed(1)),
        readinessScore,
        deploymentVerdict
    };
}

// ── Master Run ────────────────────────────────────────────────────────────────

function runFullAdversarialSuite(portfolio, analyticsResult) {
    const closedTrades = (portfolio.orders || [])
        .filter(o => o.side === 'SELL' && o.status === 'FILLED' && typeof o.pnl === 'number');

    const syntheticAttack    = runSyntheticAttackSuite(100);
    const monteCarlo         = runMonteCarlo(closedTrades, 500);
    const paramStability     = runParameterStabilityTest(closedTrades);
    const executionHostility = runExecutionHostilitySimulation(closedTrades);
    const falseDiscovery     = runFalseDiscoveryAnalysis(closedTrades);
    const researchGate       = evaluateResearchGate(
        analyticsResult,
        monteCarlo,
        syntheticAttack,
        paramStability,
        executionHostility,
        falseDiscovery
    );

    return {
        generatedAt: new Date().toISOString(),
        tradeCount: closedTrades.length,
        syntheticAttack,
        monteCarlo,
        paramStability,
        executionHostility,
        falseDiscovery,
        researchGate
    };
}

module.exports = { runFullAdversarialSuite };
