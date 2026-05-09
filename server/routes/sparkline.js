const router = require('express').Router()
const fetch = require('node-fetch')
const cache = require('../cache')

router.get('/:symbol', async (req, res) => {
    const symbol = req.params.symbol
    const cacheKey = `spark_${symbol}`
    const cached = cache.get(cacheKey, 'sparkline')
    if (cached) return res.json({ source: 'cache', data: cached })

    try {
        const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://finance.yahoo.com'
                }
            }
        )
        const d = await r.json()
        const prices = d.chart.result[0].indicators.quote[0].close
            .filter(p => p !== null)
            .slice(-12)
            .map(p => parseFloat(p.toFixed(2)))

        cache.set(cacheKey, prices)
        res.json({ source: 'live', data: prices })
    } catch (err) {
        res.status(500).json({ error: 'Sparkline failed' })
    }
})

module.exports = router
