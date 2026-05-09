# 🔱 PROMETHEUS — PHASE 19 MARKET OPEN CHECKLIST
> Pre-flight validation for tomorrow's live NSE session (09:15 IST)
> Run every section within the first 15 minutes of market open.

---

## A. Signal Quality

### Target: Real price movement produces differentiated signals.

```bash
# Watch EDGE_TRACE for spread 35–85
grep "EDGE_TRACE" server/server.log | awk -F'Edge:' '{print $2}' | awk '{print $1}' | sort -n | uniq -c

# Watch for BUY/STRONG_BUY decisions appearing
grep "Dec: BUY\|Dec: STRONG_BUY" server/server.log | tail -20

# Smart Money classification spread (not all NEUTRAL)
grep "SMART_MONEY_TRACE" server/server.log | awk '{print $NF}' | sort | uniq -c
```

| Metric | Expected @ Market Open |
|--------|------------------------|
| Breakout score range | 20–100 (was stuck at 0 after hours) |
| Momentum range | 40–75 (EMA-based, not 1-tick) |
| Edge score range | 35–85 |
| BUY frequency | ≥ 1 BUY per 5-symbol chunk |
| STRONG_BUY frequency | ≥ 1 per full 50-symbol cycle |
| SM ACCUMULATION rate | > 10% of symbols after 09:30 |
| SM NEUTRAL rate | < 60% of symbols |

### ✅ Pass Criteria
- [ ] `EDGE_TRACE` shows spread of at least 30 points between weakest/strongest
- [ ] `Dec: BUY` appears within first 3 complete cycles
- [ ] `SMART_MONEY_TRACE` shows at least one `ACCUMULATION` classification

---

## B. Execution Integrity

### Target: Zero silent rejections, every decision is traceable.

```bash
# Every symbol hitting ExecutionEngine
grep "LIVE_EXEC_TRACE" server/server.log | wc -l

# Every rejection with exact reason
grep "REJECT_TRACE" server/server.log | awk -F'| ' '{print $2}' | sort | uniq -c

# Successful entries
grep "ENTRY_CONFIRMED" server/server.log | tail -10

# Successful exits
grep "EXIT_CONFIRMED" server/server.log | tail -10

# Idempotent liquidation (should be empty or SKIP)
grep "LIQUIDATE_SKIP" server/server.log

# STATE_SYNC_BLOCKED (must be ZERO)
grep "STATE_SYNC_BLOCKED" server/server.log
```

| Check | Expected |
|-------|----------|
| LIVE_EXEC_TRACE count | ≥ symbols processed × cycles |
| REJECT_TRACE with reason | 100% (no silent drops) |
| STATE_SYNC_BLOCKED | **0 occurrences** |
| LIQUIDATE_SKIP | Only on duplicate calls (OK) |
| ENTRY_CONFIRMED | > 0 within first 30 min |

### ✅ Pass Criteria
- [ ] Zero `STATE_SYNC_BLOCKED` in logs
- [ ] Every symbol produces a `LIVE_EXEC_TRACE` or `REJECT_TRACE`
- [ ] No silent execution paths (no missing decisions)

---

## C. Portfolio Integrity

```bash
# Boot reconciliation (must appear on startup)
grep "RECONCILE" server/server.log | head -5

# Orphan detection
grep "Orphaned position" server/server.log

# Current live state
cat server/data/portfolio.json | python3 -m json.tool | grep -E '"symbol"|"qty"|"avgPrice"'
cat server/data/positions.json | python3 -m json.tool

# Consistency check (holdings must match positions)
node -e "
  const p = require('./server/data/portfolio.json');
  const pos = require('./server/data/positions.json');
  const pH = Object.keys(p.holdings || {});
  const pK = Object.keys(pos);
  console.log('Portfolio holdings:', pH);
  console.log('Positions:', pK);
  const orphans = pK.filter(k => !pH.includes(k));
  console.log('Orphans in positions.json:', orphans.length === 0 ? 'NONE ✅' : orphans);
"
```

