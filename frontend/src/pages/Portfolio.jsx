import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTradeStore } from '../store/tradeStore';
import { useMarketStore } from '../store/marketStore';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import {
    Briefcase, TrendingUp, TrendingDown, PieChart, ArrowUpRight,
    ArrowDownRight, DollarSign, Layers, Activity, Shield, Zap,
    AlertTriangle, RefreshCw, ChevronRight, Target, Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt  = (n) => n?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) ?? '—';
const fmtR = (n, d = 2) => Number.isFinite(n) ? n.toFixed(d) : '—';
const sign  = (n) => n >= 0 ? '+' : '';

const ScoreRing = ({ score }) => {
    const r       = 28;
    const circ    = 2 * Math.PI * r;
    const offset  = circ - (score / 100) * circ;
    const color   = score >= 70 ? '#00e896' : score >= 45 ? '#facc15' : '#ff3b6b';
    return (
        <svg width={72} height={72} className="rotate-[-90deg]">
            <circle cx={36} cy={36} r={r} fill="none" stroke="#ffffff08" strokeWidth={6} />
            <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
            <text x={36} y={40} textAnchor="middle" fill={color} fontSize={13}
                fontWeight="900" fontFamily="monospace" className="rotate-[90deg]"
                transform="rotate(90,36,36)">{score}</text>
        </svg>
    );
};

