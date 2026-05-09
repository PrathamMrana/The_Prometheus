const YFinanceAdapter = require('./server/apiLayer/adapters/YFinanceAdapter');

async function test() {
    const adapter = new YFinanceAdapter();
    const symbols = ['RELIANCE.NS', 'TCS.NS', 'AAPL', 'MSFT'];
    console.log(`Fetching ${symbols.join(', ')}...`);
    try {
        const results = await adapter.getPrices(symbols);
        console.log('Results:', JSON.stringify(results, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
