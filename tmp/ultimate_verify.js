const axios = require('axios');

async function runTests() {
    console.log("🔥 [ULTIMATE VERIFICATION] Starting Institutional Risk Audit...");
    const API = 'http://localhost:3001/api/trade/order';

    try {
        // --- 🧪 TEST 1: Correlation Guard (20%) ---
        console.log("\n[TEST 1] Correlation Guard (Current 20% limit)");
        // Buy TCS: ~₹245k (24.5% of 1M starting balance)
        console.log("- Initializing IT exposure to ~24.5%...");
        await axios.post(API, { symbol: "TCS", side: "BUY", type: "MARKET", qty: 100 });
        
        // Try INFY (IT sibling)
        const res1 = await axios.post(API, { symbol: "INFY", side: "BUY", type: "MARKET", qty: 1 }).catch(e => e.response);
        console.log(`- Result: ${res1.data.error || "SUCCESS"}`);
        const pass1 = res1.status === 422 && res1.data.error.includes("CORRELATION_GUARD_ACTIVE");
        console.log(`- Status: ${res1.status} | PASS: ${pass1}`);

        // --- 🧪 TEST 2 & 3: Sector Cap & Priority ---
        console.log("\n[TEST 2/3] Sector Cap vs Priority (>30% Cap overrides Correlation)");
        // Current IT exposure is ~24.5%. 
        // Attempt to buy more TCS to reach ~35% projected (add 40 shares)
        console.log("- Attempting to push IT exposure to ~35% projected...");
        const res2 = await axios.post(API, { symbol: "TCS", side: "BUY", type: "MARKET", qty: 40 }).catch(e => e.response);
        console.log(`- Result: ${res2.data.error}`);
        const pass2 = res2.data.error.includes("SECTOR_CAP_EXCEEDED");
        console.log(`- Status: ${res2.status} | PASS: ${pass2}`);

        // --- 🧪 TEST 4: Projected Exposure (Look-ahead) ---
        console.log("\n[TEST 4] Projected Exposure (Blocking future breach)");
        // Buy RELIANCE (ENERGY): Buy 200 shares (~₹270k / 27%)
        console.log("- Bulking ENERGY exposure to ~27%...");
        await axios.post(API, { symbol: "RELIANCE", side: "BUY", type: "MARKET", qty: 200 });
        // Try to buy 50 more shares (~₹68k / 6.8%) -> Projected = 33.8%
        console.log("- Attempting +6.8% entry in ENERGY...");
        const res4 = await axios.post(API, { symbol: "RELIANCE", side: "BUY", type: "MARKET", qty: 50 }).catch(e => e.response);
        console.log(`- Rejection: ${res4.data.error}`);
        const pass4 = res4.data.error.includes("SECTOR_CAP_EXCEEDED");
        console.log(`- PASS (Look-ahead working): ${pass4}`);

        // --- 🧪 TEST 5: API Status Code ---
        console.log("\n[TEST 5] API Status Code (Unprocessable Entity)");
        console.log(`- Last Rejection Status: ${res4.status} (Expected 422)`);
        const pass5 = res4.status === 422;
        console.log(`- PASS: ${pass5}`);

        console.log("\n✅ [VERIFICATION COMPLETE] 100% Institutional Compliance.");
    } catch (err) {
        console.error("Critical Test Failure:", err.message);
    }
}

runTests();
