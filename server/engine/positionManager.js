const fs = require('fs');
const path = require('path');

const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');

/**
 * 🛰️ [PHASE 9] POSITION LIFECYCLE MANAGER
 * Persistence for open positions, trade metadata, and unrealized PnL.
 */
class PositionManager {
    constructor() {
        this.positions = this.load();
    }

    /**
     * 🚀 Structured Load logic (Atomic)
     */
    load() {
        try {
            if (fs.existsSync(POSITIONS_FILE)) {
                const raw = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
                const normalized = {};
                // 🛡️ [PHASE 12] Force Uppercase Keys for Look-up Stability
                Object.entries(raw).forEach(([sym, data]) => {
                    normalized[sym.toUpperCase()] = data;
                });
                return normalized;
            }
        } catch (e) {
            console.error("[POSITION_MANAGER] Error loading positions:", e.message);
        }
        return {}; 
    }

    /**
     * 🚀 Atomic Save logic (temp-file rename)
     */
    save() {
        try {
            const dir = path.dirname(POSITIONS_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            
            const tmp = POSITIONS_FILE + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(this.positions, null, 2));
            fs.renameSync(tmp, POSITIONS_FILE);
        } catch (e) {
            console.error("[POSITION_MANAGER] Save error:", e.message);
        }
    }

    /**
     * 🚀 Lifecycle: OPEN
     */
    open(symbol, entryPrice, qty, confidence, indicators, sl, tp, strategyLabel) {
        this.positions[symbol] = {
            entryPrice,
            qty,
            confidence,
            indicators,
            timestamp: Date.now(),
            sl,
            tp,
            strategyLabel,
            mfe: 0, // Max Favorable Excursion (Highest gain %)
            mae: 0, // Max Adverse Excursion (Lowest drop %)
            status: 'OPEN'
        };
        this.save();
    }

    /**
     * 🚀 Update Metrics (MFE/MAE) on every price tick
     */
    updateMetrics(symbol, currentPrice) {
        const p = this.positions[symbol.toUpperCase()];
        if (!p || p.entryPrice <= 0) return;
        
        const pnlPct = ((currentPrice - p.entryPrice) / p.entryPrice) * 100;
        
        if (pnlPct > p.mfe) {
            p.mfe = pnlPct;
            this.save();
        } else if (pnlPct < p.mae) {
            p.mae = pnlPct;
            this.save();
        }
    }

    /**
     * 🚀 Lifecycle: CLOSE
     */
    close(symbol) {
        const p = this.positions[symbol];
        delete this.positions[symbol];
        this.save();
        return p;
    }

    get(symbol) {
        if (!symbol) return null;
        return this.positions[symbol.toUpperCase()];
    }

    reload() {
        this.positions = this.load();
        return this.positions;
    }

    all() {
        return this.positions;
    }

    /**
     * 🔱 [PHASE 19] BOOT-TIME RECONCILIATION
     * Cross-checks positions.json vs portfolio.json holdings.
     * Removes orphaned positions that were closed in portfolio but never cleaned from positions.
     * Called once at startup to prevent STATE_SYNC_BLOCKED cascades.
     */
    reconcile(portfolioHoldings = {}) {
        const holdingKeys = new Set(Object.keys(portfolioHoldings).map(k => k.toUpperCase()));
        let removed = 0;
        for (const sym of Object.keys(this.positions)) {
            if (!holdingKeys.has(sym.toUpperCase())) {
                console.warn(`[RECONCILE] Orphaned position removed: ${sym} (not in portfolio holdings)`);
                delete this.positions[sym];
                removed++;
            }
        }
        if (removed > 0) {
            this.save();
            console.log(`[RECONCILE] ✅ Cleaned ${removed} orphaned positions from positions.json`);
        } else {
            console.log(`[RECONCILE] ✅ Positions.json is clean — no orphans found`);
        }
        return removed;
    }
}

module.exports = new PositionManager();
