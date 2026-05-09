/**
 * 🧪 Prometheus ML Logic Verification
 * Verifies Phase 16: Hysteresis, ML Dominance, and Factor Kill Switch.
 */

function testDecisionLogic(prob, factorConviction, previousSignal = "HOLD") {
    const mlWeight = 0.6;
    const factorWeight = 0.4;

    // 1. Blended Confidence
    let calculatedConfidence = (prob * mlWeight) + (factorConviction * factorWeight);

    // 2. ML Dominance Boost (Lowered to 0.75)
    let dominanceApplied = false;
    if (prob > 0.75 && factorConviction > 0.4) {
        calculatedConfidence += 0.10;
        dominanceApplied = true;
    }

    calculatedConfidence = Math.max(0, Math.min(1, calculatedConfidence));

    // 3. Decision Logic (Tuned)
    let signal = "HOLD";
    if (factorConviction < 0.15) {
        signal = "HOLD"; // Kill Switch
    } else {
        const BUY_ENTRY = 0.65;
        const BUY_HOLD = 0.60;
        const SELL_ENTRY = 0.35;
        const SELL_HOLD = 0.40;

        if (previousSignal === "BUY") {
            if (calculatedConfidence >= BUY_HOLD) signal = "BUY";
            else if (calculatedConfidence <= SELL_ENTRY) signal = "SELL";
            else signal = "HOLD";
        } else if (previousSignal === "SELL") {
            if (calculatedConfidence <= SELL_HOLD) signal = "SELL";
            else if (calculatedConfidence >= BUY_ENTRY) signal = "BUY";
            else signal = "HOLD";
        } else {
            if (calculatedConfidence >= BUY_ENTRY) signal = "BUY";
            else if (calculatedConfidence <= SELL_ENTRY) signal = "SELL";
            else signal = "HOLD";
        }
    }

    return { signal, confidence: calculatedConfidence, dominanceApplied };
}

const scenarios = [
    { name: "New BUY Entry (Confidence >= 0.65)", prob: 0.7, factor: 0.6, prev: "HOLD", expected: "BUY" }, // (0.42 + 0.24) = 0.66
    { name: "SELL Entry (Confidence <= 0.35)", prob: 0.3, factor: 0.3, prev: "HOLD", expected: "SELL" }, // (0.18 + 0.12) = 0.30
    { name: "Hysteresis BUY Hold (0.61)", prob: 0.65, factor: 0.55, prev: "BUY", expected: "BUY" }, // (0.39 + 0.22) = 0.61 >= 0.60
    { name: "ML Dominance (0.76 Prob)", prob: 0.76, factor: 0.45, prev: "HOLD", expected: "BUY" }, // (0.456 + 0.18) + 0.1 = 0.736
    { name: "Kill Switch (Factor < 0.15)", prob: 0.95, factor: 0.1, prev: "HOLD", expected: "HOLD" }
];

console.log("🚀 Running Prometheus Phase 16 Logic Tests...\n");
let passed = 0;

scenarios.forEach(s => {
    const res = testDecisionLogic(s.prob, s.factor, s.prev);
    const success = res.signal === s.expected;
    if (success) passed++;
    
    console.log(`${success ? '✅' : '❌'} ${s.name}`);
    console.log(`   Inputs: ML=${s.prob}, Factor=${s.factor}, Prev=${s.prev}`);
    console.log(`   Output: Signal=${res.signal}, Confidence=${res.confidence.toFixed(2)}, Dominance=${res.dominanceApplied}`);
    console.log(`   Expected: ${s.expected}\n`);
});

console.log(`\n📊 Final Result: ${passed}/${scenarios.length} tests passed.`);
if (passed === scenarios.length) {
    console.log("🔥 LOGIC VERIFIED SUCCESSFULLY!");
} else {
    console.log("⚠️ SOME TESTS FAILED!");
    process.exit(1);
}
