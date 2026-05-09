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
    const symbolsRaw = req.query.symbols ? req.query.symbols : 'RELIANCE.NS,TCS.NS,HDFCBANK.NS,INFY.NS,ICICIBANK.NS,SBIN.NS,BHARTIARTL.NS,ITC.NS,LT.NS,BAJFINANCE.NS,^NSEI,^BSESN';
    const symbols = symbolsRaw.split(',');

    try {
        const cached = cache.get(`in_${symbolsRaw}`);
        if (cached) return res.json({ success: true, data: cached });

        // 1. Fetch Spark for validation/fallback (Yahoo Finance)
        const sparkResultsRaw = await fetchWithRetry(`https://query2.finance.yahoo.com/v8/finance/spark?symbols=${symbols.join(',')}&range=1d&interval=1m`, {}, 2, 5000)
            .then(r => r.ok ? r.json() : {})
            .catch(e => { console.error("Spark Fetch Error:", e.message); return {}; });
            
        // Map Spark Results (Yahoo's complex nesting)
        const sparkMap = ((sparkResultsRaw.spark && sparkResultsRaw.spark.result) || []).reduce((acc, r) => {
            const sym = r.symbol;
            const resp = r.response && r.response[0] || {};
            acc[sym] = {
                close: resp.indicators && resp.indicators.quote && resp.indicators.quote[0] && resp.indicators.quote[0].close || [],
                prev: resp.meta && resp.meta.chartPreviousClose || 0
            };
            return acc;
        }, {});

        // 3. Fetch Deep Metrics via Python Bridge (The ultimate fallback)
        let pythonQuotes = [];
        try {
            const pyCacheKey = `py_quotes_${symbolsRaw}`;
            pythonQuotes = cache.get(pyCacheKey);
            if (!pythonQuotes) {
                pythonQuotes = await fetchQuotesViaPython(symbols);
                cache.set(pyCacheKey, pythonQuotes, 60); 
            }
        } catch (e) { console.error("Python Bridge Error:", e.message); }

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

            const prev = spark.prev || (py.prev_close || finalPrice);
            const pct = (prev !== 0 ? ((finalPrice - prev) / prev) * 100 : 0);

            return {
                symbol: sym,
                displaySymbol: sym.replace('.NS', '').replace('.BO', '').replace('^', ''),
                price: parseFloat(finalPrice.toFixed(4)),
                pct_change: parseFloat(pct.toFixed(4)),
                volume: py.volume || 0,
                vol_ratio: py.vol_ratio || 1.0,
                market: 'INDIA',
                source: sparkPrice > 0 ? 'spark' : (pyPrice > 0 ? 'python' : 'lkg_buffer'),
                stale: finalPrice === 0 || (sparkPrice === 0 && pyPrice === 0)
            };
        });

        cache.set(`in_${symbolsRaw}`, results, 3);
        res.json({ success: true, data: results });
    } catch (e) {
        console.error("India fetch failed:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/status', (req, res) => {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = ist.getDay();
    const hour = ist.getHours();
    const min = ist.getMinutes();
    const time = hour + min / 60;
    const isOpen = (day >= 1 && day <= 5) && (time >= 9.25 && time < 15.5);
    res.json({ market: 'INDIA', isOpen, timestamp: now.toISOString() });
});

module.exports = router;
