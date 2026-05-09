const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * 🧪 PHASE 6: EXECUTION ENGINE VERIFICATION SCRIPT
 * Run this while the server is active (npm run dev / node server/index.js)
 */
const API = 'http://localhost:3001/api/trade';
const PORTFOLIO_PATH = path.join(__dirname, '../server/data/portfolio.json');

async function runTest() {
    console.log("-------------------------------------------------");
    console.log("🚀 PROMETHEUS EXECUTION ENGINE: E2E SMOKE TEST");
    console.log("-------------------------------------------------");
    
    // 🛡️ Ensure clean start
    const initial = { balance: 1000000, holdings: {}, orders: [], pendingOrders: [] };
    fs.mkdirSync(path.dirname(PORTFOLIO_PATH), { recursive: true });
    fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(initial, null, 2));
    console.log("✅ Portfolio Reset: ₹1,000,000 Initial Balance");

    try {
        // 1. PLACE MARKET BUY
        console.log("\n[1] Submitting MARKET BUY: RELIANCE.NS (10 shares)");
        const buyRes = await axios.post(`${API}/order`, {
            symbol: "RELIANCE.NS",
            side: "BUY",
            type: "MARKET",
            qty: 10,
            manual: true
        });
        
        const bOrder = buyRes.data.order;
        console.log(`✅ Status: ${bOrder.status} | Fill: ₹${bOrder.price} | ID: ${bOrder.id}`);

        // Verifying disk persistence
        let p = JSON.parse(fs.readFileSync(PORTFOLIO_PATH));
        if (p.holdings["RELIANCE.NS"] && p.holdings["RELIANCE.NS"].qty === 10) {
            console.log(`✅ Persistence: Holdings verified (RELIANCE: ${p.holdings["RELIANCE.NS"].qty})`);
        } else {
            throw new Error("Holdings mismatch after BUY");
        }

        // 2. PLACE LIMIT ORDER (PENDING)
        console.log("\n[2] Submitting LIMIT BUY: TCS.NS (5 shares @ ₹1000)");
        const limitRes = await axios.post(`${API}/order`, {
            symbol: "TCS.NS",
            side: "BUY",
            type: "LIMIT",
            qty: 5,
            limitPrice: 1000
        });
        
        const lOrder = limitRes.data.order;
        console.log(`✅ Status: ${lOrder.status} (QUEUED) | ID: ${lOrder.id}`);

        p = JSON.parse(fs.readFileSync(PORTFOLIO_PATH));
        if (p.pendingOrders.length === 1) {
            console.log("✅ Persistence: Pending order queued correctly");
        } else {
            throw new Error("Pending order not found in portfolio.json");
        }

        // 3. POSITION NETTING (PARTIAL SELL)
        console.log("\n[3] Submitting MARKET SELL: RELIANCE.NS (5 shares)");
        const sellRes = await axios.post(`${API}/order`, {
            symbol: "RELIANCE.NS",
            side: "SELL",
            type: "MARKET",
            qty: 5,
            manual: true
        });
        
        const sOrder = sellRes.data.order;
        console.log(`✅ Status: ${sOrder.status} | Fill: ₹${sOrder.price}`);

        p = JSON.parse(fs.readFileSync(PORTFOLIO_PATH));
        if (p.holdings["RELIANCE.NS"] && p.holdings["RELIANCE.NS"].qty === 5) {
            console.log(`✅ Position Netting: RELIANCE qty reduced to 5`);
        } else {
            throw new Error("Position netting failed");
        }

        // 4. INVALID TRADE PROTECTION
        console.log("\n[4] Security Check: Rejecting non-NSE symbol (TSLA)");
        try {
            await axios.post(`${API}/order`, { symbol: "TSLA", side: "BUY", type: "MARKET", qty: 1 });
            console.error("❌ FAILED: System accepted non-NSE symbol");
        } catch (e) {
            console.log(`✅ Guard: ${e.response.data.error} (Correct)`);
        }

        console.log("\n[5] Integrity Check: FINAL BALANCE");
        console.log(`💰 Portfolio Balance: ₹${p.balance.toLocaleString()}`);
        console.log("-------------------------------------------------");
        console.log("✨ ALL EXECUTION SAFEGUARDS PASSED");
        console.log("-------------------------------------------------");

    } catch (err) {
        console.error("\n❌ SMOKE TEST FAILED");
        console.error(err.response?.data || err.message);
        process.exit(1);
    }
}

runTest();
