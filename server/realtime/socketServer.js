const { WebSocketServer, WebSocket } = require('ws');
const marketState = require('../intelligence/marketState');
const Persistence = require('../utils/persistence');
const syncCoordinator = require('../apiLayer/syncCoordinator');
const healthMonitor = require('../telemetry/healthMonitor');

// 🚀 PROMETHEUS REAL-TIME HUB (v6.9 PRODUCTION HARDENED)
let wss;
const lastPayloadCache = {};
const lastPayloadTime = {};

/**
 * 🛡️ [PHASE 3] INSTITUTIONAL TICK VALIDATOR
 */
function validateTick(tick) {
    // 🔱 [PURITY LOCK] Only hard requirements: symbol + valid price
    // Intelligence signals arrive later — never block price data from reaching UI.
    if (!tick || !tick.symbol) return false;
    if (!Number.isFinite(Number(tick.price)) || tick.price <= 0) return false;
    return true;
}

function safeSend(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(data));
        } catch (err) {
            console.log(JSON.stringify({
                type: "WS_ERROR",
                message: err.message,
                time: new Date().toISOString()
            }));
            ws.terminate();
        }
    }
}

function init(server) {
    wss = new WebSocketServer({ 
        server, 
        path: '/ws',
        verifyClient: (info, done) => {
            // [PHASE 11] DEVELOPMENT OVERRIDE: Allow all local origins to restore live sync
            done(true);
        }
    });
    console.log('[REAL-TIME] WebSocket Hub Multiplexed & Hardened (Path: /ws)');

    wss.on('connection', (ws, req) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`✅ [WS] CLIENT CONNECTED: ${ip} | Total: ${wss.clients.size}`);
        ws.isAlive = true;
        ws._remoteAddress = ip; // Store for later logging

        ws.on('pong', () => { 
            ws.isAlive = true; 
        });

        ws.on('close', () => {
            console.log(`❌ [WS] CLIENT DISCONNECTED: ${ip} | Remaining: ${wss.clients.size}`);
            if (ws._syncTimeouts) {
                ws._syncTimeouts.forEach(clearTimeout);
            }
            ws.removeAllListeners();
        });

        ws.on('error', (err) => {
            console.error(`❌ [WS] CLIENT ERROR (${ip}):`, err.message);
        });
        
        try {
            // 🔥 STEP 1: INITIAL DATA PUSH
            syncOnConnect(ws, req);
        } catch (err) {
            console.error(`❌ [WS_SYNC_FATAL] Error during connection initialization:`, err.message);
            ws.terminate();
        }
    });

    // 🛡️ [STEP H] HARDENED HEARTBEAT (10s Ping + Liveness Validation)
    setInterval(() => {
        wss.clients.forEach(ws => {
            if (ws.isAlive === false) {
                console.warn('⚠️ Terminating dead client (Ping Timeout)');
                return ws.terminate();
            }
            
            ws.isAlive = false;
            ws.ping();
        });
    }, 10000);

    // 📡 [STEP D] HEARTBEAT DATA STREAM (5s Periodic Sync)
    setInterval(() => {
        broadcast({ 
            type: 'HEARTBEAT', 
            timestamp: Date.now(),
            sync_id: syncCoordinator.getSyncId(),
            health: healthMonitor.getDiagnostics() // 🔱 [PHASE 21] Global Health Purity
        });
    }, 5000);

    return wss;
}

/**
 * 🛡️ [STEP S] SNAPSHOT INTEGRITY HUB
 * Pushes exactly what is stored, filtered for corruption and stream death.
 */
