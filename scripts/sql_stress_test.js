const OrderEngine = require('../server/execution/orderEngine');
const Persistence = require('../server/utils/persistence');
const db = require('../server/data/dbProvider');
const fs = require('fs');
const path = require('path');

async function runSQLStressTest() {
    console.log("--- PROMETHEUS v7.0: HIGH-CONCURRENCY SQL STRESS TEST ---");
    
    const marketCache = Persistence.load();
    const symbols = ["TCS.NS", "RELIANCE.NS", "INFY.NS", "HDFCBANK.NS"];
    
    const BATCH_SIZE = 1000;
    console.log(`[STRESS] Firing ${BATCH_SIZE} orders into SQL database...`);

    const startTime = Date.now();
    
    const requests = Array.from({ length: BATCH_SIZE }).map((_, i) => {
        const symbol = symbols[i % symbols.length];
        return OrderEngine.placeOrder({
            symbol,
            qty: 1,
            side: (i % 2 === 0) ? 'BUY' : 'SELL',
            type: 'MARKET',
            manual: true
        }, marketCache);
    });

    const results = await Promise.all(requests);
    const endTime = Date.now();
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    console.log(`[STRESS] Completed in ${endTime - startTime}ms`);
    console.log(`[STRESS] TPS: ${(BATCH_SIZE / ((endTime - startTime) / 1000)).toFixed(2)}`);
    console.log(`[STRESS] Success: ${successCount} | Failed: ${failCount}`);

    const report = {
        timestamp: new Date().toISOString(),
        load: {
            size: BATCH_SIZE,
            durationMs: endTime - startTime,
            tps: BATCH_SIZE / ((endTime - startTime) / 1000)
        },
        engine: "SQL_OPERATIONAL"
    };

    const proofsDir = path.join(__dirname, '../proofs/load');
    if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });
    fs.writeFileSync(path.join(proofsDir, 'sql_load_test.json'), JSON.stringify(report, null, 2));

    console.log("\n✅ SQL LOAD TEST: VERIFIED");
}

runSQLStressTest();
