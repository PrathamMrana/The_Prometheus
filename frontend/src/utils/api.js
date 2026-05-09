import { getAccessToken } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * 🛡️ [PHASE 21] Auth-aware fetch wrapper.
 * Pre-flight check: if no access token, return a synthetic 401 Response immediately
 * WITHOUT making a network request. This prevents the browser console from logging
 * red "Failed to load resource: 401" errors for unauthenticated sessions.
 *
 * Post-flight check: if the server returns a real 401 (expired JWT), we
 * automatically clear stale tokens and trigger a logout — stopping the
 * infinite 401 polling loop that occurs when a session expires mid-flight.
 */
export async function apiFetch(endpoint, options = {}) {
    const token = getAccessToken();

    // 🔱 Pre-flight bail-out: avoid network noise for unauthenticated callers
    if (!token) {
        return new Response(JSON.stringify({ success: false, error: 'NOT_AUTHENTICATED' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const headers = {
        ...options.headers,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };

    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    // 🔱 Post-flight 401 guard: server rejected our token (expired/revoked)
    // Dynamically import to avoid circular dependency at module load time.
    if (response.status === 401) {
        try {
            const { useAuthStore } = await import('../store/authStore');
            const { isAuthenticated, logout } = useAuthStore.getState();
            if (isAuthenticated) {
                console.warn('[API] Server returned 401 — session expired. Logging out.');
                logout();
            }
        } catch (_) { /* best-effort */ }
    }

    return response;
}
