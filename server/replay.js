const fs = require('fs');
const readline = require('readline');
const ExecutionReducer = require('./engine/executionReducer');

/**
 * 🔱 PROMETHEUS — PHASE 1E DETERMINISTIC REPLAY CLI
 * 
 * Usage:
 * node server/replay.js [path_to_ledger.jsonl]
 */

const ledgerPath = process.argv[2] || './server/data/execution_ledger.jsonl';

async function runReplay() {
    if (!fs.existsSync(ledgerPath)) {
        console.error(`[REPLAY_FATAL] Ledger file not found: ${ledgerPath}`);
        process.exit(1);
    }

    console.log(`\n======================================================`);
    console.log(`🔱 PROMETHEUS DETERMINISTIC REPLAY ENGINE`);
    console.log(`======================================================`);
    console.log(`[INFO] Replaying ledger: ${ledgerPath}`);

    const events = [];
    const fileStream = fs.createReadStream(ledgerPath);
    
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let corruptCount = 0;
    let lastSnapshot = null;
    let rawEvents = [];

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const evt = JSON.parse(line);
            rawEvents.push(evt);
            if (evt.eventType === 'PORTFOLIO_SNAPSHOT') {
                lastSnapshot = evt;
            }
        } catch (err) {
            corruptCount++;
        }
    }

    console.log(`[INFO] Loaded ${rawEvents.length} total events. (${corruptCount} corrupt lines dropped).`);
    
    const startTime = process.hrtime.bigint();
    
    let baseState;
    let eventsToProcess;

    if (lastSnapshot) {
        console.log(`[INFO] Fast-Forwarding: Latest PORTFOLIO_SNAPSHOT found at event ${lastSnapshot.traceId}`);
        baseState = lastSnapshot.payload;
        // Bounded replay: slice from the snapshot forward
        const snapIdx = rawEvents.findIndex(e => e.eventId === lastSnapshot.eventId);
        eventsToProcess = rawEvents.slice(snapIdx + 1);
        console.log(`[INFO] Incremental events to replay: ${eventsToProcess.length}`);
    } else {
        console.log(`[INFO] No snapshots found. Replaying full history from Genesis.`);
        baseState = ExecutionReducer.getInitialState(100000);
        eventsToProcess = rawEvents;
    }

    // Sort incremental events deterministically
    eventsToProcess.sort((a, b) => {
        if (!a.monotonicTs || !b.monotonicTs) return a.wallClockTs - b.wallClockTs;
        const bigA = BigInt(a.monotonicTs);
        const bigB = BigInt(b.monotonicTs);
        return bigA > bigB ? 1 : (bigA < bigB ? -1 : 0);
    });

    let reconstructedState = baseState;
    try {
        for (const evt of eventsToProcess) {
            ExecutionReducer._applyEvent(reconstructedState, evt);
        }
        // Recompute exposure
        reconstructedState.exposure = Object.values(reconstructedState.openPositions)
            .reduce((sum, pos) => sum + (pos.qty * pos.entryPrice), 0);
    } catch (err) {
        console.error(`\n[REDUCER_FATAL_CRASH] Causality constraint violated during replay!`);
        console.error(err.stack);
        process.exit(1);
    }

    const endTime = process.hrtime.bigint();
    const replayDurationMs = Number(endTime - startTime) / 1_000_000;

    console.log(`\n======================================================`);
    console.log(`📊 RECONSTRUCTED PORTFOLIO STATE`);
    console.log(`======================================================`);
    console.log(`Cash Remaining: $${reconstructedState.cash.toFixed(2)}`);
    console.log(`Realized PnL:   $${reconstructedState.realizedPnL.toFixed(2)}`);
    console.log(`Gross Exposure: $${reconstructedState.exposure.toFixed(2)}`);
    console.log(`Trade Count:    ${reconstructedState.tradeCount}`);
    
    const openSymbols = Object.keys(reconstructedState.openPositions);
    console.log(`\nOpen Positions (${openSymbols.length}):`);
    openSymbols.forEach(sym => {
        const p = reconstructedState.openPositions[sym];
        console.log(`  - ${sym.padEnd(10)} | Qty: ${p.qty} | Entry: $${p.entryPrice.toFixed(2)}`);
    });

    console.log(`\n[INFO] Replay completed in ${replayDurationMs.toFixed(3)} ms.`);
    console.log(`======================================================\n`);
}

runReplay().catch(console.error);
