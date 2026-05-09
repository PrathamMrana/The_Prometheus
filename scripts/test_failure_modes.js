const axios = require('axios');
const API = "http://localhost:3001/api/trade";

async function run() {
    console.log("--- FAILURE-FIRST TESTING: EXECUTION GUARDS ---");
    
    // 1. INSUFFICIENT BALANCE
    try {
        console.log("[TEST 1] Buying 10,000 shares of RELIANCE (Should exceed balance)...");
        const res = await axios.post(`${API}/order`, {
            symbol: "RELIANCE.NS", side: "BUY", type: "MARKET", qty: 10000, manual: true
        });
        console.log("❌ FAIL: Order accepted with insufficient balance");
    } catch (e) {
        console.log(`✅ SUCCESS: Rejected - ${e.response.data.error} (${e.response.data.reason || ''})`);
    }

    // 2. INSUFFICIENT HOLDINGS
    try {
        console.log("[TEST 2] Selling 50 shares of TCS (Holding 0)...");
        const res = await axios.post(`${API}/order`, {
            symbol: "TCS.NS", side: "SELL", type: "MARKET", qty: 50, manual: true
        });
        console.log("❌ FAIL: Order accepted with zero holdings");
    } catch (e) {
        console.log(`✅ SUCCESS: Rejected - ${e.response.data.error} (${e.response.data.reason || ''})`);
    }

    // 3. INVALID SYMBOL (NON-EXISTENT)
    try {
        console.log("[TEST 3] Trading non-existent symbol 'FAKE.NS'...");
        const res = await axios.post(`${API}/order`, {
            symbol: "FAKE.NS", side: "BUY", type: "MARKET", qty: 1, manual: true
        });
        console.log("❌ FAIL: Order accepted for fake symbol");
    } catch (e) {
        console.log(`✅ SUCCESS: Rejected - ${e.response.data.error}`);
    }
}

run();
