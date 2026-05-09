import YahooFinanceClass from 'yahoo-finance2';
const yahooFinance = new YahooFinanceClass();
(async () => {
    try {
        const result = await yahooFinance.quote('AAPL');
        console.log('SUCCESS:', result.symbol, result.regularMarketPrice);
    } catch (e) {
        console.error('ERROR:', e.message);
    }
})();
