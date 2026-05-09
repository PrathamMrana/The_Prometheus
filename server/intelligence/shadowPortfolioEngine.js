/**
 * 🔱 PROMETHEUS — SHADOW PORTFOLIO SIMULATION
 * PHASE: CONTROLLED RESEARCH CAMPAIGN
 * 
 * Simulates realistic capital curves to prove that the edge translates
 * into a tradeable portfolio. Great signals can still produce terrible 
 * portfolios if sizing, correlation, and capital efficiency are poor.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SHADOW_LOG_DIR = path.join(__dirname, '../data/research/campaigns');
const SHADOW_FILE    = path.join(SHADOW_LOG_DIR, 'shadow_portfolio.json');

class ShadowPortfolioEngine {
    constructor() {
        this.state = this._load();
    }

    _load() {
        try {
            if (fs.existsSync(SHADOW_FILE)) {
                return JSON.parse(fs.readFileSync(SHADOW_FILE, 'utf8'));
            }
        } catch (e) {
            console.error('[SHADOW_PORTFOLIO] Load error:', e.message);
        }
        return {
            initialCapital: 1000000,
            currentBalance: 1000000,
            equityPeak: 1000000,
            maxDrawdownPct: 0,
            positions: {},
            history: [],
            metrics: {
                totalTrades: 0,
                wins: 0,
                losses: 0,
                cascadingLosses: 0, // sequential losses
                currentLossStreak: 0
            }
        };
    }

    _save() {
        try {
            if (!fs.existsSync(SHADOW_LOG_DIR)) fs.mkdirSync(SHADOW_LOG_DIR, { recursive: true });
            fs.writeFileSync(SHADOW_FILE, JSON.stringify(this.state, null, 2));
        } catch (e) {
            console.error('[SHADOW_PORTFOLIO] Save error:', e.message);
        }
    }

    /**
     * Replicates a buy signal with realistic capital constraints.
     */
    simulateEntry(symbol, price, confidence, sector) {
        // 1. Sector Concentration Guard (Max 3 per sector)
        let sectorCount = 0;
        for (const pos of Object.values(this.state.positions)) {
            if (pos.sector === sector) sectorCount++;
        }
        if (sectorCount >= 3) return { success: false, reason: 'SECTOR_CONCENTRATION_LIMIT' };

        // 2. Sizing: 5% of CURRENT equity per trade
        const equity = this.state.currentBalance + this._getOpenPositionValue();
        const allocatedCapital = equity * 0.05;
        
        if (this.state.currentBalance < allocatedCapital) {
            return { success: false, reason: 'INSUFFICIENT_CAPITAL_EFFICIENCY' };
        }

        const qty = Math.floor(allocatedCapital / price);
        if (qty <= 0) return { success: false, reason: 'PRICE_TOO_HIGH_FOR_SIZING' };

        // Execute Entry
        const cost = qty * price;
        this.state.currentBalance -= cost;
        this.state.positions[symbol] = {
            qty,
            entryPrice: price,
            sector,
            confidence,
            timestamp: Date.now()
        };

        this._save();
        return { success: true, allocated: cost };
    }

    /**
     * Replicates an exit and updates portfolio metrics.
     */
    simulateExit(symbol, exitPrice) {
        const pos = this.state.positions[symbol];
        if (!pos) return;

        const proceeds = pos.qty * exitPrice;
        const pnl = proceeds - (pos.qty * pos.entryPrice);
        
        this.state.currentBalance += proceeds;
        delete this.state.positions[symbol];

        this.state.metrics.totalTrades++;
        if (pnl > 0) {
            this.state.metrics.wins++;
            this.state.metrics.currentLossStreak = 0;
        } else {
            this.state.metrics.losses++;
            this.state.metrics.currentLossStreak++;
            if (this.state.metrics.currentLossStreak >= 3) {
                this.state.metrics.cascadingLosses++;
            }
        }

        // Drawdown tracking
        const equity = this.state.currentBalance + this._getOpenPositionValue();
        if (equity > this.state.equityPeak) {
            this.state.equityPeak = equity;
        } else {
            const dd = ((this.state.equityPeak - equity) / this.state.equityPeak) * 100;
            if (dd > this.state.maxDrawdownPct) this.state.maxDrawdownPct = dd;
        }

        this.state.history.push({
            symbol,
            pnl,
            equityAfter: equity,
            timestamp: Date.now()
        });

        this._save();
    }

    _getOpenPositionValue() {
        let val = 0;
        for (const pos of Object.values(this.state.positions)) {
            val += pos.qty * pos.entryPrice; // Approximation without live feed
        }
        return val;
    }
}

module.exports = new ShadowPortfolioEngine();
