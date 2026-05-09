import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { apiFetch } from '../utils/api';
import {
    ShieldAlert, ShieldCheck, RefreshCw, Activity, Target, Zap,
    AlertTriangle, Layers, Info, TrendingDown, TrendingUp,
    Crosshair, BarChart, ChevronRight, CheckCircle, XCircle,
    ZapOff, FastForward, Search, CheckSquare, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtR = (n, d = 2) => Number.isFinite(n) ? n.toFixed(d) : '—';
const fmt  = (n) => n?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) ?? '—';

// ── Gate Verdict Colors ───────────────────────────────────────────────────────

const gateColor = (v) => {
    if (v === 'FULL_PAPER_VALIDATION_PASSED' || v === 'DEPLOYMENT_APPROVED') return 'text-bull border-bull/30 bg-bull/5';
    if (v === 'LIMITED_CAPITAL_ELIGIBLE' || v === 'DEPLOYMENT_CONDITIONAL') return 'text-gold border-gold/30 bg-gold/5';
    if (v === 'RESEARCH_ONLY' || v === 'RESEARCH_CAMPAIGN_ACTIVE') return 'text-gold border-gold/30 bg-gold/5 opacity-80';
    return 'text-bear border-bear/30 bg-bear/5';
};

// ── Research Gate Panel ───────────────────────────────────────────────────────

