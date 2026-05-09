const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function getHash(data) {
    const clean = data.replace(/\[INFO\] Replay completed in .* ms\./g, '');
    return crypto.createHash('sha256').update(clean).digest('hex');
}

async function run() {
    console.log("--- PROMETHEUS STAGE-2: REPLAY DETERMINISM AUDIT ---");
    
    const proofsDir = path.join(__dirname, '../proofs/replay');
    if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });

    try {
        const sourceLedger = path.join(__dirname, '../server/data/execution_ledger.jsonl');
        const frozenLedger = path.join(proofsDir, 'frozen_ledger.jsonl');
        
        console.log(`[SNAPSHOT] Freezing ledger for deterministic audit...`);
        fs.copyFileSync(sourceLedger, frozenLedger);

        console.log("[RUN 1] Replaying execution ledger...");
        const outputA = execSync(`node server/replay.js ${frozenLedger}`).toString();
        const hashA = getHash(outputA);
        fs.writeFileSync(path.join(proofsDir, 'replay_output_A.txt'), outputA);

        console.log("[RUN 2] Replaying execution ledger (verification run)...");
        const outputB = execSync(`node server/replay.js ${frozenLedger}`).toString();
        const hashB = getHash(outputB);
        fs.writeFileSync(path.join(proofsDir, 'replay_output_B.txt'), outputB);

        console.log(`\nReplay Hash A: ${hashA}`);
        console.log(`Replay Hash B: ${hashB}`);

        const deterministic = (hashA === hashB);
        const result = {
            timestamp: new Date().toISOString(),
            deterministic,
            hashA,
            hashB,
            ledger: "server/data/execution_ledger.jsonl",
            metrics: {
                match: deterministic ? "100%" : "0%",
                drift: deterministic ? "0.00" : "NAN"
            }
        };

        fs.writeFileSync(path.join(proofsDir, 'deterministic_diff.json'), JSON.stringify(result, null, 2));

        if (deterministic) {
            console.log("\n✅ REPLAY DETERMINISM: VERIFIED");
        } else {
            console.log("\n❌ REPLAY DETERMINISM: FAILED (Divergence Detected)");
            process.exit(1);
        }
    } catch (e) {
        console.error(`\n[FATAL] Determinism test failed to execute: ${e.message}`);
        process.exit(1);
    }
}

run();
