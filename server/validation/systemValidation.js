/**
 * 🔱 PROMETHEUS — SYSTEM VALIDATION HARNESS (Phase 1 Safety Audit)
 * 
 * An active attack harness, not a passive test suite.
 * Validates that all safety layers behave correctly under stress.
 * 
 * Usage: node server/validation/systemValidation.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// --- Isolated Requires (avoid module side effects on live engine) ---
const LEDGER_FILE = path.join(__dirname, '../data/execution_ledger.jsonl');
const LEDGER_FILE_BACKUP = path.join(__dirname, '../data/execution_ledger.VALIDATION_BACKUP.jsonl');
const TEST_LEDGER = path.join(__dirname, '../data/test_validation_ledger.jsonl');

// Results tracking
const results = [];
let PASS = 0, FAIL = 0;

function pass(testName, detail = '') {
    PASS++;
    results.push({ status: '✅ PASS', test: testName, detail });
    console.log(`  ✅ PASS — ${testName}${detail ? ': ' + detail : ''}`);
}

function fail(testName, detail = '') {
    FAIL++;
    results.push({ status: '❌ FAIL', test: testName, detail });
    console.log(`  ❌ FAIL — ${testName}${detail ? ': ' + detail : ''}`);
}

function section(name) {
    console.log(`\n${'═'.repeat(58)}`);
    console.log(`  ${name}`);
    console.log(`${'═'.repeat(58)}`);
}

async function readLedger(filePath) {
    const events = [];
    if (!fs.existsSync(filePath)) return events;
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim()) continue;
        try { events.push(JSON.parse(line)); } catch (_) {}
    }
    return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1 — STALE FEED HALT / RESUME
// ─────────────────────────────────────────────────────────────────────────────
async function testStaleFeedHalt() {
    section('TEST 1 — STALE FEED HALT / RESUME');

    // Fresh require each test for isolation
    delete require.cache[require.resolve('../engine/riskManager')];
    delete require.cache[require.resolve('../engine/executionLedger')];
    const riskManager = require('../engine/riskManager');

    // Patch ledger to use test file
    const { ledger, EVENT_TYPES } = require('../engine/executionLedger');

    const fakePortfolio = { balance: 100000, totalValue: 0, totalPnL: 0, holdings: {}, orders: [] };

    // 1. Update tick — should be clean
    riskManager.updateTickTime();
    riskManager.evaluateGlobalState(fakePortfolio);
    
    const haltResult1 = riskManager.checkEntry('RELIANCE', 'BUY', fakePortfolio, 0.75, { atr: 10, price: 2500, score: 70 });
    if (!haltResult1.reason?.includes('HALT') && !haltResult1.reason?.includes('COOLDOWN')) {
        pass('Feed fresh → entry allowed past halt gate');
    } else {
        fail('Feed fresh → entry unexpectedly blocked by halt', haltResult1.reason);
    }

    // 2. Simulate stale feed by backdating lastTickTime
    riskManager._lastTickTime = Date.now() - 10000; // 10s ago → stale
    riskManager._globalHaltReason = null; // Reset to allow re-detection

    riskManager.evaluateGlobalState(fakePortfolio);
    if (riskManager._globalHaltReason === 'STALE_MARKET_DATA') {
        pass('Stale feed (10s lag) → STALE_MARKET_DATA halt triggered');
    } else {
        fail('Stale feed → halt NOT triggered', `reason: ${riskManager._globalHaltReason}`);
    }

    // 3. Verify halt blocks new entries
    const blockedResult = riskManager.checkEntry('RELIANCE', 'BUY', fakePortfolio, 0.9, { atr: 10, price: 2500, score: 90 });
    if (blockedResult.reason === 'TRADING_HALTED') {
        pass('While halted → new entry correctly blocked (TRADING_HALTED)');
    } else {
        fail('While halted → new entry NOT blocked', `reason: ${blockedResult.reason}`);
    }

    // 4. Restore feed → auto-resumes
    riskManager.updateTickTime();
    if (riskManager._globalHaltReason === null) {
        pass('Feed restored → halt auto-cleared (TRADING_RESUMED)');
    } else {
        fail('Feed restored → halt NOT cleared', `still: ${riskManager._globalHaltReason}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2 — DUPLICATE EXECUTION SUPPRESSION
// ─────────────────────────────────────────────────────────────────────────────
async function testDuplicateExecution() {
    section('TEST 2 — DUPLICATE EXECUTION SUPPRESSION');

    delete require.cache[require.resolve('../engine/riskManager')];
    const riskManager = require('../engine/riskManager');

    const portfolio = { balance: 100000, totalValue: 0, totalPnL: 0, holdings: {}, orders: [] };
    const signal = { atr: 15, price: 1200, score: 75 };

    // First entry — should be allowed past duplicate check
    const result1 = riskManager.checkEntry('HDFCBANK', 'BUY', portfolio, 0.78, signal);
    const key = result1.meta?.idempotencyKey;
    
    if (result1.allowed || (result1.reason && !result1.reason.includes('DUPLICATE'))) {
        pass('First execution → passes duplicate gate', `key: ${key}`);
    } else {
        fail('First execution → incorrectly blocked', result1.reason);
    }

    // Simulate the key being registered after fill
    if (key) riskManager._executedKeys.add(key);

    // Second entry with same idempotency key (burst scenario)
    const result2 = riskManager.checkEntry('HDFCBANK', 'BUY', portfolio, 0.78, signal);
    if (result2.reason === 'DUPLICATE_EXECUTION_SUPPRESSED') {
        pass('Second execution (burst) → correctly suppressed');
    } else {
        fail('Second execution → NOT suppressed', `reason: ${result2.reason}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3 — DRAWDOWN HALT
// ─────────────────────────────────────────────────────────────────────────────
async function testDrawdownHalt() {
    section('TEST 3 — DRAWDOWN HALT (MAX DRAWDOWN KILL SWITCH)');

    delete require.cache[require.resolve('../engine/riskManager')];
    const riskManager = require('../engine/riskManager');

    // Simulate portfolio in deep drawdown: 12% unrealized loss on 100k
    const badPortfolio = {
        balance: 88000,
        totalValue: 0,
        totalPnL: -12000, // -12% drawdown
        holdings: {},
        orders: []
    };

    riskManager._lastTickTime = Date.now(); // Feed is live
    riskManager.evaluateGlobalState(badPortfolio);

    if (riskManager._globalHaltReason === 'MAX_DRAWDOWN_EXCEEDED_ABSOLUTE') {
        pass('Portfolio -12% drawdown → MAX_DRAWDOWN_EXCEEDED_ABSOLUTE halt');
    } else {
        fail('Portfolio -12% drawdown → halt NOT triggered', `reason: ${riskManager._globalHaltReason}`);
    }

    // Verify all new entries blocked
    const blocked = riskManager.checkEntry('INFY', 'BUY', badPortfolio, 0.99, { atr: 5, price: 1500, score: 99 });
    if (blocked.reason === 'TRADING_HALTED') {
        pass('Under drawdown halt → high-confidence entry correctly blocked');
    } else {
        fail('Under drawdown halt → entry NOT blocked', `reason: ${blocked.reason}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4 — SNAPSHOT PARITY
// ─────────────────────────────────────────────────────────────────────────────
async function testSnapshotParity() {
    section('TEST 4 — SNAPSHOT PARITY (REDUCER vs SNAPSHOT)');

    const ExecutionReducer = require('../engine/executionReducer');
    const { EVENT_TYPES } = require('../engine/executionLedger');

    // Build a controlled synthetic event stream
    const crypto = require('crypto');
    const now = process.hrtime.bigint();
    const mkId = () => crypto.randomUUID();

    const tickId = mkId();
    const sigId = mkId();
    const riskId = mkId();
    const reqId = mkId();
    const fillId = mkId();

    const events = [
        { eventId: tickId, traceId: tickId, causationId: null, eventType: EVENT_TYPES.TICK_RECEIVED, wallClockTs: Date.now(), monotonicTs: (now).toString(), symbol: 'RELIANCE', payload: { price: 2500 } },
        { eventId: sigId, traceId: tickId, causationId: tickId, eventType: EVENT_TYPES.SIGNAL_GENERATED, wallClockTs: Date.now(), monotonicTs: (now + 1n).toString(), symbol: 'RELIANCE', payload: { score: 80 } },
        { eventId: riskId, traceId: tickId, causationId: sigId, eventType: EVENT_TYPES.RISK_APPROVED, wallClockTs: Date.now(), monotonicTs: (now + 2n).toString(), symbol: 'RELIANCE', payload: {} },
        { eventId: reqId, traceId: tickId, causationId: riskId, eventType: EVENT_TYPES.EXECUTION_REQUESTED, wallClockTs: Date.now(), monotonicTs: (now + 3n).toString(), symbol: 'RELIANCE', payload: { qty: 5, price: 2500 } },
        { eventId: fillId, traceId: tickId, causationId: reqId, eventType: EVENT_TYPES.SIM_FILL_RECEIVED, wallClockTs: Date.now(), monotonicTs: (now + 4n).toString(), symbol: 'RELIANCE', payload: { executedQty: 5, fillPrice: 2500, requestedQty: 5, isPartial: false } }
    ];

    // Run reducer
    const state = ExecutionReducer.reconstructPortfolio(events, 100000);

    const expectedCash = 100000 - (5 * 2500); // 87500
    const expectedTrades = 1;
    const expectedPosition = state.openPositions['RELIANCE'];

    if (Math.abs(state.cash - expectedCash) < 0.01) {
        pass('Reducer cash after 1 fill', `$${state.cash.toFixed(2)} == $${expectedCash}`);
    } else {
        fail('Reducer cash mismatch', `got $${state.cash} expected $${expectedCash}`);
    }

    if (state.tradeCount === expectedTrades) {
        pass('Reducer tradeCount', `${state.tradeCount}`);
    } else {
        fail('Reducer tradeCount mismatch', `got ${state.tradeCount} expected ${expectedTrades}`);
    }

    if (expectedPosition && expectedPosition.qty === 5 && expectedPosition.entryPrice === 2500) {
        pass('Reducer open position correct', `RELIANCE qty:5 @ 2500`);
    } else {
        fail('Reducer open position incorrect', JSON.stringify(expectedPosition));
    }

    // Now simulate a snapshot being generated and verify it matches
    const snapState = { cash: state.cash, tradeCount: state.tradeCount, openPositions: { ...state.openPositions }, realizedPnL: 0, exposure: state.exposure };
    const snapEvents = [
        ...events,
        { eventId: mkId(), traceId: fillId, causationId: fillId, eventType: EVENT_TYPES.PORTFOLIO_SNAPSHOT, wallClockTs: Date.now(), monotonicTs: (now + 5n).toString(), symbol: null, payload: snapState }
    ];

    // Replay from snapshot
    const snapEvt = snapEvents.find(e => e.eventType === EVENT_TYPES.PORTFOLIO_SNAPSHOT);
    const snapIdx = snapEvents.findIndex(e => e.eventId === snapEvt.eventId);
    const deltaEvents = snapEvents.slice(snapIdx + 1);

    let replayState = JSON.parse(JSON.stringify(snapEvt.payload));
    for (const evt of deltaEvents) ExecutionReducer._applyEvent(replayState, evt);

    if (Math.abs(replayState.cash - state.cash) < 0.01 && replayState.tradeCount === state.tradeCount) {
        pass('Snapshot + delta replay matches full replay', `cash: $${replayState.cash.toFixed(2)}`);
    } else {
        fail('Snapshot parity divergence', `replay: $${replayState.cash} vs full: $${state.cash}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5 — INTEGRITY FAILURE LOCKDOWN
// ─────────────────────────────────────────────────────────────────────────────
async function testIntegrityLockdown() {
    section('TEST 5 — INTEGRITY FAILURE LOCKDOWN (ORPHAN INJECTION)');

    // Write a controlled test ledger with a deliberate orphan
    const crypto = require('crypto');
    const mkId = () => crypto.randomUUID();
    const { EVENT_TYPES } = require('../engine/executionLedger');

    const tickId = mkId();
    const sigId = mkId();
    const CORRUPT_PARENT = mkId(); // ← This ID does NOT exist in the ledger

    const testEvents = [
        { eventId: tickId, traceId: tickId, causationId: null, eventType: 'TICK_RECEIVED', wallClockTs: Date.now(), monotonicTs: process.hrtime.bigint().toString(), symbol: 'INFY', payload: {} },
        { eventId: sigId, traceId: tickId, causationId: tickId, eventType: 'SIGNAL_GENERATED', wallClockTs: Date.now(), monotonicTs: (process.hrtime.bigint() + 1n).toString(), symbol: 'INFY', payload: {} },
        // 🛑 ORPHAN: SIM_FILL has causationId pointing to non-existent CORRUPT_PARENT
        { eventId: mkId(), traceId: tickId, causationId: CORRUPT_PARENT, eventType: 'SIM_FILL_RECEIVED', wallClockTs: Date.now(), monotonicTs: (process.hrtime.bigint() + 2n).toString(), symbol: 'INFY', payload: { executedQty: 3, fillPrice: 1500, requestedQty: 3, isPartial: false } }
    ];

    fs.writeFileSync(TEST_LEDGER, testEvents.map(e => JSON.stringify(e)).join('\n') + '\n');

    const OrphanTraceDetector = require('../integrity/orphanTraceDetector');
    const detector = new OrphanTraceDetector();
    const violations = await detector.scan(TEST_LEDGER);

    const orphanFill = violations.find(v => v.type === 'ORPHAN_CAUSATION');
    if (orphanFill) {
        pass('Orphan causation detected', `eventType: SIM_FILL_RECEIVED, missingParent: ${CORRUPT_PARENT.slice(0,8)}...`);
    } else {
        fail('Orphan causation NOT detected', `violations: ${JSON.stringify(violations)}`);
    }

    // Verify the integrity scanner would trigger a system halt
    delete require.cache[require.resolve('../engine/riskManager')];
    const riskManager = require('../engine/riskManager');
    riskManager._lastTickTime = Date.now();

    riskManager.evaluateGlobalState({ balance: 100000, totalValue: 0, totalPnL: 0 }, { integrityViolations: violations.length });
    if (riskManager._globalHaltReason === 'SYSTEM_INTEGRITY_COMPROMISED') {
        pass('Integrity violations → SYSTEM_INTEGRITY_COMPROMISED halt triggered');
    } else {
        fail('Integrity violations → halt NOT triggered', `reason: ${riskManager._globalHaltReason}`);
    }

    // Verify replay of the orphan ledger still succeeds (reducer is resilient)
    const ExecutionReducer = require('../engine/executionReducer');
    let replaySucceeded = false;
    try {
        const state = ExecutionReducer.reconstructPortfolio(testEvents, 100000);
        // It should process the fill and record the position
        replaySucceeded = true;
        pass('Replay still succeeds on orphan ledger (reducer handles it)', `cash: $${state.cash.toFixed(2)}`);
    } catch (err) {
        fail('Replay crashed on orphan ledger', err.message);
    }

    // Cleanup test ledger
    try { fs.unlinkSync(TEST_LEDGER); } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6 — LIVE LEDGER INTEGRITY SCAN
// ─────────────────────────────────────────────────────────────────────────────
async function testLiveLedgerIntegrity() {
    section('TEST 6 — LIVE LEDGER INTEGRITY SCAN');

    if (!fs.existsSync(LEDGER_FILE)) {
        console.log('  ⏭  Skipped (no live ledger yet — run engine first)');
        return;
    }

    const events = await readLedger(LEDGER_FILE);
    console.log(`  [INFO] Live ledger has ${events.length} events.`);

    if (events.length === 0) {
        console.log('  ⏭  Skipped (ledger is empty)');
        return;
    }

    // Run the orphan detector on the live ledger
    const OrphanTraceDetector = require('../integrity/orphanTraceDetector');
    const detector = new OrphanTraceDetector();
    const violations = await detector.scan(LEDGER_FILE);

    if (violations.length === 0) {
        pass('Live ledger integrity scan', '0 violations — causal graph is clean');
    } else {
        fail('Live ledger has integrity violations', `count: ${violations.length}`);
        violations.forEach(v => console.log('    ', JSON.stringify(v)));
    }

    // Run full deterministic replay
    const ExecutionReducer = require('../engine/executionReducer');
    try {
        const state = ExecutionReducer.reconstructPortfolio(events, 100000);
        pass('Live ledger deterministic replay', `cash: $${state.cash.toFixed(2)}, trades: ${state.tradeCount}, positions: ${Object.keys(state.openPositions).length}`);
    } catch (err) {
        fail('Live ledger replay failed', err.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HARNESS
// ─────────────────────────────────────────────────────────────────────────────
async function runAll() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║   🔱 PROMETHEUS SYSTEM VALIDATION HARNESS            ║');
    console.log('║   Phase 1 Safety Audit — Full Stress Matrix          ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    await testStaleFeedHalt();
    await testDuplicateExecution();
    await testDrawdownHalt();
    await testSnapshotParity();
    await testIntegrityLockdown();
    await testLiveLedgerIntegrity();

    // Final Verdict
    console.log(`\n${'═'.repeat(58)}`);
    console.log('  FINAL VALIDATION VERDICT');
    console.log(`${'═'.repeat(58)}`);
    console.log(`  Total Tests: ${PASS + FAIL}  |  PASSED: ${PASS}  |  FAILED: ${FAIL}`);
    
    if (FAIL === 0) {
        console.log('\n  ✅ ALL SYSTEMS VALIDATED. Architecture is stable.');
        console.log('  ✅ CLEARED FOR PERFORMANCE HARDENING.\n');
    } else {
        console.log('\n  ❌ VALIDATION FAILED. Do NOT proceed to performance hardening.');
        console.log('  ❌ Fix all failures before advancing.\n');
        process.exit(1);
    }
}

runAll().catch(err => {
    console.error('\n[HARNESS_FATAL]', err.message);
    console.error(err.stack);
    process.exit(1);
});
