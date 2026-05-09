const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { buildTrainingData } = require('./features');

const PYTHON_PATH = '/opt/anaconda3/bin/python3';
const SCRIPT_PATH = path.join(__dirname, 'model.py');
const DATA_PATH = path.join(__dirname, 'dataset.json');

/**
 * 🏋️‍♂️ ML Trainer
 * Harvests OHLCV from Yahoo Finance, extracts features, generates target labels, and delegates to Python.
 */
async function train(symbol = 'TCS.NS') {
    console.log(`📡 [ML_TRAINER] Fetching historical data for ${symbol}...`);

    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5y`;
        const fetch = require('node-fetch');
        const req = await fetch(url);
        const json = await req.json();
        
        const result = [];
        if (json.chart && json.chart.result && json.chart.result[0]) {
            const res = json.chart.result[0];
            const timestamps = res.timestamp || [];
            const quotes = res.indicators.quote[0] || {};
            for (let i = 0; i < timestamps.length; i++) {
                if (quotes.close[i] !== null) {
                    result.push({
                        date: timestamps[i],
                        close: quotes.close[i],
                        high: quotes.high[i] !== null ? quotes.high[i] : quotes.close[i],
                        low: quotes.low[i] !== null ? quotes.low[i] : quotes.close[i]
                    });
                }
            }
        }
        
        if (!result || result.length < 500) {
            console.error(`🚨 [ML_TRAINER] Insufficient data. Found ${result?.length || 0} rows.`);
            return;
        }

        console.log(`✅ [ML_TRAINER] Downloaded ${result.length} rows.`);

        // Ensure history has `close, high, low` map structure expected by features.js
        const history = result.map(r => ({
            close: r.close,
            high: r.high,
            low: r.low,
            timestamp: r.date
        }));

        console.log(`⚙️ [ML_TRAINER] Extracting Features and Labels...`);
        const dataset = buildTrainingData(history);
        
        if (dataset.length < 10) {
            console.error("🚨 [ML_TRAINER] Failure: Feature extraction yielded too few rows.");
            return;
        }

        fs.writeFileSync(DATA_PATH, JSON.stringify(dataset));
        console.log(`✅ [ML_TRAINER] Created dataset with ${dataset.length} samples at ${DATA_PATH}`);

        console.log(`🤖 [ML_TRAINER] Spawning Python RandomForest Training...`);
        const pyEnv = {
            ...process.env,
            PYTHONPATH: ":/opt/anaconda3/lib/python313.zip:/opt/anaconda3/lib/python3.13:/opt/anaconda3/lib/python3.13/lib-dynload:/opt/anaconda3/lib/python3.13/site-packages"
        };

        exec(`${PYTHON_PATH} ${SCRIPT_PATH} train ${DATA_PATH}`, { env: pyEnv }, (error, stdout, stderr) => {
            if (error) {
                console.error(`🚨 [ML_TRAINER] Python Execution Failed: ${error.message}`);
                console.error(`Stderr: ${stderr}`);
                return;
            }
            if (stderr) {
                console.warn(`⚠️ [ML_TRAINER] Python Warning: ${stderr}`);
            }

            try {
                const response = JSON.parse(stdout.trim());
                if (response.success) {
                    console.log(`🔥 [ML_TRAINER] SUCCESS! Accuracy: ${(response.accuracy * 100).toFixed(2)}% | Samples: ${response.samples_trained}`);
                    console.log(`[ML_TRAINER] Features used: ${response.features.join(', ')}`);
                    console.log(`[ML_TRAINER] Model saved to model.pkl`);
                } else {
                    console.error(`🚨 [ML_TRAINER] Model Error: ${response.error}`);
                }
            } catch (e) {
                console.error(`🚨 [ML_TRAINER] Failed to parse Python stdout: ${stdout}`);
            }
        });

    } catch (e) {
        console.error(`🚨 [ML_TRAINER] Fatal Error:`, e);
    }
}

// If run standalone:
if (require.main === module) {
    const sym = process.argv[2] || 'TCS.NS';
    train(sym);
}

module.exports = { train };
