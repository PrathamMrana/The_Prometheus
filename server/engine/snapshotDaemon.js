const fs = require('fs');
const readline = require('readline');
const path = require('path');
const ExecutionReducer = require('./executionReducer');
const { ledger, EVENT_TYPES } = require('./executionLedger');

const LEDGER_FILE = path.join(__dirname, '../data/execution_ledger.jsonl');
const SNAPSHOT_INTERVAL_MS = 60000; // 60 seconds

/**
 * 🔱 PROMETHEUS — PHASE 1F BACKGROUND SNAPSHOT DAEMON
 * 
 * Asynchronously generates PORTFOLIO_SNAPSHOT events so that crash recovery
 * bounds the O(N) replay time. Instead of replaying Day 1 -> Day 30,
 * it replays LastSnapshot + Incremental WAL.
 */
class SnapshotDaemon {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.isProcessing = false;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        // Background interval (non-blocking)
        this.intervalId = setInterval(() => this.runSnapshotTask(), SNAPSHOT_INTERVAL_MS);
        console.log(`📸 [SNAPSHOT_DAEMON] Background snapshot worker started (60s tick).`);
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.isRunning = false;
    }

    async runSnapshotTask() {
        if (this.isProcessing) return; // Prevent overlapping runs
        this.isProcessing = true;

        try {
            if (!fs.existsSync(LEDGER_FILE)) {
                this.isProcessing = false;
                return;
            }

            const events = [];
            let lastEventId = null;
            let lastSnapshotFound = null;

            // Stream read to avoid massive memory spikes
            const fileStream = fs.createReadStream(LEDGER_FILE);
            const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

            for await (const line of rl) {
                if (!line.trim()) continue;
                try {
                    const evt = JSON.parse(line);
                    events.push(evt);
                    lastEventId = evt.eventId || lastEventId;
                    
                    if (evt.eventType === EVENT_TYPES.PORTFOLIO_SNAPSHOT) {
                        lastSnapshotFound = evt;
                    }
                } catch (e) {
                    // Ignore corrupt lines in background scanner
                }
            }

            const totalEventCount = events.length;
            const snapIdx = lastSnapshotFound ? events.findIndex(e => e.eventId === lastSnapshotFound.eventId) : -1;
            const eventsSinceLast = lastSnapshotFound ? (totalEventCount - snapIdx - 1) : totalEventCount;

            // Only generate snapshot if new actionable events arrived
            if (eventsSinceLast > 0) {
                let baseState;
                let eventsToProcess;

                // 🚀 Bounded Replay Strategy
                if (lastSnapshotFound) {
                    baseState = JSON.parse(JSON.stringify(lastSnapshotFound.payload)); // Deep clone
                    eventsToProcess = events.slice(snapIdx + 1);
                } else {
                    baseState = ExecutionReducer.getInitialState(100000);
                    eventsToProcess = events;
                }

                // Deterministic sort of incremental events
                const sortedIncremental = [...eventsToProcess].sort((a, b) => {
                    if (!a.monotonicTs || !b.monotonicTs) return a.wallClockTs - b.wallClockTs;
                    const bigA = BigInt(a.monotonicTs);
                    const bigB = BigInt(b.monotonicTs);
                    return bigA > bigB ? 1 : (bigA < bigB ? -1 : 0);
                });

                // Reduce only the delta
                for (const evt of sortedIncremental) {
                    ExecutionReducer._applyEvent(baseState, evt);
                }
                
                // Recompute exposure statically
                baseState.exposure = Object.values(baseState.openPositions)
                    .reduce((sum, pos) => sum + (pos.qty * pos.entryPrice), 0);

                baseState.lastProcessedEventId = lastEventId;

                // Fire event back into the WAL
                ledger.appendEvent({
                    traceId: lastEventId,
                    eventType: EVENT_TYPES.PORTFOLIO_SNAPSHOT,
                    payload: baseState
                });
                
                console.log(`📸 [SNAPSHOT_DAEMON] Generated checkpoint. Reduced ${eventsToProcess.length} deltas. Marker: ${lastEventId}`);
            }

        } catch (err) {
            console.error(`⚠️ [SNAPSHOT_DAEMON_ERROR] ${err.message}`);
        } finally {
            this.isProcessing = false;
        }
    }
}

module.exports = new SnapshotDaemon();
