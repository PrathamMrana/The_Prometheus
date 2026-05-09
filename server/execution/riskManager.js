const PortfolioManager = require('./portfolioManager');

/**
 * 🛡️ [PHASE 8] INSTITUTIONAL RISK & CAPITAL MANAGER
 * Enforces safety limits, position sizing, and exposure guards for autonomous trading.
 */
class RiskManager {
    constructor() {
        this.MAX_POSITIONS = 5;
        this.MAX_CAPITAL_PER_TRADE_PERCENT = 10; // 10% of total balance
        this.FIXED_CAPITAL_CEILING = 50000;      // Max ₹50,000 per trade
    }

    /**
     * 🚀 Position Sizer: Calculates the safe QTY for a given entry price.
     * Logic: Min(10% of balance, ₹50,000) / price
     */
    calculateSafeQty(symbol, price, portfolio) {
        const availableBalance = portfolio.balance;
        
        // 1. Calculate capital based on % of balance
        const targetCapital = availableBalance * (this.MAX_CAPITAL_PER_TRADE_PERCENT / 100);
        
        // 2. Apply the hard ceiling (₹50k)
        const safeCapital = Math.min(targetCapital, this.FIXED_CAPITAL_CEILING);
        
        // 3. Calculate Qty
        const qty = Math.floor(safeCapital / price);
        
        return qty > 0 ? qty : 0;
    }

    /**
     * 🛰️ Exposure Guard: Checks if a new trade violates risk parameters.
     */
    validateTrade(symbol, side, portfolio) {
        // 1. Check Portfolio Caps
        const activePositionsCount = Object.keys(portfolio.holdings).length;
        if (activePositionsCount >= this.MAX_POSITIONS && side === 'BUY') {
            return { valid: false, reason: "MAX_POSITIONS_REACHED" };
        }

        // 2. Check for existing position (Prevent doubling down in Auto-Mode)
        if (portfolio.holdings[symbol] && side === 'BUY') {
            return { valid: false, reason: "POSITION_ALREADY_OPEN" };
        }

        // 3. Wash-Sale Guard (Check recent orders for same symbol - simplified)
        const recentOrders = portfolio.orders.slice(-5);
        const wasRecentlyClosed = recentOrders.some(o => o.symbol === symbol && o.status === 'FILLED' && o.side === 'SELL');
        if (wasRecentlyClosed && side === 'BUY') {
            return { valid: false, reason: "WASH_SALE_COOLDOWN" };
        }

        return { valid: true };
    }
}

module.exports = new RiskManager();
