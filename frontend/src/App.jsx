import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMarketStore } from './store/marketStore';
import { useTradeStore } from './store/tradeStore';
import { useAuthStore } from './store/authStore';
import { useWebSocket } from './hooks/useWebSocket';
import { apiFetch } from './utils/api';

// Layout & Pages
import { MainLayout } from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Trade from './pages/Trade';
import Portfolio from './pages/Portfolio';
import Analytics from './pages/Analytics';
import AdversarialAnalytics from './pages/AdversarialAnalytics';
import ResearchCommandCenter from './pages/ResearchCommandCenter';
import Settings from './pages/Settings';
import ErrorBoundary from './components/shared/ErrorBoundary';
import AuthPage from './pages/AuthPage';
import BootSequence from './pages/BootSequence';
import LandingPage from './pages/LandingPage';
import DashboardPreloader from './pages/DashboardPreloader';

// ─── Protected Route ──────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
    const isAuthenticated = useAuthStore(s => s.isAuthenticated);
    const isRestoring     = useAuthStore(s => s.isRestoring);
    if (isRestoring) return null; // Don't flash redirect during session restore
    if (!isAuthenticated) return <Navigate to="/auth" replace />;
    return children;
}

// ─── App Shell ────────────────────────────────────────────────────────────────
function AppShell() {
    const applyUpdate    = useMarketStore(s => s.applyUpdate);
    const fetchPortfolio = useTradeStore(s => s.fetchPortfolio);
    useWebSocket('/ws');

    useEffect(() => {
        let refreshInterval;
        const boot = async () => {
            // 🛡️ [PHASE 21] Guard: only boot if authenticated (handles fast mount/unmount edge cases)
            const { isAuthenticated: stillAuthed } = useAuthStore.getState();
            if (!stillAuthed) return;

            try {
                const res = await apiFetch('/api/intelligence/state');
                if (res.ok) {
                    const payload = await res.json();
                    applyUpdate({ type: 'STATE', data: payload.data || payload });
                }
            } catch (e) { console.error('[BOOT] Intelligence Sync Failed:', e); }
            fetchPortfolio();
            refreshInterval = setInterval(() => {
                // Re-check auth on each tick — stop interval if session expired (401 auto-logout)
                const { isAuthenticated: authed } = useAuthStore.getState();
                if (!authed) {
                    clearInterval(refreshInterval);
                    return;
                }
                fetchPortfolio();
            }, 15000); // Relaxed to 15s — reduces server load

        };
        boot();
        return () => { if (refreshInterval) clearInterval(refreshInterval); };
    }, [applyUpdate, fetchPortfolio]);

    return (
        <MainLayout>
            <Routes>
                <Route path="/"          element={<ProtectedRoute><ErrorBoundary><Dashboard /></ErrorBoundary></ProtectedRoute>} />
                <Route path="/trade"     element={<ProtectedRoute><ErrorBoundary><Trade /></ErrorBoundary></ProtectedRoute>} />
                <Route path="/portfolio" element={<ProtectedRoute><ErrorBoundary><Portfolio /></ErrorBoundary></ProtectedRoute>} />
                <Route path="/analytics"   element={<ProtectedRoute><ErrorBoundary><Analytics /></ErrorBoundary></ProtectedRoute>} />
                <Route path="/adversarial" element={<ProtectedRoute><ErrorBoundary><AdversarialAnalytics /></ErrorBoundary></ProtectedRoute>} />
                <Route path="/research-command" element={<ProtectedRoute><ErrorBoundary><ResearchCommandCenter /></ErrorBoundary></ProtectedRoute>} />
                <Route path="/settings"    element={<ProtectedRoute><ErrorBoundary><Settings /></ErrorBoundary></ProtectedRoute>} />
                <Route path="*"            element={<Navigate to="/" replace />} />
            </Routes>
        </MainLayout>
    );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
    const { isAuthenticated, isRestoring, user, restoreSession } = useAuthStore();
    const [showBoot, setShowBoot] = useState(false);
    const [bootDone, setBootDone] = useState(false);

    // On mount: restore session from stored refresh token
    useEffect(() => { restoreSession(); }, []);

    // When user freshly authenticates → show boot sequence once
    const handleAuthSuccess = () => setShowBoot(true);
    const handleBootComplete = () => { setShowBoot(false); setBootDone(true); };

    if (isRestoring) {
        return <DashboardPreloader />;
    }

    return (
        <BrowserRouter>
            <AnimatePresence mode="wait">
                {/* BOOT SEQUENCE — shown once after fresh login */}
                {showBoot && (
                    <motion.div
                        key="boot"
                        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <BootSequence userName={user?.name} onComplete={handleBootComplete} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* AUTH ROUTES — shown when not authenticated */}
            {!isAuthenticated && !showBoot && (
                <Routes>
                    <Route path="/"       element={<LandingPage />} />
                    <Route path="/landing" element={<LandingPage />} />
                    <Route path="/auth"   element={<AuthPage onSuccess={handleAuthSuccess} />} />
                    <Route path="*"       element={<Navigate to="/" replace />} />
                </Routes>
            )}

            {/* APP SHELL — shown once authenticated and boot is done (or restored session) */}
            {isAuthenticated && !isRestoring && !showBoot && (
                <motion.div
                    key="app"
                    initial={bootDone ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                >
                    <AppShell />
                </motion.div>
            )}
        </BrowserRouter>
    );
}
