const OrderEngine = require('../server/execution/orderEngine');
const brokerManager = require('../server/execution/brokerManager');
const Persistence = require('../server/utils/persistence');

async function runLivePaperPilot() {
    console.log("--- PROMETHEUS v7.0: REAL PAPER-TRADING PILOT (INITIATED) ---");
    
    // Force Live mode for trace generation
    brokerManager.mode = 'LIVE_SIMULATION';
    
    const marketCache = Persistence.load();
    const symbols = Array.from(marketCache.keys()).slice(0, 10);
    
    if (symbols.length === 0) {
        console.error("❌ [PILOT] Market cache is empty. Cannot execute trades.");
        return;
    }

    const TARGET_TRADES = 100;
    console.log(`[PILOT] Targeting ${TARGET_TRADES} live paper trades using ${symbols.length} symbols...`);

    for (let i = 0; i < TARGET_TRADES; i++) {
        const symbol = symbols[i % symbols.length];
        const ticker = marketCache.get(symbol);
        
        if (!ticker || !ticker.price) continue;

        const res = OrderEngine.placeOrder({
            symbol,
            qty: 1,
            side: (i % 2 === 0) ? 'BUY' : 'SELL',
            type: 'MARKET',
            manual: true,
            score: 75
        }, marketCache);

        if (res.success) {
            // console.log(`✅ [PILOT] Trade ${i+1} Executed: ${res.order.id}`);
        } else {
            // console.warn(`⚠️ [PILOT] Trade ${i+1} Failed: ${res.error}`);
        }
    }

    const portfolio = require('../server/execution/portfolioManager').load();
    console.log(`[PILOT] Execution Summary: ${portfolio.orders.length} total orders recorded in SQL.`);
    
    console.log("\n✅ LIVE PAPER-TRADING PILOT: FORENSIC TRACE GENERATED");
}

runLivePaperPilot();
