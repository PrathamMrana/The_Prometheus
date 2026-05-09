const express = require('express');
const router = express.Router();
const fetchWithRetry = require('../utils/fetchWithRetry');
const cache = require('../cache');
const { exec } = require('child_process');
const path = require('path');
const Persistence = require('../utils/persistence');

// Helper to call Python bridge
function fetchQuotesViaPython(symbols) {
    return new Promise((resolve, reject) => {
        const pythonPath = process.env.PYTHON_PATH || 'python3';
        const scriptPath = path.join(__dirname, '../get_quotes.py');
        const pyEnv = {
            ...process.env,
            PYTHONPATH: ":/opt/anaconda3/lib/python313.zip:/opt/anaconda3/lib/python3.13:/opt/anaconda3/lib/python3.13/lib-dynload:/opt/anaconda3/lib/python3.13/site-packages"
        };
        exec(`${pythonPath} ${scriptPath} ${symbols.join(',')}`, { env: pyEnv }, (error, stdout, stderr) => {
            if (error) return reject(error);
            try {
                const data = JSON.parse(stdout);
                if (data.error) return reject(new Error(data.error));
                resolve(data);
            } catch (e) {
                reject(e);
            }
        });
    });
}

// Layer 8: Persistent Institutional Memory Buffer
const LKG_BUFFER = Persistence.load();

router.get('/quote', async (req, res) => {
    const defaultSymbols = ['^GSPC', '^IXIC', '^DJI', '^VIX'];
    const symbols = req.query.symbols ? req.query.symbols.split(',') : defaultSymbols;

    try {
        const cacheKey = symbols.join(',');
        const cached = cache.get(`us_${cacheKey}`);
        if (cached) return res.json({ success: true, data: cached });

        // 1. Fetch Spark for validation/fallback (indices & stocks)
        const sparkResultsRaw = await fetchWithRetry(`https://query2.finance.yahoo.com/v8/finance/spark?symbols=${symbols.join(',')}&range=1d&interval=1m`, {}, 2, 5000)
            .then(r => r.ok ? r.json() : {})
            .catch(e => { console.error("Spark US Fetch Error:", e.message); return {}; });
            
        // Map Spark Results
        const sparkMap = ((sparkResultsRaw.spark && sparkResultsRaw.spark.result) || []).reduce((acc, r) => {
            const sym = r.symbol;
            const resp = r.response && r.response[0] || {};
            acc[sym] = {
                close: resp.indicators && resp.indicators.quote && resp.indicators.quote[0] && resp.indicators.quote[0].close || [],
                prev: resp.meta && resp.meta.chartPreviousClose || 0
            };
            return acc;
        }, {});

        // 3. Fetch Deep Metrics via Python Bridge
        let pythonQuotes = [];
        try {
            const pyCacheKey = `us_py_quotes_${symbols.join(',')}`;
            pythonQuotes = cache.get(pyCacheKey);
            if (!pythonQuotes) {
                pythonQuotes = await fetchQuotesViaPython(symbols);
                cache.set(pyCacheKey, pythonQuotes, 120); 
            }
        } catch (e) { console.error("US Python Bridge Error:", e.message); }

        const pyMap = (Array.isArray(pythonQuotes) ? pythonQuotes : []).reduce((acc, q) => ({ ...acc, [q.symbol]: q }), {});
        const fhMap = finnhubQuotes.filter(q => q && q.c).reduce((acc, q) => ({ ...acc, [q.symbol]: q }), {});

        const results = symbols.map(sym => {
            const spark = sparkMap[sym] || {};
            const fh = fhMap[sym];
            const py = pyMap[sym] || {};
            
            const sparkPrice = (spark.close || []).filter(p => p !== null).pop() || (spark.prev || 0);
            const fhPrice = fh ? (fh.c || 0) : 0;
            const pyPrice = py ? (py.price || 0) : 0;
            
            // Intelligence Fusion: Tiered Fallback (Layer 8 Resilience)
            let finalPrice = sparkPrice > 0 ? sparkPrice : pyPrice;
            
            // Final Safety: LKG Buffer (Suffix Resilient)
            if (finalPrice <= 0) {
                const baseSym = sym.split('.')[0].replace('^', '');
                const lkg = LKG_BUFFER.get(sym) || LKG_BUFFER.get(baseSym) || LKG_BUFFER.get(baseSym + '.NS') || LKG_BUFFER.get('^' + baseSym);
                if (lkg) finalPrice = lkg.price;
            }

            const { calculatePercentageChange } = require('../utils/telemetry');
            const prev = spark.prev || (py.prev_close || finalPrice);
            const pct = calculatePercentageChange(finalPrice, prev);

            return {
                symbol: sym,
                displaySymbol: sym.replace('^', ''),
                price: parseFloat(finalPrice.toFixed(4)),
                pct_change: parseFloat(pct.toFixed(4)),
                volume: py.volume || 0,
                vol_ratio: py.vol_ratio || 1.0,
                market: 'US',
                source: sparkPrice > 0 ? 'spark' : (pyPrice > 0 ? 'python' : 'lkg_buffer'),
                stale: finalPrice === 0 || (sparkPrice === 0 && pyPrice === 0)
            };
        });

        cache.set(`us_${symbols.join(',')}`, results, 3);
        res.json({ success: true, data: results });
    } catch (e) {
        console.error("US fetch failed:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/status', (req, res) => {
    const now = new Date();
    const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = est.getDay();
    const hour = est.getHours();
    const min = est.getMinutes();
    const time = hour + min / 60;

    const isOpen = (day >= 1 && day <= 5) && (time >= 9.5 && time < 16);
    res.json({ market: 'US', isOpen, timestamp: now.toISOString() });
});

module.exports = router;
