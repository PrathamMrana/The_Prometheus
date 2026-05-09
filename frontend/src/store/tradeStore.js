import { create } from 'zustand';
import { apiFetch } from '../utils/api';
import { useAuthStore } from './authStore';

/**
 * 💸 PROMETHEUS EXECUTION STORE (PHASE 6)
 * Manages institutional paper trading state, balance, and holdings.
 */
export const useTradeStore = create((set, get) => ({
    balance: 1000000,
    lockedBalance: 0,
    realizedPnL: 0,
    holdings: [],
    pendingOrders: [],
    orders: [],
    selectedSymbol: 'RELIANCE.NS',
    loading: false,
    error: null,
    lastUpdate: Date.now(),
    tradeToast: null, // { type: 'SUCCESS' | 'ERROR' | 'INFO', msg: string, id: number }
    systemLogs: [],
    agentResults: [],

    setAgentResults: (data) => set({ agentResults: data }),

    fetchSystemLogs: async () => {
        try {
            const resp = await apiFetch('/api/system/logs');
            const data = await resp.json();
            if (data.success) set({ systemLogs: data.logs || [] });
        } catch (e) { }
    },

    simulateOrder: async (order) => {
        try {
            const resp = await apiFetch('/api/trade/preview', {
                method: 'POST',
                body: JSON.stringify(order)
            });
            return await resp.json();
        } catch (e) {
            return { success: false, error: 'SIMULATION_NETWORK_ERROR' };
        }
    },

    setSelectedSymbol: (symbol) => {
        if (!symbol) return;
        const upper = symbol.trim().toUpperCase();
        const normalized = upper.includes('.') ? upper : `${upper}.NS`;
        set({ selectedSymbol: normalized });
    },

    setTradeToast: (toast) => {
        set({ tradeToast: toast ? { ...toast, id: Date.now() } : null });
    },

    /**
     * 🔒 Fetches the canonical portfolio state from the backend.
     * Bails gracefully on 401 (apiFetch handles the logout/token clear).
     */
    fetchPortfolio: async () => {
        set({ loading: true });
        try {
            const resp = await apiFetch('/api/trade/portfolio');

            // 401 → session expired; apiFetch already triggered logout — stop here
            if (resp.status === 401) {
                set({ loading: false });
                return;
            }
            // Other non-OK responses — log and surface as a connection error
            if (!resp.ok) {
                console.warn(`[TRADE_STORE] Portfolio fetch failed: HTTP ${resp.status}`);
                set({ error: 'CONNECTION_ERROR', loading: false });
                return;
            }

            const data = await resp.json();
            if (data.success) {
                set({
                    balance: data.balance,
                    lockedBalance: data.lockedBalance || 0,
                    realizedPnL: data.realizedPnL || 0,
                    holdings: data.holdings,
                    pendingOrders: data.pendingOrders,
                    orders: data.orders,
                    loading: false,
                    lastUpdate: Date.now()
                });
            } else {
                set({ loading: false });
            }
        } catch (err) {
            console.error("[TRADE_STORE] Fetch Error:", err);
            set({ error: "CONNECTION_ERROR", loading: false });
        }
    },

    /**
     * 🚀 Submits a new MARKET or LIMIT order.
     */
    placeOrder: async (order) => {
        try {
            const resp = await apiFetch('/api/trade/order', {
                method: 'POST',
                body: JSON.stringify(order)
            });
            const data = await resp.json();

            if (data.success) {
                const confScore = data.risk?.confidence ? ` | CONFD: ${(data.risk.confidence * 100).toFixed(1)}%` : '';
                const msg = `ORDER ${order.type} ${order.side} ACCEPTED${confScore}`;
                set({ tradeToast: { type: 'INFO', msg, id: Date.now() } });
                await get().fetchPortfolio();
                return { success: true, order: data.order, risk: data.risk };
            } else {
                const rejectReason = data.reason ? data.reason : 'RISK_GUARD_BLOCK';
                const msg = data.reason ? `RISK ENGINE REJECTED: ${data.reason}` : (data.error || 'EXECUTION_FAILED');
                set({ tradeToast: { type: 'REJECT', msg, reason: rejectReason, id: Date.now() } });
                return { success: false, error: data.error, reason: rejectReason };
            }
        } catch (err) {
            set({ tradeToast: { type: 'ERROR', msg: "NETWORK_FAILURE", id: Date.now() } });
            return { success: false, error: "NETWORK_FAILURE" };
        }
    },

    /**
     * 🚫 Cancels a pending LIMIT order.
     */
    cancelOrder: async (orderId) => {
        try {
            const resp = await apiFetch('/api/trade/cancel', {
                method: 'POST',
                body: JSON.stringify({ orderId })
            });
            const data = await resp.json();
            if (data.success) {
                set({ tradeToast: { type: 'INFO', msg: "ORDER CANCELLED", id: Date.now() } });
                await get().fetchPortfolio();
                return { success: true };
            }
        } catch (err) {
            set({ tradeToast: { type: 'ERROR', msg: "CANCEL_FAILED", id: Date.now() } });
            return { success: false, error: "NETWORK_FAILURE" };
        }
    },

    /**
     * 📡 Reconciles socket updates (Fills, Rejections).
     */
    handleSocketUpdate: (payload) => {
        if (!payload) return;

        // 🛡️ [PHASE 21] Auth Guard: Prevent unauthenticated fetch attempts
        const { isAuthenticated } = useAuthStore.getState();
        if (!isAuthenticated) return;

        if (payload.type === 'TRADE_UPDATE') {
            const order = payload.order;
            if (order && order.status === 'FILLED') {
                const sym = order.symbol.split('.')[0];
                const msg = `${order.side} ${sym} x ${order.qty} @ ₹${order.price} FILLED`;
                set({ tradeToast: { type: 'SUCCESS', msg, id: Date.now() } });
            }
            get().fetchPortfolio();
        }

        // 🔱 [PHASE 11 FIX] Map institutional OrderQueue lifecycle events
        if (payload.type === 'ORDER_FILLED') {
            const sym = payload.symbol.split('.')[0];
            const msg = `${payload.side} ${sym} x ${payload.qty} @ ₹${payload.fillPrice?.toFixed(2) || 'MKT'} FILLED`;
            set({ tradeToast: { type: 'SUCCESS', msg, id: Date.now() } });
            get().fetchPortfolio();
        } else if (payload.type === 'ORDER_REJECTED') {
            const sym = payload.symbol.split('.')[0];
            const msg = `${payload.side} ${sym} REJECTED: ${payload.reason}`;
            set({ tradeToast: { type: 'REJECT', msg, reason: payload.reason, id: Date.now() } });
            get().fetchPortfolio();
        } else if (payload.type === 'ORDER_QUEUE_UPDATE') {
            get().fetchPortfolio(); // Refetch to show queue state (VALIDATING/ROUTING/etc)
        }
    }
}));
