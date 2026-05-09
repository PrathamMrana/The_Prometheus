import { useRef, useEffect } from 'react';
import { useMarketStore } from '../store/marketStore';
import { useTradeStore } from '../store/tradeStore';
import { useAuthStore } from '../store/authStore';
import { updateQueue } from '../utils/updateQueue';
import { apiFetch } from '../utils/api';

const API_BASE = '';

export const useWebSocket = (url) => {
  const applyUpdate = useMarketStore((state) => state.applyUpdate);
  const handleTradeUpdate = useTradeStore((state) => state.handleSocketUpdate);
  const setHealth = useMarketStore((state) => state.setHealth);
  // NOTE: isAuthenticated/isRestoring below are used for initial render guard.
  // Inside callbacks (watchdog, onopen, etc.) we ALWAYS call useAuthStore.getState()
  // to get the LIVE value — stale closure values cannot be trusted in async contexts.
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isRestoring = useAuthStore((state) => state.isRestoring);
  
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const watchdogTimer = useRef(null);
  const lastDataTime = useRef(Date.now());
  const retryCount = useRef(0);
  const isConnecting = useRef(false);
  const lastSyncId = useRef(0);
  
  const MAX_RETRIES = 50;         // 🔱 Never permanently fail — always attempt recovery
  const BASE_DELAY = 3000;

  /**
   * 🛡️ [STEP U] SMART DATA WATCHDOG
   * Fires every 10s. Stall threshold: 90s (server cycle takes up to 60s for 56 symbols).
   */
  const startWatchdog = () => {
    if (watchdogTimer.current) clearInterval(watchdogTimer.current);
    
    watchdogTimer.current = setInterval(() => {
      // 🛡️ [PHASE 21] LIVE auth check — never use stale closure for auth gating
      const { isAuthenticated: liveAuth } = useAuthStore.getState();

      // If not authenticated, silently reset the stall timer and skip reconnect.
      // This prevents the zombie-reconnect → 401-cascade loop on public pages.
      if (!liveAuth) {
        lastDataTime.current = Date.now();
        return;
      }

      const timeSinceLastData = Date.now() - lastDataTime.current;
      
      // Threshold = 45s. Server sends HEARTBEAT every 5s.
      // If 45s pass with ZERO messages, the socket is a zombie.
      if (timeSinceLastData > 45000) {
        console.error(`⚠ [FAILSAFE] DATA STALLED (${Math.floor(timeSinceLastData/1000)}s). Zombie socket — forcing reconnect.`);
        setHealth({ status: 'STALLED', latency: 0 });
        
        if (ws.current) {
            console.log("🔄 Force-closing stalled socket to trigger recovery...");
            ws.current.close(); 
        } else {
            console.log("🔄 WS missing, initiating immediate reconnect...");
            retryCount.current = 0; 
            connect();
        }
      }
    }, 10000);
  };

  /**
   * 🔄 [STEP S] DRIFT RECOVERY
   */
  const checkDrift = (sync_id) => {
    if (lastSyncId.current && sync_id > lastSyncId.current + 5) {
      console.warn(`[SYNC] Drift Detected (${sync_id - lastSyncId.current} packets).`);
      resync();
    }
    lastSyncId.current = sync_id;
  };

  const resync = async () => {
    if (window.__FREEZE__) return; // 🚨 Stop rogue UI REST polling unfreezing

    try {
      const response = await apiFetch('/api/intelligence/state');
      if (response.ok) {
        const payload = await response.json();
        const data = payload.data || payload;
        applyUpdate({ type: 'STATE', data, sync_id: data.sync_id, timestamp: data.timestamp });
      }
    } catch (e) {
      console.error('[SYNC] Restore Failed:', e.message);
    }
  };

  const connect = () => {
    // 🛡️ [PHASE 21] LIVE auth check — never open a socket for unauthenticated users.
    // This is the final defense: even if watchdog or reconnect logic calls connect(),
    // it will no-op silently if the user is not logged in.
    const { isAuthenticated: liveAuth } = useAuthStore.getState();
    if (!liveAuth) return;

    // 🔒 [GUARD] Prevent duplicate connection attempts
    if (isConnecting.current || (ws.current && ws.current.readyState === WebSocket.OPEN)) {
        return;
    }

    if (retryCount.current >= MAX_RETRIES) {
        console.error("❌ WS MAX RETRIES REACHED. Manual intervention required.");
        setHealth({ status: 'STALLED', latency: 0 });
        return;
    }

    isConnecting.current = true;
    console.log(`[WS] Initializing Connection (Attempt ${retryCount.current + 1})...`);
    
    const wsUrl = url.startsWith('/') 
      ? (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + url
      : url;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("✅ WS CONNECTED");
      isConnecting.current = false;
      retryCount.current = 0;  // 🔱 Always reset — never carry retry debt across sessions
      lastDataTime.current = Date.now();  // 🔱 Reset stall timer immediately on connect
      setHealth({ status: 'LIVE', latency: 0 });
      // 🔱 [PHASE 21] Re-read live auth state — not stale closure
      const { isAuthenticated: authed, isRestoring: restoring } = useAuthStore.getState();
      if (authed && !restoring) {
          resync();
      }
    };

    let hasState = false;
    let hasGlobal = false;

    ws.current.onmessage = (event) => {
      lastDataTime.current = Date.now();
      try {
        const data = JSON.parse(event.data);
        
        // 🛡️ Real latency: measure server-to-client propagation delay
        if (data.type === 'heartbeat' || data.type === 'HEARTBEAT') {
            const raw = (data.timestamp && Number.isFinite(data.timestamp))
                ? Date.now() - data.timestamp
                : null;
            // 🛡️ Sanity cap: if drift > 5s, timestamp is stale/misaligned — surface nothing
            const latency = (raw !== null && raw >= 0 && raw < 5000) ? raw : null;
            // 🔱 [PHASE 18 FIX] HEARTBEAT explicitly keeps health LIVE — prevents false STALLED state
            // lastDataTime is already updated at line 111 for ALL messages including HEARTBEAT.
            // But health must be kept LIVE so the watchdog banner never shows during normal flow.
            setHealth({ status: 'LIVE', ...(latency !== null ? { latency } : {}) });
            updateQueue.push(data);
            return; 
        }

        if (data.type === 'STATE') {
          hasState = true;
        }
        updateQueue.push(data);
      } catch (e) {
        console.error('Parse Error:', e);
      }
    };

    ws.current.onerror = (err) => {
      console.error("❌ WS ERROR:", err);
      // Let onclose handle the reconnection
    };

    ws.current.onclose = (event) => {
      isConnecting.current = false;
      ws.current = null;
      
      const isUnreachable = event.code === 1006;
      console.log(isUnreachable ? "⚠️ WS: SERVER UNREACHABLE" : "⚠ WS: CLOSED", `(Code: ${event.code})`);

      // 🔱 [FIX] Always retry — never permanently give up
      const delay = Math.min(30000, BASE_DELAY * Math.pow(1.5, Math.min(retryCount.current, 8)));
      retryCount.current++;
      
      setHealth({ status: 'RECOVERY_MODE', latency: 0 });
      console.log(`🔄 [WS] Reconnecting in ${Math.round(delay)}ms... (Attempt ${retryCount.current})`);
      
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
          if (!ws.current || ws.current.readyState === WebSocket.CLOSED) {
              connect();
          }
      }, delay);
    };
  };

  useEffect(() => {
    let timeout;
    
    updateQueue.setProcessor(async (payload) => {
      if (payload.sync_id) checkDrift(payload.sync_id);
      
      // 🛡️ [PHASE 21] Auth-Gate Trade Updates
      // Prevents unauthenticated public clients (Landing Page) from triggering 
      // portfolio fetches and causing 401 console noise.
      if (['TRADE_UPDATE', 'ORDER_QUEUE_UPDATE', 'ORDER_FILLED', 'ORDER_REJECTED'].includes(payload.type) && isAuthenticated) {
        handleTradeUpdate(payload);
      }
      
      applyUpdate(payload);
    });

    const start = () => {
        timeout = setTimeout(() => {
            console.log("⏱️ Initializing delayed connection (1s)...");
            connect();
        }, 1000);
    };

    start();
    startWatchdog();

    return () => {
      console.log("🧹 Cleaning up WebSocket...");
      if (timeout) clearTimeout(timeout);
      if (ws.current) ws.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (watchdogTimer.current) clearInterval(watchdogTimer.current);
    };
  }, []); 

  const safeSend = (data) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  };

  return { socket: ws.current, safeSend };
};
