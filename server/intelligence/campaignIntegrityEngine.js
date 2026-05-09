/**
 * 🔱 PROMETHEUS — CAMPAIGN INTEGRITY ENGINE
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Ensures the research campaign itself is valid. Detects config drift,
 * missing logs, and research contamination.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RESEARCH_DIR = path.join(__dirname, '../data/research');

class CampaignIntegrityEngine {
    constructor() {
        this.configHash = null;
        this.configPath = path.join(__dirname, '../engine/config.js');
        this.baselineHash = this._hashFile(this.configPath);
    }

    check(trades) {
        const alerts = [];
        let isValid = true;

        // 1. Config Drift / Research Contamination
        const currentHash = this._hashFile(this.configPath);
        if (this.baselineHash && currentHash !== this.baselineHash) {
            alerts.push('CONFIG_DRIFT_DETECTED');
            alerts.push('RESEARCH_CONTAMINATION');
            isValid = false;
        }

        // 2. Missing Replay Data / Log Integrity
        let missingReplays = 0;
        trades.forEach(t => {
            // Assume trade log ID maps to replay ID or symbol + timestamp
            // Basic sanity check: ensure replays directory isn't vastly smaller than trades
        });

        const replaysDir = path.join(RESEARCH_DIR, 'replays');
        const replayCount = fs.existsSync(replaysDir) ? fs.readdirSync(replaysDir).filter(f => f.endsWith('.json')).length : 0;
        
        // Number of entry trades roughly equals number of closed trades + open trades
        if (trades.length > 0 && replayCount < (trades.length * 0.8)) {
            alerts.push('REPLAY_GAP_DETECTED');
            isValid = false;
        }

        if (alerts.length > 0) {
            this._logAlerts(alerts);
        }

        return {
            isValid,
            alerts,
            replayCoverage: trades.length > 0 ? (replayCount / trades.length) * 100 : 100
        };
    }

    _hashFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) return null;
            const content = fs.readFileSync(filePath, 'utf8');
            return crypto.createHash('sha256').update(content).digest('hex');
        } catch (e) {
            return null;
        }
    }

    _logAlerts(alerts) {
        try {
            const logFile = path.join(RESEARCH_DIR, 'integrity_alerts.jsonl');
            fs.appendFileSync(logFile, JSON.stringify({ timestamp: Date.now(), alerts }) + '\n');
        } catch (e) {}
    }
}

module.exports = new CampaignIntegrityEngine();
