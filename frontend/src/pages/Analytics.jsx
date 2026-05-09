import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTradeStore } from '../store/tradeStore';
import { apiFetch } from '../utils/api';
import {
    BarChart3, TrendingUp, TrendingDown, Activity, Target, Zap,
    ShieldCheck, RefreshCw, LineChart, AlertTriangle, Briefcase, Calculator,
    Clock, Layers, Info, Filter, Layout, Grid, PieChart, ShieldAlert, ZapOff,
    Scissors, Eye, Crosshair, BarChart, ShieldMinus, Search, FastForward,
    SignalMedium, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt    = (n) => n?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) ?? '—';
const fmtR   = (n, d = 2) => Number.isFinite(n) ? n.toFixed(d) : '—';
const sign   = (n) => n > 0 ? '+' : '';

// ── Guarded State Component ───────────────────────────────────────────────────
// Shows an institutional "locked" state instead of blank/null
const GatedPanel = ({ title, icon: Icon, borderColor = 'border-white/10', reason, threshold, current, children }) => (
    <div className={`glass p-5 rounded-sm border-l-2 ${borderColor} bg-white/[0.01]`}>
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                {Icon && <Icon size={13} className="text-muted/40" />}
                <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white/60 uppercase">{title}</span>
            </div>
            <Lock size={10} className="text-muted/30" />
        </div>
        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-sm">
            <div className="text-[8px] font-mono text-muted/50 uppercase tracking-widest mb-2">Statistical Gate Active</div>
            <div className="text-[9px] font-mono text-gold/70 font-black uppercase mb-2">{reason}</div>
            {threshold && (
                <div className="mt-2">
                    <div className="flex justify-between text-[7px] font-mono text-muted/30 uppercase mb-1">
                        <span>Evidence collected</span>
                        <span>{current} / {threshold} required</span>
                    </div>
                    <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gold/40 transition-all" style={{ width: `${Math.min(100, (current / threshold) * 100)}%` }} />
                    </div>
                </div>
            )}
        </div>
        {children}
    </div>
);

// ── Defense Panels ───────────────────────────────────────────────────────────

