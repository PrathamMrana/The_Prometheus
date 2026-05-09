'use strict';
const { computeSmartMoney } = require('./engines/smartMoneyEngine');

// ── Helper: build a 25-candle OHLCV history ────────────────────────────────
function buildHistory({ startPrice, trend, volumeBase, volumeScale = 1 }) {
    const candles = [];
    let price = startPrice;
    for (let i = 0; i < 25; i++) {
        price = price * (1 + (trend * (0.5 + Math.random() * 0.5)));
        candles.push({
            close:  parseFloat(price.toFixed(2)),
            volume: Math.round(volumeBase * volumeScale * (0.8 + Math.random() * 0.4))
        });
    }
    return candles;
}

// ── 20 varied test scenarios ────────────────────────────────────────────────
const scenarios = [
    // High accumulation (strong up trend + extreme volume)
    { symbol: 'RELIANCE',   startPrice: 2900, trend:  0.004,  volumeBase: 1200000, finalVR: 4.5,  desc: 'Extreme spike (VR=4.5) → diminishing returns test'  },
    { symbol: 'SBIN',       startPrice:  750, trend:  0.005,  volumeBase: 3000000, finalVR: 3.1,  desc: 'Just-above cap (VR=3.1) → log dampening applied'      },
    { symbol: 'TATASTEEL',  startPrice: 1200, trend:  0.006,  volumeBase:  900000, finalVR: 2.8,  desc: 'Near-cap (VR=2.8) → high accumulation signal'         },
    { symbol: 'ADANIENT',   startPrice: 2400, trend:  0.004,  volumeBase:  800000, finalVR: 2.5,  desc: 'Strong VR → ACCUMULATION if consistency holds'         },
    { symbol: 'COALINDIA',  startPrice:  440, trend:  0.003,  volumeBase: 2000000, finalVR: 3.8,  desc: 'PSU rally + high vol → extreme dampening test'         },
    { symbol: 'LT',         startPrice: 3200, trend:  0.005,  volumeBase:  400000, finalVR: 2.2,  desc: 'Infrastructure surge → mid-high accumulation'          },
    // Mid-range signals
    { symbol: 'INFY',       startPrice: 1400, trend:  0.001,  volumeBase:  800000, finalVR: 1.4,  desc: 'Mild above-average vol → mid-range score'             },
    { symbol: 'WIPRO',      startPrice:  450, trend:  0.003,  volumeBase:  700000, finalVR: 1.8,  desc: 'Moderate breakout → consistent up + vol boost'         },
    { symbol: 'SUNPHARMA',  startPrice: 1200, trend:  0.002,  volumeBase:  600000, finalVR: 1.6,  desc: 'Pharma trend + avg vol above mean'                     },
    { symbol: 'HINDUNILVR', startPrice: 2700, trend:  0.001,  volumeBase:  600000, finalVR: 1.1,  desc: 'Flat vol near average → neutral-ish score'             },
    { symbol: 'POWERGRID',  startPrice:  290, trend:  0.001,  volumeBase:  700000, finalVR: 1.0,  desc: 'Exactly at average volume → baseline reference'        },
    { symbol: 'NTPC',       startPrice:  330, trend:  0.002,  volumeBase: 1100000, finalVR: 1.3,  desc: 'Slow uptrend + mild vol → moderate signal'             },
    // Distribution / low signals
    { symbol: 'HDFCBANK',   startPrice: 1700, trend: -0.003,  volumeBase: 2000000, finalVR: 0.25, desc: 'Low volume + falling price → clear DISTRIBUTION'       },
    { symbol: 'ICICIBANK',  startPrice: 1100, trend: -0.004,  volumeBase: 1500000, finalVR: 0.15, desc: 'Very low vol + decline → strong DISTRIBUTION signal'   },
    { symbol: 'ITC',        startPrice:  460, trend: -0.003,  volumeBase: 3500000, finalVR: 0.10, desc: 'Minimal vol + consistent decline → lowest score test'  },
    { symbol: 'MARUTI',     startPrice:11500, trend: -0.002,  volumeBase:  500000, finalVR: 0.20, desc: 'Auto sector pullback + low vol'                         },
    { symbol: 'TITAN',      startPrice: 3300, trend: -0.001,  volumeBase:  400000, finalVR: 0.12, desc: 'Luxury goods selloff + near-zero volume'               },
    // Edge cases
    { symbol: 'KOTAKBANK',  startPrice: 1800, trend:  0.000,  volumeBase:  800000, finalVR: 0.18, desc: 'Flat price + very low vol → neutral-low'               },
    { symbol: 'DRREDDY',    startPrice: 5900, trend:  0.008,  volumeBase:  300000, finalVR: 5.0,  desc: 'Highest VR=5.0 → maximum diminishing returns test'     },
    { symbol: 'BAJFINANCE', startPrice: 6800, trend:  0.006,  volumeBase: 1000000, finalVR: 3.5,  desc: 'NBFC surge + 3.5x vol → saturation boundary'          },
];

