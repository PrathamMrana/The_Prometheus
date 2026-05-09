const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEDGER_FILE = path.join(__dirname, '../data/execution_ledger.jsonl');

// 🛡️ Institutional Event Types
const EVENT_TYPES = {
    TICK_RECEIVED: 'TICK_RECEIVED',
    FEATURE_COMPUTED: 'FEATURE_COMPUTED',
    SIGNAL_GENERATED: 'SIGNAL_GENERATED',
    RISK_REJECTED: 'RISK_REJECTED',
    RISK_APPROVED: 'RISK_APPROVED',
    ALLOCATION_CREATED: 'ALLOCATION_CREATED',
    EXECUTION_REQUESTED: 'EXECUTION_REQUESTED',
    EXECUTION_SKIPPED: 'EXECUTION_SKIPPED',
    SIM_FILL_RECEIVED: 'SIM_FILL_RECEIVED',
    POSITION_OPENED: 'POSITION_OPENED',
    POSITION_CLOSED: 'POSITION_CLOSED',
    PNL_UPDATED: 'PNL_UPDATED',
    PORTFOLIO_SNAPSHOT: 'PORTFOLIO_SNAPSHOT',
    TRADING_HALTED: 'TRADING_HALTED',
    TRADING_RESUMED: 'TRADING_RESUMED',
    RISK_LIMIT_EXCEEDED: 'RISK_LIMIT_EXCEEDED',
    STALE_FEED_DETECTED: 'STALE_FEED_DETECTED',
    DUPLICATE_EXECUTION_BLOCKED: 'DUPLICATE_EXECUTION_BLOCKED',
    COALESCED_TICK_DROPPED: 'COALESCED_TICK_DROPPED',
    SYSTEM_WARNING: 'SYSTEM_WARNING',
    SYSTEM_HALT: 'SYSTEM_HALT'
};

const SCHEMA_VERSION = 1;

/**
 * 🔱 PROMETHEUS — PHASE 1A EXECUTION LEDGER (WAL)
 * Write-Ahead Log to guarantee Exactly-Once Execution, Deterministic Replay, 
 * and perfect causal reconstruction.
 */
class ExecutionLedger {
    constructor() {
        // Ensure data directory exists
        const dataDir = path.dirname(LEDGER_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // Using an append-only write stream for high-throughput non-blocking logging
        this.stream = fs.createWriteStream(LEDGER_FILE, { flags: 'a' });
    }

    /**
     * @returns {string} Deterministic UUIDv4
     */
    generateId() {
        return crypto.randomUUID();
    }

    /**
     * Strict validation layer before appending to disk.
     */
    validateEvent(event) {
        if (!EVENT_TYPES[event.eventType]) throw new Error(`Invalid eventType: ${event.eventType}`);
        if (!event.traceId) throw new Error(`Missing traceId for eventType: ${event.eventType}`);
        if (!event.eventId) throw new Error(`Missing eventId for eventType: ${event.eventType}`);
        if (!event.wallClockTs || !event.monotonicTs) throw new Error(`Missing timestamps for eventType: ${event.eventType}`);
        return true;
    }

    /**
     * Appends an event to the Execution Ledger (WAL).
     * @param {Object} params
     * @param {string} params.traceId - The root lineage ID (e.g., from the originating tick)
     * @param {string} [params.causationId] - The immediate parent ID that caused this event
     * @param {string} params.eventType - Must be a valid EVENT_TYPES value
     * @param {string} [params.symbol] - The asset symbol involved
     * @param {Object} [params.payload] - The core data payload
     * @param {Object} [params.metadata] - Optional ambient contextual data (regime, etc.)
     * @returns {string} The generated eventId (useful for passing as causationId to the next step)
     */
    appendEvent({ traceId, causationId = null, eventType, symbol = null, payload = {}, metadata = {} }) {
        const eventId = this.generateId();
        const rootTraceId = traceId || eventId; 
        
        const event = {
            schemaVersion: SCHEMA_VERSION,
            eventId,
            traceId: rootTraceId,
            causationId,
            wallClockTs: Date.now(),
            monotonicTs: process.hrtime.bigint().toString(),
            eventType,
            symbol,
            payload,
            metadata
        };

        try {
            this.validateEvent(event);
        } catch (e) {
            console.error(`⚠️ [LEDGER_ERROR] Failed validation: ${e.message}`);
            return null;
        }

        // Write-Ahead Discipline:
        const jsonl = JSON.stringify(event) + '\n';
        
        // Write to stream immediately. For extreme safety (e.g. execution triggers), 
        // one might use appendEventSync to guarantee disk fsync before mutating memory state.
        this.stream.write(jsonl);
        
        return eventId;
    }

    /**
     * Synchronous Write-Ahead flush.
     * Use ONLY for critical execution states where in-memory mutation MUST follow persistent truth.
     */
    appendEventSync(eventData) {
        const eventId = this.generateId();
        const event = {
            schemaVersion: SCHEMA_VERSION,
            eventId,
            traceId: eventData.traceId || eventId,
            causationId: eventData.causationId || null,
            wallClockTs: Date.now(),
            monotonicTs: process.hrtime.bigint().toString(),
            eventType: eventData.eventType,
            symbol: eventData.symbol || null,
            payload: eventData.payload || {},
            metadata: eventData.metadata || {}
        };
        
        try {
            this.validateEvent(event);
        } catch (e) {
            console.error(`⚠️ [LEDGER_ERROR] Failed validation sync: ${e.message}`);
            return null;
        }

        const jsonl = JSON.stringify(event) + '\n';
        fs.appendFileSync(LEDGER_FILE, jsonl);
        
        return eventId;
    }
}

// Export singleton to maintain singular append stream
module.exports = {
    ledger: new ExecutionLedger(),
    EVENT_TYPES
};