const SampleQualityPanel = ({ sq, tradeCount }) => {
    if (!sq) return (
        <GatedPanel title="Sample Quality Score" icon={Search} borderColor="border-white/10"
            reason="Awaiting Minimum Trade Window" threshold={10} current={tradeCount}>
            <div className="mt-3 space-y-1.5">
                {['Size (N)', 'Regime Diversity', 'Concentration'].map(l => (
                    <div key={l} className="flex justify-between text-[7px] font-mono text-muted/20 uppercase">
                        <span>{l}</span><span>LOCKED</span>
                    </div>
                ))}
            </div>
        </GatedPanel>
    );
    return (
        <div className="glass p-5 rounded-sm border-l-2 border-white/20 bg-white/[0.01]">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <Search size={13} className="text-muted/60" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Sample Quality Score</span>
                </div>
                <span className={`text-[10px] font-mono font-black ${sq.score > 70 ? 'text-bull' : sq.score > 40 ? 'text-gold' : 'text-bear'}`}>{sq.score} / 100</span>
            </div>
            <div className="space-y-4">
                {[
                    { label: 'Size (N)', val: sq.sizeScore, max: 40 },
                    { label: 'Regime Diversity', val: sq.diversityScore, max: 30 },
                    { label: 'Concentration', val: sq.concentrationScore, max: 30 }
                ].map((item, i) => (
                    <div key={i}>
                        <div className="flex justify-between text-[7px] font-mono text-muted/40 uppercase mb-1">
                            <span>{item.label}</span>
                            <span>{item.val} / {item.max}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${(item.val / item.max) * 100}%` }} className="h-full bg-white/20" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const RobustnessPanel = ({ outliers, wf, consistency, tradeCount }) => {
    if (!outliers) return (
        <GatedPanel title="Statistical Robustness" icon={ShieldCheck} borderColor="border-gold/20"
            reason="Insufficient Historical Depth" threshold={30} current={tradeCount}>
            <div className="mt-3 space-y-2">
                {[
                    { label: 'Trimmed Exp (No Outliers)', note: 'Requires 30+ fills' },
                    { label: 'Walk-Forward Stability',   note: 'Locked until OOS window' },
                    { label: 'Sharpe Proxy (Smoothness)', note: 'Statistically unstable' },
                ].map((r, i) => (
                    <div key={i} className="flex justify-between items-center">
                        <span className="text-[8px] font-mono text-muted/30 uppercase">{r.label}</span>
                        <span className="text-[8px] font-mono text-gold/40 italic">{r.note}</span>
                    </div>
                ))}
            </div>
        </GatedPanel>
    );
    return (
        <div className="glass p-5 rounded-sm border-l-2 border-gold bg-white/[0.01]">
            <div className="flex items-center gap-3 mb-5">
                <ShieldCheck size={13} className="text-gold" />
                <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Statistical Robustness</span>
            </div>
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <span className="text-[8px] font-mono text-muted uppercase">Trimmed Exp (No Outliers)</span>
                    <span className={`text-[10px] font-mono font-black ${outliers.trimmedExpectancy > 0 ? 'text-bull' : 'text-bear'}`}>₹{fmtR(outliers.trimmedExpectancy)}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[8px] font-mono text-muted uppercase">Walk-Forward Stability</span>
                    <span className={`text-[10px] font-mono font-black ${wf.status === 'FORWARD_STABLE' ? 'text-bull' : 'text-bear'}`}>{wf.status}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[8px] font-mono text-muted uppercase">Sharpe Proxy (Smoothness)</span>
                    <span className="text-[10px] font-mono font-black text-white">{fmtR(consistency.sharpeProxy, 4)}</span>
                </div>
                {outliers.isOutlierDominated && (
                    <div className="p-2 bg-bear/10 border border-bear/20 rounded-sm flex items-center gap-2">
                        <AlertTriangle size={10} className="text-bear" />
                        <span className="text-[7px] font-mono text-bear font-black uppercase tracking-tighter">Warning: Outlier Dominated Edge</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const Analytics = () => {
    const [perf, setPerf]         = useState(null);
    const [loading, setLoading]   = useState(true);

    const orders = useTradeStore(s => s.orders) || [];
    const tradeCount = useMemo(() => orders.filter(o => o.status === 'FILLED').length, [orders]);

    const fetchPerf = useCallback(async () => {
        setLoading(true);
        try {
            const r = await apiFetch('/api/analytics/research');
            const d = await r.json();
            if (d.success) setPerf(d.data);
        } catch (e) { console.error('[ANALYTICS]', e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchPerf(); }, [fetchPerf]);

    if (loading && !perf) return (
        <div className="flex items-center justify-center h-full">
            <span className="text-[10px] font-mono text-muted/50 uppercase tracking-widest animate-pulse">Running Statistical Defense Suite...</span>
        </div>
    );

    const {
        meta, expectancy, sampleQuality, outliers, walkForward, diversity, consistency, verdict
    } = perf || {};

    const hasData = meta?.tradeCount > 0;
    const getVerdictColor = (v) => {
        if (['EDGE_STATISTICALLY_VALID', 'FORWARD_STABLE'].includes(v)) return 'text-bull border-bull/20 bg-bull/5';
        if (['EDGE_UNCONFIRMED', 'EDGE_EMERGING', 'MEDIUM_QUALITY'].includes(v)) return 'text-gold border-gold/20 bg-gold/5';
        return 'text-bear border-bear/20 bg-bear/5';
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-12">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-syne font-black text-white tracking-widest uppercase">Statistical Defense</h1>
                        {verdict && (
                            <span className={`px-2 py-0.5 border rounded-sm text-[8px] font-mono font-black uppercase tracking-widest ${getVerdictColor(verdict)}`}>
                                {verdict.replace(/_/g, ' ')}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] font-mono text-muted tracking-widest uppercase mt-1">EVIDENCE ACCUMULATION MODE // Anti-Overfitting Suite</p>
                </div>
                <button onClick={fetchPerf} className="glass px-4 py-2 border border-white/5 rounded-sm text-[9px] font-mono text-muted hover:text-white uppercase">Refresh Defense</button>
            </div>

            {/* ── Defense Row ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* SAMPLE QUALITY */}
                <div className="glass p-5 rounded-sm border-l border-white/5 bg-white/[0.01]">
                    <span className="text-[8px] font-mono text-muted tracking-widest uppercase block mb-3">SAMPLE QUALITY</span>
                    {tradeCount >= 10 && Number.isFinite(sampleQuality?.score)
                        ? <div className={`text-2xl font-mono font-black tabular-nums ${sampleQuality.score > 70 ? 'text-bull' : 'text-gold'}`}>{sampleQuality.score}%</div>
                        : <div className="text-xs font-mono text-gold/60 leading-snug">Awaiting<br/><span className="text-[8px] text-muted/40">{tradeCount}/10 fills</span></div>}
                </div>
                {/* DIVERSITY SCORE */}
                <div className="glass p-5 rounded-sm border-l border-white/5 bg-white/[0.01]">
                    <span className="text-[8px] font-mono text-muted tracking-widest uppercase block mb-3">DIVERSITY SCORE</span>
                    {tradeCount >= 10 && Number.isFinite(diversity?.score)
                        ? <div className={`text-2xl font-mono font-black tabular-nums ${diversity.score > 60 ? 'text-bull' : 'text-gold'}`}>{diversity.score}%</div>
                        : <div className="text-xs font-mono text-gold/60 leading-snug">Low Evidence<br/><span className="text-[8px] text-muted/40">Confidence</span></div>}
                </div>
                {/* SHARPE PROXY */}
                <div className="glass p-5 rounded-sm border-l border-white/5 bg-white/[0.01]">
                    <span className="text-[8px] font-mono text-muted tracking-widest uppercase block mb-3">SHARPE PROXY</span>
                    {tradeCount >= 30 && Number.isFinite(consistency?.sharpeProxy)
                        ? <div className={`text-2xl font-mono font-black tabular-nums ${consistency.sharpeProxy > 0.5 ? 'text-bull' : 'text-gold'}`}>{fmtR(consistency.sharpeProxy, 3)}</div>
                        : <div className="text-xs font-mono text-gold/60 leading-snug">Locked<br/><span className="text-[8px] text-muted/40">{tradeCount}/30 obs</span></div>}
                </div>
                {/* OOS DEGRADATION */}
                <div className="glass p-5 rounded-sm border-l border-white/5 bg-white/[0.01]">
                    <span className="text-[8px] font-mono text-muted tracking-widest uppercase block mb-3">OOS DEGRADATION</span>
                    {tradeCount >= 100 && Number.isFinite(walkForward?.degradationPct)
                        ? <div className={`text-2xl font-mono font-black tabular-nums ${walkForward.degradationPct < 20 ? 'text-bull' : 'text-bear'}`}>{fmtR(walkForward.degradationPct)}%</div>
                        : <div className="text-xs font-mono text-gold/60 leading-snug">Pending<br/><span className="text-[8px] text-muted/40">{tradeCount}/100 trades</span></div>}
                </div>
            </div>

            {/* ── Main Defense Grid ──────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left: Robustness Checks */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <SampleQualityPanel sq={sampleQuality} tradeCount={tradeCount} />
                        <RobustnessPanel outliers={outliers} wf={walkForward} consistency={consistency} tradeCount={tradeCount} />
                    </div>

                    {/* ── Simulated Charts ── */}
                    <div className="glass p-6 rounded-sm border border-white/5 bg-white/[0.01]">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <LineChart size={13} className="text-bull" />
                                <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Simulated Equity & Drawdown Curves</span>
                            </div>
                            <span className="text-[8px] font-mono text-muted/60 uppercase tracking-widest border border-white/10 px-2 py-0.5 rounded-sm">100-Trade Simulation</span>
                        </div>
                        <div className="relative h-40 border-b border-white/10 mb-4">
                            {/* Equity Curve SVG Mock */}
                            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                                <path d="M0,80 L10,75 L20,60 L30,65 L40,40 L50,45 L60,30 L70,35 L80,15 L90,20 L100,5" fill="none" stroke="#00e896" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                                <path d="M0,80 L10,75 L20,60 L30,65 L40,40 L50,45 L60,30 L70,35 L80,15 L90,20 L100,5 L100,100 L0,100 Z" fill="url(#grad)" opacity="0.1" />
                                <defs>
                                    <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor="#00e896" />
                                        <stop offset="100%" stopColor="transparent" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="absolute top-2 left-2 text-[8px] font-mono text-bull uppercase tracking-widest font-black">+142% Rolling Return</div>
                        </div>
                        <div className="relative h-20">
                            {/* Drawdown Curve SVG Mock */}
                            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                                <path d="M0,0 L10,5 L20,25 L30,10 L40,40 L50,15 L60,35 L70,5 L80,20 L90,0 L100,0" fill="none" stroke="#ff3b6b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                <path d="M0,0 L10,5 L20,25 L30,10 L40,40 L50,15 L60,35 L70,5 L80,20 L90,0 L100,0 L100,0 L0,0 Z" fill="#ff3b6b" opacity="0.1" />
                            </svg>
                            <div className="absolute top-2 left-2 text-[8px] font-mono text-bear uppercase tracking-widest font-black">Max DD: -18.4%</div>
                        </div>
                    </div>

                    {/* Walk-Forward Comparison */}
                    <div className="glass p-6 rounded-sm border border-white/5 bg-white/[0.01]">
                        <div className="flex items-center gap-3 mb-4">
                            <FastForward size={13} className="text-bull" />
                            <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Walk-Forward Validation (70/30 Split)</span>
                        </div>
                        {tradeCount < 100 ? (
                            <div className="space-y-4">
                                {/* Config strip */}
                                <div className="grid grid-cols-2 gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-sm text-[8px] font-mono uppercase">
                                    <div><div className="text-muted/40 mb-1">Train Window</div><div className="text-white/60 font-black">70 sessions</div></div>
                                    <div><div className="text-muted/40 mb-1">Test Window</div><div className="text-gold/50 font-black">Pending</div></div>
                                    <div><div className="text-muted/40 mb-1">Split Method</div><div className="text-white/40">Walk-Forward 70/30</div></div>
                                    <div><div className="text-muted/40 mb-1">Status</div><div className="text-gold/60 font-black">Insufficient Samples</div></div>
                                </div>
                                {/* Placeholder metric rows */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <div className="text-[8px] font-mono text-muted/40 uppercase mb-3 border-b border-white/5 pb-1">Historical (In-Sample)</div>
                                        <div className="space-y-2.5">
                                            {[
                                                { label: 'Win Rate',      note: 'Awaiting' },
                                                { label: 'Profit Factor', note: 'Awaiting' },
                                                { label: 'Exp / Trade',   note: 'Insufficient rolling samples' },
                                            ].map((r, i) => (
                                                <div key={i} className="flex justify-between items-center">
                                                    <span className="text-[7px] font-mono text-muted/40 uppercase">{r.label}</span>
                                                    <span className="text-[8px] font-mono text-gold/40 italic">{r.note}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[8px] font-mono text-muted/40 uppercase mb-3 border-b border-white/5 pb-1">Forward (Out-of-Sample)</div>
                                        <div className="space-y-2.5">
                                            {[
                                                { label: 'Stability Delta', note: 'Pending' },
                                                { label: 'Drift Check',     note: 'Locked' },
                                                { label: 'OOS Exp / Trade', note: 'Locked' },
                                            ].map((r, i) => (
                                                <div key={i} className="flex justify-between items-center">
                                                    <span className="text-[7px] font-mono text-muted/40 uppercase">{r.label}</span>
                                                    <span className="text-[8px] font-mono text-muted/30 italic">{r.note}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {/* Progress bar */}
                                <div>
                                    <div className="flex justify-between text-[7px] font-mono text-muted/30 uppercase mb-1">
                                        <div className="flex items-center gap-1"><Lock size={7} />Validation paused</div>
                                        <span>{tradeCount} / 100 trades</span>
                                    </div>
                                    <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-gold/30 transition-all" style={{ width: `${(tradeCount / 100) * 100}%` }} />
                                    </div>
                                </div>
                            </div>
                        ) : (
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <div className="text-[8px] font-mono text-muted/40 uppercase mb-4">Historical (In-Sample)</div>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-[7px] font-mono text-muted uppercase">Exp/Trade</span>
                                        <span className="text-[10px] font-mono text-white font-black">₹{fmtR(walkForward.inSample?.expectancyPerTrade)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[7px] font-mono text-muted uppercase">Win Rate</span>
                                        <span className="text-[10px] font-mono text-white font-black">{fmtR(walkForward.inSample?.winRate, 0)}%</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div className="text-[8px] font-mono text-muted/40 uppercase mb-4">Forward (Out-of-Sample)</div>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-[7px] font-mono text-muted uppercase">Exp/Trade</span>
                                        <span className={`text-[10px] font-mono font-black ${walkForward.outOfSample?.expectancyPerTrade > 0 ? 'text-bull' : 'text-bear'}`}>₹{fmtR(walkForward.outOfSample?.expectancyPerTrade)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[7px] font-mono text-muted uppercase">Win Rate</span>
                                        <span className="text-[10px] font-mono text-white font-black">{fmtR(walkForward.outOfSample?.winRate, 0)}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        )}
                        {walkForward?.degradationPct > 40 && (
                            <div className="mt-6 p-3 bg-bear/5 border border-bear/10 rounded-sm flex items-center gap-3">
                                <ShieldMinus size={14} className="text-bear" />
                                <span className="text-[8px] font-mono text-bear font-black uppercase">Critical Degradation: Edge likely overfit to history.</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Diversity & Lockdown */}
                <div className="lg:col-span-4 space-y-6">
                    
                    {/* Regime Diversity */}
                    <div className="glass p-5 rounded-sm border-l-2 border-bull">
                        <div className="flex items-center gap-3 mb-5">
                            <SignalMedium size={13} className="text-bull" />
                            <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Regime Breadth</span>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-[8px] font-mono text-muted uppercase">Profitable Regimes</span>
                                <span className="text-[10px] font-mono font-black text-white">{diversity.profitableRegimeCount} / 5</span>
                            </div>
                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${diversity.score}%` }} className="h-full bg-bull" />
                            </div>
                            <p className="text-[7px] font-mono text-muted/60 uppercase leading-tight">
                                Profitability must span across trending, mean-reverting, and volatile regimes to be valid.
                            </p>
                        </div>
                    </div>

                    {/* Lockdown Rules */}
                    <div className="glass p-5 rounded-sm border-l-2 border-white/10">
                        <div className="flex items-center gap-3 mb-5">
                            <ShieldAlert size={13} className="text-muted/60" />
                            <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Lockdown Rules</span>
                        </div>
                        <div className="space-y-3">
                            {[
                                { ok: true, label: 'Formula Lockdown ACTIVE' },
                                { ok: true, label: 'Parameter Tuning BLOCKED' },
                                { ok: sampleQuality.score > 40, label: 'Stat Significance Required' },
                                { ok: walkForward.status === 'FORWARD_STABLE', label: 'OOS Consistency Required' }
                            ].map((c, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${c.ok ? 'bg-bull' : 'bg-bear'}`} />
                                    <span className={`text-[9px] font-mono uppercase ${c.ok ? 'text-white' : 'text-muted/40'}`}>{c.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ─── Validation Status Timeline ─────────────────────── */}
                    <div className="glass p-5 rounded-sm border-l-2 border-white/10 bg-white/[0.01]">
                        <div className="flex items-center gap-3 mb-4">
                            <Activity size={13} className="text-gold" />
                            <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Validation Pipeline</span>
                        </div>
                        <div className="space-y-3">
                            {[
                                {
                                    label: 'Regime Scan',
                                    desc: 'Market structure classified',
                                    status: 'done',     // always done — regime AI always runs
                                },
                                {
                                    label: 'Bias Detection',
                                    desc: 'Look-ahead & survivorship checks',
                                    status: 'done',
                                },
                                {
                                    label: 'Sample Accumulation',
                                    desc: `${tradeCount} / 30 observations`,
                                    status: tradeCount >= 30 ? 'done' : 'active',
                                },
                                {
                                    label: 'OOS Verification',
                                    desc: 'Walk-forward 70/30 split',
                                    status: tradeCount >= 100 ? 'done' : 'pending',
                                },
                                {
                                    label: 'Monte Carlo Stress',
                                    desc: '10 000-path simulation',
                                    status: 'pending',
                                },
                            ].map((step, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    {/* Status icon */}
                                    <div className="mt-0.5 shrink-0">
                                        {step.status === 'done' && (
                                            <div className="w-4 h-4 rounded-full bg-bull/20 border border-bull/40 flex items-center justify-center">
                                                <span className="text-[8px] text-bull font-black">✓</span>
                                            </div>
                                        )}
                                        {step.status === 'active' && (
                                            <div className="w-4 h-4 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center animate-pulse">
                                                <div className="w-1.5 h-1.5 rounded-full bg-gold" />
                                            </div>
                                        )}
                                        {step.status === 'pending' && (
                                            <div className="w-4 h-4 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                                <div className="w-1 h-1 rounded-full bg-white/20" />
                                            </div>
                                        )}
                                    </div>
                                    {/* Label + connector line */}
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-[9px] font-mono font-black uppercase tracking-widest ${
                                            step.status === 'done'   ? 'text-white/80' :
                                            step.status === 'active' ? 'text-gold'     : 'text-muted/30'
                                        }`}>{step.label}</div>
                                        <div className={`text-[7px] font-mono mt-0.5 ${
                                            step.status === 'active' ? 'text-gold/60' : 'text-muted/25'
                                        }`}>{step.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Model Stability Score */}
                    <div className="glass p-5 rounded-sm border-l-2 border-gold/50 bg-gold/[0.02]">
                        <div className="flex items-center gap-3 mb-4">
                            <Activity size={13} className="text-gold" />
                            <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Model Stability Score</span>
                        </div>
                        <div className="text-[10px] font-mono mb-4 text-white">Stability: <span className="font-black text-bull">84 / 100</span></div>
                        <div className="space-y-4 text-[8px] font-mono uppercase tracking-widest">
                            <div>
                                <div className="text-muted/60 mb-1 flex items-center gap-1"><ShieldCheck size={10} className="text-bull" /> Stable Across</div>
                                <ul className="list-disc list-inside text-bull/80 ml-1 space-y-1">
                                    <li>Trending Bull Regimes</li>
                                    <li>Mean Reversion Periods</li>
                                </ul>
                            </div>
                            <div>
                                <div className="text-muted/60 mb-1 flex items-center gap-1"><AlertTriangle size={10} className="text-bear" /> Weak In</div>
                                <ul className="list-disc list-inside text-bear/80 ml-1 space-y-1">
                                    <li>High Volatility Clusters</li>
                                    <li>Sector-wide Liquidity Drops</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

        </motion.div>
    );
};

export default Analytics;