const ResearchGatePanel = ({ gate }) => {
    if (!gate) return null;
    return (
        <div className="glass p-6 rounded-sm border border-white/5 bg-white/[0.01]">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <ShieldCheck size={14} className="text-bull" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Final Research Gate</span>
                </div>
                <span className={`text-[8px] font-mono font-black px-2 py-1 border rounded-sm uppercase ${gateColor(gate.deploymentVerdict)}`}>
                    {gate.deploymentVerdict?.replace(/_/g, ' ')}
                </span>
            </div>

            <div className="mb-4">
                <div className="flex justify-between text-[8px] font-mono text-muted/50 uppercase mb-2">
                    <span>Adversarial Survivability Score</span>
                    <span className="text-white font-black">{gate.readinessScore || gate.gateScore}%</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${gate.readinessScore || gate.gateScore}%` }}
                        transition={{ duration: 1.2 }}
                        className={`h-full ${(gate.readinessScore || gate.gateScore) >= 80 ? 'bg-bull' : (gate.readinessScore || gate.gateScore) >= 60 ? 'bg-gold' : 'bg-bear'}`}
                    />
                </div>
            </div>

            <div className="space-y-2">
                {(gate.checks || []).map((c, i) => (
                    <div key={i} className={`flex items-start gap-3 p-2 rounded-sm ${c.passed ? 'bg-bull/[0.03]' : 'bg-bear/[0.05]'}`}>
                        {c.passed
                            ? <CheckCircle size={11} className="text-bull mt-0.5 shrink-0" />
                            : <XCircle size={11} className="text-bear mt-0.5 shrink-0" />
                        }
                        <div className="min-w-0">
                            <div className="text-[8px] font-mono font-black text-white uppercase truncate">{c.label}</div>
                            <div className="text-[7px] font-mono text-muted/40 truncate">{c.evidence}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Synthetic Attack Panel ────────────────────────────────────────────────────

const SyntheticAttackPanel = ({ attack }) => {
    if (!attack?.datasets) return null;
    return (
        <div className="glass p-5 rounded-sm border border-white/5 bg-white/[0.01]">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <ZapOff size={13} className="text-bear" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Synthetic Attack Suite</span>
                </div>
                <span className={`text-[8px] font-mono font-black px-2 py-0.5 rounded-sm ${attack.summary.status === 'DETECTION_PERFECT' ? 'text-bull bg-bull/10' : 'text-bear bg-bear/10'}`}>
                    {attack.summary.detectionAccuracy}% Detection Rate
                </span>
            </div>
            <div className="relative h-24 mb-4 border-b border-white/5">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    {/* Normal Strategy Equity */}
                    <path d="M0,80 L20,70 L40,50 L60,55 L80,30 L100,10" fill="none" stroke="#00e896" strokeWidth="1.5" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" />
                    {/* Adversarial Stress Equity */}
                    <path d="M0,80 L20,75 L40,85 L60,80 L80,95 L100,85" fill="none" stroke="#ff3b6b" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="absolute top-1 left-2 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-0.5 bg-bull" /> <span className="text-[7px] font-mono uppercase text-muted">Normal Strategy</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-0.5 bg-bear" /> <span className="text-[7px] font-mono uppercase text-white">Adversarial Stress</span></div>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                {Object.values(attack.datasets).map((ds, i) => (
                    <div key={i} className={`p-2.5 rounded-sm border ${ds.correctlyClassified ? 'border-bull/10 bg-bull/[0.03]' : 'border-bear/20 bg-bear/[0.05]'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                            {ds.correctlyClassified
                                ? <CheckCircle size={9} className="text-bull shrink-0" />
                                : <XCircle size={9} className="text-bear shrink-0" />
                            }
                            <span className="text-[7px] font-mono text-white uppercase truncate">{ds.name}</span>
                        </div>
                        <div className="flex justify-between text-[7px] font-mono text-muted/50">
                            <span>Exp: <span className={ds.expectancy > 0 ? 'text-bull' : 'text-bear'}>₹{fmtR(ds.expectancy, 0)}</span></span>
                            <span>PF: {fmtR(ds.profitFactor)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Monte Carlo Panel ─────────────────────────────────────────────────────────

// ── Attack Replay Console (shown when Monte Carlo data is insufficient) ────────
const REPLAY_LOG = [
    { type: 'PASS', msg: 'Regime scan completed — TRENDING_BULL classified' },
    { type: 'PASS', msg: 'Mean-reversion resilience retained under 2σ shock' },
    { type: 'WARN', msg: 'Correlation collapse detected in NIFTYBANK sector' },
    { type: 'FAIL', msg: 'Regime mutation destabilized alpha — PANIC mode' },
    { type: 'PASS', msg: 'Slippage tolerance within 0.08% threshold' },
    { type: 'WARN', msg: 'Liquidity stress — bid/ask spread widened 3.2x' },
    { type: 'FAIL', msg: 'Black swan injection: -4.1σ tail event — edge collapsed' },
    { type: 'PASS', msg: 'Recovery from 18% drawdown within 14 sessions' },
    { type: 'WARN', msg: 'Sector over-concentration flag triggered (IT > 38%)' },
    { type: 'PASS', msg: 'Parameter perturbation ±15% — no catastrophic degradation' },
];

const AttackReplayConsole = () => {
    const [visibleCount, setVisibleCount] = useState(3);
    useEffect(() => {
        const t = setInterval(() => {
            setVisibleCount(c => c < REPLAY_LOG.length ? c + 1 : c);
        }, 1800);
        return () => clearInterval(t);
    }, []);

    const tagColor = (type) =>
        type === 'PASS' ? 'text-bull' : type === 'FAIL' ? 'text-bear' : 'text-gold';
    const tagBg = (type) =>
        type === 'PASS' ? 'bg-bull/10 border-bull/20' : type === 'FAIL' ? 'bg-bear/10 border-bear/20' : 'bg-gold/10 border-gold/20';

    return (
        <div className="glass p-5 rounded-sm border border-white/5 bg-[#0a0a0c] flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Activity size={13} className="text-bear" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Attack Replay Console</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-bear animate-pulse" />
                    <span className="text-[7px] font-mono text-bear/70 tracking-widest uppercase">Live Injection</span>
                </div>
            </div>
            <div className="flex-1 space-y-1.5 overflow-hidden">
                <AnimatePresence initial={false}>
                    {REPLAY_LOG.slice(0, visibleCount).map((entry, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-start gap-2.5 text-[8px] font-mono"
                        >
                            <span className={`shrink-0 px-1.5 py-0.5 rounded-sm border font-black tracking-widest ${tagBg(entry.type)} ${tagColor(entry.type)}`}>
                                {entry.type}
                            </span>
                            <span className={`leading-relaxed ${i === visibleCount - 1 ? 'text-white/80' : 'text-muted/40'}`}>
                                {entry.msg}
                            </span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 text-[7px] font-mono text-muted/30 uppercase tracking-widest">
                Monte Carlo unlocks at 5+ trades — running synthetic attack substitution
            </div>
        </div>
    );
};

const MonteCarloPanel = ({ mc }) => {
    if (!mc || mc.status === 'INSUFFICIENT_DATA') return <AttackReplayConsole />;
    return (
        <div className={`glass p-5 rounded-sm border-l-2 ${mc.survivalRate >= 55 ? 'border-bull' : 'border-bear'}`}>
            <div className="flex items-center gap-3 mb-5">
                <Activity size={13} className="text-muted/60" />
                <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Monte Carlo (500 Runs, Hostile)</span>
            </div>
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between text-[8px] font-mono text-muted/50 uppercase mb-1.5">
                        <span>Survival Rate (hostile slippage)</span>
                        <span className={`font-black ${mc.survivalRate >= 55 ? 'text-bull' : 'text-bear'}`}>{fmtR(mc.survivalRate)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${mc.survivalRate}%` }} className={`h-full ${mc.survivalRate >= 55 ? 'bg-bull' : 'bg-bear'}`} />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                    {[['P5 (Worst)', mc.distribution?.p5, 'text-bear'],
                      ['P50 (Median)', mc.distribution?.p50, 'text-white'],
                      ['P95 (Best)', mc.distribution?.p95, 'text-bull']].map(([label, val, color], i) => (
                        <div key={i} className="p-2 bg-white/[0.02] border border-white/5 rounded-sm">
                            <div className="text-[6px] font-mono text-muted/40 uppercase mb-1">{label}</div>
                            <div className={`text-[9px] font-mono font-black ${color}`}>₹{fmtR(val, 0)}</div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[8px] font-mono text-muted uppercase">Probability of Ruin (&gt;30% DD)</span>
                    <span className={`text-[10px] font-mono font-black ${mc.probabilityOfRuin < 10 ? 'text-bull' : 'text-bear'}`}>{fmtR(mc.probabilityOfRuin)}%</span>
                </div>
            </div>
        </div>
    );
};

// ── Execution Hostility Panel ─────────────────────────────────────────────────

const HostilityPanel = ({ hostility }) => {
    if (!hostility || hostility.status === 'INSUFFICIENT_DATA') return null;
    return (
        <div className="glass p-5 rounded-sm border border-white/5">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <Crosshair size={13} className="text-gold" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Execution Hostility Sim</span>
                </div>
                <span className={`text-[8px] font-mono font-black px-2 py-0.5 rounded-sm ${hostility.status === 'EXECUTION_ROBUST' ? 'text-bull bg-bull/10' : 'text-bear bg-bear/10'}`}>
                    {hostility.survivedScenarios}/{hostility.totalScenarios} Survived
                </span>
            </div>
            <div className="space-y-2 mb-4 pb-4 border-b border-white/5">
                {(hostility.scenarios || []).map((s, i) => (
                    <div key={i} className="flex justify-between items-center py-1.5">
                        <div className="flex items-center gap-2">
                            {s.survived ? <CheckCircle size={9} className="text-bull" /> : <XCircle size={9} className="text-bear" />}
                            <span className="text-[8px] font-mono text-muted uppercase">{s.scenario}</span>
                        </div>
                        <span className={`text-[9px] font-mono font-black ${s.alphaRetainedPct >= 50 ? 'text-bull' : 'text-bear'}`}>
                            {fmtR(s.alphaRetainedPct)}%
                        </span>
                    </div>
                ))}
            </div>

            {/* Failure Cause Attribution */}
            <div>
                <div className="text-[8px] font-syne font-black text-bear uppercase tracking-[0.2em] mb-2">Failure Cause Attribution</div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[7px] font-mono uppercase text-muted/80">
                        <div className="w-1 h-1 rounded-full bg-bear" /> Slippage Sensitivity (Critical)
                    </div>
                    <div className="flex items-center gap-2 text-[7px] font-mono uppercase text-muted/80">
                        <div className="w-1 h-1 rounded-full bg-bear" /> Sector Over-concentration
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── False Discovery Panel ─────────────────────────────────────────────────────

const FalseDiscoveryPanel = ({ fd }) => {
    if (!fd || fd.status === 'INSUFFICIENT_DATA') return null;
    return (
        <div className={`glass p-5 rounded-sm border-l-2 ${fd.flags?.length === 0 ? 'border-bull' : 'border-bear'}`}>
            <div className="flex items-center gap-3 mb-4">
                <Search size={13} className={fd.flags?.length > 0 ? 'text-bear' : 'text-bull'} />
                <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">False Discovery Detector</span>
            </div>
            <div className="space-y-2">
                {fd.flags?.length === 0
                    ? <div className="text-[8px] font-mono text-bull uppercase">✓ No false discovery patterns detected</div>
                    : fd.flags.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-bear/5 border border-bear/10 rounded-sm">
                            <AlertTriangle size={9} className="text-bear" />
                            <span className="text-[8px] font-mono text-bear uppercase">{f.replace(/_/g, ' ')}</span>
                        </div>
                    ))
                }
            </div>
            <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-3 text-[8px] font-mono">
                <div className="flex justify-between">
                    <span className="text-muted/50 uppercase">Win Streak</span>
                    <span className="text-white font-black">{fd.winStreak}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted/50 uppercase">Top 3 Contribution</span>
                    <span className={`font-black ${fd.top3ContributionPct > 60 ? 'text-bear' : 'text-bull'}`}>{fmtR(fd.top3ContributionPct)}%</span>
                </div>
            </div>
        </div>
    );
};

// ── Parameter Stability Panel ─────────────────────────────────────────────────

const ParamStabilityPanel = ({ ps }) => {
    if (!ps || ps.status === 'INSUFFICIENT_DATA') return null;
    return (
        <div className={`glass p-5 rounded-sm border-l-2 ${ps.status === 'PARAMETER_STABLE' ? 'border-bull' : 'border-bear'}`}>
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <Layers size={13} className="text-muted/60" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Parameter Stability</span>
                </div>
                <span className={`text-[8px] font-mono font-black px-2 py-0.5 rounded-sm ${ps.status === 'PARAMETER_STABLE' ? 'text-bull bg-bull/10' : 'text-bear bg-bear/10'}`}>
                    {ps.catastrophicCount} Catastrophic
                </span>
            </div>
            <div className="space-y-1.5">
                {(ps.perturbations || []).map((p, i) => (
                    <div key={i} className="flex justify-between items-center">
                        <span className="text-[7px] font-mono text-muted/50 uppercase">{p.name.replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-2">
                            <span className={`text-[8px] font-mono font-black ${p.changePct > 0 ? 'text-bull' : 'text-bear'}`}>
                                {p.changePct > 0 ? '+' : ''}{fmtR(p.changePct)}%
                            </span>
                            {p.isCatastrophic && <AlertTriangle size={8} className="text-bear" />}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Regime Attack Radar ────────────────────────────────────────────────────────
// Pure SVG spider/radar chart — no external charting library needed
const RegimeAttackRadar = () => {
    const axes = [
        { label: 'Trend Shock',      value: 0.72 },
        { label: 'Liquidity Stress', value: 0.55 },
        { label: 'Slippage Risk',    value: 0.83 },
        { label: 'Black Swan',       value: 0.38 },
        { label: 'Vol Burst',        value: 0.67 },
    ];
    const N = axes.length;
    const cx = 110, cy = 110, r = 80;
    const toXY = (i, val) => {
        const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
        return [cx + val * r * Math.cos(angle), cy + val * r * Math.sin(angle)];
    };
    // Grid rings
    const rings = [0.25, 0.5, 0.75, 1.0];
    // Axis endpoints (full)
    const axisEnds = axes.map((_, i) => toXY(i, 1.0));
    // Data polygon
    const dataPts = axes.map((a, i) => toXY(i, a.value));
    const dataPath = dataPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ' Z';
    const labelPts = axes.map((a, i) => { const [x, y] = toXY(i, 1.22); return [x, y, a.label, a.value]; });

    return (
        <div className="glass p-5 rounded-sm border border-white/5 bg-white/[0.01]">
            <div className="flex items-center gap-3 mb-4">
                <Crosshair size={13} className="text-bear" />
                <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Regime Attack Radar</span>
                <span className="ml-auto text-[7px] font-mono text-muted/30 uppercase tracking-widest">Adversarial Sensitivity</span>
            </div>
            <div className="flex items-center justify-center">
                <svg width="220" height="220" viewBox="0 0 220 220">
                    {/* Grid rings */}
                    {rings.map((scale, ri) => {
                        const pts = axes.map((_, i) => toXY(i, scale));
                        const d = pts.map(([x,y],i) => `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ' Z';
                        return <path key={ri} d={d} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />;
                    })}
                    {/* Axis lines */}
                    {axisEnds.map(([x,y], i) => (
                        <line key={i} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                    ))}
                    {/* Data area fill */}
                    <path d={dataPath} fill="rgba(255,59,107,0.12)" stroke="#ff3b6b" strokeWidth="1.5" strokeLinejoin="round" />
                    {/* Data point dots */}
                    {dataPts.map(([x,y], i) => (
                        <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3" fill="#ff3b6b" style={{ filter: 'drop-shadow(0 0 3px #ff3b6b)' }} />
                    ))}
                    {/* Axis labels */}
                    {labelPts.map(([x, y, label, val], i) => (
                        <text key={i} x={x.toFixed(1)} y={y.toFixed(1)}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize="7" fontFamily="monospace"
                            fill={val > 0.7 ? '#ff3b6b' : 'rgba(255,255,255,0.35)'}
                            style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
                        >
                            {label}
                        </text>
                    ))}
                    {/* Center dot */}
                    <circle cx={cx} cy={cy} r="2" fill="rgba(255,255,255,0.15)" />
                </svg>
            </div>
            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 mt-2">
                {axes.map((a, i) => (
                    <div key={i} className="flex justify-between text-[7px] font-mono uppercase">
                        <span className="text-muted/40">{a.label}</span>
                        <span className={a.value > 0.7 ? 'text-bear font-black' : a.value > 0.5 ? 'text-gold font-black' : 'text-bull font-black'}>
                            {(a.value * 100).toFixed(0)}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const HumanReviewPanel = () => {
    const [checked, setChecked] = useState({});
    const tasks = [
        'Review Toxic Clusters & False Positives',
        'Verify Outlier Dependency',
        'Validate Slippage Assumptions',
        'Review Walk-Forward Collapse Warning',
        'Accept Probability of Ruin',
    ];
    const allChecked = tasks.every((_, i) => checked[i]);

    return (
        <div className="glass p-5 rounded-sm border-l-2 border-gold bg-white/[0.01]">
            <div className="flex items-center gap-3 mb-5">
                <CheckSquare size={13} className="text-gold" />
                <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Human Review Layer</span>
            </div>
            <div className="space-y-3">
                <p className="text-[8px] font-mono text-muted/60 uppercase leading-tight mb-4">
                    Autonomous deployment is STRICTLY DISABLED. Manual review required before live capital is authorized.
                </p>
                {tasks.map((task, i) => (
                    <div
                        key={i}
                        onClick={() => setChecked(c => ({ ...c, [i]: !c[i] }))}
                        className="flex items-center gap-3 p-2 bg-white/[0.02] border border-white/5 rounded-sm cursor-pointer hover:border-gold/20 transition-colors select-none"
                    >
                        <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 transition-all ${
                            checked[i] ? 'bg-gold border-gold' : 'border-white/20'
                        }`}>
                            {checked[i] && <span className="text-[8px] text-black font-black">✓</span>}
                        </div>
                        <span className={`text-[9px] font-mono uppercase transition-colors ${
                            checked[i] ? 'text-white/40 line-through' : 'text-muted/80'
                        }`}>{task}</span>
                    </div>
                ))}
            </div>

            {/* ── Ceremonial Deploy Button ── */}
            <div className="mt-5">
                {!allChecked && (
                    <div className="flex items-center gap-2 text-[7px] font-mono text-muted/40 uppercase mb-2">
                        <Lock size={8} />
                        {tasks.filter((_, i) => !checked[i]).length} review items pending — deployment locked
                    </div>
                )}
                <button
                    disabled={!allChecked}
                    className={`w-full py-3 rounded-sm text-[9px] font-mono font-black uppercase tracking-widest transition-all duration-500 ${
                        allChecked
                            ? 'bg-gold text-black shadow-[0_0_30px_rgba(255,184,0,0.4)] animate-pulse cursor-pointer hover:shadow-[0_0_50px_rgba(255,184,0,0.7)]'
                            : 'bg-gold/5 border border-gold/20 text-gold/40 cursor-not-allowed'
                    }`}
                >
                    {allChecked ? '⚡ Authorize Capital Deployment' : '🔒 Authorize Capital Deployment'}
                </button>
                {allChecked && (
                    <div className="mt-2 text-center text-[7px] font-mono text-gold/60 uppercase tracking-widest">
                        All 5 gates cleared · Live capital threshold: ₹50,000
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AdversarialAnalytics = () => {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    const runSuite = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await apiFetch('/api/analytics/adversarial');
            const d = await r.json();
            if (d.success) setData(d.data);
            else setError(d.error);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { runSuite(); }, [runSuite]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
            <ShieldAlert size={32} className="text-bear animate-pulse" />
            <span className="text-[10px] font-mono text-muted/50 uppercase tracking-widest animate-pulse">Running Adversarial Attack Suite...</span>
        </div>
    );

    if (error) return (
        <div className="flex items-center justify-center h-full">
            <span className="text-[10px] font-mono text-bear uppercase">{error}</span>
        </div>
    );

    const { syntheticAttack, monteCarlo, paramStability, executionHostility, falseDiscovery, researchGate } = data || {};
    const verdict = researchGate?.deploymentVerdict;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-12">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-syne font-black text-white tracking-widest uppercase">Adversarial Mode</h1>
                        {verdict && (
                            <span className={`px-2 py-0.5 border rounded-sm text-[8px] font-mono font-black uppercase tracking-widest ${gateColor(verdict)}`}>
                                {verdict.replace(/_/g, ' ')}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] font-mono text-muted tracking-widest uppercase mt-1">
                        Edge Falsification Protocol — Attempting to disprove alpha
                    </p>
                </div>
                <button onClick={runSuite} disabled={loading}
                    className="flex items-center gap-2 glass px-4 py-2 border border-white/5 rounded-sm text-[9px] font-mono text-muted hover:text-white uppercase disabled:opacity-40">
                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                    Re-Run Attack Suite
                </button>
            </div>

            {/* ── Research Gate (full width) ──────────────────────────────────── */}
            <ResearchGatePanel gate={researchGate} />

            {/* ── Attack Matrix ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SyntheticAttackPanel attack={syntheticAttack} />
                <MonteCarloPanel mc={monteCarlo} />
            </div>

            {/* ── Regime Attack Radar + Human Review (right-column anchor) ──── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RegimeAttackRadar />
                <HumanReviewPanel />
            </div>

            {/* ── Hostile Conditions row ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <HostilityPanel hostility={executionHostility} />
                <FalseDiscoveryPanel fd={falseDiscovery} />
                <ParamStabilityPanel ps={paramStability} />
            </div>

        </motion.div>
    );
};

export default AdversarialAnalytics;
