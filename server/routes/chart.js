const router = require('express').Router();
const fetch = require('node-fetch');

/**
 * 📈 [INSTITUTIONAL CHART PROXY]
 * Proxies Yahoo Finance chart data to bypass browser CORS restrictions.
 * Supports: 1m, 5m, 15m, 1h, 1d, 1wk timeframes.
 */
router.get('/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { range = '5d', interval = '15m' } = req.query;

        // Ensure symbol has correct suffix for Yahoo Finance (NSE priority or Index caret)
        const indices = {
            'NSEBANK': '^NSEBANK',
            'NSEI': '^NSEI',
            'BSESN': '^BSESN',
            'INDIAVIX': '^INDIAVIX',
            'VIX': '^VIX',
            'GSPC': '^GSPC',
            'IXIC': '^IXIC'
        };
        
        let ticker = indices[symbol] || symbol;
        if (!ticker.startsWith('^') && !ticker.includes('.')) {
            ticker = `${ticker}.NS`;
        }
        // 🔱 [PHASE 17 FIX] Strip accidental double-suffixes like ^NSEI.NS
        if (ticker.startsWith('^')) {
            ticker = ticker.replace('.NS', '');
        }
        
        // 🛡️ Safe range fallback: some intervals need wider ranges for global indices
        const safeRange = (interval === '1d' && range === '5d') ? '1mo' : range;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${safeRange}&interval=${interval}`;
        const fallbackUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?range=${safeRange}&interval=${interval}`;

        const fetchHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://finance.yahoo.com'
        };

        let response = await fetch(url, { headers: fetchHeaders });

        // 🔄 Automatic fallback to query2 if query1 fails
        if (!response.ok) {
            console.warn(`[CHART_PROXY] query1 failed (${response.status}) for ${ticker} — retrying query2`);
            response = await fetch(fallbackUrl, { headers: fetchHeaders });
        }

        if (!response.ok) {
            throw new Error(`Yahoo Finance API returned ${response.status}`);
        }

        const data = await response.json();
        
        // 🛡️ Data Validation
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            return res.status(404).json({ success: false, error: "SYMBOL_NOT_FOUND" });
        }

        res.json({ success: true, data: data.chart.result[0] });

    } catch (err) {
        console.error(`[CHART_PROXY_ERR] ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