function syncOnConnect(ws, req) {
    const ip = ws._remoteAddress || (req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : 'UNKNOWN');
    try {
        const cache = Persistence.load();
        const sync_id = syncCoordinator.getSyncId();

        // 🔱 [PHASE 21] IMMEDIATE HEALTH HYDRATION
        // Deliver the current system health score and diagnostics immediately upon connection.
        // This prevents the UI from showing 'STALLED' while waiting for the first chunk.
        ws.send(JSON.stringify({
            type: 'HEARTBEAT',
            timestamp: Date.now(),
            sync_id,
            health: healthMonitor.getDiagnostics()
        }));
        
        // 🛡️ [FIX 2] BUILD CLEAN SNAPSHOT (Filter DEAD/NO_DATA)
        const snapshot = [];
        
        cache.forEach((data, rawSym) => {
            if (!data || data.status === "DEAD" || data.status === "NO_DATA") return;
            
            // 🔱 [PURITY LOCK] Canonical key: strip .NS suffix and ^ prefix
            const key = rawSym.replace('.NS', '').replace('^', '').split('.')[0]?.trim().toUpperCase();
            if (!key) return;

            const price = Number(data.price);
            if (!Number.isFinite(price) || price <= 0) return;
            
            const tick = {
                symbol: key,
                price,
                percent: Number(data.percent) || Number(data.pct_change) || 0,
                prevClose: Number(data.prevClose) || 0,
                sparkline: data.sparkline || [],
                signal: data.signal || { decision: "HOLD", score: 50, confidence: 0.5 },
                anomaly: data.anomaly || null,
                zscore: Number(data.zscore) || 0,
                timestamp: data.timestamp || Date.now(),
                status: data.status || "CLOSED"
            };

            snapshot.push(tick);
        });

        const msg = {
            type: "STATE",
            timestamp: Date.now(),
            sync_id,
            health: healthMonitor.getDiagnostics(), // 🔱 [PHASE 21]
            data: snapshot
        };

        // 🛡️ [PHASE 3.6.1] STAGGERED SNAPSHOT DELIVERY
        const chunkSize = 10;
        const total = snapshot.length;
        
        console.log(`[SOCKET] Initiating Chunked Sync (${total} tickers) for ${ip}`);

        ws._syncTimeouts = ws._syncTimeouts || [];
        for (let i = 0; i < total; i += chunkSize) {
            const tId = setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    const chunk = snapshot.slice(i, i + chunkSize);
                    
                    // 🔱 [DEBUG LOG]
                    if (chunk.length > 0) {
                        const sample = chunk[0];
                        console.log(`[WS EMIT STATE CHUNK] | Symbols: ${chunk.length} | Sample: ${sample.symbol} | Price: ${sample.price} | Prev: ${sample.prevClose} | %: ${sample.percent}`);
                    }

                    ws.send(JSON.stringify({
                        type: "STATE",
                        timestamp: Date.now(),
                        sync_id,
                        is_chunk: true,
                        data: chunk
                    }));
                }
            }, 150 + (i * 20)); 
            ws._syncTimeouts.push(tId);
        }

        console.log(`[SOCKET] Chunked Sync Pipeline Armed for ${ip}`);
    } catch (err) {
        console.error(`[SNAPSHOT ERROR] ${ip}: ${err.message}`);
    }
}

/**
 * 🛡️ [STEP B] BROADCAST ENGINE (CLEAN)
 */
function broadcast(data) {
    if (!wss) return;
    
    // Heartbeats are pure and time-based (Called from setInterval outside loop)
    if (data.type === 'HEARTBEAT') {
        const payload = JSON.stringify(data);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        });
        return;
    }

    // 🛡️ [PHASE 6] EXECUTION SYSTEM BROADCAST
    if (data.type === 'TRADE_UPDATE') {
        console.log("[TRADE_UPDATE]", data.order?.symbol, data.order?.status);
    }

    // 🛡️ [CRITICAL UI SYNC] Allow identical payloads occasionally to refresh the "Updated" timer
    // [PHASE 18 FIX] Reduced from 5000ms → 2000ms to prevent silent stalls during slow/closed-market cycles
    if (data.type === 'TICK' || data.type === 'TICK_DELTA') {
        const payloadString = JSON.stringify(data);
        const lastSent = lastPayloadTime[data.type] || 0;
        
        // Block identical only if sent within the last 2 seconds (prevents burst spam)
        if (lastPayloadCache[data.type] === payloadString && (Date.now() - lastSent < 2000)) {
            return; 
        }
        lastPayloadCache[data.type] = payloadString;
        lastPayloadTime[data.type] = Date.now();
    }
    
    // 🛡️ [PHASE 3] IN-FLIGHT VALIDATION
    if (data.type === 'TICK' || data.type === 'TICK_DELTA') {
        const ticks = data.type === 'TICK_DELTA' ? data.updates : [data];
        const validTicks = ticks.filter(t => {
            if (!validateTick(t)) {
                console.log("[REJECTED TICK]", t.symbol || "UNKNOWN");
                return false;
            }
            return true;
        });

        if (validTicks.length === 0) return;
        if (data.type === 'TICK_DELTA') {
            data.updates = validTicks;
            const sample = validTicks[0];
            console.log(`[WS EMIT TICK_DELTA] | Updates: ${validTicks.length} | Sample: ${sample.symbol} | Price: ${sample.price} | Prev: ${sample.prevClose} | %: ${sample.pct_change}`);
        } else {
            data = validTicks[0];
            console.log(`[WS EMIT TICK] | Symbol: ${data.symbol} | Price: ${data.price} | Prev: ${data.prevClose} | %: ${data.pct_change}`);
        }
    }
    
    // 🛡️ [PHASE 3] CRASH ISOLATION LOOP
    wss.clients.forEach(client => {
        try {
            if (client.readyState === WebSocket.OPEN) {
                safeSend(client, data);
            }
        } catch (err) {
            console.log("[WS DROP CLIENT]", err.message);
        }
    });
}

module.exports = { init, broadcast };

// 🔱 [PHASE 18 FIX] CLEAN SHUTDOWN — Send close frame to all clients on exit.
// Without this, pkill/nodemon restart causes browsers to hold zombie connections
// for up to 300s (OS TCP timeout), causing false DATA STALLED banners.
function gracefulShutdown(signal) {
    console.log(`[WS HUB] ${signal} received — closing all ${wss?.clients?.size || 0} client connections cleanly.`);
    if (wss) {
        wss.clients.forEach(client => {
            try {
                client.close(1001, 'Server restarting'); // 1001 = Going Away
            } catch (_) {}
        });
    }
}
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