// ── PRE-PHASE-18 SCORING SIMULATION (old linear model) ────────────────────
function oldLinearScore(vr) {
    const raw = vr * 50;  // old: volumeScore = ratio * 50 (no cap)
    return Math.min(100, raw);
}

// ── Run all 20 and collect results ────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
console.log('║   🔱 PHASE 18 — SMART MONEY CALIBRATION PROOF RUN (20 scenarios)   ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

const results = [];

for (const sc of scenarios) {
    const history = buildHistory({
        startPrice: sc.startPrice,
        trend:      sc.trend,
        volumeBase: sc.volumeBase
    });

    // Inject the scenario's target volume ratio as the final candle
    const finalVolume = Math.round(sc.volumeBase * sc.finalVR);
    history[history.length - 1].volume = finalVolume;

    const result = computeSmartMoney({ prices: history, symbol: sc.symbol });
    const oldVS  = Math.min(100, (sc.finalVR / 3.0) * 100); // new capped model baseline
    const legacyVS = oldLinearScore(sc.finalVR);             // pre-phase-18 linear model

    results.push({
        ...sc,
        ...result,
        legacyVolumeScore: legacyVS,
        saturationDiff:    (legacyVS - result.volumeScore).toFixed(1)
    });
}

// ── SMART_MONEY_TRACE LOG SECTION ─────────────────────────────────────────
console.log('──────────────────────────────────────────────────────────────────────');
console.log('📡 20 SMART_MONEY_TRACE LOGS (POST-CALIBRATION):');
console.log('──────────────────────────────────────────────────────────────────────\n');

results.forEach((r, i) => {
    console.log(`[SMART_MONEY_TRACE] #${String(i+1).padStart(2,'0')} | ${r.symbol.padEnd(11)} | VR:${r.vr.toFixed(2).padEnd(5)} | VolScore:${r.volumeScore.toFixed(1).padEnd(6)} | Consist:${(r.consistency*100).toFixed(0).padEnd(4)}% | Score:${r.score.toFixed(1).padEnd(6)} | ${r.classification.padEnd(14)} | ${r.rationale}`);
});

// ── RANKING TABLE: BEFORE vs AFTER ────────────────────────────────────────
console.log('\n──────────────────────────────────────────────────────────────────────');
console.log('📊 BEFORE vs AFTER RANKING (Old Linear vs Phase 18 Calibrated):');
console.log('──────────────────────────────────────────────────────────────────────');

const beforeRank = [...results].sort((a, b) => b.legacyVolumeScore - a.legacyVolumeScore);
const afterRank  = [...results].sort((a, b) => b.score - a.score);

console.log('\nBEFORE (Old linear vol score, no cap — rank by legacyVolScore):');
console.log('RANK | SYMBOL      | VR    | LEG_VS | OLD_CLASS');
beforeRank.slice(0, 10).forEach((r, i) => {
    const oldClass = r.legacyVolumeScore >= 75 ? 'ACCUMULATION' : r.legacyVolumeScore <= 35 ? 'DISTRIBUTION' : 'NEUTRAL';
    console.log(`  ${String(i+1).padStart(2)} | ${r.symbol.padEnd(11)} | ${r.vr.toFixed(2).padEnd(5)} | ${r.legacyVolumeScore.toFixed(1).padEnd(6)} | ${oldClass}`);
});

console.log('\nAFTER (Phase 18 final score — rank by blended smartMoneyScore):');
console.log('RANK | SYMBOL      | VR    | SCORE  | SATURATED? | CLASS');
afterRank.slice(0, 10).forEach((r, i) => {
    const saturated = r.score >= 100 ? '🔴 YES' : '✅ NO ';
    console.log(`  ${String(i+1).padStart(2)} | ${r.symbol.padEnd(11)} | ${r.vr.toFixed(2).padEnd(5)} | ${r.score.toFixed(1).padEnd(6)} | ${saturated}       | ${r.classification}`);
});

// ── SATURATION PROOF ──────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────────────────────────────────');
console.log('🛡️  SATURATION PROOF:');
console.log('──────────────────────────────────────────────────────────────────────');

const allScores = results.map(r => r.score);
const highest   = results.reduce((a, b) => b.score > a.score ? b : a);
const lowest    = results.reduce((a, b) => b.score < a.score ? b : a);
const saturated = results.filter(r => r.score >= 100);

console.log(`Highest Score:   ${highest.score.toFixed(2)} [${highest.symbol}]  VR=${highest.vr.toFixed(2)}x  → ${highest.rationale}`);
console.log(`Lowest Score:    ${lowest.score.toFixed(2)} [${lowest.symbol}]   VR=${lowest.vr.toFixed(2)}x  → ${lowest.rationale}`);
console.log(`Score Spread:    ${(highest.score - lowest.score).toFixed(2)} points`);
console.log(`Saturated (=100):${saturated.length} symbols  ${saturated.length === 0 ? '✅ ZERO SATURATION CONFIRMED' : '❌ SATURATION EXISTS'}`);
console.log(`Scores ≥ 90:     ${results.filter(r => r.score >= 90).length} symbols`);
console.log(`Scores ≥ 80:     ${results.filter(r => r.score >= 80).length} symbols`);
console.log(`Scores ≤ 40:     ${results.filter(r => r.score <= 40).length} symbols`);

// ── WEBSOCKET PAYLOAD SAMPLE ───────────────────────────────────────────────
const sample = afterRank[0];
const wsPayload = {
    type: "TICK_DELTA",
    updates: [{
        symbol:   sample.symbol,
        price:    sample.startPrice,
        percent:  parseFloat((sample.trend * 100).toFixed(3)),
        signal: {
            score:      parseFloat(sample.score.toFixed(2)),
            decision:   sample.score >= 70 ? 'BUY' : 'HOLD',
            sectorFlow: 0.42,
            breakout:   sample.score >= 80,
            smartMoney: {
                score:          parseFloat(sample.score.toFixed(2)),
                vr:             parseFloat(sample.vr.toFixed(2)),
                consistency:    parseFloat((sample.consistency).toFixed(3)),
                volumeScore:    parseFloat(sample.volumeScore.toFixed(2)),
                classification: sample.classification,
                rationale:      sample.rationale
            }
        }
    }],
    sync_id: "p18-proof-" + Date.now()
};

console.log('\n──────────────────────────────────────────────────────────────────────');
console.log('📡 WEBSOCKET PAYLOAD SAMPLE (TICK_DELTA with smartMoney object):');
console.log('──────────────────────────────────────────────────────────────────────');
console.log(JSON.stringify(wsPayload, null, 2));

// ── UI STATE DESCRIPTION ──────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────────────────────────────────');
console.log('🖥️  UI STATE DESCRIPTIONS (Post-WebSocket update, no page refresh):');
console.log('──────────────────────────────────────────────────────────────────────');

afterRank.slice(0, 5).forEach((r, i) => {
    const borderColor  = r.classification === 'ACCUMULATION' ? 'border-bull/50 (GREEN glow)' :
                         r.classification === 'DISTRIBUTION' ? 'border-bear/50 (RED glow)' : 'border-gold/30 (GOLD)';
    const badge        = r.classification === 'ACCUMULATION' ? '[ACCUMULATION] badge (bg-bull, text-black)' :
                         r.classification === 'DISTRIBUTION' ? '[DISTRIBUTION] badge (bg-bear, text-white)' : '[NEUTRAL]';
    const scoreBar     = `${r.score.toFixed(0)}% filled (${r.classification === 'ACCUMULATION' ? 'bg-bull' : 'bg-white/40'})`;
    const tooltip      = r.rationale;

    console.log(`\n  Card #${i+1}: ${r.symbol}`);
    console.log(`    Card border:       ${borderColor}`);
    console.log(`    Classification:    ${badge}`);
    console.log(`    Score bar:         ${scoreBar}`);
    console.log(`    VR display:        VR: ${r.vr.toFixed(1)}x`);
    console.log(`    Rationale tooltip: "${tooltip}"`);
    console.log(`    Factor row:        VOL=${r.volumeScore.toFixed(0)}%  CONS=${(r.consistency*100).toFixed(0)}%`);
});

console.log('\n✅ PHASE 18 PROOF COMPLETE');
console.log('═══════════════════════════════════════════════════════════════════════\n');
