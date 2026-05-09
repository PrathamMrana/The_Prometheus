const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DBProvider {
    constructor() {
        const dbPath = path.join(__dirname, 'prometheus.db');
        this.db = new Database(dbPath); // Removed verbose: console.log
        this._cache = null;
        this._init();
    }

    _init() {
        // Load schema
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        this.db.exec(schema);
        
        // Initialize portfolio if empty
        const count = this.db.prepare('SELECT COUNT(*) as count FROM portfolio').get();
        if (count.count === 0) {
            this.db.prepare('INSERT INTO portfolio (balance, realized_pnl) VALUES (?, ?)').run(1000000, 0);
            console.log("📂 [DATABASE] Initialized default portfolio state.");
        }
    }

    // --- Portfolio ---
    getPortfolio() {
        if (this._cache) {
            return JSON.parse(JSON.stringify(this._cache));
        }

        const row = this.db.prepare('SELECT * FROM portfolio LIMIT 1').get();
        const holdingsRows = this.db.prepare('SELECT * FROM holdings').all();
        
        const holdings = {};
        holdingsRows.forEach(h => {
            holdings[h.symbol] = {
                qty: h.qty,
                avgPrice: h.avg_price,
                totalCost: h.total_cost,
                lockedQty: h.locked_qty
            };
        });

        const orders = this.db.prepare('SELECT * FROM orders ORDER BY timestamp DESC').all();

        const state = {
            balance: row.balance,
            lockedBalance: row.locked_balance,
            realizedPnL: row.realized_pnl,
            holdings,
            orders: orders.map(o => ({ ...o, metadata: JSON.parse(o.metadata || '{}') }))
        };

        this._cache = state;
        return JSON.parse(JSON.stringify(state));
    }

    updatePortfolio(data) {
        const stmt = this.db.prepare('UPDATE portfolio SET balance = ?, locked_balance = ?, realized_pnl = ?, updated_at = CURRENT_TIMESTAMP');
        stmt.run(data.balance, data.lockedBalance, data.realizedPnL);
        this._cache = null;
    }

    // --- Atomic Trade Commit ---
    saveTrade(order, portfolioUpdates) {
        const transaction = this.db.transaction((order, portfolioUpdates) => {
            // 1. Save Order
            const orderStmt = this.db.prepare(`
                INSERT OR REPLACE INTO orders (id, symbol, side, type, qty, price, status, pnl, timestamp, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            orderStmt.run(
                order.id, 
                order.symbol, 
                order.side, 
                order.type, 
                order.qty, 
                order.price, 
                order.status, 
                order.pnl || null, 
                order.timestamp, 
                JSON.stringify(order.metadata || {})
            );

            // 2. Update Portfolio
            this.updatePortfolio(portfolioUpdates);

            // 3. Update Holdings
            if (order.status === 'FILLED') {
                const holding = portfolioUpdates.holdings[order.symbol];
                if (holding) {
                    const holdingStmt = this.db.prepare(`
                        INSERT OR REPLACE INTO holdings (symbol, qty, avg_price, total_cost, locked_qty, updated_at)
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `);
                    holdingStmt.run(order.symbol, holding.qty, holding.avgPrice, holding.totalCost, holding.lockedQty);
                } else {
                    this.db.prepare('DELETE FROM holdings WHERE symbol = ?').run(order.symbol);
                }
            }
        });

        transaction(order, portfolioUpdates);
        this._cache = null; // Invalidate cache on trade execution
    }
}

module.exports = new DBProvider();
