#!/usr/bin/env node
/**
 * PROMETHEUS PHASE 15.2 — MARKET-OPEN VALIDATION SCRIPT
 * Run this at 9:15 AM IST on a market day.
 * Usage: node scripts/validate_market_open.js
 */

const http = require('http');

const PASS = (msg) => console.log('  ✅ ' + msg);
const FAIL = (msg) => console.log('  ❌ ' + msg);
const WARN = (msg) => console.log('  ⚠️  ' + msg);

function get(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 4000 }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(new Error('JSON parse failed')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
    });
}

async function run() {
    console.log('\n====================================================');
    console.log('  PROMETHEUS PHASE 15.2 — MARKET-OPEN CERTIFICATION');
    console.log('  ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    console.log('====================================================\n');

    let [state, portfolio] = [null, null];

    try {
        state = await get('http://localhost:3001/api/intelligence/state');
    } catch (e) {
        console.log('❌ FATAL: Cannot reach intelligence state API:', e.message);
        process.exit(1);
    }

    try {
        portfolio = await get('http://localhost:3001/api/trade/portfolio');
    } catch (e) {
        console.log('❌ FATAL: Cannot reach portfolio API:', e.message);
        process.exit(1);
    }

    const prices   = state?.data?.prices || {};
    const holdings = Array.isArray(portfolio.holdings)
        ? portfolio.holdings
        : Object.values(portfolio.holdings || {});
    const now = Date.now();
    let failures = 0;

    // ── 1. MARKET STATUS ───────────────────────────────
    console.log('CHECK 1: MARKET STATUS');
    const marketStatus = state?.data?.regime ? 'data present' : 'unknown';
    const sampleStatus = Object.values(prices)[0]?.status;
    if (sampleStatus === 'OPEN') PASS('Market is OPEN — live data expected');
    else { WARN('Market status = ' + sampleStatus + ' — run again after 9:15 AM IST'); }

    // ── 2. TIMESTAMP FRESHNESS ─────────────────────────
    console.log('\nCHECK 2: TIMESTAMP FRESHNESS');
    const timestamps = Object.values(prices).map(p => p.timestamp).filter(Boolean);
    if (timestamps.length) {
        const latest  = Math.max(...timestamps);
        const drift_s = Math.round((now - latest) / 1000);
        console.log('   Latest data age:', drift_s, 's');
        if (drift_s < 60)  PASS('Data fresh — ' + drift_s + 's old');
        else if (drift_s < 300) WARN('Data is ' + drift_s + 's old (within 5 min tolerance)');
        else { FAIL('Data STALE — ' + drift_s + 's old. Market data not updating.'); failures++; }
    } else {
        FAIL('No timestamps found'); failures++;
    }

    // ── 3. VOLUME VALIDATION ───────────────────────────
    console.log('\nCHECK 3: VOLUME DATA (must be non-zero at market open)');
    const withVolume = Object.entries(prices).filter(([,v]) => v.volume && v.volume > 0);
    const zeroVol    = Object.entries(prices).filter(([,v]) => !v.volume || v.volume === 0);
    if (withVolume.length > 0) {
        PASS(withVolume.length + '/' + Object.keys(prices).length + ' symbols have live volume');
        if (zeroVol.length > 0) WARN(zeroVol.map(([s]) => s).join(', ') + ' still showing volume=0');
    } else {
        FAIL('ALL symbols show volume=0 during market hours → YAHOO PARSING BUG');
        failures++;
    }

    // ── 4. SYMBOL COVERAGE ────────────────────────────
    console.log('\nCHECK 4: PORTFOLIO SYMBOL COVERAGE');
    const missing = [];
    holdings.forEach(h => {
        const sym = (h.symbol || '').split('.')[0].toUpperCase();
        const ltp = prices[sym]?.price;
        if (ltp && Number.isFinite(ltp) && ltp > 0) {
            PASS(sym + ': LTP=₹' + ltp);
        } else {
            FAIL(sym + ': NO LIVE PRICE — positions panel will show "NO LIVE DATA"');
            missing.push(sym);
            failures++;
        }
    });
    if (missing.length === 0) PASS('100% portfolio coverage — all holdings have live prices');

    // ── 5. TATASTEEL SPECIFIC ────────────────────────
    console.log('\nCHECK 5: TATASTEEL SPECIFIC');
    if (prices['TATASTEEL']) {
        PASS('TATASTEEL present: LTP=₹' + prices['TATASTEEL'].price + ', volume=' + prices['TATASTEEL'].volume);
    } else {
        const tataKeys = Object.keys(prices).filter(k => k.startsWith('TATA'));
        FAIL('TATASTEEL missing. Found TATA keys: ' + (tataKeys.join(', ') || 'NONE'));
        failures++;
    }

    // ── 6. PERCENT FORMULA ────────────────────────────
    console.log('\nCHECK 6: PERCENT FORMULA ACCURACY');
    let mathErrors = 0;
    Object.entries(prices).slice(0, 8).forEach(([sym, d]) => {
        if (!d.price || !d.prevClose || d.percent == null) return;
        const expected = ((d.price - d.prevClose) / d.prevClose) * 100;
        const diff = Math.abs(expected - d.percent);
        if (diff > 0.15) { FAIL(sym + ': expected ' + expected.toFixed(2) + '% got ' + d.percent + '%'); mathErrors++; }
        else PASS(sym + ': ' + d.percent + '% ✓');
    });
    if (mathErrors > 0) failures += mathErrors;

    // ── 7. CONFIDENCE SCALE ───────────────────────────
    console.log('\nCHECK 7: CONFIDENCE NORMALIZATION');
    const confs = Object.values(prices).map(v => v?.signal?.confidence).filter(c => c != null);
    if (confs.length) {
        const max = Math.max(...confs), min = Math.min(...confs);
        console.log('   Range: ' + min.toFixed(1) + ' – ' + max.toFixed(1));
        const outliers = confs.filter(c => c < 0 || c > 100);
        if (outliers.length === 0 && max <= 100) PASS('Confidence 0-100 scale, no outliers');
        else { FAIL('Out-of-range confidences detected'); failures++; }
    }

    // ── VERDICT ───────────────────────────────────────
    console.log('\n====================================================');
    if (failures === 0) {
        console.log('  🚀 PHASE 15.2 = 100% CERTIFIED — READY FOR PHASE 16');
    } else {
        console.log('  ❌ PHASE 15.2 = NOT YET CERTIFIED');
        console.log('  Failures: ' + failures + ' — fix before proceeding to Phase 16');
    }
    console.log('====================================================\n');
    process.exit(failures > 0 ? 1 : 0);
}

run().catch(e => { console.error('Script error:', e.message); process.exit(1); });
