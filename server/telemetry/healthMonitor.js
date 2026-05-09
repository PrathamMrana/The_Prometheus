/**
 * 🔱 [PHASE 21] INSTITUTIONAL TELEMETRY HEALTH MONITOR
 * Transforms the telemetry system into a resilient execution intelligence pipeline.
 * Tracks: feed stability, packet loss, propagation delay, and circuit breaker status.
 */

'use strict';

const fs = require('fs');
const path = require('path');

class TelemetryHealthMonitor {
    constructor() {
        this.metrics = {
            feedHealth: 100, // 0-100
            packetLoss: 0,   // %
            avgLatency: 0,   // ms
            staleSymbols: 0,
            circuitBreakerActive: false,
            defensiveMode: false,
            lastSync: Date.now(),
            integrityScore: 100,
            activeAdapters: ['YFINANCE'],
            status: 'OPERATIONAL' // OPERATIONAL | DEGRADED | CRITICAL | DEFENSIVE
        };

        this.session = {
            currentDay: new Date().getUTCDay(),
            isWeekend: false,
            lastRollover: Date.now()
        };

        this.thresholds = {
            maxLatency: 8000,      // 8s (Institutional limit)
            maxStaleSymbols: 15,   // Alert if more than 15 symbols are stale
            maxPacketLoss: 10,     // 10%
            criticalMemory: 450,   // 450MB
        };

        this.history = [];
        this.logs = [];
    }

    /**
     * 🛡️ [RUNTIME_VALIDATION]
     * Updates health metrics based on latest cycle data.
     */
    update(cycleData) {
        const now = Date.now();
        const { latency, staleCount, providers, sync_id } = cycleData;

        // 1. Calculate Latency Health
        this.metrics.avgLatency = latency || this.metrics.avgLatency;
        const latencyPenalty = Math.max(0, (this.metrics.avgLatency - 2000) / 100); 

        // 2. Track Stale Symbols
        this.metrics.staleSymbols = staleCount || 0;
        const stalePenalty = this.metrics.staleSymbols * 2;

        // 3. Evaluate Integrity Score
        let integrity = 100 - latencyPenalty - stalePenalty;
        
        // 4. Provider Check
        this.metrics.activeAdapters = providers || this.metrics.activeAdapters;
        if (this.metrics.activeAdapters.length === 0) integrity -= 50;

        this.metrics.integrityScore = Math.max(0, Math.min(100, Math.round(integrity)));
        this.metrics.lastSync = now;

        // 5. State Machine Transition
        this._transitionState();
        
        // 6. Record Event
        this._recordEvent('SYNC_COMPLETE', { sync_id, integrity: this.metrics.integrityScore });

        // 7. Session Rollover Detection
        this._checkSessionRollover();
    }

    /**
     * 🛡️ [SESSION_INTEGRITY]
     * Detects date changes and triggers baseline preservation.
     */
    _checkSessionRollover() {
        const today = new Date().getUTCDay();
        if (today !== this.session.currentDay) {
            this._log('SYNC', `📅 SESSION ROLLOVER DETECTED: ${this.session.currentDay} -> ${today}. Locking reference baselines.`);
            this.session.currentDay = today;
            this.session.lastRollover = Date.now();
            this.triggerRecovery(); // Rehydrate for new session
        }
    }

    /**
     * 🛡️ [CIRCUIT_BREAKER]
     * Evaluates if system should enter DEFENSIVE MODE to prevent cascading failure.
     */
    _transitionState() {
        const m = this.metrics;
        
        // CRITICAL TRIGGERS
        const isLatencyCritical = m.avgLatency > this.thresholds.maxLatency;
        const isStaleCritical = m.staleSymbols > this.thresholds.maxStaleSymbols;
        const isIntegrityCritical = m.integrityScore < 40;

        if (isLatencyCritical || isStaleCritical || isIntegrityCritical) {
            if (m.status !== 'DEFENSIVE') {
                this.activateDefensiveMode("Telemetry Integrity Collapse");
            }
        } else if (m.integrityScore > 80 && m.status === 'DEFENSIVE') {
            this.deactivateDefensiveMode();
        } else if (m.integrityScore < 70) {
            m.status = 'DEGRADED';
        } else {
            m.status = 'OPERATIONAL';
        }
    }

    activateDefensiveMode(reason) {
        this.metrics.status = 'DEFENSIVE';
        this.metrics.circuitBreakerActive = true;
        this.metrics.defensiveMode = true;
        this._log('ADVERSARIAL', `🛡️ DEFENSIVE MODE ACTIVATED: ${reason}`);
        console.error(`🚨 [CIRCUIT_BREAKER] SYSTEM ENTERING DEFENSIVE MODE: ${reason}`);
    }

    deactivateDefensiveMode() {
        this.metrics.status = 'OPERATIONAL';
        this.metrics.circuitBreakerActive = false;
        this.metrics.defensiveMode = false;
        this._log('RECOVERY', '✅ SYSTEM RECOVERED: Restoring standard execution intelligence.');
        console.log(`🟢 [CIRCUIT_BREAKER] SYSTEM RECOVERED: Normal operations resumed.`);
    }

    /**
     * 📊 [OBSERVABILITY]
     * Returns a full diagnostic snapshot for UI components.
     */
    getDiagnostics() {
        return {
            ...this.metrics,
            uptime: Math.round((Date.now() - (process.uptime() * 1000)) / 1000),
            events: this.history.slice(-10),
            logs: this.logs.slice(-20)
        };
    }

    _recordEvent(type, payload) {
        this.history.push({ type, timestamp: Date.now(), ...payload });
        if (this.history.length > 100) this.history.shift();
    }

    _log(category, message) {
        const entry = {
            timestamp: new Date().toISOString(),
            category: category.toUpperCase(),
            message,
            trace: Error().stack?.split('\n')[2]?.trim()
        };
        this.logs.unshift(entry);
        if (this.logs.length > 100) this.logs.pop();
        
        // Also persist to system logs
        if (global.systemLogs) {
            global.systemLogs.unshift({ 
                timestamp: Date.now(), 
                msg: `[${category}] ${message}` 
            });
        }
    }

    /**
     * 🛡️ [RECOVERY_ROUTINE]
     * Force rehydration of telemetry if baseline is lost or session rolls over.
     */
    async triggerRecovery() {
        if (this.metrics.recovering) return;
        this.metrics.recovering = true;

        this._log('RECOVERY', 'Triggering telemetry rehydration routine...');
        
        try {
            // Signal the worker or syncCoordinator to refresh
            // In this architecture, we'll use a global event or file flag
            const recoveryFlag = path.join(process.cwd(), '.telemetry_recovery');
            fs.writeFileSync(recoveryFlag, Date.now().toString());
            
            this._log('RECOVERY', 'Recovery flag emitted. Awaiting orchestration rehydration.');
            
            setTimeout(() => {
                this.metrics.recovering = false;
                if (fs.existsSync(recoveryFlag)) fs.unlinkSync(recoveryFlag);
            }, 30000); // 30s cooldown
        } catch (err) {
            this._log('ERROR', `Recovery routine failed: ${err.message}`);
            this.metrics.recovering = false;
        }
    }
}

module.exports = new TelemetryHealthMonitor();
