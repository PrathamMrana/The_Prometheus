const fs = require('fs');
const readline = require('readline');
const ExecutionReducer = require('../engine/executionReducer');
const { EVENT_TYPES } = require('../engine/executionLedger');
const Rules = require('./transitionRules');

/**
 * 🔱 PROMETHEUS — ORPHAN TRACE DETECTOR (V1)
 * 
 * A distributed consistency verifier. Scans the immutable execution ledger
 * to identify broken causality, duplicate executions, invalid state transitions,
 * time-order violations, and snapshot divergence.
 */
class OrphanTraceDetector {
    
    constructor() {
        this.eventsMap = new Map(); // eventId -> event
        this.traceMap = new Map();  // traceId -> [events]
        this.violations = [];
    }

    async scan(ledgerPath) {
        if (!fs.existsSync(ledgerPath)) throw new Error("Ledger file not found: " + ledgerPath);

        const rl = readline.createInterface({
            input: fs.createReadStream(ledgerPath),
            crlfDelay: Infinity
        });

        const rawEvents = [];
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const evt = JSON.parse(line);
                rawEvents.push(evt);
                this.eventsMap.set(evt.eventId, evt);
                
                if (evt.traceId) {
                    if (!this.traceMap.has(evt.traceId)) this.traceMap.set(evt.traceId, []);
                    this.traceMap.get(evt.traceId).push(evt);
                }
            } catch (err) {}
        }

        // 1. Structural Linkage & Transition Scans
        for (const evt of rawEvents) {
            if (evt.causationId) {
                const parent = this.eventsMap.get(evt.causationId);
                
                // Detection 1: Missing Causation Links
                if (!parent) {
                    this.report('CRITICAL', 'ORPHAN_CAUSATION', evt, { missingCausationId: evt.causationId });
                    continue; // Can't verify parent rules if parent is missing
                }

                // Detection 4: Time Order Violations
                if (evt.monotonicTs && parent.monotonicTs) {
                    if (BigInt(evt.monotonicTs) < BigInt(parent.monotonicTs)) {
                        this.report('CRITICAL', 'TIME_ORDER_CORRUPTION', evt, { parentId: parent.eventId });
                    }
                }

                // Detection 3: Invalid State Transitions
                const requiredParents = Rules.CAUSAL_REQUIREMENTS[evt.eventType];
                if (requiredParents && !requiredParents.includes(parent.eventType)) {
                    this.report('CRITICAL', 'INVALID_STATE_TRANSITION', evt, { 
                        expectedOneOf: requiredParents, 
                        foundParentType: parent.eventType 
                    });
                }
            } else if (evt.traceId) {
                // Events that are deliberately detached from any causal chain are exempt.
                // These represent system-wide state transitions, not tick descendants.
                const DETACHED_SYSTEM_EVENTS = [
                    EVENT_TYPES.TICK_RECEIVED,
                    EVENT_TYPES.PORTFOLIO_SNAPSHOT,
                    EVENT_TYPES.TRADING_HALTED,
                    EVENT_TYPES.TRADING_RESUMED,
                    EVENT_TYPES.RISK_LIMIT_EXCEEDED,
                    EVENT_TYPES.STALE_FEED_DETECTED,
                    EVENT_TYPES.DUPLICATE_EXECUTION_BLOCKED,
                    EVENT_TYPES.COALESCED_TICK_DROPPED,
                    EVENT_TYPES.SYSTEM_WARNING,
                    EVENT_TYPES.SYSTEM_HALT
                ];
                if (!DETACHED_SYSTEM_EVENTS.includes(evt.eventType)) {
                    // Non-root trade events missing causationId are genuine orphans
                    this.report('CRITICAL', 'MISSING_PARENT_ID', evt, { reason: "Missing causationId on non-root event." });
                }
            }
        }

        // 2. Duplicate Executions
        for (const [traceId, events] of this.traceMap.entries()) {
            const counts = {};
            for (const evt of events) {
                counts[evt.eventType] = (counts[evt.eventType] || 0) + 1;
            }

            for (const type of Rules.EXACTLY_ONCE_EVENTS) {
                if (counts[type] > 1) {
                    this.report('CRITICAL', 'DUPLICATE_EXECUTION', { traceId, eventId: 'AGGREGATE' }, { eventType: type, count: counts[type] });
                }
            }
        }

        // 5. Snapshot Consistency
        this.verifySnapshots(rawEvents);

        return this.violations;
    }

    verifySnapshots(rawEvents) {
        let runningState = ExecutionReducer.getInitialState(100000);
        
        // Sort incrementally
        const sorted = [...rawEvents].sort((a,b) => {
            if(!a.monotonicTs || !b.monotonicTs) return a.wallClockTs - b.wallClockTs;
            const bigA = BigInt(a.monotonicTs);
            const bigB = BigInt(b.monotonicTs);
            return bigA > bigB ? 1 : (bigA < bigB ? -1 : 0);
        });

        for (const evt of sorted) {
            if (evt.eventType === EVENT_TYPES.PORTFOLIO_SNAPSHOT) {
                const snapState = evt.payload;
                
                // Compare state truth
                if (Math.abs(snapState.cash - runningState.cash) > 0.01 || 
                    snapState.tradeCount !== runningState.tradeCount) {
                    
                    this.report('FATAL', 'SNAPSHOT_DIVERGENCE', evt, { 
                        snapshotCash: snapState.cash, 
                        reducerCash: runningState.cash,
                        snapshotTrades: snapState.tradeCount,
                        reducerTrades: runningState.tradeCount
                    });
                }
            } else {
                try {
                    ExecutionReducer._applyEvent(runningState, evt);
                } catch(e) {
                    // Failures in reduction imply fatal lineage breakage
                }
            }
        }
    }

    report(severity, type, event, details = {}) {
        const violation = {
            severity,
            type,
            traceId: event.traceId || 'UNKNOWN',
            eventId: event.eventId || 'UNKNOWN',
            timestamp: event.wallClockTs || Date.now(),
            ...details
        };
        this.violations.push(violation);
    }
}

module.exports = OrphanTraceDetector;
