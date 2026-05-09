const risk = require('../server/engine/riskManager');
const signal = require('../server/engine/signalEngine');

function test(name, fn) {
  try {
    const res = fn();
    console.log(`\n${name}`);
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error(`❌ ${name}`, e.message);
  }
}

// Mock position
const pos = {
  entryPrice: 100,
  sl: 90,   // R = 10
  tp: 120
};

// Helper indicators
const good = { rsi: 30, ema20: 110, ema50: 100, momentum: 1, atr: 10 };
const bad  = { rsi: 60, ema20: 90,  ema50: 100, momentum: -1, atr: 10 };

// =========================
// TEST 1 — STOP LOSS
// =========================
test("TEST 1 — STOP LOSS", () => {
  return risk.checkExit("TCS", pos, 80, good);
});

// =========================
// TEST 2 — TRAILING (1.6R → drop)
// =========================
test("TEST 2 — TRAILING STOP L1", () => {
  const R = pos.entryPrice - pos.sl;
  risk._peakPrice["TCS"] = pos.entryPrice + (1.6 * R); // Peak = 116
  // trail = peak - R = 116 - 10 = 106. Price 105 is below trail.
  return risk.checkExit("TCS", pos, 105, good);
});

// =========================
// TEST 3 — PROFIT LOCK (2R → drop)
// =========================
test("TEST 3 — PROFIT LOCK 1R", () => {
  const R = pos.entryPrice - pos.sl;
  risk._peakPrice["TCS"] = pos.entryPrice + (2.1 * R); // Peak = 121
  // lock = entry + R = 100 + 10 = 110. Price 108 is below lock.
  return risk.checkExit("TCS", pos, 108, good);
});

// =========================
// TEST 3.5 — PROFIT LOCK 2R
// =========================
test("TEST 3.5 — PROFIT LOCK 2R", () => {
  const R = pos.entryPrice - pos.sl;
  risk._peakPrice["TCS"] = pos.entryPrice + (3.1 * R); // Peak = 131
  // lock = entry + 2R = 100 + 20 = 120. Price 119 is below lock.
  return risk.checkExit("TCS", pos, 119, good);
});

// =========================
// TEST 4 — ALPHA REVERSAL
// =========================
test("TEST 4 — ALPHA REVERSAL", () => {
  return risk.checkExit("TCS", pos, 105, bad);
});

// =========================
// TEST 5 — NO EXIT
// =========================
test("TEST 5 — NO EXIT", () => {
  return risk.checkExit("TCS", pos, 105, { ...good, rsi: 30 });
});
