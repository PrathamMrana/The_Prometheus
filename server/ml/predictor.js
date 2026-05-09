const { exec } = require('child_process');
const path = require('path');
const { extractFeatures } = require('./features');

const PYTHON_PATH = process.env.PYTHON_PATH || 'python3';
const SCRIPT_PATH = path.join(__dirname, 'model.py');

/**
 * 🔮 ML Predictor
 * Converts raw price history into probabilistic signal with Factor-Driven Confidence.
 */
function predict(symbol, history, analytics = {}, previousSignal = "HOLD") {
    return new Promise((resolve, reject) => {
        if (!history || history.length < 10) {
            return resolve({ success: false, error: "INSUFFICIENT_DATA" });
        }

        // 1. Feature Engineering
        const features = extractFeatures(history);
        if (!features) {
            return resolve({ success: false, error: "FEATURE_EXTRACTION_FAILED" });
        }

        // 2. Spawn ML Inference
        const payload = JSON.stringify(features);
        const escapedPayload = payload.replace(/"/g, '\\"');
        
        const pyEnv = { ...process.env };

        exec(`${PYTHON_PATH} ${SCRIPT_PATH} predict "${escapedPayload}"`, { env: pyEnv }, (error, stdout, stderr) => {
            if (error) {
                console.error(`🚨 [PREDICTOR_ERROR] ${error.message}`);
                return resolve({ success: false, error: "PYTHON_EXEC_FAILED" });
            }

            try {
                const response = JSON.parse(stdout.trim());
                if (!response.success) {
                    return resolve({ success: false, error: response.error || "MODEL_ERROR" });
                }

                const prob = response.prob;
                
                // 🛡️ [PHASE 16] HYBRID ML + FACTOR CONFIDENCE ENGINE
                const { rsi, atr, price, ema20, ema50 } = features;
                // ⚖️ [PRODUCTION_GRADE] Optimized Weights (60% ML / 40% Factors)
                const mlWeight = 0.6;
                const factorWeight = 0.4;
                const prevConf = analytics.prevConfidence || 0.5;

                // 🎯 Optimized Factor Scaling (Institutional Smoothness)
                const trendDir = Math.max(-0.6, Math.min(0.6, (ema20 - ema50) / (Math.max(1, price) * 0.08)));
                const momentumDir = Math.max(-1, Math.min(1, (rsi - 50) / 30));
                const volatilityStability = 1 - Math.min(1, (atr * 1.5) / Math.max(1, price));
                const vSafe = analytics.currentVolume || analytics.avgVolume || 0;
                const vAvgSafe = analytics.avgVolume || 1;
                const volumeStrength = Math.min(1, vSafe / vAvgSafe);

                const safe = (v, fb = 0) => (Number.isFinite(v) ? v : fb);
                const tClean = safe(trendDir);
                const mClean = safe(momentumDir);
                const vClean = safe(volatilityStability);
                const volClean = safe(volumeStrength);

                const factorScore = (tClean * 0.4) + (mClean * 0.3) + (vClean * 0.2) + (volClean * 0.1);
                const factorConviction = 0.5 + (factorScore * 0.5);

                // 🚀 FINAL BLENDED CONFIDENCE
                let calculatedConfidence = (prob * mlWeight) + (factorConviction * factorWeight);

                // 🔥 [PHASE 16] ML DOMINANCE OVERRIDE (Triggered at 0.75)
                let dominanceApplied = false;
                if (prob > 0.75 && factorConviction > 0.4) {
                    calculatedConfidence += 0.10;
                    dominanceApplied = true;
                }

                calculatedConfidence = Math.max(0, Math.min(1, calculatedConfidence));
                const confidenceDelta = calculatedConfidence - prevConf;

                // 🔱 [PHASE 16.5] HYSTERESIS & KILL SWITCH LOGIC
                let signal = "HOLD";
                
                if (factorConviction < 0.15) {
                    signal = "HOLD";
                    console.log(`🚫 [KILL_SWITCH] Factors too bearish for ${symbol} (${factorConviction.toFixed(2)})`);
                } else {
                    const BUY_ENTRY = 0.63;
                    const BUY_HOLD = 0.60;
                    const SELL_ENTRY = 0.35;
                    const SELL_HOLD = 0.40;

                    if (previousSignal === "BUY") {
                        if (calculatedConfidence >= BUY_HOLD) signal = "BUY";
                        else if (calculatedConfidence <= SELL_ENTRY) signal = "SELL";
                        else signal = "HOLD";
                    } else if (previousSignal === "SELL") {
                        if (calculatedConfidence <= SELL_HOLD) signal = "SELL";
                        else if (calculatedConfidence >= BUY_ENTRY) signal = "BUY";
                        else signal = "HOLD";
                    } else {
                        if (calculatedConfidence >= BUY_ENTRY) signal = "BUY";
                        else if (calculatedConfidence <= SELL_ENTRY) signal = "SELL";
                        else signal = "HOLD";
                    }
                }

                // 📊 [PHASE 16.5] SIGNAL STATE LAYER
                let state;

                if (signal === "HOLD") {
                    state = previousSignal === "BUY" ? "EXIT" : "NEUTRAL";
                } 
                else if (previousSignal === signal) {
                    state = "HOLDING";
                } 
                else {
                    state = "NEW";
                }

                // 🌟 [Elite Level] Explicit EXIT Signal Upgrade
                if (signal === "HOLD" && previousSignal === "BUY") {
                    signal = "EXIT";
                }

                // 🏷️ CONFIDENCE-BASED LABELING
                let label = signal;
                if (signal === "BUY" && calculatedConfidence < 0.65) {
                    label = "WEAK BUY (Holding)";
                } else if (signal === "BUY" && calculatedConfidence >= 0.75) {
                    label = "STRONG BUY";
                } else if (signal === "SELL" && calculatedConfidence > 0.35) {
                    label = "WEAK SELL (Holding)";
                }

                resolve({
                    success: true,
                    signal,
                    confidence: parseFloat(calculatedConfidence.toFixed(4)),
                    state,
                    label,
                    confidenceDelta: parseFloat(confidenceDelta.toFixed(4)),
                    ml_prob: prob,
                    factor_conviction: parseFloat(factorConviction.toFixed(4)),
                    factors: {
                        trend: parseFloat(trendDir.toFixed(2)),
                        momentum: parseFloat(momentumDir.toFixed(2)),
                        volatility: parseFloat(volatilityStability.toFixed(2)),
                        volume: parseFloat(volumeStrength.toFixed(2))
                    },
                    dominance_applied: dominanceApplied,
                    model: response.model || "RandomForest"
                });
            } catch (e) {
                console.error(`🚨 [PREDICTOR_PARSE_ERROR] Invalid JSON from Python: ${stdout}`);
                resolve({ success: false, error: "INVALID_JSON_RESPONSE" });
            }
        });
    });
}

module.exports = { predict };
