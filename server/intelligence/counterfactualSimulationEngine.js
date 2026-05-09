/**
 * 🔱 PROMETHEUS — COUNTERFACTUAL SIMULATION ENGINE
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Measures edge survivability under execution hostility.
 * Simulates worse slippage, delayed fills, and spread widening on closed trades.
 */

'use strict';

class CounterfactualSimulationEngine {
    
    compute(trades) {
        if (!trades || trades.length === 0) return this._emptyState();

        const baseExpectancy = trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length;
        
        // Hostility Scenarios
        const sim2xSlippage = this._simulateSlippage(trades, 2.0);
        const sim3xSlippage = this._simulateSlippage(trades, 3.0);
        const sim500msDelay = this._simulateDelay(trades, 500); // Rough proxy: assume every 100ms = 0.05% slippage

        const scenarios = {
            baseline: baseExpectancy,
            slippage2x: sim2xSlippage,
            slippage3x: sim3xSlippage,
            delay500ms: sim500msDelay
        };

        // Determine fragility
        let survivability = 'ROBUST';
        if (sim3xSlippage < 0) survivability = 'FRAGILE_TO_SLIPPAGE';
        if (sim2xSlippage < 0) survivability = 'EXTREMELY_FRAGILE';

        return {
            scenarios,
            survivability,
            stressTestPassed: sim2xSlippage > 0
        };
    }

    _simulateSlippage(trades, multiplier) {
        let simulatedPnL = 0;
        trades.forEach(t => {
            const slippageAmount = (t.tradeTags?.slippage || 0.1); // default 0.1 if unknown
            const additionalSlippage = slippageAmount * (multiplier - 1);
            // Deduct additional slippage from PnL
            simulatedPnL += (t.pnl - additionalSlippage);
        });
        return simulatedPnL / trades.length;
    }

    _simulateDelay(trades, delayMs) {
        // Approximate delay penalty: 100ms = 0.5 units of PnL drag (hypothetical)
        const delayPenalty = (delayMs / 100) * 0.5;
        let simulatedPnL = 0;
        trades.forEach(t => {
            simulatedPnL += (t.pnl - delayPenalty);
        });
        return simulatedPnL / trades.length;
    }

    _emptyState() {
        return {
            scenarios: {},
            survivability: 'UNKNOWN',
            stressTestPassed: false
        };
    }
}

module.exports = new CounterfactualSimulationEngine();
