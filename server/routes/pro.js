const express = require('express');
const router = express.Router();
const Persistence = require('../utils/persistence');

router.get('/quote', async (req, res) => {
    // 🔓 [PRO] EXPLICIT URI DECODING
    const symbolsRaw = decodeURIComponent(req.query.symbols || '').replace(/%2C/g, ',');
    const symbols = symbolsRaw.split(',').map(s => s.trim()).filter(s => s);

    try {
        const LKG_BUFFER = Persistence.load();
        
        const results = symbols.map(sym => {
            const lkg = LKG_BUFFER.get(sym) || LKG_BUFFER.get(sym.split('.')[0]);
            
            if (lkg) {
                const px = lkg.price || 0;
                const pc = lkg.pct || 0;
                const prev = lkg.prevClose || 0;
                return {
                    symbol: sym,
                    price: parseFloat(px.toFixed(4)),
                    pct_change: parseFloat(pc.toFixed(4)),
                    prev_close: parseFloat(prev.toFixed(4)),
                    rsi: lkg.rsi || 50,
                    macd: lkg.macd || 0,
                    consensus: lkg.consensus || 'HOLD',
                    market: (sym.includes('.NS') || sym.includes('.BO')) ? 'INDIA' : 'US',
                    source: 'buffer',
                    stale: (Date.now() - (lkg.timestamp || 0)) > 90000 
                };
            } else {
                return {
                    symbol: sym,
                    price: 0,
                    pct_change: 0,
                    market: 'UNKNOWN',
                    source: 'none',
                    stale: true
                };
            }
        });

        res.json({ success: true, data: results });
    } catch (e) {
        console.error("Pro Route Buffer Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
