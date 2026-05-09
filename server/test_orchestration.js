/**
 * test_orchestration.js - End-to-End Verification of the Universal API Layer.
 */
require('dotenv').config();
const apiManager = require('./apiLayer/apiManager');
const workerProxy = require('./workerProxy');

async function runTest() {
    console.log("🚀 STARTING ORCHESTRATION VERIFICATION...");
    console.log("KEYS DETECTED:", {
        FINNHUB: !!process.env.FINNHUB_API_KEY,
        ALPHA: !!process.env.ALPHA_VANTAGE_KEY,
        FMP: !!process.env.FMP_KEY,
        TWELVE: !!process.env.TWELVE_DATA_KEY
    });

    try {
        // 1. Test Price Pulse (High Priority)
        console.log("\n[TEST 1] PULSING RELIANCE...");
        const rel = await workerProxy.getQuote('RELIANCE.NS');
        console.log("RESULT:", JSON.stringify(rel, null, 2));

        // 2. Test Cache Hit (Hot Layer)
        console.log("\n[TEST 2] CACHE HIT CHECK (RELIANCE)...");
        const relCache = await workerProxy.getQuote('RELIANCE.NS');
        console.log("RESULT:", JSON.stringify(relCache, null, 2));

        // 3. Test Enrichment (Indicators/Fundamentals)
        console.log("\n[TEST 3] ENRICHING AAPL...");
        const aapl = await workerProxy.enrich('AAPL');
        console.log("RESULT:", JSON.stringify(aapl, null, 2));

        // 4. Test Macro Pulse
        console.log("\n[TEST 4] PULSING GDP...");
        const gdp = await apiManager.fetch('MACRO', 'GDP');
        console.log("RESULT:", JSON.stringify(gdp, null, 2));

        // 5. Check Health Metrics
        console.log("\n[TEST 5] SYSTEM HEALTH MONITOR:");
        console.table(apiManager.getHealth());
    } catch (e) {
        console.error("TEST FAILED:", e.message);
    }
}

runTest().catch(console.error);
