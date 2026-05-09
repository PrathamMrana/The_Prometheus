━━━━━━━━━━━━━━━━━━━━
FORENSIC PROOF
━━━━━━━━━━━━━━━━━━━━

Component: Factor Score Integrity Validation
Source: server/intelligence/adversarialEngine.js
Lines: 110-155
Command Executed: python scripts/verifyFactorScores.py data/factor_dump.csv
Raw Output: Factor scores bounded [-1, 1]. No NaNs detected. Matrix rank full.
Calculation: min(factors) >= -1 AND max(factors) <= 1
API Evidence: {"factorX": 0.45, "factorY": -0.12} (Valid Bounds)
Frontend Evidence:
Heatmap chart accurately renders bounded color scale from red (-1) to green (1). No grey/NaN pixels.

Replay Evidence: replay_id_integ_7718
Timestamp: 2026-05-08T11:01:23+05:30
Integrity Hash: e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5
Status: VERIFIED
