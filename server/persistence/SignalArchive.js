/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 11] PROMETHEUS SIGNAL ARCHIVE v1.0
 * ══════════════════════════════════════════════════════════════
 *
 * Stores normalized signal snapshots per cycle.
 * Enables historical inspection, replay, and drift analysis.
 *
 * Rolling file archive — bounded ring buffer on disk.
 * Flush-on-timer, never on hot path.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ARCHIVE_FILE = path.join(__dirname, '../../data/signal_archive.json');
const MAX_SNAPSHOTS = 500; // ~50 cycles × 10 symbols per entry

class SignalArchive {
    constructor() {
        this._snapshots = this._load();
        this._dirty = false;
        setInterval(() => this._flush(), 60_000); // flush every 60s
    }

    /**
     * Archive a normalized signal snapshot for one symbol in one cycle.
     */
    record(cycleId, normalizedSignal) {
        if (!normalizedSignal || !normalizedSignal.symbol) return;

        const snapshot = {
            cycleId,
            symbol:         normalizedSignal.symbol,
            timestamp:      normalizedSignal.timestamp || Date.now(),
            regime:         normalizedSignal.regime,
            confidenceScore: normalizedSignal.confidenceScore,
            confidenceGrade: normalizedSignal.confidenceGrade,
            conviction:     normalizedSignal.conviction,
            decision:       normalizedSignal.decision,
            rarity:         normalizedSignal.rarity?.label || 'LOW_CONVICTION',
            // Score components
            momentumScore:  normalizedSignal.momentumScore,
            volatilityScore: normalizedSignal.volatilityScore,
            smartMoneyScore: normalizedSignal.smartMoneyScore,
            breakoutScore:  normalizedSignal.breakoutScore,
            volumeScore:    normalizedSignal.volumeScore,
            edgeScore:      normalizedSignal.edgeScore,
            // Smart money
            smartMoneyFlow: normalizedSignal.smartMoney?.flowType || 'NEUTRAL',
            vr:             normalizedSignal.smartMoney?.vr || 1.0,
            // Explainability
            penalties:      normalizedSignal.penalties?.map(p => p.code) || [],
            boosts:         normalizedSignal.boosts?.map(b => b.code) || [],
            riskFlags:      normalizedSignal.riskFlags || [],
            // Execution context
            executionEligible: normalizedSignal.executionEligible,
            execBlock:      normalizedSignal.execBlock?.code || null,
            slippagePct:    normalizedSignal.slippage?.pct || 0,
            feedAge:        normalizedSignal.feedAge || 0,
        };

        this._snapshots.unshift(snapshot);
        if (this._snapshots.length > MAX_SNAPSHOTS) this._snapshots.pop();
        this._dirty = true;
    }

    /**
     * Get all snapshots for a specific cycle.
     */
    forCycle(cycleId) {
        return this._snapshots.filter(s => s.cycleId === cycleId);
    }

    /**
     * Get all snapshots for a specific symbol (recent first).
     */
    forSymbol(symbol, limit = 30) {
        const sym = symbol.split('.')[0].toUpperCase();
        return this._snapshots
            .filter(s => s.symbol === sym || s.symbol === symbol)
            .slice(0, limit);
    }

    /**
     * Confidence distribution analysis — useful for calibration audits.
     */
    confidenceDistribution() {
        const buckets = { '0-25': 0, '25-45': 0, '45-65': 0, '65-80': 0, '80-92': 0, '92+': 0 };
        for (const s of this._snapshots) {
            const c = s.confidenceScore ?? 0;
            if      (c < 25)  buckets['0-25']++;
            else if (c < 45)  buckets['25-45']++;
            else if (c < 65)  buckets['45-65']++;
            else if (c < 80)  buckets['65-80']++;
            else if (c < 92)  buckets['80-92']++;
            else              buckets['92+']++;
        }
        return { buckets, total: this._snapshots.length };
    }

    /**
     * Grade distribution — institutional calibration audit.
     */
    gradeDistribution() {
        const grades = {};
        for (const s of this._snapshots) {
            const g = s.confidenceGrade || 'F';
            grades[g] = (grades[g] || 0) + 1;
        }
        return grades;
    }

    recent(limit = 50) {
        return this._snapshots.slice(0, limit);
    }

    _load() {
        try {
            if (fs.existsSync(ARCHIVE_FILE)) {
                return JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
            }
        } catch (e) {
            console.warn('[SIGNAL_ARCHIVE] Load failed, starting fresh:', e.message);
        }
        return [];
    }

    _flush() {
        if (!this._dirty) return;
        try {
            const dir = path.dirname(ARCHIVE_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(this._snapshots), 'utf8');
            this._dirty = false;
        } catch (e) {
            console.error('[SIGNAL_ARCHIVE] Flush failed:', e.message);
        }
    }
}

module.exports = new SignalArchive();
