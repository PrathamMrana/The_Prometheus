/**
 * 🔱 PROMETHEUS — CONFIDENCE CALIBRATION ENGINE
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Determines whether the engine's confidence scores are actually predictive 
 * of success or if the model is miscalibrated/overconfident.
 */

'use strict';

class CalibrationEngine {
    
    /**
     * Computes Brier Score, Expected Calibration Error (ECE), and Bucket Accuracy
     * @param {Array} trades Array of closed trades with .confidence and .pnl
     */
    compute(trades) {
        if (!trades || trades.length === 0) return this._emptyState();

        const buckets = {
            '50-60': { expected: 55, count: 0, wins: 0 },
            '60-70': { expected: 65, count: 0, wins: 0 },
            '70-80': { expected: 75, count: 0, wins: 0 },
            '80-90': { expected: 85, count: 0, wins: 0 },
            '90-100': { expected: 95, count: 0, wins: 0 }
        };

        let totalBrier = 0;

        trades.forEach(t => {
            const conf = t.tradeTags?.score || t.confidence || 0;
            const isWin = t.pnl > 0 ? 1 : 0;
            const confDecimal = conf / 100;

            // Brier Score (Mean Squared Error of probabilistic forecasts)
            totalBrier += Math.pow(confDecimal - isWin, 2);

            // Bucketing
            if (conf >= 90) { buckets['90-100'].count++; buckets['90-100'].wins += isWin; }
            else if (conf >= 80) { buckets['80-90'].count++; buckets['80-90'].wins += isWin; }
            else if (conf >= 70) { buckets['70-80'].count++; buckets['70-80'].wins += isWin; }
            else if (conf >= 60) { buckets['60-70'].count++; buckets['60-70'].wins += isWin; }
            else { buckets['50-60'].count++; buckets['50-60'].wins += isWin; }
        });

        const brierScore = totalBrier / trades.length;
        let eceSum = 0;
        let validBuckets = 0;

        const curve = Object.keys(buckets).map(k => {
            const b = buckets[k];
            const actualWinRate = b.count > 0 ? (b.wins / b.count) * 100 : 0;
            const error = Math.abs(b.expected - actualWinRate);
            
            if (b.count > 0) {
                eceSum += (b.count / trades.length) * error;
                validBuckets++;
            }

            return {
                bucket: k,
                expected: b.expected,
                actual: actualWinRate,
                count: b.count,
                error
            };
        });

        const ece = eceSum; // Expected Calibration Error

        // Detect Alerts
        let alert = null;
        if (ece > 20) alert = 'CONFIDENCE_COLLAPSE';
        else if (brierScore > 0.25) alert = 'OVERCONFIDENT_MODEL';
        
        // High confidence failure cluster
        const highConf = buckets['90-100'];
        if (highConf.count >= 5 && (highConf.wins / highConf.count) < 0.5) {
            alert = 'HIGH_CONFIDENCE_FAILURE_CLUSTER';
        }

        return {
            brierScore,
            ece,
            curve,
            alert,
            isValid: ece < 15
        };
    }

    _emptyState() {
        return {
            brierScore: 0,
            ece: 0,
            curve: [],
            alert: null,
            isValid: false
        };
    }
}

module.exports = new CalibrationEngine();
