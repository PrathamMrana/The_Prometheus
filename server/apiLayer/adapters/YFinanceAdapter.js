const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 🔱 [PHASE 21] PERSISTENT PYTHON BRIDGE
 * Maintains a single long-lived process to avoid library load overhead (OOM mitigation).
 */
let bridgeProcess = null;
let currentResolve = null;
let currentReject = null;

class YFinanceAdapter extends BaseAdapter {
    constructor() {
        super('YFINANCE', 'NONE');
        const venvPy = path.join(__dirname, '../../venv/bin/python3');
        this.pyPath = fs.existsSync(venvPy) ? venvPy : process.env.PYTHON_PATH || 'python3';
        this.scriptPath = path.join(__dirname, '../../get_quotes.py');
        this._initBridge();
    }

    _initBridge() {
        if (bridgeProcess) return;

        console.log('🚀 [BRIDGE] Initializing Persistent Python Daemon...');
        bridgeProcess = spawn(this.pyPath, [this.scriptPath, '--persistent'], {
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        bridgeProcess.stdout.on('data', (data) => {
            const raw = data.toString();
            try {
                // Split by newline in case multiple JSONs came in (though unlikely with current protocol)
                const lines = raw.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    const parsed = JSON.parse(line);
                    
                    // Handle 'READY' signal
                    if (parsed.status === 'READY') {
                        console.log('✅ [BRIDGE] Python Daemon READY.');
                        continue;
                    }

                    if (currentResolve) {
                        const results = this._processPayload(parsed);
                        currentResolve(results);
                        currentResolve = null;
                        currentReject = null;
                    }
                }
            } catch (e) {
                console.error(`[BRIDGE_PARSE_ERROR] ${e.message} | RAW: ${raw.substring(0, 100)}`);
                if (currentReject) currentReject(e);
            }
        });

        bridgeProcess.stderr.on('data', (data) => {
            const err = data.toString();
            if (err.includes('Error fetching')) {
                // Individual symbol errors are handled, don't crash the bridge
                return;
            }
            console.error(`[BRIDGE_STDERR] ${err}`);
        });

        bridgeProcess.on('close', (code) => {
            console.warn(`💀 [BRIDGE] Process exited with code ${code}. Restarting...`);
            bridgeProcess = null;
            if (currentReject) currentReject(new Error('Bridge died'));
            setTimeout(() => this._initBridge(), 1000);
        });
    }

    _processPayload(parsed) {
        const resultsArray = parsed.quotes || [];
        const mapped = {};
        resultsArray.forEach(data => {
            mapped[data.symbol] = this.standardize({
                price: data.price,
                pct_change: data.pct_change,
                prevClose: data.prev_close,
                priority: data.priority || "NORMAL",
                volume: data.volume,
                volume_history: data.volume_history || [],
                sparkline: data.sparkline || [],
                signal: data.signal,
                anomaly: data.anomaly,
                zscore: data.zscore,
                sector: data.sector,
                timestamp: data.timestamp
            }, data.symbol);
        });
        return { quotes: mapped, global: parsed.global || {} };
    }

    async getPrices(symbols) {
        if (!symbols || symbols.length === 0) return { quotes: {}, global: {} };
        
        const normalized = symbols.map(s => {
            const sym = s.trim().toUpperCase();
            if (sym.includes(".") || sym.startsWith("^")) return sym;
            if (["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN"].includes(sym)) return sym;
            return `${sym}.NS`;
        });

        return new Promise((resolve, reject) => {
            // 🛡️ [PHASE 21] Bridge Concurrency Lock
            // Since we only have ONE bridge, we must wait if it's busy.
            // In worker.js, we fetch in chunks anyway.
            if (currentResolve) {
                return setTimeout(() => resolve(this.getPrices(symbols)), 100);
            }

            currentResolve = resolve;
            currentReject = reject;
            
            try {
                bridgeProcess.stdin.write(JSON.stringify({ symbols: normalized }) + '\n');
            } catch (e) {
                console.error('[BRIDGE_WRITE_ERROR]', e.message);
                reject(e);
            }
        });
    }

    async getPrice(symbol) {
        const res = await this.getPrices([symbol]);
        return res.quotes[symbol] || null;
    }

    async getQuote(symbol) { return this.getPrice(symbol); }
}

module.exports = YFinanceAdapter;
