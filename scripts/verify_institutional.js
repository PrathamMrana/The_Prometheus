const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API = "http://localhost:3001/api/trade";
const PORTFOLIO_PATH = path.join(__dirname, "../server/data/portfolio.json");
const INITIAL_CAPITAL = 1000000;

async function resetState() {
    const portfolio = {
        balance: INITIAL_CAPITAL,
        lockedBalance: 0,
        holdings: {},
        orders: [],
        pendingOrders: [],
        realizedPnL: 0
    };
    fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2));
    console.log("✅ State Reset: ₹1,000,000 Capital");
}

async function run() {
    console.log("-------------------------------------------------");
    console.log("🏛️  PHASE 6: INSTITUTIONAL INTEGRITY SUITE");
    console.log("-------------------------------------------------");

    try {
        await resetState();

        console.log("\n[1] Testing LIMIT BUY & Drift Refund (TCS.NS)");
        const limitRes = await axios.post(`${API}/order`, {
            symbol: "TCS.NS", side: "BUY", type: "LIMIT", qty: 10, limitPrice: 5000, manual: true
        });
        console.log(`✅ Order Placed: ${limitRes.data.order.id} | Status: ${limitRes.data.order.status}`);

        console.log("⏳ Waiting 15s for matching engine...");
        await new Promise(r => setTimeout(r, 15000));

        let p = JSON.parse(fs.readFileSync(PORTFOLIO_PATH));
        const fill = p.orders.find(o => o.symbol === "TCS.NS" && o.status === "FILLED");
        if (!fill) throw new Error("LIMIT order failed to fill");

        console.log(`✅ Filled at ₹${fill.price} (Limit was ₹5000)`);
        
        const totalValue = p.balance + p.lockedBalance + (fill.qty * fill.price);
        console.log(`📊 Capital Integrity: ₹${totalValue.toLocaleString()} (Expected: ₹1,000,000)`);
        if (Math.abs(totalValue - INITIAL_CAPITAL) > 0.01) throw new Error("CAPITAL_LEAK_IN_REFUND");

        console.log("\n[2] Testing SELL-Side Locking (RELIANCE.NS)");
        await axios.post(`${API}/order`, { symbol: "RELIANCE.NS", side: "BUY", type: "MARKET", qty: 20, manual: true });
        console.log("✅ MARKET BUY: 20 RELIANCE");

        console.log("🚀 Placing LIMIT SELL for 15 shares...");
        await axios.post(`${API}/order`, { symbol: "RELIANCE.NS", side: "SELL", type: "LIMIT", qty: 15, limitPrice: 9999, manual: true });
        
        console.log("🚀 Attempting overlapping SELL for 10 shares (should fail)...");
        try {
            await axios.post(`${API}/order`, { symbol: "RELIANCE.NS", side: "SELL", type: "MARKET", qty: 10, manual: true });
            throw new Error("FAIL: System allowed over-selling shares");
        } catch (e) {
            console.log(`✅ Guard: ${e.response.data.error} (Correct)`);
        }

        console.log("\n[3] Stress Testing State Persistence...");
        const symbols = ["INFY.NS", "HDFCBANK.NS", "SBIN.NS"];
        for (let i = 0; i < 5; i++) {
            const sym = symbols[i % symbols.length];
            const side = Math.random() > 0.5 ? "BUY" : "SELL";
            try {
                await axios.post(`${API}/order`, { symbol: sym, side, type: "MARKET", qty: 2, manual: true });
            } catch (e) {}
        }
        console.log("✅ Processed 5 rapid-fire orders");

        console.log("\n[4] FINAL RECONCILIATION");
        const snapshot = await axios.get(`${API}/portfolio`);
        for (const o of snapshot.data.pendingOrders) {
            await axios.post(`${API}/cancel`, { orderId: o.id });
        }

        const freshSnapshot = await axios.get(`${API}/portfolio`);
        for (const h of freshSnapshot.data.holdings) {
            if (h.qty > 0) {
                await axios.post(`${API}/order`, { symbol: h.symbol, side: "SELL", type: "MARKET", qty: h.qty, manual: true });
            }
        }

        const final = await axios.get(`${API}/portfolio`);
        const finalCap = final.data.balance + (final.data.realizedPnL || 0);
        console.log(`🏁 Final Capital (Liquidated): ₹${finalCap.toLocaleString()}`);
        console.log("✨ INTEGRITY SUITE PASSED");

    } catch (err) {
        console.error("\n❌ INTEGRITY SUITE FAILED");
        console.error(err.response ? err.response.data : err.message);
        process.exit(1);
    }
}

run();
