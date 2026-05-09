const fetchWithRetry = require('./fetchWithRetry');

async function fetchPolygonQuotes(symbols) {
    const apiKey = process.env.POLYGON_API_KEY;
    
    // We only use Polygon for specific high-precision tickers (e.g., US Tech)
    const proSymbols = symbols.filter(s => ['AAPL', 'MSFT', 'NVDA', 'TSLA'].includes(s));
    if (proSymbols.length === 0) return [];

    console.log(`[POLYGON] Pulse for ${proSymbols.length} US Leaders...`);
    const results = [];
    
    for (const sym of proSymbols) {
        try {
            const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${apiKey}`;
            const resp = await fetchWithRetry(url, {}, 2, 3000);
            const data = await resp.json();
            
            if (data && data.ticker) {
                const t = data.ticker;
                results.push({
                    symbol: sym,
                    price: t.lastQuote?.p || t.prevDay?.c || 0,
                    prevClose: t.prevDay?.c || 0,
                    pct: t.todaysChangePerc || 0,
                    volume: t.day?.v || 0
                });
            }
        } catch (e) {
            console.error(`[POLYGON] FAIL: ${sym} | ${e.message}`);
        }
    }
    return results;
}

module.exports = { fetchPolygonQuotes };
