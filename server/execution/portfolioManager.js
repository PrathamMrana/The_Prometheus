const db = require('../data/dbProvider');
const { buildEntryTags, mergeExitTags } = require('../intelligence/tradeTagger');

/**
 * 🛡️ [PHASE 6] PRO-GRADE PORTFOLIO MANAGER (v7.0)
 * Re-engineered for SQL atomic persistence.
 */
class PortfolioManager {
    static clean(v) {
        return Number(Number(v).toFixed(2));
    }

    /**
     * 📊 [PHASE 10.6] INSTITUTIONAL STATE ENRICHMENT
     * Calculates current portfolio valuation based on live price cache.
     */
    static getLiveMetrics(portfolio, priceCache) {
        let totalValue = portfolio.balance + (portfolio.lockedBalance || 0);
        let unrealizedPnL = 0;
        const processedHoldings = [];

        for (const [symbol, holding] of Object.entries(portfolio.holdings)) {
            const currentPriceData = priceCache.get(symbol) || priceCache.get(symbol + ".NS");
            const currentPrice = currentPriceData ? currentPriceData.price : holding.avgPrice;
            const currentValue = holding.qty * currentPrice;
            const unrealized = currentValue - (holding.qty * holding.avgPrice);
            
            totalValue += currentValue;
            unrealizedPnL += unrealized;

            processedHoldings.push({
                symbol,
                ...holding,
                currentPrice,
                currentValue: this.clean(currentValue),
                unrealizedPnL: this.clean(unrealized)
            });
        }

        return {
            totalValue: this.clean(totalValue),
            unrealizedPnL: this.clean(unrealizedPnL),
            holdings: processedHoldings,
            balance: portfolio.balance,
            lockedBalance: portfolio.lockedBalance || 0,
            realizedPnL: portfolio.realizedPnL
        };
    }

    static load() {
        return db.getPortfolio();
    }

    static save(data) {
        db.updatePortfolio(data);
    }

    static buy(symbol, price, qty, researchContext = {}) {
        const state = this.load();
        const totalCost = this.clean(price * qty);
        const now = Date.now();

        const entryTags = buildEntryTags({
            ...researchContext,
            price,
            timestamp: now
        });

        state.balance = this.clean(state.balance - totalCost);
        
        const order = {
            id: `ENTRY_${now}_${Math.random().toString(36).substr(2, 4)}`,
            symbol,
            side: 'BUY',
            type: 'MARKET',
            qty,
            price,
            status: 'FILLED',
            timestamp: now,
            metadata: entryTags
        };

        state.holdings[symbol] = {
            qty,
            avgPrice: price,
            totalCost,
            lockedQty: 0
        };

        db.saveTrade(order, state);
        console.log(`🔱 [PORTFOLIO] Registered SQL entry: ${symbol} @${price}`);
        return state;
    }

    static liquidate(symbol, exitPrice, metrics = {}) {
        const state = this.load();
        const holding = state.holdings[symbol];

        if (!holding) return state;

        const now = Date.now();
        const qty = holding.qty;
        const proceeds = this.clean(qty * exitPrice);
        const costBasis = this.clean(qty * holding.avgPrice);
        const pnl = this.clean(proceeds - costBasis);

        state.balance = this.clean(state.balance + proceeds);
        state.realizedPnL = this.clean(state.realizedPnL + pnl);

        const order = {
            id: `EXIT_${now}_${Math.random().toString(36).substr(2, 4)}`,
            symbol,
            side: 'SELL',
            type: 'MARKET',
            qty,
            price: exitPrice,
            status: 'FILLED',
            timestamp: now,
            pnl,
            metadata: { ...metrics, exitTimestamp: now }
        };

        delete state.holdings[symbol];
        db.saveTrade(order, state);

        console.log(`🚀 [PORTFOLIO] SQL Liquidation: ${symbol} PnL: ${pnl}`);
        return state;
    }
}

module.exports = PortfolioManager;
