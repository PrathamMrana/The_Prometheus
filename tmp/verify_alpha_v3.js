/**
 * 🧪 [PHASE 11] ALPHA LAYER VERIFICATION SUITE (v3)
 * Uses TCS to minimize competition with background worker in lkg_cache.json.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API = 'http://localhost:3001/api/trade/order';
const CACHE_FILE = path.join(__dirname, '../server/data/lkg_cache.json');
const PORTFOLIO_FILE = path.join(__dirname, '../server/data/portfolio.json');

async function seedCache(symbol, indicators) {
    let cache = {};
    if (fs.existsSync(CACHE_FILE)) {
        try {
            cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        } catch (e) { cache = {}; }
    }
    
    cache[symbol] = {
        symbol,
        price: 100,
        timestamp: Date.now(),
        ...indicators
    };
    
    // Seed both the raw and .NS variant to be safe
    cache[symbol + '.NS'] = cache[symbol];

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`  💾 Seeded ${symbol} in LKG cache...`);
}

async function resetState() {
    // We don't wipe the whole cache, just ensure our target symbols are clean for the test
}

async function runTest(name, symbol, qty, expectedErrorFragment) {
    console.log(`\n▶️ Testing: ${name}`);
    try {
        const res = await axios.post(API, {
            symbol,
            side: 'BUY',
            type: 'MARKET',
            qty
        });
        console.log(`  ✅ Result: SUCCESS (Status: ${res.status})`);
        if (expectedErrorFragment) console.error(`  ❌ Expected error containing "${expectedErrorFragment}" but got success.`);
    } catch (err) {
        const error = err.response ? err.response.data.error : err.message;
        const status = err.response ? err.response.status : 'N/A';
        console.log(`  ℹ️ Result: REJECTED (Status: ${status})`);
        console.log(`  📝 Error: ${error}`);
        
        if (expectedErrorFragment && error.includes(expectedErrorFragment)) {
            console.log(`  ✅ Correctly Rejected: Found "${expectedErrorFragment}"`);
        } else if (expectedErrorFragment) {
            console.error(`  ❌ Wrong Rejection: Expected "${expectedErrorFragment}" but got "${error}"`);
        }
    }
}

(async () => {
    console.log('🚀 Starting Alpha Layer Verification (v3)...\n');

    // 1. WEAK SIGNAL (RSI 50)
    await seedCache('TCS', { rsi: 50, ema20: 90, ema50: 100, momentum: -5 });
    await runTest('Weak Signal (RSI 50)', 'TCS', 1, 'ALPHA_REJECTED');

    // 2. MODERATE SIGNAL (RSI 30, EMA Trend)
    // Score: RSI < 35 (+2) + EMA Trend (+2) = 4/5
    await seedCache('TCS', { rsi: 30, ema20: 110, ema50: 100, momentum: -5 });
    await runTest('Moderate Signal (Score 4)', 'TCS', 1, null);

    // 3. STRONG SIGNAL (RSI 30, EMA Trend, Momentum > 0)
    // Score: 5/5
    await seedCache('TCS', { rsi: 30, ema20: 110, ema50: 100, momentum: 10 });
    await runTest('Strong Signal (Score 5)', 'TCS', 1, null);

    // 4. RISK OVERRIDE (Strong Signal + Sector Breach)
    // TCS is IT. Cap is 30%. Equity 1M. Need > 300k value.
    // 4000 shares @ 100 = 400k.
    await seedCache('TCS', { rsi: 30, ema20: 110, ema50: 100, momentum: 10 });
    await runTest('Risk Override (Strong + Sector Breach)', 'TCS', 4000, 'RISK_REJECTED: SECTOR_CAP_EXCEEDED');

    console.log('\n🏁 Verification Suite Finished.');
})();
