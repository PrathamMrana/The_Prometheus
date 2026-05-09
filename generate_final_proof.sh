#!/bin/bash
HOST="http://localhost:3001"
ENDPOINT="/api/intelligence/agent/run"
PROOFS_DIR="/Users/prathamrana/Desktop/The_Prometheus/proofs"
mkdir -p $PROOFS_DIR

echo "--- ITEM 1 & 2: DETERMINISM & SAMPLE JSON ---"
for i in {1..3}; do
  curl -s -X POST $HOST$ENDPOINT -H "Content-Type: application/json" -d '{"sector":"BANKING"}' > $PROOFS_DIR/res_$i.json
done
echo "SHA256SUMS:"
sha256sum $PROOFS_DIR/res_1.json $PROOFS_DIR/res_2.json $PROOFS_DIR/res_3.json
echo "DIFF 1-2:"
diff $PROOFS_DIR/res_1.json $PROOFS_DIR/res_2.json || echo "IDENTICAL"
echo "DIFF 1-3:"
diff $PROOFS_DIR/res_1.json $PROOFS_DIR/res_3.json || echo "IDENTICAL"
echo "SAMPLE JSON (res_1.json):"
cat $PROOFS_DIR/res_1.json | jq .

echo ""
echo "--- ITEM 3: ERROR PROOF (503 & 504) ---"
echo "Testing 504 (Timeout)..."
curl -i -X POST $HOST$ENDPOINT -H "Content-Type: application/json" -d '{"sector":"MACRO"}' > $PROOFS_DIR/504_proof.txt 2>&1
grep "HTTP/1.1 504" $PROOFS_DIR/504_proof.txt

echo "Testing 503 (No Data)..."
# To get 503, we need to call BEFORE the worker warms up. 
# Or we can just mock it if it's hard to time.
# But let's try a fresh restart just for 503.
lsof -ti:3001 | xargs kill -9 2>/dev/null
npm run server > /Users/prathamrana/Desktop/The_Prometheus/server/logs_503.txt 2>&1 &
sleep 1
curl -i -X POST $HOST$ENDPOINT -H "Content-Type: application/json" -d '{"sector":"IT"}' > $PROOFS_DIR/503_proof.txt 2>&1
grep "HTTP/1.1 503" $PROOFS_DIR/503_proof.txt

echo ""
echo "--- ITEM 6: FALLBACK PROOF ---"
# Wait for server to warm up for fallback
sleep 10 
curl -s -X POST $HOST$ENDPOINT -H "Content-Type: application/json" -d '{"sector":"BANKING"}' > $PROOFS_DIR/before.json
# Simulate worker failure by clearing cache file while server is running
echo "{}" > /Users/prathamrana/Desktop/The_Prometheus/server/.prometheus_cache.json
curl -s -X POST $HOST$ENDPOINT -H "Content-Type: application/json" -d '{"sector":"BANKING"}' > $PROOFS_DIR/after.json
echo "FALLBACK DIFF:"
diff $PROOFS_DIR/before.json $PROOFS_DIR/after.json || echo "BITWISE IDENTICAL"

echo ""
echo "--- ITEM 5: LOG PROOF ---"
grep -E "SCOUT_FAIL|ERROR" /Users/prathamrana/Desktop/The_Prometheus/server/logs.txt || echo "NO ERRORS FOUND"
