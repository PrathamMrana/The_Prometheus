/**
 * YFinanceAdapter - Python Bridge for High-Reliability Fallback Data.
 * Uses get_quotes.py to fetch data via yfinance.
 */
const BaseAdapter = require('./BaseAdapter');
const { exec } = require('child_process');
const path = require('path');

class YFinanceAdapter extends BaseAdapter {
    constructor() {
        super('YFINANCE', 'NONE'); // No API key needed for yfinance
        // Use project venv first, fall back to Anaconda if venv missing
        const venvPy = path.join(__dirname, '../../venv/bin/python3');
        const { existsSync } = require('fs');
        this.pyPath = existsSync(venvPy) ? venvPy : process.env.PYTHON_PATH || 'python3';
        this.scriptPath = path.join(__dirname, '../../get_quotes.py');
    }

    async getPrice(symbol) {
        const results = await this.getPrices([symbol]);
        return results ? results[symbol] : null;
    }

    /**
     * 🚀 [BATCH] INSTITUTIONAL CHUNKED FETCH (Stealth Mode)
     * Consolidates multiple tickers into small, rate-limit resistant chunks.
     */
    async getPrices(symbols) {
        if (!symbols || symbols.length === 0) return {};
        
        // 🛡️ [STEP 1] INSTITUTIONAL SYMBOL NORMALIZATION
        const normalized = symbols.map(s => {
            const sym = s.trim().toUpperCase();
            if (sym.includes(".") || sym.startsWith("^")) return sym;
            if (["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN"].includes(sym)) return sym;
            return `${sym}.NS`;
        });

        // 🛡️ [STEP 2] SINGLE BATCH EXECUTION (NO CHUNKING)
        // Ensure SINGLE complete payload for accurate GLOBAL STATE
        // [STABILITY] Processing chunked batch...
        // console.log(`[STEALTH BATCH] Processing ${normalized.length} tickers in ONE unified segment...`);
        try {
            return await this.executePythonBatch(normalized.join(','), normalized.length);
        } catch (e) {
            console.error(`[STEALTH BATCH FAIL] Unified execution blocked: ${e.message}`);
            return { quotes: {}, global: {} };
        }
    }

    /**
     * Internal Python Execution Bridge (with Header Rotation & Retries)
     */
    async executePythonBatch(symString, expectedCount) {
        let lastError;
        for (let i = 0; i < 3; i++) {
            try {
                return await this._runPython(symString);
            } catch (e) {
                lastError = e;
                const delay = 300 + Math.random() * 500;
                console.warn(`[YF_RETRY] Attempt ${i+1} failed. Retrying in ${Math.round(delay)}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
        throw lastError;
    }

    _runPython(symString) {
        return new Promise((resolve, reject) => {
            const uas = [
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1.2 Mobile/15E148 Safari/604.1"
            ];
            const ua = uas[Math.floor(Math.random() * uas.length)];
            const cmd = `${this.pyPath} ${this.scriptPath} "${symString}"`;
            
        exec(cmd, { env: { ...process.env, USER_AGENT: ua } }, (error, stdout, stderr) => {
            if (error && !stdout.includes('{"quotes":')) return reject(new Error(`Exec error: ${error.message}`));
            try {
                // 🔱 [FIX] Extract only the JSON payload, ignoring yfinance terminal warnings (like 'symbol delisted')
                const jsonStart = stdout.indexOf('{"quotes":');
                if (jsonStart === -1) throw new Error("JSON payload not found in python output");
                
                const cleanJson = stdout.substring(jsonStart);
                const parsed = JSON.parse(cleanJson);
                const resultsArray = parsed.quotes || [];
                    const mapped = {};
                    
                    resultsArray.forEach(data => {
                        mapped[data.symbol] = this.standardize({
                            price: data.price,
                            high: data.high,
                            low: data.low,
                            percent: data.pct_change,
                            prevClose: data.prev_close,
                            priority: data.priority || "NORMAL",
                            volume: data.volume,
                            volume_history: data.volume_history || [],
                            sparkline: data.sparkline || [],
                            signal: data.signal,
                            anomaly: data.anomaly,
                            zscore: data.zscore,
                            sector: data.sector,
                            timestamp: data.timestamp // 🔱 [Purity Lock] Use real market timestamp
                        }, data.symbol);
                    });
                    
                    resolve({
                        quotes: mapped,
                        global: parsed.global || {}
                    });
                } catch (e) {
                    reject(new Error(`Parse error: ${e.message}`));
                }
            });
        });
    }

    async getQuote(symbol) {
        return this.getPrice(symbol);
    }
}

module.exports = YFinanceAdapter;
