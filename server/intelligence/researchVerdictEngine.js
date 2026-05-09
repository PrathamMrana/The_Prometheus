/**
 * 🔱 PROMETHEUS — RESEARCH VERDICT ENGINE
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Combines all institutional truth layers into a single deployment readiness verdict.
 * Persists outputs to server/data/research/verdict/
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VERDICT_DIR = path.join(__dirname, '../data/research/verdict');

class ResearchVerdictEngine {
    constructor() {
        if (!fs.existsSync(VERDICT_DIR)) fs.mkdirSync(VERDICT_DIR, { recursive: true });
    }

    compute(layers) {
        const { calibration, falseDiscovery, toxicClusters, survivability, transitionStress, coreMetrics } = layers;

        // Minimum Sample Constraint
        if ((coreMetrics?.totalTrades || 0) < 50) {
            const result = {
                verdict: 'RESEARCH_ONLY',
                reason: 'Insufficient trade sample for statistical significance (Need >50).',
                score: 20,
                penalties: ['Awaiting 50-trade threshold']
            };
            this._persist(result);
            return result;
        }

        let score = 100;
        const penalties = [];

        // 1. False Discovery Risk
        if (falseDiscovery?.pboRisk > 50) {
            score -= 40;
            penalties.push('High Probability of Backtest Overfitting (PBO).');
        } else if (falseDiscovery?.pboRisk > 20) {
            score -= 15;
            penalties.push('Moderate random-luck baseline proximity.');
        }

        // 2. Calibration
        if (!calibration?.isValid) {
            score -= 30;
            penalties.push('Confidence models are miscalibrated (ECE > 15).');
        }

        // 3. Toxic Clusters
        if ((toxicClusters?.toxicClusters?.length || 0) > 0) {
            score -= 20;
            penalties.push(`${toxicClusters.toxicClusters.length} Toxic failure clusters detected.`);
        }

        // 4. Survivability Timeline (Structural Decay)
        if (survivability?.trendDirection === 'DECAYING') {
            score -= 25;
            penalties.push('Structural edge decay detected in rolling windows.');
        } else if (survivability?.trendDirection === 'COLLAPSING') {
            score -= 50;
            penalties.push('Total alpha collapse in recent windows.');
        }

        // 5. Regime Transition Stress
        if (!transitionStress?.isValid) {
            score -= 20;
            penalties.push('Fragile edge during regime transitions.');
        }

        // Compute Verdict
        score = Math.max(0, score);
        let verdict = 'INVALIDATED';
        
        if (score >= 95) verdict = 'INSTITUTIONAL_GRADE';
        else if (score >= 85) verdict = 'SURVIVABLE';
        else if (score >= 75) verdict = 'LIMITED_CAPITAL';
        else if (score >= 55) verdict = 'RESEARCH_ONLY';
        else if (score >= 40) verdict = 'UNSTABLE';
        else verdict = 'INVALIDATED';

        const result = {
            timestamp: Date.now(),
            verdict,
            score,
            penalties
        };

        this._persist(result);
        return result;
    }

    _persist(result) {
        try {
            fs.writeFileSync(path.join(VERDICT_DIR, 'verdict.json'), JSON.stringify(result, null, 2));
            fs.appendFileSync(path.join(VERDICT_DIR, 'verdict_history.jsonl'), JSON.stringify(result) + '\n');
            if (result.penalties && result.penalties.length > 0) {
                fs.appendFileSync(path.join(VERDICT_DIR, 'verdict_alerts.jsonl'), JSON.stringify({ ts: result.timestamp, penalties: result.penalties }) + '\n');
            }
        } catch (e) {
            console.error('[VERDICT_ENGINE] Failed to save verdict logs:', e.message);
        }
    }
}

module.exports = new ResearchVerdictEngine();
