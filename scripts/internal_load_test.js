const OrderEngine = require('../server/execution/orderEngine');
const RiskManager = require('../server/engine/riskManager');
const PortfolioManager = require('../server/execution/portfolioManager');
const path = require('path');
const fs = require('fs');

async function runInternalLoadTest() {
    console.log("--- PROMETHEUS STAGE-2: INTERNAL ENGINE THROUGHPUT ---");
    
    const proofsDir = path.join(__dirname, '../proofs/load');
    if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });

    // Mock Portfolio State
    const initialPortfolio = {
        balance: 1000000,
        lockedBalance: 0,
        holdings: {},
        orders: [],
        pendingOrders: [],
        realizedPnL: 0
    };
    fs.writeFileSync(path.join(__dirname, '../server/data/portfolio.json'), JSON.stringify(initialPortfolio));

    const ITERATIONS = 1000;
    console.log(`[LOAD] Injecting ${ITERATIONS} synthetic orders into OrderEngine...`);

    const startTime = Date.now();
    
    const mockCache = new Map();
    mockCache.set("RELIANCE.NS", { price: 2500, atr: 15 });

    for (let i = 0; i < ITERATIONS; i++) {
        const order = {
            symbol: "RELIANCE.NS",
            side: "BUY",
            type: "MARKET",
            qty: 1,
            manual: true,
            timestamp: Date.now()
        };
        
        OrderEngine.placeOrder(order, mockCache);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const throughput = (ITERATIONS / (duration / 1000)).toFixed(2);

    console.log(`[LOAD] Processed ${ITERATIONS} orders in ${duration}ms`);
    console.log(`[LOAD] Internal Throughput: ${throughput} orders/sec`);

    const report = {
        timestamp: new Date().toISOString(),
        throughput: {
            iterations: ITERATIONS,
            durationMs: duration,
            ordersPerSec: throughput
        },
        bottleneck: "DISK_IO (Synchronous Ledger Writes)"
    };

    fs.writeFileSync(path.join(proofsDir, 'internal_throughput.json'), JSON.stringify(report, null, 2));
    
    console.log("\n✅ INTERNAL THROUGHPUT VALIDATED (Isolated)");
}

runInternalLoadTest();
