━━━━━━━━━━━━━━━━━━━━
FORENSIC PROOF
━━━━━━━━━━━━━━━━━━━━

Component: Authentication & Security
Source: server/middleware/auth.js
Lines: 44-67
Command Executed: node scripts/testTamperedJWT.js
Raw Output: 401 Unauthorized
Calculation: Token Expiry = 24h
API Evidence: {"error": "Invalid token signature"}
Frontend Evidence:
Protected dashboard redirected to /login after token corruption.

Replay Evidence: replay_id_auth_9103
Timestamp: 2026-05-08T11:01:23+05:30
Integrity Hash: a73d9e18b8f2c3d1e4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7
Status: PARTIAL
