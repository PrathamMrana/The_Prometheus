const fs = require('fs');
const path = require('path');
const v8 = require('v8');
const os = require('os');

const LOG_FILE = path.join(__dirname, '../proofs/soak/soak_24h_report.jsonl');
const proofsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });

console.log("--- PROMETHEUS v7.0: PRODUCTION SOAK TEST (INITIATED) ---");

function logMetrics() {
    const mem = process.memoryUsage();
    const heap = v8.getHeapStatistics();
    const dbPath = path.join(__dirname, '../server/data/prometheus.db');
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    
    const entry = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        cpu: os.loadavg()[0],
        memory: {
            rss: (mem.rss / 1024 / 1024).toFixed(2) + " MB",
            heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + " MB"
        },
        database: {
            size: (dbSize / 1024).toFixed(2) + " KB"
        }
    };

    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
    console.log(`[SOAK] ${entry.timestamp} | RSS: ${entry.memory.rss} | DB: ${entry.database.size} | CPU: ${entry.cpu.toFixed(2)}`);
}

// Log every 30 seconds for production soak
setInterval(logMetrics, 30000);
logMetrics();

// Keep process alive
process.stdin.resume();
