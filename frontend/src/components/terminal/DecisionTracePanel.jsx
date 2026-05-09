import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, CheckCircle, XCircle, AlertCircle, Zap, ArrowDown, Shield } from 'lucide-react';

export const reasonMap = {
    UNKNOWN_SECTOR_BLOCK: "Sector risk restriction triggered",
    DUPLICATE_POSITION: "Already holding this asset",
    HIGH_VOLATILITY: "Market too volatile",
    LOW_CONFIDENCE: "Score below execution threshold",
    WEAK_ML_CONFIDENCE: "Score below execution threshold",
    TOO_MANY_ORDERS: "Spam protection triggered",
    SECTOR_CAP_EXCEEDED: "Maximum sector exposure reached",
    LOW_RISK_SCORE: "Inadequate risk/reward profile",
    FAIL_SAFE_BLOCK: "System integrity protect",
    LOGIC_SAFE: "Parameters within safe bounds"
};

// ─── Layer Row ─────────────────────────────────────────────────────────────
const LayerRow = ({ index, label, sublabel, value, color, icon: Icon, iconColor, badge }) => (
    <div className="relative">
        <div className="flex items-center gap-3 p-2.5 rounded-sm bg-white/[0.03] border border-white/5">
            {/* Step number */}
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black font-mono shrink-0 ${color === 'bull' ? 'bg-bull/20 text-bull border border-bull/30' : color === 'bear' ? 'bg-bear/20 text-bear border border-bear/30' : 'bg-gold/20 text-gold border border-gold/30'}`}>
                {index}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[8px] font-mono text-muted uppercase tracking-widest">{label}</div>
                {sublabel && <div className="text-[7px] font-mono text-white/30 uppercase tracking-wider mt-0.5">{sublabel}</div>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
                {badge}
                <div className={`flex items-center gap-1 ${color === 'bull' ? 'text-bull' : color === 'bear' ? 'text-bear' : 'text-gold'}`}>
                    {Icon && <Icon size={10} className={iconColor || ''} />}
                    <span className={`text-[11px] font-black font-mono tracking-widest`}>{value}</span>
                </div>
            </div>
        </div>
    </div>
);

// ─── Arrow connector ────────────────────────────────────────────────────────
const FlowArrow = ({ blocked }) => (
    <div className="flex items-center justify-center py-1 relative">
        <div className={`h-4 w-px ${blocked ? 'bg-bear/40' : 'bg-white/10'}`} />
        <ArrowDown size={10} className={`absolute bottom-0 ${blocked ? 'text-bear/60' : 'text-white/20'}`} />
    </div>
);

// ─── Main Component ─────────────────────────────────────────────────────────
export const DecisionTracePanel = ({ trace, mode = 'PREVIEW', loading = false }) => {
    if (loading) return (
        <div className="mb-4 p-4 glass border border-white/5 rounded-sm animate-pulse flex flex-col items-center justify-center min-h-[120px]">
            <Cpu size={24} className="text-gold mb-3 animate-spin" />
            <span className="text-[10px] font-syne font-black text-gold tracking-[0.3em] uppercase">Analyzing AI Decision...</span>
        </div>
    );

    if (!trace) return null;

    const { ml, risk, final } = trace;
    const isApproved = final === 'APPROVED' || final === 'FILLED';

    // ✅ Single source of truth — ALWAYS from trace, no local recompute
    const score     = trace.score ?? Math.round((ml?.confidence ?? 0) * 100);
    const decision  = trace.decision ?? 'REJECT';   // AI Strategy layer
    const breakout  = trace.breakout ?? false;
    const sectorFlow = trace.sectorFlow ?? 0;
    const riskStatus = trace.riskStatus ?? (risk?.passed ? 'passed' : 'failed');
    const finalDecision = trace.finalDecision ?? (isApproved ? 'APPROVED' : 'REJECTED');

    // Color helpers
    const strategyColor = decision === 'BUY' ? 'bull' : decision === 'HOLD' ? 'gold' : 'bear';
    const riskColor     = riskStatus === 'passed' ? 'bull' : 'bear';
    const execColor     = finalDecision === 'APPROVED' ? 'bull' : 'bear';

    const scoreBarColor = decision === 'BUY' ? 'bg-bull' : decision === 'HOLD' ? 'bg-gold' : 'bg-bear';

    // ── Override explanation ─────────────────────────────────────────────────
    // When AI says BUY but risk blocks → this is EXPECTED behavior, not a bug
    const isOverridden = decision !== 'REJECT' && finalDecision === 'REJECTED';
    // When strategy rejects even before risk gets a say
    const isStrategyRejected = decision === 'REJECT' && finalDecision === 'REJECTED';

    const overrideLabel = isOverridden
        ? `AI signal blocked by risk engine (safety override)`
        : isStrategyRejected
        ? `Strategy rejected — conditions not met`
        : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 p-4 glass rounded-sm relative overflow-hidden transition-all duration-500 ${
                mode === 'PREVIEW' ? 'border-dashed border-2 border-white/10' : 'border border-white/20'
            }`}
        >
            {/* Left accent bar — overall outcome color */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isApproved ? 'bg-bull shadow-[0_0_12px_#00e896]' : 'bg-bear shadow-[0_0_12px_#ff4466]'}`} />

            {/* ── Header ────────────────────────────────────────────────── */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                    <span className="text-[9px] font-syne font-black text-white/40 tracking-[0.4em] uppercase">
                        {mode} MODE // PHASE 17 TRACE
                    </span>
                    <span className="text-[7px] font-mono text-white/20 uppercase tracking-widest mt-0.5">
                        3-Layer Decision Architecture
                    </span>
                </div>

                {/* Overall badge */}
                <div className="flex flex-col items-end gap-1">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-syne font-black tracking-widest uppercase border animate-pulse ${
                        isApproved
                            ? 'bg-bull/20 text-bull border-bull/30 shadow-bull/20'
                            : 'bg-bear/20 text-bear border-bear/30 shadow-bear/20'
                    } shadow-lg`}>
                        {isApproved ? '● APPROVED' : '● REJECTED'}
                    </span>
                    {/* AI Signal badge when BUY but not executed */}
                    {isOverridden && (
                        <span className="px-2 py-0.5 rounded-sm bg-gold/10 border border-gold/20 text-[7px] font-mono text-gold tracking-wider uppercase">
                            AI Signal: {decision} (Not Executed)
                        </span>
                    )}
                </div>
            </div>

            {/* ── 3-Layer Flow ──────────────────────────────────────────── */}
            <div className="mb-4 space-y-0">

                {/* LAYER 1: AI Strategy */}
                <LayerRow
                    index="1"
                    label="AI Strategy"
                    sublabel="Prometheus V5 model output"
                    value={decision}
                    color={strategyColor}
                    icon={decision === 'BUY' ? Zap : decision === 'HOLD' ? Shield : XCircle}
                    badge={breakout && (
                        <span className="px-1 py-0.5 rounded-sm bg-bull/20 text-[7px] font-mono text-bull border border-bull/30 animate-pulse flex items-center gap-0.5">
                            <Zap size={7} />BREAKOUT
                        </span>
                    )}
                />

                <FlowArrow blocked={decision === 'REJECT'} />

                {/* LAYER 2: Risk Engine — numeric score + outcome tag */}
                <LayerRow
                    index="2"
                    label="Risk Engine"
                    sublabel={riskStatus === 'failed' ? (reasonMap[risk?.reason] || risk?.reason || 'Risk check failed') : 'All checks passed'}
                    value={`${(risk?.riskScore ?? 0).toFixed(2)} (${riskStatus === 'passed' ? 'PASS' : 'FAIL'})`}
                    color={riskColor}
                    icon={riskStatus === 'passed' ? CheckCircle : XCircle}
                />

                <FlowArrow blocked={!isApproved} />

                {/* LAYER 3: Execution Result */}
                <LayerRow
                    index="3"
                    label="Execution Result"
                    sublabel="Final gate — requires ALL layers to pass"
                    value={finalDecision}
                    color={execColor}
                    icon={isApproved ? CheckCircle : XCircle}
                />
            </div>

            {/* ── Override Explanation Banner ───────────────────────────── */}
            {overrideLabel && (
                <div className={`mb-4 px-3 py-2 rounded-sm flex items-center gap-2.5 ${
                    isOverridden
                        ? 'bg-gold/5 border border-gold/15'
                        : 'bg-bear/5 border border-bear/15'
                }`}>
                    <AlertCircle size={12} className={isOverridden ? 'text-gold shrink-0' : 'text-bear shrink-0'} />
                    <span className={`text-[9px] font-mono tracking-wide ${isOverridden ? 'text-gold/80' : 'text-bear/80'}`}>
                        {overrideLabel}
                    </span>
                </div>
            )}

            {/* ── Score + Sector Flow ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-2.5 rounded-sm bg-black/40 border border-white/10 shadow-inner">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[8px] font-mono text-muted uppercase tracking-widest">P17 Score</span>
                        {trace.learningAdjustment?.active && (
                            <span className="text-[7px] font-mono text-gold/60 italic">Adjusted</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-white/5 rounded-none overflow-hidden flex gap-0.5">
                            {[...Array(10)].map((_, i) => {
                                const active = score >= (i + 1) * 10;
                                return (
                                    <div 
                                        key={i} 
                                        className={`flex-1 h-full transition-all duration-700 ${
                                            active ? scoreBarColor : 'bg-white/5'
                                        } ${active && i === Math.floor(score/10) ? 'animate-pulse' : ''}`}
                                    />
                                );
                            })}
                        </div>
                        <span className={`text-[13px] font-black font-mono tabular-nums ${
                            decision === 'BUY' ? 'text-bull' : decision === 'HOLD' ? 'text-gold' : 'text-bear'
                        }`}>{Math.round(score)}</span>
                    </div>
                </div>
                <div className="p-2.5 rounded-sm bg-black/40 border border-white/10 shadow-inner">
                    <div className="text-[8px] font-mono text-muted uppercase tracking-widest mb-1.5">Sector Flow</div>
                    <div className="flex items-baseline gap-1.5">
                        <span className={`text-[13px] font-black font-mono ${
                            sectorFlow > 0 ? 'text-bull' : sectorFlow < 0 ? 'text-bear' : 'text-muted'
                        }`}>
                            {sectorFlow > 0 ? '+' : ''}{Number(sectorFlow).toFixed(2)}%
                        </span>
                        <span className="text-[7px] font-mono text-white/20 uppercase tracking-tighter">Relative Pulse</span>
                    </div>
                </div>
            </div>

            {/* ── Intelligence Alignment & Penalties ── */}
            {trace.learningAdjustment?.active && (
                <div className="mb-4 p-2.5 rounded-sm bg-gold/5 border border-gold/10 space-y-2">
                    <div className="flex justify-between items-center text-[8px] font-mono border-b border-gold/10 pb-1">
                        <span className="text-gold/60 uppercase tracking-widest flex items-center gap-1.5">
                            <Cpu size={8} /> Intelligence Calibration
                        </span>
                        <span className="text-gold/40">Fusion Factor: {trace.learningAdjustment.alignmentFactor || '1.00'}</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5">
                        {/* 🚀 Active Intelligence Tags: Renders all dampers (Divergence, Volatility, etc.) */}
                        {trace.learningAdjustment.penalties?.map(p => (
                            <span key={p} className={`px-1.5 py-0.5 rounded-none border text-[8px] font-mono font-bold uppercase tracking-tighter shadow-sm ${
                                p.includes('BOOST') 
                                    ? 'bg-bull/10 border-bull/30 text-bull' 
                                    : 'bg-bear/10 border-bear/30 text-bear'
                            }`}>
                                ● {p.replace(/_/g, ' ')}
                            </span>
                        ))}
                    </div>
                </div>
            )}


            {/* ── Risk Guard Checks + Engine Weights (2-col) ───────────── */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <span className="text-[8px] font-mono text-muted uppercase tracking-widest block border-b border-white/5 pb-1">Risk Guard Checks</span>
                    {Object.entries(risk?.checks || {}).map(([check, passed]) => (
                        <div key={check} className="flex justify-between items-center text-[9px] font-mono">
                            <span className="text-white/50 capitalize">{check}:</span>
                            {passed
                                ? <CheckCircle size={10} className="text-bull" />
                                : <XCircle size={10} className="text-bear" />
                            }
                        </div>
                    ))}
                </div>

                {ml?.factors && (
                    <div className="space-y-1.5">
                        <span className="text-[8px] font-mono text-muted uppercase tracking-widest block border-b border-white/5 pb-1">Engine Weights</span>
                        {Object.entries(ml.factors).map(([f, val]) => {
                            const pct = Math.abs(val) > 1 ? Math.min(Math.abs(val) * 50, 100) : Math.abs(val) * 100;
                            const barColor = pct > 65 ? 'bg-bull' : pct > 40 ? 'bg-gold' : 'bg-bear';
                            return (
                                <div key={f} className="flex justify-between items-center text-[9px] font-mono">
                                    <span className="text-white/40 capitalize">{f}:</span>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-10 h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div className={`h-full ${barColor} opacity-60`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-white/70 tabular-nums w-7 text-right">
                                            {val > 0 ? '+' : ''}{(val * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Source footer ─────────────────────────────────────────── */}
            <div className="mt-3 pt-2 border-t border-white/5 flex justify-between text-[8px] font-mono text-white/20 uppercase tracking-widest">
                <span>Source: YFinance / Node</span>
                <span>Data Quality: {trace.quality ?? (ml?.confidence ? Math.round(ml.confidence * 100) : '—')}%</span>
            </div>
        </motion.div>
    );
};
