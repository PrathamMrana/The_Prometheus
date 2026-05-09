import React, { useState, useEffect, useRef } from 'react';

/**
 * 🔱 PHASE 19 — OBSERVABILITY PANEL
 * Live system health: cycle latency, execution counts, regime, SM distribution, WS status.
 * Receives TELEMETRY_STATE from the WebSocket broadcast.
 * Zero heavy rendering — pure CSS transitions, no chart libs.
 */

const REGIME_COLORS = {
    TRENDING_BULL:      { bg: 'rgba(16,185,129,0.12)', border: '#10b981', label: '#34d399' },
    BREAKOUT_EXPANSION: { bg: 'rgba(139,92,246,0.12)', border: '#8b5cf6', label: '#a78bfa' },
    SIDEWAYS:           { bg: 'rgba(100,116,139,0.12)', border: '#64748b', label: '#94a3b8' },
    VOLATILE:           { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', label: '#fbbf24' },
    TRENDING_BEAR:      { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', label: '#f87171' },
    RISK_OFF:           { bg: 'rgba(239,68,68,0.20)', border: '#dc2626', label: '#fca5a5' },
};

function MiniBar({ label, value, max, color = '#6366f1' }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
                <span>{label}</span>
                <span style={{ color: '#e2e8f0' }}>{value}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
            </div>
        </div>
    );
}

function StatPill({ label, value, sub, color = '#64748b' }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid rgba(255,255,255,0.07)`,
            borderRadius: 8,
            padding: '10px 14px',
            minWidth: 90,
            flex: '1 1 90px'
        }}>
            <div style={{ fontSize: 18, fontWeight: 700, color, letterSpacing: -0.5 }}>{value}</div>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
            {sub && <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

export default function ObservabilityPanel({ wsData }) {
    const [telemetry, setTelemetry] = useState(null);
    const [wsStatus, setWsStatus]   = useState('CONNECTING');
    const [lastHeartbeat, setLastHeartbeat] = useState(null);
    const [blinkKey, setBlinkKey]   = useState(0);
    const timerRef = useRef(null);

    // Receive data from parent via wsData prop (populated from useWebSocket hook)
    useEffect(() => {
        if (!wsData) return;

        if (wsData.type === 'TELEMETRY_STATE') {
            setTelemetry(wsData.payload);
            setBlinkKey(k => k + 1);
        }
        if (wsData.type === 'HEARTBEAT') {
            setLastHeartbeat(Date.now());
            setWsStatus('LIVE');
        }
    }, [wsData]);

    // WS staleness watchdog
    useEffect(() => {
        timerRef.current = setInterval(() => {
            if (lastHeartbeat && Date.now() - lastHeartbeat > 12000) {
                setWsStatus('STALLED');
            }
        }, 3000);
        return () => clearInterval(timerRef.current);
    }, [lastHeartbeat]);

    const regime = telemetry?.dominantRegime || 'UNKNOWN';
    const rTheme = REGIME_COLORS[regime] || REGIME_COLORS.SIDEWAYS;

    const rejectReasons = telemetry?.rejectReasons || {};
    const totalRejects  = Object.values(rejectReasons).reduce((a, b) => a + b, 0);
    const topRejects    = Object.entries(rejectReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    const smClasses = telemetry?.smClassifications || {};
    const totalSM   = Object.values(smClasses).reduce((a, b) => a + b, 0);

    const wsColor = wsStatus === 'LIVE' ? '#10b981' : wsStatus === 'STALLED' ? '#f59e0b' : '#64748b';

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(30,27,75,0.95) 100%)',
            border: '1px solid rgba(99,102,241,0.15)',
            borderRadius: 16,
            padding: '20px 22px',
            fontFamily: "'Inter', 'SF Mono', monospace",
            color: '#e2e8f0',
            marginBottom: 20
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%', background: wsColor,
                        boxShadow: `0 0 8px ${wsColor}`,
                        animation: wsStatus === 'LIVE' ? 'pulse 2s infinite' : 'none'
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.5, color: '#94a3b8', textTransform: 'uppercase' }}>
                        System Observability
                    </span>
                </div>
                <div style={{
                    fontSize: 10, color: wsColor, fontWeight: 700, letterSpacing: 1,
                    background: `${wsColor}18`, padding: '3px 9px', borderRadius: 12
                }}>
                    {wsStatus}
                </div>
            </div>

            {/* Regime + Core Stats Row */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                {/* Regime Pill (wider) */}
                <div style={{
                    flex: '2 1 160px',
                    background: rTheme.bg,
                    border: `1px solid ${rTheme.border}33`,
                    borderRadius: 10,
                    padding: '10px 14px'
                }}>
                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>Regime AI</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: rTheme.label, marginTop: 2 }}>{regime.replace(/_/g, ' ')}</div>
                    {telemetry?.avgEdgeScore != null && (
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                            Avg Edge: <span style={{ color: '#94a3b8' }}>{telemetry.avgEdgeScore}</span>
                        </div>
                    )}
                </div>

                <StatPill label="Cycle" value={telemetry?.cycleCount ?? '—'} sub="total" color="#6366f1" />
                <StatPill label="Avg Latency" value={telemetry?.avgCycleDurationMs ? `${telemetry.avgCycleDurationMs}ms` : '—'} color="#818cf8" />
                <StatPill label="Buy Rate" value={telemetry?.buyConversionRate != null ? `${telemetry.buyConversionRate}%` : '—'} color="#10b981" />
            </div>

            {/* Signal Decision Counters */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                <StatPill label="BUY" value={telemetry?.buyCount ?? 0} color="#10b981" />
                <StatPill label="Strong BUY" value={telemetry?.strongBuyCount ?? 0} color="#34d399" />
                <StatPill label="Hold" value={telemetry?.holdCount ?? 0} color="#94a3b8" />
                <StatPill label="Rejected" value={telemetry?.rejectCount ?? 0} color="#ef4444" />
            </div>

            {/* Rejection Breakdown */}
            {topRejects.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                        Rejection Breakdown
                    </div>
                    {topRejects.map(([reason, count]) => (
                        <MiniBar key={reason} label={reason} value={count} max={totalRejects} color="#ef4444" />
                    ))}
                </div>
            )}

            {/* Smart Money Distribution */}
            {totalSM > 0 && (
                <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                        Smart Money Classification
                    </div>
                    {Object.entries(smClasses).sort((a,b) => b[1]-a[1]).slice(0,4).map(([cls, cnt]) => {
                        const color = cls.includes('ACCUM') ? '#10b981' : cls.includes('DIST') ? '#ef4444' : '#64748b';
                        return <MiniBar key={cls} label={cls} value={cnt} max={totalSM} color={color} />;
                    })}
                </div>
            )}

            {/* Last heartbeat */}
            {lastHeartbeat && (
                <div style={{ fontSize: 10, color: '#334155', marginTop: 10, textAlign: 'right' }}>
                    Last heartbeat: {new Date(lastHeartbeat).toLocaleTimeString()}
                </div>
            )}
        </div>
    );
}