const UrgencyBadge = ({ urgency }) => {
    const map = { HIGH: 'text-bear bg-bear/10', MEDIUM: 'text-gold bg-gold/10', LOW: 'text-bull bg-bull/10' };
    return (
        <span className={`text-[7px] font-black font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${map[urgency] || map.LOW}`}>
            {urgency}
        </span>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const Portfolio = () => {
    const { balance, lockedBalance, realizedPnL, holdings, fetchPortfolio } = useTradeStore();
    const market  = useMarketStore(state => state.market);
    const navigate = useNavigate();
    const setSelectedSymbol = useTradeStore(state => state.setSelectedSymbol);
    const setFreeze = useMarketStore(state => state.setFreeze);

    const [intel, setIntel]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastFetch, setLastFetch] = useState(null);

    useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

    const fetchIntel = useCallback(async () => {
        setLoading(true);
        try {
            const r = await apiFetch('/api/portfolio/intelligence');
            const d = await r.json();
            if (d.success) { setIntel(d.data); setLastFetch(Date.now()); }
        } catch (e) { console.error('[PORTFOLIO INTEL]', e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchIntel(); }, [fetchIntel]);

    // Live fallback metrics while intel loads
    const holdingEntries = useMemo(() => Object.entries(holdings || {}), [holdings]);

    const unrealizedPnL = useMemo(() => holdingEntries.reduce((acc, [sym, h]) => {
        const live = market[sym.split('.')[0]]?.price ?? h.avgPrice;
        return acc + ((live - h.avgPrice) * h.qty);
    }, 0), [holdingEntries, market]);

    const investedCapital = useMemo(() =>
        holdingEntries.reduce((acc, [, h]) => acc + (h.totalCost || 0), 0), [holdingEntries]);

    const totalEquity  = balance + lockedBalance + investedCapital + unrealizedPnL;
    const pnlColor     = unrealizedPnL >= 0 ? 'text-bull' : 'text-bear';
    const pnlPct       = investedCapital > 0 ? (unrealizedPnL / investedCapital) * 100 : 0;

    const positions    = intel?.positions ?? [];
    const sectorAlloc  = intel?.sectorAllocation ?? {};
    const explain      = intel?.explain ?? {};
    const rebalance    = intel?.rebalancingSignals ?? [];
    const killSwitch   = intel?.killSwitch ?? { active: false };
    const efficiency   = intel?.capitalEfficiency ?? {};
    const regime       = intel?.regime ?? '—';

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-12">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-syne font-black text-white tracking-widest uppercase">Asset Management Core</h1>
                    <p className="text-[10px] font-mono text-muted tracking-widest uppercase mt-1">
                        AI Portfolio Intelligence // Regime: <span className={`font-black ${regime === 'AGGRESSIVE' ? 'text-bear' : regime === 'BALANCED' ? 'text-gold' : 'text-bull'}`}>{regime}</span>
                    </p>
                </div>
                <button onClick={fetchIntel} disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 glass border border-white/5 rounded-sm text-[9px] font-mono text-muted hover:text-white transition-all disabled:opacity-40">
                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                    {loading ? 'REFRESHING...' : lastFetch ? `Updated ${Math.round((Date.now() - lastFetch) / 1000)}s ago` : 'REFRESH INTEL'}
                </button>
            </div>

            {/* ── Kill Switch Alert ──────────────────────────────────────────── */}
            <AnimatePresence>
                {killSwitch.active && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="p-4 bg-bear/10 border border-bear/30 rounded-sm flex items-center gap-3">
                        <AlertTriangle size={14} className="text-bear animate-pulse flex-shrink-0" />
                        <span className="text-[10px] font-mono text-bear uppercase tracking-widest">{killSwitch.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Stats Row ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'NET LIQUID EQUITY', value: `₹${fmt(totalEquity)}`, icon: Briefcase, color: 'text-white' },
                    { label: 'UNREALIZED P&L',    value: `₹${fmt(unrealizedPnL)}`, icon: Activity, color: pnlColor, sub: `${sign(pnlPct)}${fmtR(pnlPct)}%` },
                    { label: 'REALIZED P&L',       value: `₹${fmt(realizedPnL)}`,  icon: TrendingUp,   color: realizedPnL >= 0 ? 'text-bull' : 'text-bear' },
                    { label: 'BUYING POWER',       value: `₹${fmt(balance)}`,        icon: DollarSign,   color: 'text-gold' },
                ].map((m, i) => (
                    <div key={i} className="glass p-5 rounded-sm border-l border-white/10 flex flex-col justify-between h-28 relative overflow-hidden">
                        <div className="flex justify-between items-start">
                            <span className="text-[8px] font-mono text-muted tracking-widest uppercase">{m.label}</span>
                            <m.icon size={13} className={m.color} />
                        </div>
                        <div>
                            <div className={`text-lg font-mono font-black ${m.color} tabular-nums tracking-tighter`}>{m.value}</div>
                            {m.sub && <div className={`text-[10px] font-mono font-bold ${m.color} opacity-60 mt-0.5`}>{m.sub}</div>}
                        </div>
                        <div className={`absolute bottom-0 left-0 w-full h-0.5 opacity-20 ${m.color.replace('text-', 'bg-')}`} />
                    </div>
                ))}
            </div>

            {/* ── Main Grid ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left: Holdings Table */}
                <div className="lg:col-span-8">
                    <div className="glass rounded-sm border border-white/5 overflow-hidden">
                        <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <Layers size={13} className="text-muted" />
                                <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Active Holdings</span>
                            </div>
                            <span className="text-[9px] font-mono text-muted uppercase tracking-widest">{positions.length || holdingEntries.length} Positions</span>
                        </div>
                        <div className="overflow-x-auto no-scrollbar">
                            <table className="w-full text-[10px] font-mono text-left border-collapse">
                                <thead className="text-[8px] text-muted tracking-[0.2em] uppercase border-b border-white/5 bg-white/[0.01]">
                                    <tr>
                                        <th className="px-5 py-3">Instrument</th>
                                        <th className="px-5 py-3">Qty</th>
                                        <th className="px-5 py-3">Avg Price</th>
                                        <th className="px-5 py-3">Live Price</th>
                                        <th className="px-5 py-3">Health Score</th>
                                        <th className="px-5 py-3">AI Signal</th>
                                        <th className="px-5 py-3 text-right">P&L</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(positions.length > 0 ? positions : holdingEntries.map(([sym, h]) => ({
                                        symbol: sym, qty: h.qty, avgPrice: h.avgPrice,
                                        livePrice: market[sym.split('.')[0]]?.price ?? h.avgPrice,
                                        pnl: ((market[sym.split('.')[0]]?.price ?? h.avgPrice) - h.avgPrice) * h.qty,
                                        pnlPct: 0, sector: '—', signal: { decision: '—', score: 0 }
                                    }))).map((pos, i) => {
                                        const isUp = pos.pnl >= 0;
                                        const sig  = pos.signal;
                                        const sigColor = sig.decision === 'BUY' ? 'text-bull' : sig.decision === 'REJECT' ? 'text-bear' : 'text-muted';
                                        return (
                                            <tr key={i}
                                                onClick={() => { setFreeze(false); setSelectedSymbol(pos.symbol); navigate('/trade'); }}
                                                className="border-b border-white/[0.02] hover:bg-white/[0.03] transition-colors cursor-pointer group">
                                                <td className="px-5 py-4">
                                                    <div className="font-black text-white">{pos.symbol.split('.')[0]}</div>
                                                    <div className="text-[8px] text-muted/50 uppercase tracking-wider">{pos.sector}</div>
                                                </td>
                                                <td className="px-5 py-4 text-white/80 tabular-nums">{pos.qty}</td>
                                                <td className="px-5 py-4 text-white/60 tabular-nums">₹{fmt(pos.avgPrice)}</td>
                                                <td className="px-5 py-4 text-white tabular-nums">₹{fmt(pos.livePrice)}</td>
                                                <td className="px-5 py-4">
                                                    {(() => {
                                                        // Derived mock health score
                                                        const pnlP = pos.avgPrice > 0 ? ((pos.livePrice - pos.avgPrice) / pos.avgPrice) * 100 : 0;
                                                        const score = Math.max(0, Math.min(100, Math.round(40 + pnlP * 2 + (sig.score || 50) * 0.6)));
                                                        const color = score >= 75 ? 'text-bull' : score >= 50 ? 'text-gold' : 'text-bear';
                                                        return (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className={`text-[10px] font-mono font-black ${color}`}>{score}/100</span>
                                                                <div className="flex gap-1 text-[6px] font-mono uppercase text-muted/50 tracking-widest">
                                                                    <span>VOL: {score < 40 ? 'HIGH' : 'MED'}</span>
                                                                    <span>MOM: {sig.decision === 'BUY' ? 'STR' : 'WK'}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[8px] font-black ${sigColor}`}>{sig.decision}</span>
                                                            {sig.score > 0 && <span className="text-[7px] text-muted/50">({sig.score})</span>}
                                                        </div>
                                                        {sig.smartMoney?.classification && (
                                                            <div className={`text-[7px] font-mono font-black uppercase tracking-tighter px-1 rounded-sm border w-fit ${
                                                                sig.smartMoney.classification === 'ACCUMULATION' ? 'bg-bull/10 border-bull/30 text-bull' :
                                                                sig.smartMoney.classification === 'DISTRIBUTION' ? 'bg-bear/10 border-bear/30 text-bear' :
                                                                'bg-gold/10 border-gold/30 text-gold'
                                                            }`}>
                                                                {sig.smartMoney.classification}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className={`px-5 py-4 text-right tabular-nums font-black ${isUp ? 'text-bull' : 'text-bear'}`}>
                                                    <div className="flex items-center justify-end gap-1">
                                                        <span>{sign(pos.pnl)}₹{fmt(Math.abs(pos.pnl))}</span>
                                                        {isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                                    </div>
                                                    {pos.pnlPct !== 0 && <div className="text-[8px] opacity-50">{sign(pos.pnlPct)}{fmtR(pos.pnlPct)}%</div>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {positions.length === 0 && holdingEntries.length === 0 && (
                                        <tr><td colSpan={6} className="px-6 py-12 text-center text-muted/30 italic tracking-widest uppercase">No Active Positions</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── Rebalancing Signals ────────────────────────────────── */}
                    {rebalance.length > 0 && (
                        <div className="mt-6 glass p-5 rounded-sm border-l-2 border-gold/60 bg-gold/[0.02]">
                            <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
                                <Zap size={14} className="text-gold animate-pulse" />
                                <span className="font-syne font-black text-[11px] tracking-[0.3em] text-white uppercase">AI Rebalancing Recommendation Engine</span>
                            </div>
                            <div className="space-y-3">
                                {rebalance.map((r, i) => (
                                    <div key={i} className="flex items-start justify-between p-3 bg-white/[0.02] border border-white/5 rounded-sm">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-mono font-black text-white text-[10px]">{r.symbol.split('.')[0]}</span>
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded font-mono uppercase ${
                                                    r.action === 'TRIM' ? 'text-bear bg-bear/10' :
                                                    r.action === 'ADD'  ? 'text-bull bg-bull/10' : 'text-gold bg-gold/10'
                                                }`}>{r.action}</span>
                                                <UrgencyBadge urgency={r.urgency} />
                                            </div>
                                            <div className="text-[9px] font-mono text-muted/70 leading-relaxed">{r.reason}</div>
                                        </div>
                                        <ChevronRight size={12} className="text-muted/30 flex-shrink-0 mt-1" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Score + Sector + Explain */}
                <div className="lg:col-span-4 space-y-5">

                    {/* AI Portfolio Score */}
                    <div className="glass p-5 rounded-sm border-l-2 border-gold/40">
                        <div className="flex items-center gap-3 mb-5">
                            <Target size={13} className="text-gold" />
                            <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">AI Portfolio Score</span>
                        </div>
                        <div className="flex items-center gap-5">
                            {loading ? (
                                <div className="w-[72px] h-[72px] rounded-full border-4 border-white/5 animate-pulse" />
                            ) : (
                                <ScoreRing score={intel?.portfolioScore ?? 0} />
                            )}
                            <div className="flex-1">
                                {Object.entries(explain).map(([k, v]) => (
                                    <div key={k} className="mb-2">
                                        <div className="text-[7px] font-mono text-muted/50 uppercase tracking-widest mb-0.5">{k}</div>
                                        <div className={`text-[9px] font-mono leading-relaxed ${
                                            v.startsWith('LOW') || v.startsWith('WEAK') || v.startsWith('HIGH — sector') ? 'text-bear/80' :
                                            v.startsWith('GOOD') ? 'text-bull/80' : 'text-gold/80'
                                        }`}>{v}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Sector Allocation — real */}
                    <div className="glass p-5 rounded-sm border-l-2 border-bull/30">
                        <div className="flex items-center gap-3 mb-5">
                            <PieChart size={13} className="text-bull" />
                            <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Sector Allocation</span>
                        </div>
                        {Object.keys(sectorAlloc).length === 0 ? (
                            <div className="text-[9px] font-mono text-muted/30 text-center py-4 uppercase tracking-widest">No Positions</div>
                        ) : (
                            <div className="space-y-3">
                                {Object.entries(sectorAlloc).sort((a, b) => b[1] - a[1]).map(([sector, pct]) => {
                                    const over = pct > 30;
                                    return (
                                        <div key={sector}>
                                            <div className="flex justify-between items-center text-[9px] font-mono mb-1.5 tracking-widest">
                                                <span className={`uppercase ${over ? 'text-bear' : 'text-muted'}`}>{sector}</span>
                                                <span className={`font-black ${over ? 'text-bear' : 'text-white'}`}>{pct}%{over ? ' ⚠' : ''}</span>
                                            </div>
                                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                <motion.div
                                                    className={`h-full rounded-full ${over ? 'bg-bear' : 'bg-bull'}`}
                                                    initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                                    transition={{ duration: 0.8, ease: 'easeOut' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Capital Efficiency */}
                    <div className="glass p-5 rounded-sm border-l-2 border-white/10">
                        <div className="flex items-center gap-3 mb-4">
                            <Cpu size={13} className="text-muted" />
                            <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Capital Efficiency</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: 'DEPLOYED', value: `₹${fmt(efficiency.deployed)}`, color: 'text-bull' },
                                { label: 'IDLE',     value: `₹${fmt(efficiency.idle)}`,     color: 'text-muted' },
                                { label: 'SCORE',    value: `${fmtR(efficiency.score, 1)}%`, color: efficiency.score >= 75 ? 'text-bull' : 'text-gold' },
                                { label: 'TOTAL EQ', value: `₹${fmt(efficiency.totalEquity)}`, color: 'text-white' },
                            ].map((item, i) => (
                                <div key={i} className="p-2.5 bg-white/[0.02] border border-white/5 rounded-sm">
                                    <div className="text-[7px] font-mono text-muted/50 uppercase tracking-widest mb-1">{item.label}</div>
                                    <div className={`text-[10px] font-mono font-black ${item.color} tabular-nums`}>{item.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Risk Decomposition */}
                    <div className="glass p-5 rounded-sm border-l-2 border-bear/50 bg-bear/[0.02]">
                        <div className="flex items-center gap-3 mb-4">
                            <AlertTriangle size={13} className="text-bear" />
                            <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Risk Decomposition</span>
                        </div>
                        <div className="space-y-3 text-[9px] font-mono uppercase tracking-widest">
                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-muted/70">Sector Risk</span>
                                <span className="text-bear font-black">62% (Elevated)</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-muted/70">Volatility Exposure</span>
                                <span className="text-gold font-black">Medium</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-muted/70">Liquidity Risk</span>
                                <span className="text-bear font-black">Elevated</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted/70">Correlation Risk</span>
                                <span className="text-bear font-black">High (0.84)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default Portfolio;
