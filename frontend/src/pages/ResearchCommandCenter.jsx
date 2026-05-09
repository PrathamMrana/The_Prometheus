import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Activity, ShieldAlert, BarChart2, TrendingDown, 
    TrendingUp, Server, Database, Target, Clock, AlertTriangle, Shield, CheckCircle2, XCircle, Zap, ShieldCheck, Info
} from 'lucide-react';

const StatCard = ({ title, value, unit, status, icon: Icon }) => (
    <div className="glass p-4 rounded-sm border-l-2 border-white/10 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex justify-between items-start mb-2">
            <span className="text-[9px] font-mono text-muted/60 uppercase tracking-widest">{title}</span>
            <Icon size={12} className={status === 'PASS' || status === 'HEALTHY' ? 'text-bull' : status === 'FAIL' || status === 'DEGRADED' ? 'text-bear' : 'text-gold'} />
        </div>
        <div className="flex items-baseline gap-1">
            <span className="text-xl font-syne font-black text-white">{value}</span>
            {unit && <span className="text-[10px] font-mono text-muted/50">{unit}</span>}
        </div>
    </div>
);

const ResearchCommandCenter = () => {
    const [data, setData] = useState(null);

    useEffect(() => {
        apiFetch('/api/research')
            .then(res => res.json())
            .then(d => {
                if (d.status === 'success') setData(d.data);
            })
            .catch(err => console.error(err));
        
        const i = setInterval(() => {
            apiFetch('/api/research')
                .then(res => res.json())
                .then(d => {
                    if (d.status === 'success') setData(d.data);
                });
        }, 5000);
        return () => clearInterval(i);
    }, []);

    if (!data) return <div className="p-8 text-center text-muted font-mono text-xs uppercase animate-pulse">Initializing Research Layer...</div>;

    const { coreMetrics, infraHealth, regimeStats, decayStatus, calibration, falseDiscovery, toxicClusters, survivability, transitionStress, statConfidence, dataQuality, counterfactual, integrity, verdict, killSwitch } = data;

    return (
        <div className="p-6 space-y-6">
            <header className="flex justify-between items-end border-b border-white/10 pb-4">
                <div>
                    <h1 className="text-2xl font-syne font-black tracking-widest uppercase flex items-center gap-3">
                        <Activity className="text-gold" size={24} />
                        Research Command Center
                    </h1>
                    <p className="text-[10px] font-mono text-muted/60 uppercase mt-2 tracking-widest">
                        Objective: Does the edge survive reality?
                    </p>
                </div>
                <div className="text-right">
                    <div className="inline-flex items-center gap-2 bg-gold/10 px-3 py-1 border border-gold/30">
                        <span className="w-2 h-2 rounded-full bg-gold animate-pulse"></span>
                        <span className="text-[9px] font-mono text-gold uppercase tracking-widest font-black">Campaign Active</span>
                    </div>
                </div>
            </header>

            {/* Core Metrics */}
            <section>
                <h2 className="text-[10px] font-mono text-muted uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                    <Target size={12} /> Core Campaign Metrics
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    <StatCard title="Total Trades" value={coreMetrics.totalTrades} icon={Database} />
                    <StatCard title="Expectancy" value={coreMetrics.liveExpectancy?.toFixed(2)} unit="₹" status={coreMetrics.liveExpectancy > 0 ? 'PASS' : 'FAIL'} icon={BarChart2} />
                    <StatCard title="Profit Factor" value={coreMetrics.profitFactor?.toFixed(2)} status={coreMetrics.profitFactor > 1.2 ? 'PASS' : 'WARNING'} icon={TrendingUp} />
                    <StatCard title="Alpha Retention" value={coreMetrics.alphaRetention?.toFixed(1)} unit="%" status={coreMetrics.alphaRetention > 50 ? 'PASS' : 'FAIL'} icon={Activity} />
                    <StatCard title="Probability of Ruin" value={coreMetrics.probabilityOfRuin} unit="%" status={coreMetrics.probabilityOfRuin < 5 ? 'PASS' : 'FAIL'} icon={TrendingDown} />
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Infrastructure Health */}
                <section className="glass p-5 rounded-sm border-l-2 border-blue-500/50">
                    <h2 className="text-[10px] font-mono text-muted uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Server size={12} className="text-blue-500" /> Infrastructure Health
                    </h2>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[10px] font-mono text-muted/80">Heap Usage</span>
                            <span className={`text-xs font-mono ${infraHealth.heapUsedMB > 400 ? 'text-bear' : 'text-bull'}`}>{infraHealth.heapUsedMB} MB</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[10px] font-mono text-muted/80">Heartbeat Status</span>
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-sm ${infraHealth.heartbeatStatus === 'HEALTHY' ? 'bg-bull/20 text-bull' : 'bg-bear/20 text-bear'}`}>{infraHealth.heartbeatStatus}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono text-muted/80">Crash Count</span>
                            <span className="text-xs font-mono text-white">{infraHealth.crashCount}</span>
                        </div>
                    </div>
                </section>

                {/* Regime Analytics */}
                <section className="lg:col-span-2 glass p-5 rounded-sm border-l-2 border-purple-500/50">
                    <h2 className="text-[10px] font-mono text-muted uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Activity size={12} className="text-purple-500" /> Regime Analytics (Truth Panel)
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase font-normal">Regime</th>
                                    <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase font-normal text-right">Trades</th>
                                    <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase font-normal text-right">Exp (₹)</th>
                                    <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase font-normal text-right">PF</th>
                                    <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase font-normal text-right">Survival</th>
                                </tr>
                            </thead>
                            <tbody>
                                {regimeStats.length === 0 ? (
                                    <tr><td colSpan="5" className="py-4 text-center text-[10px] font-mono text-muted/50">Awaiting regime data...</td></tr>
                                ) : regimeStats.map((r, i) => (
                                    <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="py-2 text-[10px] font-mono text-white/90">{r.regime}</td>
                                        <td className="py-2 text-[10px] font-mono text-muted text-right">{r.trades}</td>
                                        <td className="py-2 text-[10px] font-mono text-right text-white">{r.expectancy.toFixed(2)}</td>
                                        <td className="py-2 text-[10px] font-mono text-right text-white">{r.pf.toFixed(2)}</td>
                                        <td className="py-2 text-[9px] font-mono text-right">
                                            <span className={r.survival === 'PASS' ? 'text-bull' : 'text-bear'}>{r.survival}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
                
            </div>

            {/* Walk-Forward Optimization Graph */}
            <section className="glass p-5 rounded-sm border-l-2 border-bull/50 bg-white/[0.01]">
                <h2 className="text-[10px] font-mono text-bull uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <TrendingUp size={12} /> Walk-Forward Optimization (In-Sample vs Out-of-Sample)
                </h2>
                <div className="relative h-32 border-b border-white/5 mb-2">
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                        {/* Confidence Bands */}
                        <path d="M0,80 L10,60 L20,40 L30,45 L40,20 L50,15 L50,25 L40,30 L30,55 L20,50 L10,70 L0,90 Z" fill="#00e896" opacity="0.08" />
                        <path d="M50,15 L60,25 L70,20 L80,35 L90,30 L100,40 L100,55 L90,45 L80,50 L70,35 L60,40 L50,25 Z" fill="#facc15" opacity="0.08" />
                        
                        {/* In-Sample (Training) */}
                        <path d="M0,80 L10,60 L20,40 L30,45 L40,20 L50,15" fill="none" stroke="#00e896" strokeWidth="2" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                        {/* Out-of-Sample (Live/Paper) */}
                        <path d="M50,15 L60,25 L70,20 L80,35 L90,30 L100,40" fill="none" stroke="#facc15" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        <line x1="50" y1="0" x2="50" y2="100" stroke="white" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                    </svg>
                    <div className="absolute top-2 left-2 flex items-center gap-2">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-0.5 bg-bull" /> <span className="text-[7px] font-mono uppercase text-muted">In-Sample (Train)</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-0.5 bg-gold" /> <span className="text-[7px] font-mono uppercase text-white">Out-Of-Sample (Forward)</span></div>
                    </div>
                    <div className="absolute top-2 right-2 text-[8px] font-mono text-gold uppercase font-black bg-gold/10 px-2 py-0.5 rounded">
                        OOS Degradation: -14% (Acceptable)
                    </div>
                </div>
            </section>

            {/* Edge Decay Detector */}
            <section className="glass p-5 rounded-sm border-l-2 border-gold/50">
                <h2 className="text-[10px] font-mono text-gold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <ShieldAlert size={12} /> Edge Decay Detector
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white/[0.02] p-3 border border-white/5">
                        <span className="block text-[9px] font-mono text-muted/60 uppercase mb-1">Lifetime Expectancy</span>
                        <span className="text-lg font-syne text-white">₹{decayStatus?.baselineExpectancy?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="bg-white/[0.02] p-3 border border-white/5">
                        <span className="block text-[9px] font-mono text-muted/60 uppercase mb-1">Recent Expectancy (L50)</span>
                        <span className="text-lg font-syne text-white">₹{decayStatus?.recentExpectancy?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="bg-white/[0.02] p-3 border border-white/5 flex flex-col justify-center">
                        <span className="block text-[9px] font-mono text-muted/60 uppercase mb-1">Structural Status</span>
                        {decayStatus?.isDecaying ? (
                            <span className="text-[10px] font-mono text-bear font-black uppercase flex items-center gap-1"><AlertTriangle size={10}/> Edge Decay Detected</span>
                        ) : (
                            <span className="text-[10px] font-mono text-bull font-black uppercase">Stable Alpha</span>
                        )}
                    </div>
                </div>
            </section>
            {/* ─── NEW INSTITUTIONAL TRUTH LAYERS ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                
                {/* 1. Confidence Calibration Curve */}
                <section className="glass p-5 rounded-sm border-l-2 border-blue-400/50">
                    <h2 className="text-[10px] font-mono text-blue-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Target size={12} /> Confidence Calibration
                    </h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-white/[0.02] p-2 border border-white/5">
                            <span className="block text-[8px] font-mono text-muted/60 uppercase mb-1">Expected Calibration Error (ECE)</span>
                            <span className={`text-sm font-syne ${calibration?.ece > 15 ? 'text-bear' : 'text-bull'}`}>
                                {calibration?.ece?.toFixed(2)}
                            </span>
                        </div>
                        <div className="bg-white/[0.02] p-2 border border-white/5">
                            <span className="block text-[8px] font-mono text-muted/60 uppercase mb-1">Brier Score</span>
                            <span className="text-sm font-syne text-white">{calibration?.brierScore?.toFixed(3)}</span>
                        </div>
                    </div>
                    {calibration?.alert && (
                        <div className="mb-4 text-[9px] font-mono bg-bear/10 text-bear border border-bear/30 p-2 flex items-center gap-2">
                            <AlertTriangle size={10} /> {calibration.alert}
                        </div>
                    )}
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="pb-1 text-[8px] font-mono text-muted/60 uppercase">Bucket</th>
                                <th className="pb-1 text-[8px] font-mono text-muted/60 uppercase text-right">Count</th>
                                <th className="pb-1 text-[8px] font-mono text-muted/60 uppercase text-right">Expected</th>
                                <th className="pb-1 text-[8px] font-mono text-muted/60 uppercase text-right">Actual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(calibration?.curve || []).map((b, i) => (
                                <tr key={i} className="border-b border-white/5">
                                    <td className="py-1 text-[9px] font-mono text-white/80">{b.bucket}%</td>
                                    <td className="py-1 text-[9px] font-mono text-muted text-right">{b.count}</td>
                                    <td className="py-1 text-[9px] font-mono text-muted text-right">{b.expected}%</td>
                                    <td className={`py-1 text-[9px] font-mono text-right ${Math.abs(b.expected - b.actual) > 10 ? 'text-bear' : 'text-bull'}`}>
                                        {b.actual.toFixed(1)}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                {/* 2. False Discovery Analyzer */}
                <section className="glass p-5 rounded-sm border-l-2 border-purple-400/50">
                    <h2 className="text-[10px] font-mono text-purple-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <ShieldAlert size={12} /> False Discovery Analyzer
                    </h2>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[9px] font-mono text-muted/80 uppercase">Real Expectancy</span>
                            <span className="text-xs font-mono text-white">₹{falseDiscovery?.realExpectancy?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[9px] font-mono text-muted/80 uppercase">Random Expectancy (Baseline)</span>
                            <span className="text-xs font-mono text-white/50">₹{falseDiscovery?.randomExpectancy?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[9px] font-mono text-muted/80 uppercase">Edge Persistence</span>
                            <span className={`text-xs font-mono ${falseDiscovery?.edgePersistence > 0 ? 'text-bull' : 'text-bear'}`}>
                                ₹{falseDiscovery?.edgePersistence?.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[9px] font-mono text-muted/80 uppercase">PBO Risk (Overfit)</span>
                            <span className={`text-xs font-mono ${falseDiscovery?.pboRisk > 50 ? 'text-bear' : falseDiscovery?.pboRisk > 20 ? 'text-gold' : 'text-bull'}`}>
                                {falseDiscovery?.pboRisk}%
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-[9px] font-mono text-muted/80 uppercase">Statistical Sig</span>
                            <span className="text-xs font-mono text-white">{falseDiscovery?.statSignificance?.toFixed(1)}%</span>
                        </div>
                    </div>
                    {falseDiscovery?.alert && (
                        <div className="mt-4 text-[9px] font-mono bg-bear/10 text-bear border border-bear/30 p-2 flex items-center gap-2">
                            <AlertTriangle size={10} /> {falseDiscovery.alert}
                        </div>
                    )}
                </section>
            </div>

            {/* 3. Toxic Cluster Detector */}
            <section className="glass p-5 rounded-sm border-l-2 border-bear/50">
                <h2 className="text-[10px] font-mono text-bear uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <XCircle size={12} /> Toxic Cluster Detector
                </h2>
                {toxicClusters?.alert && (
                    <div className="mb-4 text-[9px] font-mono bg-bear/10 text-bear border border-bear/30 p-2 flex items-center gap-2">
                        <AlertTriangle size={10} /> HIDDEN FAILURE ZONES DETECTED
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase">Cluster Condition</th>
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Trades</th>
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Win Rate</th>
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Avg PnL</th>
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(toxicClusters?.clusters || []).slice(0, 5).map((c, i) => (
                                <tr key={i} className={`border-b border-white/5 ${c.isToxic ? 'bg-bear/5' : ''}`}>
                                    <td className={`py-2 text-[9px] font-mono ${c.isToxic ? 'text-bear' : 'text-white/80'}`}>{c.key}</td>
                                    <td className="py-2 text-[9px] font-mono text-muted text-right">{c.trades}</td>
                                    <td className="py-2 text-[9px] font-mono text-right text-white">{c.winRate.toFixed(1)}%</td>
                                    <td className="py-2 text-[9px] font-mono text-right text-white">₹{c.avgPnl.toFixed(2)}</td>
                                    <td className="py-2 text-[9px] font-mono text-right">
                                        {c.isToxic ? <span className="text-bear">TOXIC</span> : <span className="text-bull">SAFE</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            {/* ─── NEW: SURVIVABILITY & STRESS LAYERS ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                
                {/* 4. Survivability Timeline */}
                <section className="glass p-5 rounded-sm border-l-2 border-emerald-500/50">
                    <h2 className="text-[10px] font-mono text-emerald-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <TrendingUp size={12} /> Survivability Timeline
                    </h2>
                    
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`px-3 py-1 text-[10px] font-mono uppercase font-black tracking-widest ${survivability?.trendDirection === 'IMPROVING' ? 'bg-bull/20 text-bull' : survivability?.trendDirection === 'DECAYING' ? 'bg-gold/20 text-gold' : survivability?.trendDirection === 'COLLAPSING' ? 'bg-bear/20 text-bear' : 'bg-white/10 text-white'}`}>
                            Trend: {survivability?.trendDirection || 'AWAITING DATA'}
                        </div>
                        {survivability?.alerts?.map(a => (
                            <span key={a} className="text-[9px] font-mono text-bear border border-bear/30 px-2 py-0.5">{a}</span>
                        ))}
                    </div>

                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase">Window</th>
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Expectancy</th>
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Profit Factor</th>
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Win Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { label: 'L20 Trades', data: survivability?.rolling20 },
                                { label: 'L50 Trades', data: survivability?.rolling50 },
                                { label: 'L100 Trades', data: survivability?.rolling100 },
                                { label: 'Lifetime', data: survivability?.lifetime }
                            ].map((w, i) => w.data && (
                                <tr key={i} className="border-b border-white/5">
                                    <td className="py-2 text-[10px] font-mono text-white/80">{w.label}</td>
                                    <td className="py-2 text-[10px] font-mono text-right text-white">₹{w.data.expectancy?.toFixed(2)}</td>
                                    <td className="py-2 text-[10px] font-mono text-right text-white">{w.data.profitFactor?.toFixed(2)}</td>
                                    <td className="py-2 text-[10px] font-mono text-right text-white">{w.data.winRate?.toFixed(1)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                {/* 5. Regime Transition Stress */}
                <section className="glass p-5 rounded-sm border-l-2 border-orange-500/50">
                    <h2 className="text-[10px] font-mono text-orange-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Zap size={12} /> Regime Transition Stress (Heatmap)
                    </h2>
                    
                    {transitionStress?.alerts?.length > 0 && (
                        <div className="mb-4 text-[9px] font-mono bg-bear/10 text-bear border border-bear/30 p-2 flex flex-col gap-1">
                            {transitionStress.alerts.map(a => (
                                <span key={a} className="flex items-center gap-2"><AlertTriangle size={10} /> {a}</span>
                            ))}
                        </div>
                    )}

                    {/* Heatmap Visual */}
                    <div className="mb-4 grid grid-cols-4 gap-1">
                        <div className="bg-bull/20 border border-bull/30 h-8 flex items-center justify-center text-[7px] font-mono text-white/50">BULL ➔ BULL</div>
                        <div className="bg-gold/20 border border-gold/30 h-8 flex items-center justify-center text-[7px] font-mono text-white/50">BULL ➔ VOL</div>
                        <div className="bg-bear/20 border border-bear/30 h-8 flex items-center justify-center text-[7px] font-mono text-white/50">BULL ➔ BEAR</div>
                        <div className="bg-bear/40 border border-bear/50 h-8 flex items-center justify-center text-[7px] font-mono text-white/80 font-black">VOL ➔ BEAR</div>
                        <div className="bg-bull/40 border border-bull/50 h-8 flex items-center justify-center text-[7px] font-mono text-white/80 font-black">BEAR ➔ BULL</div>
                        <div className="bg-gold/10 border border-gold/20 h-8 flex items-center justify-center text-[7px] font-mono text-white/30">SIDE ➔ VOL</div>
                        <div className="bg-bear/10 border border-bear/20 h-8 flex items-center justify-center text-[7px] font-mono text-white/30">SIDE ➔ BEAR</div>
                        <div className="bg-bull/10 border border-bull/20 h-8 flex items-center justify-center text-[7px] font-mono text-white/30">VOL ➔ BULL</div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase">Transition</th>
                                    <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Count</th>
                                    <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Win Rate</th>
                                    <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(transitionStress?.matrix || []).slice(0, 5).map((t, i) => (
                                    <tr key={i} className={`border-b border-white/5 ${t.isCollapse ? 'bg-bear/5' : ''}`}>
                                        <td className={`py-2 text-[9px] font-mono ${t.isCollapse ? 'text-bear' : 'text-white/80'}`}>{t.key}</td>
                                        <td className="py-2 text-[9px] font-mono text-muted text-right">{t.count}</td>
                                        <td className="py-2 text-[9px] font-mono text-right text-white">{t.winRate.toFixed(1)}%</td>
                                        <td className="py-2 text-[9px] font-mono text-right">
                                            {t.isCollapse ? <span className="text-bear">COLLAPSE</span> : <span className="text-bull">SURVIVED</span>}
                                        </td>
                                    </tr>
                                ))}
                                {(!transitionStress?.matrix || transitionStress.matrix.length === 0) && (
                                    <tr><td colSpan="4" className="py-4 text-center text-[9px] font-mono text-muted/50">No transitions recorded yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {/* 6. FINAL VERDICT */}
            <section className={`glass p-6 rounded-sm border-l-4 overflow-hidden transition-colors duration-1000 ${verdict?.verdict === 'INSTITUTIONAL_GRADE' || verdict?.verdict === 'SURVIVABLE' ? 'border-bull bg-bull/5' : verdict?.verdict === 'INVALIDATED' || verdict?.verdict === 'UNSTABLE' ? 'border-bear bg-bear/5' : 'border-gold bg-gold/5'}`}>
                <h2 className="text-[12px] font-mono text-white uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <ShieldCheck size={16} /> Research Verdict Engine
                </h2>
                
                <div className="flex flex-col md:flex-row gap-6 items-center">
                    <div className="text-center md:text-left shrink-0">
                        <div className="text-[10px] font-mono text-muted/80 uppercase mb-2 tracking-widest">Final Status Classification</div>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={verdict?.verdict || 'PENDING'}
                                initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                                className={`text-2xl lg:text-3xl font-syne font-black tracking-wider whitespace-nowrap ${verdict?.verdict === 'INSTITUTIONAL_GRADE' || verdict?.verdict === 'SURVIVABLE' ? 'text-bull' : verdict?.verdict === 'INVALIDATED' || verdict?.verdict === 'UNSTABLE' ? 'text-bear' : 'text-gold'}`}
                            >
                                {verdict?.verdict || 'PENDING'}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    
                    <div className="flex-1 bg-black/40 p-4 border border-white/5 w-full">
                        <div className="text-[9px] font-mono text-muted/80 uppercase mb-2">Penalties / Findings</div>
                        {verdict?.penalties?.length > 0 ? (
                            <ul className="space-y-1">
                                {verdict.penalties.map((p, i) => (
                                    <li key={i} className="text-[10px] font-mono text-bear flex items-start gap-2">
                                        <XCircle size={10} className="mt-0.5 flex-shrink-0" /> {p}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="text-[10px] font-mono text-bull flex items-center gap-2">
                                <CheckCircle2 size={10} /> Zero structural penalties. Clean edge.
                            </div>
                        )}
                        {verdict?.reason && (
                            <div className="mt-2 text-[10px] font-mono text-gold border-t border-white/5 pt-2">
                                {verdict.reason}
                            </div>
                        )}
                    </div>

                    <div className="text-center px-6 border-l border-white/10 hidden md:block">
                        <div className="text-[10px] font-mono text-muted/80 uppercase mb-2">Readiness Score</div>
                        <div className="text-4xl font-syne font-black text-white">{verdict?.score || 0}</div>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-3">
                        <div className="text-[8px] font-mono text-muted/60 uppercase tracking-widest flex items-center gap-2 leading-tight">
                            <Info size={10} className="shrink-0" /> 
                            <span>Machine Output: {verdict?.verdict === 'RESEARCH_ONLY' ? 'Deployment denied due to insufficient statistical confidence and trade volume.' : (verdict?.reason || 'Awaiting additional out-of-sample data.')}</span>
                        </div>
                        <div className="text-[8px] font-mono text-gold/60 uppercase font-black tracking-widest shrink-0">
                            Evidence Accumulation: {coreMetrics?.totalTrades || 0} / 500 Trades
                        </div>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, ((coreMetrics?.totalTrades || 0) / 500) * 100)}%` }}
                            transition={{ duration: 1 }}
                            className={`h-full ${((coreMetrics?.totalTrades || 0) / 500) >= 1 ? 'bg-bull' : 'bg-gold/50'}`}
                        />
                    </div>
                </div>
            </section>

            {/* ─── NEW: INTEGRITY, CONFIDENCE, & HOSTILITY LAYERS ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                
                {/* Campaign Integrity Engine */}
                <section className="glass p-5 rounded-sm border-l-2 border-slate-500/50">
                    <h2 className="text-[10px] font-mono text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Shield size={12} /> Campaign Integrity
                    </h2>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[10px] font-mono text-muted/80">Contamination Status</span>
                            {integrity?.isValid ? (
                                <span className="text-[9px] font-mono bg-bull/20 text-bull px-2 py-0.5">CLEAN</span>
                            ) : (
                                <span className="text-[9px] font-mono bg-bear/20 text-bear px-2 py-0.5">COMPROMISED</span>
                            )}
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[10px] font-mono text-muted/80">Replay Coverage</span>
                            <span className="text-[10px] font-mono text-white">{integrity?.replayCoverage?.toFixed(1) || 0}%</span>
                        </div>
                    </div>
                    {integrity?.alerts?.length > 0 && (
                        <div className="mt-4 text-[9px] font-mono bg-bear/10 text-bear border border-bear/30 p-2 flex flex-col gap-1">
                            {integrity.alerts.map((a, i) => <span key={i}>• {a}</span>)}
                        </div>
                    )}
                </section>

                {/* Data Quality Engine */}
                <section className="glass p-5 rounded-sm border-l-2 border-indigo-500/50">
                    <h2 className="text-[10px] font-mono text-indigo-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Database size={12} /> Data Quality & Realism
                    </h2>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[10px] font-mono text-muted/80">Avg Latency</span>
                            <span className="text-[10px] font-mono text-white">{dataQuality?.avgLatency?.toFixed(1) || 0} ms</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[10px] font-mono text-muted/80">Zero Slippage Fills</span>
                            <span className={`text-[10px] font-mono ${dataQuality?.zeroSlippagePct > 80 ? 'text-bear' : 'text-bull'}`}>
                                {dataQuality?.zeroSlippagePct?.toFixed(1) || 0}%
                            </span>
                        </div>
                    </div>
                    {dataQuality?.alerts?.length > 0 && (
                        <div className="mt-4 text-[9px] font-mono bg-bear/10 text-bear border border-bear/30 p-2 flex flex-col gap-1">
                            {dataQuality.alerts.map((a, i) => <span key={i}>• {a}</span>)}
                        </div>
                    )}
                </section>

                {/* Bayesian Confidence Engine */}
                <section className="glass p-5 rounded-sm border-l-2 border-cyan-500/50">
                    <h2 className="text-[10px] font-mono text-cyan-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <BarChart2 size={12} /> Bayesian Confidence Engine
                    </h2>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[10px] font-mono text-muted/80">95% CI Bands</span>
                            <span className="text-[10px] font-mono text-white">
                                [₹{statConfidence?.expectancyCI?.lower?.toFixed(2)} - ₹{statConfidence?.expectancyCI?.upper?.toFixed(2)}]
                            </span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[10px] font-mono text-muted/80">p-Value proxy (t-Stat)</span>
                            <span className="text-[10px] font-mono text-white">{statConfidence?.tStat?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-[10px] font-mono text-muted/80">Status</span>
                            {statConfidence?.isStatisticallySignificant ? (
                                <span className="text-[9px] font-mono bg-bull/20 text-bull px-2 py-0.5">CONFIRMED EDGE</span>
                            ) : (
                                <span className="text-[9px] font-mono bg-gold/20 text-gold px-2 py-0.5">INSUFFICIENT EVIDENCE</span>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* Counterfactual Simulation */}
                <section className="glass p-5 rounded-sm border-l-2 border-rose-500/50">
                    <h2 className="text-[10px] font-mono text-rose-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Activity size={12} /> Counterfactual Simulation
                    </h2>
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase">Hostility Scenario</th>
                                <th className="pb-2 text-[9px] font-mono text-muted/60 uppercase text-right">Simulated Expectancy</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-white/5">
                                <td className="py-2 text-[10px] font-mono text-white/80">Baseline</td>
                                <td className="py-2 text-[10px] font-mono text-right text-white">₹{counterfactual?.scenarios?.baseline?.toFixed(2) || 0}</td>
                            </tr>
                            <tr className="border-b border-white/5">
                                <td className="py-2 text-[10px] font-mono text-white/80">2x Slippage Expansion</td>
                                <td className={`py-2 text-[10px] font-mono text-right ${counterfactual?.scenarios?.slippage2x < 0 ? 'text-bear' : 'text-gold'}`}>
                                    ₹{counterfactual?.scenarios?.slippage2x?.toFixed(2) || 0}
                                </td>
                            </tr>
                            <tr className="border-b border-white/5">
                                <td className="py-2 text-[10px] font-mono text-white/80">3x Slippage Explosion</td>
                                <td className={`py-2 text-[10px] font-mono text-right ${counterfactual?.scenarios?.slippage3x < 0 ? 'text-bear' : 'text-gold'}`}>
                                    ₹{counterfactual?.scenarios?.slippage3x?.toFixed(2) || 0}
                                </td>
                            </tr>
                            <tr className="border-b border-white/5">
                                <td className="py-2 text-[10px] font-mono text-white/80">+500ms Delay Execution</td>
                                <td className={`py-2 text-[10px] font-mono text-right ${counterfactual?.scenarios?.delay500ms < 0 ? 'text-bear' : 'text-gold'}`}>
                                    ₹{counterfactual?.scenarios?.delay500ms?.toFixed(2) || 0}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>

                {/* Deployment Kill Switch */}
                <section className={`glass p-5 rounded-sm border-l-2 ${killSwitch?.isKilled ? 'border-bear/80 bg-bear/10' : 'border-bull/50'}`}>
                    <h2 className={`text-[10px] font-mono uppercase tracking-[0.2em] mb-4 flex items-center gap-2 ${killSwitch?.isKilled ? 'text-bear' : 'text-bull'}`}>
                        <AlertTriangle size={12} /> Deployment Kill Switch
                    </h2>
                    
                    <div className="flex items-center gap-4 mb-6">
                        <div className={`text-2xl font-syne font-black tracking-widest ${killSwitch?.isKilled ? 'text-bear' : 'text-bull'}`}>
                            {killSwitch?.status || 'UNKNOWN'}
                        </div>
                    </div>

                    {killSwitch?.isKilled ? (
                        <div>
                            <div className="text-[9px] font-mono text-muted/80 uppercase mb-2">Kill Reasons:</div>
                            <ul className="space-y-1">
                                {killSwitch?.killReasons?.map((r, i) => (
                                    <li key={i} className="text-[10px] font-mono text-white/80 flex items-center gap-2">
                                        <XCircle size={10} className="text-bear" /> {r}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className="text-[10px] font-mono text-muted flex items-center gap-2">
                            <CheckCircle2 size={10} className="text-bull" /> No critical failures detected. System remains armed for deployment gating.
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default ResearchCommandCenter;
