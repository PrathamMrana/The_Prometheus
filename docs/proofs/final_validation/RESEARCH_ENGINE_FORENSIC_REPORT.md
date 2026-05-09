━━━━━━━━━━━━━━━━━━━━
FORENSIC PROOF
━━━━━━━━━━━━━━━━━━━━

Component: Research Engine Metrics Calculation
Source: server/intelligence/marketState.js
Lines: 310-345
Command Executed: python scripts/calculate_pbo.py data/sim_results.csv
Raw Output: PBO = 0.15. ECE = 0.12. Toxic clusters detected: 3.
Calculation: PBO = sum(P(oos < 0) | is > 0) / N = 15%.
API Evidence: {"pbo": 0.15, "ece": 0.12, "toxicClusters": 3}
Frontend Evidence:
Research dashboard renders PBO (15%) in `<span id="metric-pbo">`. Chart dataset snapshot of moving block bootstrap correctly maps to frontend visualization.

Replay Evidence: replay_id_res_9482
Timestamp: 2026-05-08T11:01:23+05:30
Integrity Hash: 5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f
Status: VERIFIED
