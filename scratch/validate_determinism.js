const MarketRegimeAI = require('../server/engines/marketRegimeAI');
const RiskEngine = require('../server/risk/RiskEngine');
const SmartMoneyEngine = require('../server/engines/smartMoneyEngine');

const mockMarketState = {
    vix: 18.5,
    breadthRatio: 0.65,
    sectorCount: 4,
    macroEmaDivergence: 0.05,
    trendStrength: 0.6
};

const mockSymbolState = {
    symbol: 'RELIANCE.NS',
    price: 2500,
    sector: 'ENERGY',
    vr: 1.2,
    feedAge: 100,
    stale: false
};

const signal = { decision: 'BUY', score: 85, confidence: 0.85, atr: 15 };
const portfolio = { balance: 1000000, holdings: {} };

let r1 = MarketRegimeAI.evaluate(mockMarketState);
let r2 = MarketRegimeAI.evaluate(mockMarketState);
console.log('Regime Determinism:', r1.regime === r2.regime, r1.entropy === r2.entropy);

let sm1 = SmartMoneyEngine.analyzeVolume('RELIANCE', { volume: 1000, vwap: 2500 }, 1.2, 'BUY');
let sm2 = SmartMoneyEngine.analyzeVolume('RELIANCE', { volume: 1000, vwap: 2500 }, 1.2, 'BUY');
console.log('SmartMoney Determinism:', sm1.score === sm2.score);

let re1 = RiskEngine.evaluate({ signal, portfolio, marketState: { regimeAI: r1, vix: mockMarketState.vix }, feedStateStr: 'LIVE', symbolState: mockSymbolState });
let re2 = RiskEngine.evaluate({ signal, portfolio, marketState: { regimeAI: r1, vix: mockMarketState.vix }, feedStateStr: 'LIVE', symbolState: mockSymbolState });
console.log('RiskEngine Determinism:', re1.approved === re2.approved && re1.adjustedQty === re2.adjustedQty);
