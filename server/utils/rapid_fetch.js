const fetchWithRetry = require('./fetchWithRetry');

async function fetchRapidQuotes(symbols) {
    const apiKey = process.env.RAPID_API_KEY;
    const host = 'apidojo-yahoo-finance-v1.p.rapidapi.com';
    const url = `https://${host}/market/v2/get-quotes?symbols=${symbols.join(',')}&region=US`;

    console.log(`[RAPID] Fetching ${symbols.length} symbols...`);
    try {
        const resp = await fetchWithRetry(url, {
            headers: {
                'x-rapidapi-key': apiKey,
                'x-rapidapi-host': host
            }
        }, 3, 5000);
        
        const data = await resp.json();
        if (data && data.quoteResponse && data.quoteResponse.result) {
            return data.quoteResponse.result.map(q => ({
                symbol: q.symbol,
                price: q.regularMarketPrice,
                prevClose: q.regularMarketPreviousClose,
                pct: q.regularMarketChangePercent,
                consensus: q.averageAnalystRating ? q.averageAnalystRating.toUpperCase().replace('_', ' ') : "HOLD",
                name: q.shortName
            }));
        }
        return [];
    } catch (e) {
        console.error(`[RAPID] FAIL: ${e.message}`);
        return [];
    }
}

module.exports = { fetchRapidQuotes };
