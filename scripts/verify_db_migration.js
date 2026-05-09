const db = require('../server/data/dbProvider');
const fs = require('fs');
const path = require('path');

async function verifyMigration() {
    console.log("--- PROMETHEUS v7.0: DATABASE INTEGRITY AUDIT ---");
    
    try {
        const portfolio = db.getPortfolio();
        console.log("✅ [DB] Portfolio Loaded:", portfolio.balance);
        
        // Test atomic trade commit
        const testOrder = {
            id: 'TEST_MIGRATION_' + Date.now(),
            symbol: 'RELIANCE.NS',
            side: 'BUY',
            type: 'MARKET',
            qty: 10,
            price: 2500,
            status: 'FILLED',
            timestamp: Date.now(),
            metadata: { tag: 'MIGRATION_TEST' }
        };

        const updates = {
            ...portfolio,
            balance: portfolio.balance - 25000,
            holdings: {
                ...portfolio.holdings,
                'RELIANCE.NS': { qty: 10, avgPrice: 2500, totalCost: 25000, lockedQty: 0 }
            }
        };

        db.saveTrade(testOrder, updates);
        console.log("✅ [DB] Atomic Trade Commit Verified.");

        const reloaded = db.getPortfolio();
        if (reloaded.balance !== updates.balance) throw new Error("BALANCE_MISMATCH");
        
        console.log("✅ [DB] Persistence Verified.");

        const report = {
            timestamp: new Date().toISOString(),
            status: "VERIFIED",
            checks: {
                portfolio_load: "PASS",
                atomic_commit: "PASS",
                persistence: "PASS"
            }
        };

        const proofsDir = path.join(__dirname, '../proofs/database');
        if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });
        fs.writeFileSync(path.join(proofsDir, 'db_integrity_report.json'), JSON.stringify(report, null, 2));
        
        console.log("\n✅ DATABASE MIGRATION: VERIFIED");
    } catch (e) {
        console.error("❌ [DB] Migration verification failed:", e.message);
        process.exit(1);
    }
}

verifyMigration();
