/**
 * 🧪 [PHASE 11] ALPHA LAYER VERIFICATION SUITE (REVISED)
 * Tests 4 critical scenarios with proper LKG Map handling.
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
    
    // Ensure we seed with the same structure the engine expects
    cache[symbol] = {
        symbol,
        price: 100,
        timestamp: Date.now(),
        ...indicators
    };
    
    // Also seed the .NS variant just in case
    cache[symbol + '.NS'] = cache[symbol];

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`  💾 Seeded ${symbol} with:`, JSON.stringify(indicators));
}

async function resetState() {
    // Clear cache but keep the file existing so Persistence.load() doesn't return empty Map
    fs.writeFileSync(CACHE_FILE, JSON.stringify({}, null, 2));
    
    if (fs.existsSync(PORTFOLIO_FILE)) {
        const p = JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf8'));
        p.balance = 1000000;
        p.holdings = {};
        p.orders = [];
        p.pendingOrders = [];
        fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(p, null, 2));
    }
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
        if (expectedErrorFragment) {
            console.error(`  ❌ Expected error containing "${expectedErrorFragment}" but got success.`);
        }
    } catch (err) {
        const error = err.response ? err.response.data.error : err.message;
        const status = err.response ? err.response.status : 'N/A';
        console.log(`  ℹ️ Result: REJECTED (Status: ${status})`);
        console.log(`  📝 Error: ${error}`);
        
        if (expectedErrorFragment) {
            if (error && error.includes(expectedErrorFragment)) {
                console.log(`  ✅ Correctly Rejected: Found "${expectedErrorFragment}"`);
            } else {
                console.error(`  ❌ Wrong Rejection: Expected "${expectedErrorFragment}" but got "${error}"`);
            }
        }
    }
}

(async () => {
    console.log('🚀 Starting Alpha Layer Verification (v2)...\n');

    // 1. WEAK SIGNAL (RSI 50)
    await resetState();
    await seedCache('RELIANCE', { rsi: 50, ema20: 90, ema50: 100, momentum: -5 });
    await runTest('Weak Signal (RSI 50, Downward Trend)', 'RELIANCE', 1, 'ALPHA_REJECTED');

    // 2. MODERATE SIGNAL (RSI 30, EMA Trend)
    // Score: RSI < 35 (+2) + EMA Trend (+2) = 4/5 (Label: STRONG)
    await resetState();
    await seedCache('RELIANCE', { rsi: 30, ema20: 110, ema50: 100, momentum: -5 });
    await runTest('Moderate Signal (RSI 30, Upward Trend)', 'RELIANCE', 1, null);

    // 3. STRONG SIGNAL (RSI 30, EMA Trend, Momentum > 0)
    // Score: +2 +2 +1 = 5/5
    await resetState();
    await seedCache('RELIANCE', { rsi: 30, ema20: 110, ema50: 100, momentum: 10 });
    await runTest('Strong Signal (Perfect Alignment)', 'RELIANCE', 1, null);

    // 4. RISK OVERRIDE (Strong Signal, but large qty breaching Sector Cap)
    await resetState();
    await seedCache('RELIANCE', { rsi: 30, ema20: 110, ema50: 100, momentum: 10 });
    // RELIANCE is ENERGY. Cap is 30%.
    // Equity 1M. Cap 300k. Trade 4000 shares @ 100 = 400k.
    await runTest('Risk Override (Strong Signal + Sector Breach)', 'RELIANCE', 4000, 'RISK_REJECTED: SECTOR_CAP_EXCEEDED');

    console.log('\n🏁 Verification Suite Finished.');
})();
