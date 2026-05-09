const fs = require('fs');
const path = require('path');

const TRADE_MEMORY_FILE = path.join(__dirname, '../data/trade_memory.json');

/**
 * 🛰️ [PHASE 9] TRADE ANALYTICS MEMORY
 * Persistence for win/loss stats and strategy intelligence.
 */
class TradeMemory {
    constructor() {
        this.data = this.load();
    }

    /**
     * 🚀 Structured Load logic
     */
    load() {
        try {
            if (fs.existsSync(TRADE_MEMORY_FILE)) {
                return JSON.parse(fs.readFileSync(TRADE_MEMORY_FILE, 'utf8'));
            }
        } catch (e) {
            console.error("[TRADE_MEMORY] Error loading analytics:", e.message);
        }
        return {
            totalTrades: 0,
            winRate: 0,
            avgReturn: 0,
            winningSignals: {}, // strategy_label -> count
            totalPnL: 0
        };
    }

    /**
     * 🚀 Log Trade Outcome
     */
    record(symbol, pnlPercent, strategyLabel) {
        this.data.totalTrades++;
        this.data.totalPnL += pnlPercent;

        if (pnlPercent > 0) {
            this.data.winningSignals[strategyLabel] = (this.data.winningSignals[strategyLabel] || 0) + 1;
        }

        this.data.winRate = (Object.values(this.data.winningSignals).reduce((a, b) => a + b, 0) / this.data.totalTrades) * 100;
        this.data.avgReturn = this.data.totalPnL / this.data.totalTrades;

        this.save();
    }

    /**
     * 🚀 Atomic Save logic
     */
    save() {
        try {
            const dir = path.dirname(TRADE_MEMORY_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(TRADE_MEMORY_FILE, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error("[TRADE_MEMORY] Save Error:", e.message);
        }
    }
}

module.exports = new TradeMemory();
