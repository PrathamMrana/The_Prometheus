const axios = require('axios');

async function testRaceCondition() {
    console.log("--- PROMETHEUS v7.0: CONCURRENCY RACE AUDIT ---");
    
    // 1. Get initial balance
    const startRes = await axios.get('http://localhost:3001/api/trade/portfolio');
    const startBalance = startRes.data.balance;
    console.log(`[RACE] Starting Balance: ${startBalance}`);

    // 2. Fire 10 simultaneous orders for the same symbol
    console.log(`[RACE] Firing 10 simultaneous MARKET BUY orders...`);
    const orders = [];
    for (let i = 0; i < 10; i++) {
        orders.push(axios.post('http://localhost:3001/api/trade/order', {
            symbol: 'TCS.NS',
            side: 'BUY',
            type: 'MARKET',
            qty: 1,
            manual: true
        }));
    }

    const results = await Promise.allSettled(orders);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.data.success).length;
    console.log(`[RACE] Successfully placed: ${successCount}/10 orders.`);

    // 3. Check final balance
    const endRes = await axios.get('http://localhost:3001/api/trade/portfolio');
    const endBalance = endRes.data.balance;
    const totalCost = results.reduce((acc, r) => {
        if (r.status === 'fulfilled' && r.value.data.success) {
            return acc + (r.value.data.order.price * r.value.data.order.qty);
        }
        return acc;
    }, 0);

    const expectedBalance = startBalance - totalCost;
    const drift = Math.abs(endBalance - expectedBalance);

    console.log(`[RACE] Expected Balance: ${expectedBalance.toFixed(2)}`);
    console.log(`[RACE] Actual Balance:   ${endBalance.toFixed(2)}`);
    console.log(`[RACE] Drift Detected:   ${drift.toFixed(2)}`);

    if (drift < 0.01) {
        console.log("\n✅ CONCURRENCY AUDIT: VERIFIED (Zero Drift)");
    } else {
        console.log("\n❌ CONCURRENCY AUDIT: FAILED (Race Condition Detected)");
    }
}

testRaceCondition();