| Check | Expected |
|-------|----------|
| RECONCILE at boot | ✅ ALWAYS |
| Orphaned positions post-reconcile | 0 |
| portfolio.json holdings = positions.json keys | 100% match |

### ✅ Pass Criteria
- [ ] `[RECONCILE] ✅ Positions.json is clean` on startup
- [ ] `portfolio.json` holdings exactly mirror `positions.json` keys
- [ ] No duplicate entries in either file

---

## D. Regime AI

```bash
# Regime transitions as market opens
grep "REGIME_TRACE" server/server.log | tail -20

# Breadth evolution (should rise from ~0.30 to ~0.50+ during bullish open)
grep "REGIME_BREADTH" server/server.log | tail -10

# Adaptation (buy threshold and scale must shift with regime)
grep "REGIME_ADAPT" server/server.log | tail -10

# Execution gate (must see Allowed:true for BUY signals)
grep "REGIME_EXECUTION.*Allowed:true" server/server.log | wc -l
```

| Metric | Expected |
|--------|----------|
| Regime at open | SIDEWAYS → (shifts based on breadth after 09:30) |
| Breadth at open | 0.30–0.45 (rising as signals accumulate) |
| Confidence | > 0.35 within 5 cycles |
| Regime transitions | At least 1 per 10 cycles in active market |

### ✅ Pass Criteria
- [ ] Regime shifts from SIDEWAYS within 10 cycles if market gaps up
- [ ] `REGIME_EXECUTION | Allowed:true` appears when BUY signals fire
- [ ] `buyThreshold` drops below 70 in bullish regime

---

## E. Infrastructure

```bash
# Cycle latency (critical — must stay < 10s)
grep "EXECUTION_LATENCY" server/server.log | tail -10

# Memory usage (must stay < 300MB)
grep "CYCLE_START" server/server.log | grep -oP 'Memory: \K[0-9.]+' | tail -20

# WebSocket health
grep "WS CONNECTED\|STALLED\|RECONNECT" server/server.log | tail -10

# API failures
grep "API_FAILURES\|STABILITY ERROR" server/server.log | wc -l
```

| Metric | Expected |
|--------|----------|
| Avg cycle duration | < 5000ms |
| Peak memory | < 250MB |
| API failure rate | < 3 per 30 min |
| WebSocket reconnects | 0 during first hour |

### ✅ Pass Criteria
- [ ] `EXECUTION_LATENCY | Cycle:<5000ms` for 90% of cycles
- [ ] Memory stays below 250MB for first 2 hours
- [ ] Zero WebSocket STALLED events

---

## F. Live Market Validation (Critical)

### Expected behavior when NSE opens at 09:15 IST:

1. **Breakout scores** will jump from `0.0` → `20–80` as prices move from prior close
2. **Smart Money** will leave NEUTRAL → ACCUMULATION for stocks gapping up with volume
3. **Edge scores** will spread from 35–85 instead of the compressed 24–35 seen after hours
4. **BUY decisions** will appear as stocks with strong EMA + RSI + ATR breakout alignment
5. **Regime breadth** will update every cycle based on signal score average

### Immediate post-open validation commands:
```bash
# Run live tail within 5 minutes of market open
tail -f server/server.log | grep -E "EDGE_TRACE|REGIME_TRACE|ENTRY_CONFIRMED|REJECT_TRACE|EXECUTION_LATENCY"
```

---

## Emergency Rollback

```bash
# If critical issues detected:
git stash
git checkout phase19-hardened  # or specific commit hash

# Reset state files to clean
echo '{"balance":1000000,"lockedBalance":0,"holdings":{},"orders":[],"pendingOrders":[],"realizedPnL":0}' > server/data/portfolio.json
echo '{}' > server/data/positions.json
```
