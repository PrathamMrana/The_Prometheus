
const { StrategyManager } = require('../server/intelligence/strategyManager');
const { loadState: loadStrategyState } = require('../server/intelligence/strategyTracker');
const fs = require('fs');
const path = require('path');

async function test() {
    console.log('--- Phase 3.5 Validation ---');
    
    // Mock prices
    const prices = Array.from({length: 30}, (_, i) => ({
        close: 100 + i,
        high: 105 + i,
        low: 95 + i,
        volume: 1000
    }));

    const globalState = {
        SECTOR_MAP: { 'HDFCBANK': 'BANKING', 'INFY': 'IT' },
        sectorFlow: { 'BANKING': 1.5, 'IT': -1.2 }
    };

    const strategyState = loadStrategyState();
    console.log('Current Strategy State:', JSON.stringify({
        recentTrend: strategyState.recentTrend,
        sectorBlacklist: strategyState.sectorBlacklist,
        badPatterns: strategyState.badPatterns,
        winningPatterns: strategyState.winningPatterns
    }, null, 2));

    // Test a blacklisted symbol
    console.log('\n--- Test 1: Blacklisted Sector (UNKNOWN) ---');
    const symbol1 = 'UNKNOWN_SYM';
    const ml1 = { success: true, confidence: 0.9, factors: { volatility: 0.1 } };
    const sig1 = StrategyManager.getPhase17Signal(symbol1, prices, globalState, ml1);
    console.log('Symbol:', symbol1, '| Decision:', sig1.decision, '| Final Score:', sig1.score);
    console.log('Adjustment:', JSON.stringify(sig1.learningAdjustment, null, 2));

    // Test False Conviction (High score, Low confidence)
    console.log('\n--- Test 2: False Conviction Pattern ---');
    const symbol2 = 'HDFCBANK.NS';
    // Mock prices that give a high raw score
    const ml2 = { success: true, confidence: 0.5, factors: { volatility: 0.1 } };
    const sig2 = StrategyManager.getPhase17Signal(symbol2, prices, globalState, ml2);
    console.log('Symbol:', symbol2, '| Decision:', sig2.decision, '| Final Score:', sig2.score);
    console.log('Adjustment:', JSON.stringify(sig2.learningAdjustment, null, 2));
    
    if (signal.learningAdjustment.active) {
        console.log('✅ ADAPTIVE SCORING ACTIVE');
    } else {
        console.log('❌ ADAPTIVE SCORING NOT TRIGGERED (Check if patterns/blacklist match)');
    }
}

test().catch(console.error);
