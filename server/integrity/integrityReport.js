const path = require('path');
const OrphanTraceDetector = require('./orphanTraceDetector');

/**
 * 🔱 PROMETHEUS — INTEGRITY REPORT GENERATOR
 * Runs the Orphan Trace Detector against the current Execution Ledger.
 * 
 * Usage: node server/integrity/integrityReport.js
 */

const ledgerPath = path.join(__dirname, '../data/execution_ledger.jsonl');

async function runReport() {
    console.log(`\n======================================================`);
    console.log(`🔱 PROMETHEUS FINANCIAL INTEGRITY SCANNER`);
    console.log(`======================================================`);
    console.log(`[INFO] Scanning ledger: ${ledgerPath}`);

    const detector = new OrphanTraceDetector();
    
    const startTime = process.hrtime.bigint();
    let violations = [];
    try {
        violations = await detector.scan(ledgerPath);
    } catch (err) {
        console.error(`[FATAL] Scanner failed to run: ${err.message}`);
        process.exit(1);
    }

    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;

    console.log(`[INFO] Scan completed in ${durationMs.toFixed(2)} ms.`);
    console.log(`======================================================`);

    if (violations.length === 0) {
        console.log(`✅ [CLEAN] 0 integrity violations found. The causal graph is perfectly consistent.`);
    } else {
        console.log(`❌ [FAILED] Found ${violations.length} structural violations:\n`);
        
        // Output machine-readable JSON format as mandated by institutional standards
        violations.forEach(v => {
            console.log(JSON.stringify(v, null, 2));
        });

        console.log(`\n======================================================`);
        console.log(`⚠️ ACTION REQUIRED: Auto-repair is intentionally disabled.`);
        console.log(`Please inspect the above violations manually.`);
    }
    console.log(`======================================================\n`);
}

runReport();
