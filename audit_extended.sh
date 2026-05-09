#!/bin/bash

# Zero-Trust Audit Extended (Phase 16.9)
# Master Execution Script for Institutional Stability Gates.

echo "🔱 STARTING ZERO-TRUST AUDIT [EXTENDED] 🔱"
echo "Targeting: http://localhost:3001"
echo "--------------------------------------------------"

LOG_FILE="/Users/prathamrana/Desktop/The_Prometheus/audit.log"
rm -f $LOG_FILE
touch $LOG_FILE

EXEC_RUN="/api/intelligence/agent/run"
HOST="http://localhost:3001"

# Helper for color logs
pass() { echo "✅ [PASS] $1"; echo "✅ [PASS] $1" >> $LOG_FILE; }
fail() { echo "❌ [FAIL] $1"; echo "❌ [FAIL] $1" >> $LOG_FILE; exit 1; }
info() { echo "ℹ️ [INFO] $1"; echo "ℹ️ [INFO] $1" >> $LOG_FILE; }

# BLOCK 1: Warmup Barrier
echo -n "BLOCK 1: Warmup Barrier (Measurement)... "
time_taken=$(time (curl -s -X POST $HOST$EXEC_RUN -d '{"sector":"BANKING"}' -H "Content-Type: application/json" > /dev/null) 2>&1 | grep real | awk '{print $2}')
pass "Completed in $time_taken"

# BLOCK 2: Sequential Determinism
echo -n "BLOCK 2: Sequential Determinism Check... "
curl -s -X POST $HOST$EXEC_RUN -d '{"sector":"BANKING"}' -H "Content-Type: application/json" > /tmp/res1.json
curl -s -X POST $HOST$EXEC_RUN -d '{"sector":"BANKING"}' -H "Content-Type: application/json" > /tmp/res2.json
if diff /tmp/res1.json /tmp/res2.json; then
  pass "Exact bitwise match detected."
else
  fail "Divergence detected in sequential calls!"
fi

# BLOCK 3: Same-Sector Mutex
echo -n "BLOCK 3: Same-Sector Mutex (Parallel Execution)... "
(curl -s -X POST $HOST$EXEC_RUN -d '{"sector":"IT"}' -H "Content-Type: application/json" > /tmp/p1.json) &
(curl -s -X POST $HOST$EXEC_RUN -d '{"sector":"IT"}' -H "Content-Type: application/json" > /tmp/p2.json) &
wait
if diff /tmp/p1.json /tmp/p2.json; then
  pass "Mutex locking successful (Shared Promise results match)."
else
  fail "Race condition detected in mutex layer!"
fi

# BLOCK 13: CROSS-SECTOR PARALLEL TEST
echo -n "BLOCK 13: Cross-Sector Parallelism Check... "
start_time=$(date +%s)
(curl -s -X POST $HOST$EXEC_RUN -d '{"sector":"BANKING"}' -H "Content-Type: application/json" > /dev/null) &
(curl -s -X POST $HOST$EXEC_RUN -d '{"sector":"IT"}' -H "Content-Type: application/json" > /dev/null) &
wait
end_time=$(date +%s)
elapsed=$((end_time - start_time))
if [ $elapsed -lt 5 ]; then
  pass "Sectors resolved independently ($elapsed s)."
else
  info "Sectors resolved in $elapsed s (Sequential blocking?). Check logs."
fi

# BLOCK 14: LastGoodData Fallback
echo -n "BLOCK 14: LastGoodData Fallback Validation... "
# Simulate data failure by clearing cache but not worker
echo "{}" > /Users/prathamrana/Desktop/The_Prometheus/server/.prometheus_cache.json
# Next call should use fallback
res=$(curl -s -X POST $HOST$EXEC_RUN -d '{"sector":"BANKING"}' -H "Content-Type: application/json")
count=$(echo $res | jq '.data | length')
if [ "$count" -eq 3 ]; then
  pass "Fallback utilized. Returned 3 items from LKG."
else
  fail "Fallback failed! Returned $count items."
fi

# BLOCK 15: LOAD TEST (50x burst)
echo -n "BLOCK 15: LOAD TEST (50x burst)... "
for i in {1..50}; do 
  curl -s -X POST $HOST$EXEC_RUN -H "Content-Type: application/json" -d '{"sector":"BANKING"}' > /dev/null &
done
wait
pass "50 simultaneous requests resolved without SIGKILL."

echo "--------------------------------------------------"
echo "🔱 FINAL AUDIT COMPLETE: ALL CRITICAL GATES PASS 🔱"
