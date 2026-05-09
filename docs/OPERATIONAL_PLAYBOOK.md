# PROMETHEUS v7.0 OPERATIONAL PLAYBOOK
**Subject:** Production Deployment & Incident Response
**Status:** **PILOT_READY**

---

## 1. DEPLOYMENT PROCEDURES

### **Standard Launch (Docker)**
```bash
# 1. Build and start containers
docker-compose up -d --build

# 2. Verify health
curl http://localhost:3001/health

# 3. Check logs
docker-compose logs -f backend
```

### **Manual Launch (Node.js)**
```bash
cd server
npm install
node index.js
```

---

## 2. ROLLBACK PROCEDURES

### **Emergency Rollback**
1. **Stop Services:** `docker-compose down`
2. **Revert Git:** `git revert HEAD --no-edit && git push`
3. **Redeploy:** `docker-compose up -d --build`

### **Data Rollback (SQLite)**
1. **Locate Backup:** `server/data/prometheus.db.bak`
2. **Restore:** `cp server/data/prometheus.db.bak server/data/prometheus.db`
3. **Restart Engine.**

---

## 3. INCIDENT RECOVERY PROCEDURES

### **A. Database Corruption**
- **Symptoms:** `SQLITE_CORRUPT` errors or failed starts.
- **Action:** 
  1. Stop engine.
  2. Run `sqlite3 prometheus.db ".recover" | sqlite3 prometheus_recovered.db`.
  3. Swap DB files.
  4. Perform **Replay Recovery** (see Section 4).

### **B. Broker Disconnect**
- **Symptoms:** "BROKER_CONN_ERROR" in logs.
- **Action:** 
  1. `BrokerManager` automatically attempts reconnection every 30s.
  2. If persistent, verify `ALPACA_KEY` and network egress.

---

## 4. REPLAY RECOVERY PROCEDURES

### **Full State Reconstruction**
If the `portfolio` table is lost but `orders` remains:
1. Initialize fresh DB schema.
2. Run `scripts/reconstruct_state_from_orders.js`.
3. This will replay every `FILLED` order to rebuild the `holdings` and `balance` tables.

---

## 5. REPLAY INTEGRITY CHECK
```bash
node scripts/verify_replay_integrity.js
```
Expected output: `REPLAY_HASH: [SHA256]` matches previous audit hash.

---

**CONFIDENTIAL: FOR INSTITUTIONAL PILOT TEAMS ONLY**
