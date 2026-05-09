require('dotenv').config()
const router = require('express').Router()
const fetch = require('node-fetch')

const KEY = process.env.FINNHUB_API_KEY

router.get('/:query', async (req, res) => {
    try {
        const query = req.params.query

        // Search US stocks via Finnhub
        const usRes = await fetch(
            `https://finnhub.io/api/v1/search?q=${query}&token=${KEY}`
        )
        const usData = await usRes.json()

        // Search Indian stocks via Yahoo
        const inRes = await fetch(
            `https://query2.finance.yahoo.com/v1/finance/search?q=${query}&region=IN&lang=en-IN`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://finance.yahoo.com'
                }
            }
        )
        const inData = await inRes.json()

        // Combine and filter results
        const usResults = (usData.result || [])
            .filter(r => r.type === 'Common Stock')
            .slice(0, 5)
            .map(r => ({
                symbol: r.symbol,
                name: r.description,
                exchange: r.primaryExchange,
                market: 'US',
                currency: 'USD'
            }))

        const inResults = (inData.quotes || [])
            .filter(r => r.exchange === 'NSI' || r.exchange === 'BSE')
            .slice(0, 5)
            .map(r => ({
                symbol: r.symbol,
                name: r.longname || r.shortname,
                exchange: r.exchange === 'NSI' ? 'NSE' : 'BSE',
                market: 'INDIA',
                currency: 'INR'
            }))

        res.json({
            query,
            results: [...usResults, ...inResults]
        })
    } catch (err) {
        res.status(500).json({ error: 'Search failed', message: err.message })
    }
})

module.exports = router
