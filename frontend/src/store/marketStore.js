import { create } from 'zustand';
import { calculatePercentageChange, isBaselineFrozen } from '../utils/telemetry';

export const useMarketStore = create((set, get) => ({
  market: {},
  health: {
    integrityScore: 100,
    status: 'OPERATIONAL',
    lastSync: Date.now(),
    defensiveMode: false,
    activeAdapters: [],
    logs: [],
    events: []
  },
  global: {
    regime: "SIDEWAYS",
    risk: "LOW",
    riskReason: "Stable market",
    sectorFlow: { BANKING: { value: 0, trend: "FLAT" }, IT: { value: 0, trend: "FLAT" }, AUTO: { value: 0, trend: "FLAT" } },
    advanceDecline: { advancers: 0, decliners: 0 },
    topMovers: { gainers: [], losers: [] }
  },
  anomalies: [],
  macro: [],
  telemetry: null, // 🔱 [PHASE 19] Execution telemetry snapshot
  opportunityBoard: [], // 🔱 [PHASE 20] Ranked opportunity leaderboard
  boardMeta: null, // Phase 10: market context from backend
  sync_id: 0,
  lastUpdate: Date.now(),
  globalLatency: 0,
  lastTickIdMap: {},
  symbolLoading: null,
  symbolMeta: {},
  logs: [],
  // Phase 10: graded feed state from backend state machine
  feedState: 'LIVE',      // LIVE | DELAYED | STALE | DISCONNECTED
  feedDataAge: 0,         // ms since last confirmed tick
  allowEntry: true,       // from backend trading rules
  allowExit: true,        // from backend trading rules

  freeze: false,
  setFreeze: (val) => set({ freeze: val }),

  setSymbolLoading: (sym) => set({ symbolLoading: sym }),
  setSymbolMeta: (sym) => set((s) => ({
    symbolMeta: { ...s.symbolMeta, [sym]: true }
  })),

  applyUpdate: (payload) => set((state) => {
    // 🥶 [PHASE 6] GLOBAL HARD BLOCK
    if (state.freeze) return state;

    if (!payload) return state;

    // 🔱 [PHASE 21] INSTITUTIONAL HEALTH SYNC
    if (payload.health) {
      state.health = { ...state.health, ...payload.health, lastSync: Date.now() };
    }

    if (payload.type === 'HEARTBEAT') {
      return { ...state };
    }

    if (payload.type === 'GLOBAL_STATE') {
      const g = payload.payload || state.global;
      // Phase 10: extract feed state fields emitted by backend FeedStateMachine
      const feedState    = g.feedState    ?? state.feedState;
      const feedDataAge  = g.feedDataAge  ?? state.feedDataAge;
      const allowEntry   = g.allowEntry   ?? state.allowEntry;
      const allowExit    = g.allowExit    ?? state.allowExit;
      
      // 🛡️ [PHASE 21] Sync Health with Feed Status
      if (feedState === 'RECOVERING' || state.feedState === 'RECOVERING') {
        g.data_health = 'RECOVERING';
      }

      const isChanged = JSON.stringify(state.global) !== JSON.stringify(g);
      if (!isChanged && feedState === state.feedState) return state;
      return { ...state, global: g, feedState, feedDataAge, allowEntry, allowExit };
    }

    if (payload.type === 'TELEMETRY_STATE') {
      return { ...state, telemetry: payload.payload };
    }

    if (payload.type === 'OPPORTUNITY_BOARD') {
      return { 
        ...state, 
        opportunityBoard: payload.payload || [],
        boardMeta: payload.meta || state.boardMeta, // Phase 10: market context
      };
    }

    let newMarket = { ...state.market };

    // 🔥 [PHASE 21] INSTITUTIONAL STATE RECOVERY
    if (payload.type === 'STATE') {
      const list = payload.data || [];
      const prices = payload.data?.prices || list;
      const listToProcess = Array.isArray(prices) ? prices : Object.values(prices);

      // 🛡️ [GRACEFUL DEGRADATION] Resilience Guard
      // If we receive an empty state, preserve existing data and wait for recovery.
      if (listToProcess.length === 0) {
        if (Object.keys(state.market).length > 0) {
            return { ...state, feedState: 'RECOVERING' };
        }
        return state; // No-op if we have nothing and got nothing
      }

      listToProcess.forEach((d) => {
        const rawSymbol = d.symbol || "";
        const id = d.id || d.tick_id || Date.now();
        
        // 🔱 [NORMALIZATION] Strip '^' and suffixes for unified store access
        const key = rawSymbol.replace('^', '').split(".")[0]?.trim().toUpperCase();
        if (!key || !Number.isFinite(d.price)) return;
        if (d.status === 'DEAD') return;

        const currency = rawSymbol.includes('.NS') ? 'INR' : 'USD';
        
        const incomingPct = d.percent !== undefined ? d.percent : d.pct_change;
        const prevClose = d.prevClose || 0;
        
        // 🔱 [TELEMETRY ENGINE] Unified Percentage Calculation
        let finalPercent = calculatePercentageChange(d.price, prevClose);
        
        // Fallback to incoming if engine returns null (e.g. missing baseline)
        if (finalPercent === null) finalPercent = Number.isFinite(incomingPct) ? incomingPct : 0;

        // 🔱 [TELEMETRY LOGGING]
        console.log(`[TELEMETRY] ${key} | Price: ${d.price} | PrevClose: ${prevClose} | %: ${finalPercent}% | Status: ${d.status}`);

        // 🔒 [SAFE FALLBACK] Only trigger when Phase 17 pipeline hasn't produced signal yet.
        if (!d.signal) {
          d.signal = { 
            status: "Awaiting live telemetry synchronization",
            loading: true,
            decision: "SYNCING"
          };
        }

        newMarket[key] = {
          symbol: key,
          rawSymbol: rawSymbol,
          currency: currency,
          price: d.price,
          prevClose: prevClose, // 🔱 [PHASE 21] Persistent Baseline
          percent: finalPercent,
          pct_change: finalPercent,
          sparkline: d.sparkline || newMarket[key]?.sparkline || [],
          signal: d.signal,
          anomaly: d.anomaly || newMarket[key]?.anomaly || null,
          zscore: d.zscore || newMarket[key]?.zscore || 0,
          alerts: d.alerts || newMarket[key]?.alerts || [],
          priority: d.priority || newMarket[key]?.priority || "NORMAL",
          timestamp: d.timestamp || Date.now(),
          status: d.status || "LIVE"
        };
      });

      return { ...state, market: newMarket, feedState: 'LIVE' };
    }

    // ⚡ [FIX 2] SAFE TICK MERGE MAPPED FOR DELTAS
    if (payload.type === 'TICK' || payload.type === 'TICK_DELTA') {
      const updates = payload.type === 'TICK_DELTA' ? payload.updates : [payload];
      if (!updates || !updates.length) return state;

      updates.forEach(d => {
        const rawSymbol = d.symbol || "";
        const key = rawSymbol.replace('^', '').split(".")[0]?.trim().toUpperCase();
        if (!key) return;

        const id = `${key}-${d.timestamp}`;
        if (state.lastTickIdMap[key] === id) return;

        // 🔱 [PURITY LOCK] Only filter by valid price — never silently drop real market data
        if (!Number.isFinite(Number(d.price)) || d.price <= 0) return;

        const currency = rawSymbol.includes('.NS') ? 'INR' : (newMarket[key]?.currency || 'USD');

        const newPrice = Number.isFinite(d.price) ? d.price : (newMarket[key]?.price ?? null);
        const incomingPct = d.percent !== undefined ? d.percent : d.pct_change;
        const prevClose = d.prevClose || newMarket[key]?.prevClose || 0;

        // 🔱 [TELEMETRY ENGINE] Centralized Calculation Engine
        let finalPercent = calculatePercentageChange(newPrice, prevClose);
        
        // ❄️ [BASELINE FREEZE] If market is closed, do not allow recalculations that jitter
        if (isBaselineFrozen(newMarket[key]?.status)) {
           finalPercent = newMarket[key]?.percent ?? finalPercent;
        }

        if (finalPercent === null) finalPercent = Number.isFinite(incomingPct) ? incomingPct : (newMarket[key]?.percent ?? 0);

        // 🔱 [TELEMETRY LOGGING] Detailed update trace
        if (newPrice !== newMarket[key]?.price) {
           console.log(`[TICK_TELEMETRY] ${key} | New: ${newPrice} | Prev: ${newMarket[key]?.price} | Baseline: ${prevClose} | %: ${finalPercent}%`);
        }

        newMarket[key] = {
          ...(newMarket[key] || {}),
          ...d,
          symbol: key,
          rawSymbol: rawSymbol,
          currency: currency,
          price: newPrice,
          prevClose: prevClose, // 🔱 [PHASE 21] Hardened reference
          percent: finalPercent,
          pct_change: finalPercent,
          sparkline: d.sparkline && d.sparkline.length > 0 ? d.sparkline : (newMarket[key]?.sparkline || []),
          // 🔱 [PURITY LOCK] Keep existing signal if new tick hasn't been processed by intelligence yet
          signal: (d.signal && (d.signal.decision || d.signal.score)) ? d.signal : (newMarket[key]?.signal || { decision: 'LOADING', score: 0 }),
          anomaly: d.anomaly || newMarket[key]?.anomaly || null,
          zscore: Number.isFinite(d.zscore) ? d.zscore : (newMarket[key]?.zscore || 0),
          alerts: d.alerts || newMarket[key]?.alerts || [],
          priority: d.priority || newMarket[key]?.priority || 'NORMAL',
          timestamp: d.timestamp || newMarket[key]?.timestamp || Date.now()
        };

        state.lastTickIdMap[key] = id;
      });
    }
 
    if (payload.type === 'LOG') {
      const newLog = {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
        type: payload.logType || 'SYSTEM',
        msg: payload.message || payload.text || 'Core process update'
      };
      return { ...state, logs: [newLog, ...state.logs].slice(0, 100) };
    }

    return {
      ...state,
      market: newMarket,
      lastUpdate: Date.now(),
      sync_id: payload.sync_id || state.sync_id
    };
  }),

  // 🔱 [PHASE 17] Patch a single symbol's signal from the /preview API.
  // Called after a successful pre-trade simulate so SymbolIntel stops showing COMPUTING.
  patchSignal: (symbol, signalPatch) => set((state) => {
    const key = symbol.split('.')[0].trim().toUpperCase();
    const existing = state.market[key];
    if (!existing) return state;
    return {
      ...state,
      market: {
        ...state.market,
        [key]: {
          ...existing,
          signal: {
            ...(existing.signal || {}),
            ...signalPatch,
            status: 'READY'   // ← always mark READY so isLoading clears
          }
        }
      }
    };
  }),

  setHealth: (health) => set((state) => ({
    health: { ...state.health, ...health },
    // 🛡️ globalLatency is what Navbar reads — keep it in sync with health.latency
    ...(health.latency !== undefined ? { globalLatency: health.latency } : {})
  }))
}));
