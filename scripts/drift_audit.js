const fs = require('fs');
const path = require('path');
const ExecutionReducer = require('../server/engine/executionReducer');

async function runDriftAudit() {
    console.log("--- PROMETHEUS STAGE-2: DRIFT AUDIT (PERSISTENCE) ---");
    
    const proofsDir = path.join(__dirname, '../proofs/drift');
    if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });

    const ledgerPath = path.join(__dirname, '../server/data/execution_ledger.jsonl');
    const portfolioPath = path.join(__dirname, '../server/data/portfolio.json');

    console.log("[DRIFT] Loading live portfolio state...");
    const livePortfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'));

    console.log("[DRIFT] Reconstructing truth from immutable ledger...");
    const events = [];
    const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n');
    for (const line of lines) {
        if (line.trim()) events.push(JSON.parse(line));
    }

    const reconstructed = ExecutionReducer.reconstructPortfolio(events, 1000000);

    console.log(`\nMetric | Live State | Reconstructed | Drift`);
    console.log(`-------|------------|---------------|------`);
    
    const cashDrift = Math.abs(livePortfolio.balance - reconstructed.cash);
    const pnlDrift = Math.abs((livePortfolio.realizedPnL || 0) - reconstructed.realizedPnL);

    console.log(`Cash   | ${livePortfolio.balance.toFixed(2)} | ${reconstructed.cash.toFixed(2)} | ${cashDrift.toFixed(2)}`);
    console.log(`PnL    | ${(livePortfolio.realizedPnL || 0).toFixed(2)} | ${reconstructed.realizedPnL.toFixed(2)} | ${pnlDrift.toFixed(2)}`);

    const result = {
        timestamp: new Date().toISOString(),
        cashDrift,
        pnlDrift,
        status: (cashDrift < 0.01 && pnlDrift < 0.01) ? "VERIFIED" : "FAILED"
    };

    fs.writeFileSync(path.join(proofsDir, 'drift_report.json'), JSON.stringify(result, null, 2));

    if (result.status === "VERIFIED") {
        console.log("\n✅ DRIFT AUDIT: VERIFIED (Reconstruction matched perfectly)");
    } else {
        console.log("\n❌ DRIFT AUDIT: FAILED (Data drift detected)");
    }
}

runDriftAudit();
