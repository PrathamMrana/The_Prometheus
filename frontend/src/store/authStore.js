/**
 * 🔱 [PHASE 21] Auth Store — Zustand
 * Manages JWT access/refresh tokens, user state, and session persistence.
 * Tokens stored in localStorage for session restore on refresh.
 */
import { create } from 'zustand';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ACCESS_KEY  = 'prometheus_access';
const REFRESH_KEY = 'prometheus_refresh';
const USER_KEY    = 'prometheus_user';

// ─── Token helpers ────────────────────────────────────────────────────────────
export function getAccessToken()  { return localStorage.getItem(ACCESS_KEY); }
export function getRefreshToken() { return localStorage.getItem(REFRESH_KEY); }

function saveTokens(accessToken, refreshToken, user) {
    localStorage.setItem(ACCESS_KEY,  accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY,    JSON.stringify(user));
}

function clearTokens() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
}

function getSavedUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
}

// ─── Zustand store ────────────────────────────────────────────────────────────
export const useAuthStore = create((set, get) => ({
    user:           getSavedUser(),
    accessToken:    getAccessToken(),
    isAuthenticated: !!getSavedUser(),
    isLoading:      false,
    error:          null,
    isRestoring:    true,   // true while we verify existing token on boot

    // ─── Register ───────────────────────────────────────────────────────────
    register: async (email, password, name) => {
        set({ isLoading: true, error: null });
        try {
            const res = await fetch(`${API}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Registration failed.');
            saveTokens(data.accessToken, data.refreshToken, data.user);
            set({ user: data.user, accessToken: data.accessToken, isAuthenticated: true, isLoading: false });
            return { success: true };
        } catch (e) {
            set({ isLoading: false, error: e.message });
            return { success: false, error: e.message };
        }
    },

    // ─── Login ──────────────────────────────────────────────────────────────
    login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Login failed.');
            saveTokens(data.accessToken, data.refreshToken, data.user);
            set({ user: data.user, accessToken: data.accessToken, isAuthenticated: true, isLoading: false });
            return { success: true };
        } catch (e) {
            set({ isLoading: false, error: e.message });
            return { success: false, error: e.message };
        }
    },

    // ─── Restore session ────────────────────────────────────────────────────
    restoreSession: async () => {
        const refreshToken = getRefreshToken();
        const savedUser    = getSavedUser();
        if (!refreshToken || !savedUser) {
            set({ isRestoring: false, isAuthenticated: false, user: null, accessToken: null });
            return;
        }
        try {
            const res = await fetch(`${API}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });
            // 🛡️ [PHASE 21] Silently clear stale tokens on 401
            if (!res.ok) {
                clearTokens();
                set({ user: null, accessToken: null, isAuthenticated: false, isRestoring: false });
                return;
            }
            const data = await res.json();
            saveTokens(data.accessToken, data.refreshToken, data.user);
            set({ user: data.user, accessToken: data.accessToken, isAuthenticated: true, isRestoring: false });
        } catch {
            clearTokens();
            set({ user: null, accessToken: null, isAuthenticated: false, isRestoring: false });
        }
    },

    // ─── Logout ─────────────────────────────────────────────────────────────
    logout: async () => {
        const refreshToken = getRefreshToken();
        clearTokens();
        set({ user: null, accessToken: null, isAuthenticated: false });
        try {
            await fetch(`${API}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });
        } catch { /* best-effort */ }
    },

    clearError: () => set({ error: null }),
}));
