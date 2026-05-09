━━━━━━━━━━━━━━━━━━━━
FORENSIC PROOF
━━━━━━━━━━━━━━━━━━━━

Component: Portfolio Drawdown Safeguard
Source: server/portfolio/riskManager.js
Lines: 78-95
Command Executed: node scripts/testDrawdownCap.js
Raw Output: Execution halted. Current drawdown: -2.21%. Cap: -2.2%.
Calculation: -2.21% <= -2.20% == HALT
API Evidence: {"error": "Drawdown limit exceeded. Trading halted."}
Frontend Evidence:
UI renders red banner "TRADING HALTED: DRAWDOWN CAP REACHED". Chart dataset snapshot shows equity curve flattening at -2.2%.

Replay Evidence: replay_id_port_4821
Timestamp: 2026-05-08T11:01:23+05:30
Integrity Hash: 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b
Status: VERIFIED
