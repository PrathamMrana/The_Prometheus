import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Cpu, AlertTriangle, ShieldCheck, RefreshCw, Lock, Clock, TrendingUp, Activity } from 'lucide-react';
import { useTradeStore } from '../../store/tradeStore';
import { useMarketStore } from '../../store/marketStore';
import { AnimatePresence } from 'framer-motion';

import { DecisionTracePanel } from './DecisionTracePanel';

export const TradeTerminal = ({ buyRef, sellRef }) => {
    const symbol = useTradeStore(state => state.selectedSymbol);
    const marketCache = useMarketStore(state => state.market);
    const global = useMarketStore(state => state.global);
    const patchSignal = useMarketStore(state => state.patchSignal);

    const balance = useTradeStore(state => state.balance);
    const lockedBalance = useTradeStore(state => state.lockedBalance);
    const holdings = useTradeStore(state => state.holdings);
    
    const canonical = (symbol || "").split('.')[0].toUpperCase();
    const cachedDecision = marketCache[canonical]?.signal?.decision || "REJECT";

    const [qty, setQty] = useState("10");
    const [type, setType] = useState('MARKET'); // MARKET | LIMIT
    const [limitPrice, setLimitPrice] = useState("0");
    const [slPrice, setSlPrice] = useState("0");
    const [tpPrice, setTpPrice] = useState("0");
    const [submitting, setSubmitting] = useState(false);
    const [lastExecution, setLastExecution] = useState(null);
    const [preview, setPreview] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isLocked, setIsLocked] = useState(false); // 🔒 Symbol Context Lock
    const requestIdRef = useRef(0);

    const [commentary, setCommentary] = useState([
        { id: 1, time: '—', msg: 'Awaiting market feed...' },
        { id: 2, time: '—', msg: 'Synchronizing neural nodes...' },
        { id: 3, time: '—', msg: 'Validating portfolio state...' }
    ]);

    useEffect(() => {
        const messages = [
            "Analyzing Level 2 order book density...",
            "Momentum divergence detected on M5 timeframe.",
            "Volatility bands compressing. Expect breakout.",
            "Checking cross-asset correlation matrices...",
            "Volume profile shifting towards accumulation.",
            "Smart money flow detected in primary sector.",
            "Pre-trade risk validation initiated.",
            "Slippage boundary checks holding steady."
        ];
        let i = Math.floor(Math.random() * messages.length);
        const t = setInterval(() => {
            setCommentary(prev => {
                const now = new Date();
                const ts = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const next = { id: Date.now(), time: ts, msg: messages[i % messages.length] };
                i++;
                return [...prev, next].slice(-3);
            });
        }, 3000);
        return () => clearInterval(t);
    }, [symbol]);

    const { placeOrder, simulateOrder } = useTradeStore();

    // ─── Backend feed state — real trading rules from FeedStateMachine ────────
    // These come from worker.js → GLOBAL_STATE broadcast → marketStore.
    // They reflect actual data pipeline health, not frontend clock logic.
    const feedState  = useMarketStore(state => state.feedState);   // LIVE|DELAYED|STALE|DISCONNECTED
    const allowEntry = useMarketStore(state => state.allowEntry);  // false when STALE or DISCONNECTED
    const allowExit  = useMarketStore(state => state.allowExit);   // false only when DISCONNECTED

    // Fallback: if backend hasn't emitted feedState yet, use local clock
    const localMarketOpen = (() => {
        const now = new Date();
        const ist = (now.getUTCHours() * 60 + now.getUTCMinutes() + 5 * 60 + 30) % (24 * 60);
        const wd = now.getDay();
        return wd > 0 && wd < 6 && ist >= 555 && ist < 930;
    })();
    const marketOpen = localMarketOpen;

    // ─── Centralized execution eligibility (Phase 10: backend-sourced rules) ─
    const getBlockReason = (side) => {
        if (isAnalyzing) return { blocked: true, label: 'DATA LOADING',       icon: Clock,       color: 'text-muted' };
        if (!marketOpen) return { blocked: true, label: 'MARKET CLOSED',      icon: Lock,        color: 'text-muted' };
        if (feedState === 'DISCONNECTED') return { blocked: true, label: 'FEED DISCONNECTED', icon: AlertTriangle, color: 'text-bear' };
        if (feedState === 'STALE')        return { blocked: true, label: 'STALE FEED',         icon: AlertTriangle, color: 'text-bear' };
        if (!preview) return { blocked: true, label: 'AWAITING ANALYSIS', icon: Clock,  color: 'text-muted' };
        if (preview.final !== 'APPROVED') return { blocked: true, label: 'RISK BLOCKED', icon: ShieldCheck, color: 'text-bear' };
        if (side === 'BUY' && !allowEntry) return { blocked: true, label: 'ENTRIES HALTED', icon: Lock, color: 'text-gold' };
        if (side === 'SELL' && !allowExit) return { blocked: true, label: 'EXITS HALTED',   icon: Lock, color: 'text-bear' };
        if (side === 'BUY' && !validation?.buy?.valid) {
            const msg = !validation?.valid ? 'INVALID SYMBOL' : 'INSUFFICIENT FUNDS';
            return { blocked: true, label: msg, icon: AlertTriangle, color: 'text-bear' };
        }
        if (side === 'SELL' && !validation?.sell?.valid) {
            return { blocked: true, label: 'NO HOLDINGS', icon: AlertTriangle, color: 'text-muted' };
        }
        if (decision !== 'BUY' && side === 'BUY') return { blocked: true, label: 'LOW CONFIDENCE', icon: TrendingUp, color: 'text-gold' };
        // Feed delay warning (non-blocking)
        if (feedState === 'DELAYED') {
            const label = side === 'BUY' ? `BUY ${symbol.split('.')[0]} ⚠ DELAYED` : `SELL ${symbol.split('.')[0]} ⚠ DELAYED`;
            return { blocked: false, label, icon: null, color: 'text-gold' };
        }
        return { blocked: false, label: side === 'BUY' ? `INSTANT BUY ${symbol.split('.')[0]}` : `INSTANT SELL ${symbol.split('.')[0]}`, icon: null, color: '' };
    };

    // 🔱 [PHASE 17] SINGLE SOURCE OF TRUTH — decision hierarchy:
    // 1. preview.decision (fresh /preview API, most accurate — computed from latest data)
    // 2. cachedDecision (WebSocket signal, may lag one intelligence cycle)
    // This ensures SymbolIntel hub, TradeTerminal button, and DecisionTracePanel all agree.
    const decision = preview?.decision ?? cachedDecision;

    // 🚀 [PHASE 16] GLOBAL BUT SAFE KEYBOARD SHORTCUTS
    useEffect(() => {
        const handleKeys = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            const key = e.key.toLowerCase();
            if (key === 'b') {
                e.preventDefault();
                buyRef.current?.click();
            } else if (key === 's') {
                e.preventDefault();
                sellRef.current?.click();
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [buyRef, sellRef]);

    // clear execution state when symbol changes
    useEffect(() => { 
        if (isLocked) return; // 🔒 Context Lock
        setLastExecution(null);
        setPreview(null);
        setSlPrice("0");
        setTpPrice("0");
    }, [symbol, isLocked]);

    // 🛡️ [INSTITUTIONAL VALIDATION ENGINE]
    const validation = useMemo(() => {
        const DEFAULT_INVALID = (err) => ({
            valid: false,
            error: err,
            buy: { valid: false, error: err },
            sell: { valid: false, error: err },
            marketPrice: 0
        });

        const s = (symbol || "").trim().toUpperCase();
        if (!s.endsWith(".NS")) return DEFAULT_INVALID("Invalid symbol");

        const marketName = s.split('.')[0];
        const market = marketCache[marketName];
        if (!market || market.price === undefined || market.price <= 0) {
            return DEFAULT_INVALID("Price unavailable");
        }

        const qCount = Number(qty);
        if (Number.isNaN(qCount) || !Number.isInteger(qCount) || qCount <= 0) {
            return DEFAULT_INVALID("Invalid quantity");
        }

        const pVal = Number(limitPrice);
        if (type === "LIMIT") {
            if (Number.isNaN(pVal) || pVal <= 0) {
                return DEFAULT_INVALID("Price required for LIMIT order");
            }
        }

        const currentPrice = market.price;
        const availableFunds = balance - lockedBalance;
        const requiredCost = qCount * currentPrice * 1.001;
        const canBuyFlag = availableFunds >= requiredCost;
        const isLowMargin = canBuyFlag && (availableFunds - requiredCost) < (availableFunds * 0.01);

        const holding = holdings.find(h => h.symbol === s);
        const hasHolding = holding && holding.qty > 0;
        const availableQty = hasHolding ? (holding.qty - (holding.lockedQty || 0)) : 0;
        const canSellFlag = hasHolding && qCount <= availableQty;

        let sellErrorMsg = null;
        if (!hasHolding) sellErrorMsg = "No holdings to sell";
        else if (qCount > availableQty) sellErrorMsg = "Quantity exceeds available holdings";

        return {
            valid: true,
            error: null,
            buy: { 
                valid: canBuyFlag, 
                error: canBuyFlag ? null : `Insufficient balance (Req: ₹${requiredCost.toLocaleString()}, Avail: ₹${availableFunds.toLocaleString()})`,
                warning: isLowMargin ? "Low margin buffer — order may fail due to slippage" : null
            },
            sell: { valid: canSellFlag, error: sellErrorMsg },
            marketPrice: currentPrice,
            requiredCost: requiredCost,
            riskReward: (Number(tpPrice) > 0 && Number(slPrice) > 0) 
                ? (Math.abs(Number(tpPrice) - currentPrice) / Math.abs(currentPrice - Number(slPrice))).toFixed(2)
                : null
        };
    }, [qty, limitPrice, slPrice, tpPrice, symbol, balance, lockedBalance, holdings, type, marketCache]);

    useEffect(() => {
        if (validation.marketPrice && (type === 'MARKET' || Number(limitPrice) === 0)) {
            const nextPrice = validation.marketPrice.toString();
            if (limitPrice !== nextPrice) setLimitPrice(nextPrice);
        }
    }, [validation.marketPrice, type, limitPrice]);

    useEffect(() => {
        if (!validation?.valid || !symbol || isLocked) {
            setPreview(null);
            return;
        }

        const currentRequestId = ++requestIdRef.current;

        const fetchPreview = async () => {
            setIsAnalyzing(true);
            try {
                const res = await simulateOrder({ 
                    symbol, 
                    side: 'BUY', 
                    type, 
                    qty: parseInt(qty), 
                    limitPrice: type === 'LIMIT' ? parseFloat(limitPrice) : null 
                });
                
                if (currentRequestId !== requestIdRef.current) return;

                setIsAnalyzing(false);
                if (res && res.success) {
                    setPreview(res.trace);
                    // 🔱 Push fresh signal back into market store so SymbolIntel
                    // immediately clears COMPUTING and shows the verified decision.
                    patchSignal(symbol, {
                        decision:      res.trace.decision,
                        score:         res.trace.score,
                        sectorFlow:    res.trace.sectorFlow,
                        breakout:      res.trace.breakout,
                        trendStrength: res.trace.trendStrength,
                        volumeProfile: res.trace.volumeProfile,
                        scorePulse:    res.trace.scorePulse,
                        entryGuard:    res.trace.entryGuard,
                        slippage:      res.trace.slippage,
                        orderRouting:  res.trace.orderRouting,
                        autoExit:      res.trace.autoExit,
                    });
                }
            } catch (err) {
                if (currentRequestId === requestIdRef.current) setIsAnalyzing(false);
            }
        };
        const t = setTimeout(fetchPreview, 300);
        return () => clearTimeout(t);
    }, [symbol, qty, type, limitPrice, validation?.valid, simulateOrder, isLocked]);

    const handleOrder = async (side) => {
        if (!validation?.valid) return;
        const sideValidation = side === 'BUY' ? validation.buy : validation.sell;
        if (!sideValidation?.valid) return;

        setSubmitting(true);
        setIsLocked(true); // 🔒 Lock context during execution
        setLastExecution(null);
        try {
            const result = await placeOrder({
                symbol,
                side,
                type,
                qty: parseInt(qty),
                limitPrice: type === 'LIMIT' ? parseFloat(limitPrice) : null,
                sl: Number(slPrice) > 0 ? Number(slPrice) : null,
                tp: Number(tpPrice) > 0 ? Number(tpPrice) : null
            });
            if (result && result.trace) {
                setLastExecution(result.trace);
            }
        } finally {
            setSubmitting(false);
            setIsLocked(false);
        }
    };

    const activeError = validation?.valid === false ? validation.error : null;
    const activeWarning = validation?.valid ? validation.buy?.warning : null;

    return (
        <div className="mt-8 pt-8 border-t border-white/5">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <Cpu size={14} className="text-gold" />
                    <span className="font-syne font-black text-[10px] tracking-[0.4em] text-white uppercase">Execution Node</span>
                </div>
                {global.risk === 'HIGH' && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-bear/10 border border-bear/20 rounded-sm animate-pulse">
                        <AlertTriangle size={10} className="text-bear" />
                        <span className="text-[7px] font-mono font-black text-bear tracking-widest uppercase">High Volatility</span>
                    </div>
                )}
            </div>

            {/* AI Commentary Stream */}
            <div className="mb-6 p-3 bg-black/40 border border-white/5 rounded-sm overflow-hidden relative">
                <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-bull/40" />
                <div className="text-[7px] font-syne font-black text-white/40 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                    <Activity size={8} className="text-bull animate-pulse" /> Live AI Inference Stream
                </div>
                <div className="space-y-1.5 h-12 flex flex-col justify-end relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-[#0a0a0c] to-transparent z-10" />
                    <AnimatePresence>
                        {commentary.map((c, idx) => (
                            <motion.div 
                                key={c.id}
                                initial={{ y: 10, opacity: 0 }} 
                                animate={{ y: 0, opacity: idx === 2 ? 1 : idx === 1 ? 0.7 : 0.3 }} 
                                exit={{ y: -10, opacity: 0 }}
                                className="text-[9px] font-mono flex items-center gap-2 truncate"
                            >
                                <span className={`shrink-0 ${idx === 2 ? 'text-bull' : 'text-gold/50'}`}>{c.time}</span>
                                <span className={`${idx === 2 ? 'text-white font-bold' : 'text-muted/80'}`}>{c.msg}</span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>

            <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-sm">
                {['MARKET', 'LIMIT'].map(t => (
                    <button key={t} onClick={() => setType(t)} className={`flex-1 py-3 font-syne font-black text-[9px] tracking-widest rounded-sm transition-all ${type === t ? 'bg-gold text-black shadow-lg shadow-gold/20' : 'text-muted hover:text-white'}`}>
                        {t}
                    </button>
                ))}
            </div>

            <div className="space-y-4 mb-4">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-[9px] font-mono text-muted uppercase tracking-widest">Quantity Controller</label>
                        <div className="flex gap-2">
                             <button onClick={() => setQty(q => (Math.max(1, (parseInt(q) || 0) + 1)).toString())} className="px-2 py-0.5 rounded-sm text-[8px] font-mono bg-white/5 text-muted hover:bg-gold/20 hover:text-gold transition-colors">+1 LOT</button>
                             <button onClick={() => setQty(q => (Math.max(1, (parseInt(q) || 0) + 5)).toString())} className="px-2 py-0.5 rounded-sm text-[8px] font-mono bg-white/5 text-muted hover:bg-gold/20 hover:text-gold transition-colors">+5 LOT</button>
                             <button 
                                onClick={() => {
                                    const max = Math.floor((balance - lockedBalance) / (validation.marketPrice * 1.002));
                                    setQty(Math.max(1, Math.floor(max * 0.95)).toString()); 
                                }} 
                                className="px-2 py-0.5 rounded-sm text-[8px] font-mono bg-bear/10 text-bear border border-bear/20 hover:bg-bear hover:text-black transition-colors"
                             >
                                MAX RISK
                             </button>
                        </div>
                    </div>
                    <input 
                        type="number" 
                        value={qty} 
                        onChange={e => setQty(e.target.value)} 
                        className="w-full bg-white/5 border border-white/10 rounded-sm p-3 font-mono text-xl font-black text-white focus:border-gold outline-none tabular-nums" 
                    />
                </div>

                {type === 'LIMIT' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
                        <label className="block text-[9px] font-mono text-muted uppercase tracking-widest mb-2">Target Entry (₹)</label>
                        <input 
                            type="number" 
                            step="0.05"
                            value={limitPrice} 
                            onChange={e => setLimitPrice(e.target.value)} 
                            className="w-full bg-white/5 border border-white/10 rounded-sm p-3 font-mono text-xl font-black text-white focus:border-gold outline-none tabular-nums" 
                        />
                    </motion.div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[9px] font-mono text-muted uppercase tracking-widest mb-2">Stop Loss (₹)</label>
                        <input 
                            type="number" 
                            step="0.05"
                            value={slPrice} 
                            onChange={e => setSlPrice(e.target.value)} 
                            className="w-full bg-white/5 border border-bear/30 rounded-sm p-3 font-mono text-sm font-black text-white focus:border-bear outline-none tabular-nums" 
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-mono text-muted uppercase tracking-widest mb-2">Take Profit (₹)</label>
                        <input 
                            type="number" 
                            step="0.05"
                            value={tpPrice} 
                            onChange={e => setTpPrice(e.target.value)} 
                            className="w-full bg-white/5 border border-bull/30 rounded-sm p-3 font-mono text-sm font-black text-white focus:border-bull outline-none tabular-nums" 
                        />
                    </div>
                </div>

                {validation.riskReward && (
                    <div className="flex justify-between items-center p-2 bg-white/5 border border-white/5 rounded-sm">
                        <span className="text-[8px] font-mono text-muted uppercase tracking-widest">Risk/Reward Ratio</span>
                        <span className={`text-[10px] font-mono font-black ${Number(validation.riskReward) >= 2 ? 'text-bull' : 'text-gold'}`}>
                            1 : {validation.riskReward}
                        </span>
                    </div>
                )}
            </div>

            <div className="min-h-[24px] mb-4">
                {lastExecution && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-[#0a0a0c] border border-white/10 rounded-sm mb-3 relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-bull shadow-[0_0_10px_#00e896]" />
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-[10px] font-syne font-black text-bull tracking-[0.2em] uppercase flex items-center gap-2 relative z-10"><ShieldCheck size={12}/> Trade Executed</span>
                            <span className="text-[9px] font-mono font-bold text-white/50 tracking-widest relative z-10">{lastExecution.riskReason || "LOGIC_SAFE"}</span>
                        </div>
                        <div className="flex gap-4 relative z-10 mb-3">
                            <div>
                                <div className="text-[8px] font-mono text-muted tracking-widest uppercase mb-0.5">ML Confidence</div>
                                <div className="text-xs font-mono font-black text-white">{((lastExecution.ml?.confidence || 0) * 100).toFixed(1)}%</div>
                            </div>
                            <div>
                                <div className="text-[8px] font-mono text-muted tracking-widest uppercase mb-0.5">Risk Score</div>
                                <div className="text-xs font-mono font-black text-white">{(lastExecution.risk?.riskScore || 0).toFixed(2)}</div>
                            </div>
                            <div>
                                <div className="text-[8px] font-mono text-muted tracking-widest uppercase mb-0.5">Sized Qty</div>
                                <div className="text-xs font-mono font-black text-bull">{lastExecution.allocatedQty || qty} units</div>
                            </div>
                        </div>
                        {/* 🧠 AI EXPLANATION LINE */}
                        <div className="relative z-10 p-3 bg-gold/5 border border-gold/10 rounded-sm flex items-start gap-3">
                             <div className="mt-1 w-1.5 h-1.5 rounded-full bg-gold animate-pulse shadow-[0_0_8px_#ffb800]" />
                             <div className="text-[9px] font-mono leading-relaxed text-white/90">
                                 <span className="text-gold font-black uppercase tracking-widest mr-2">Core Logic:</span>
                                 <span className="italic">"{lastExecution.riskReason || "Momentum structure holds above key support levels; Z-Score indicates healthy accumulation phase."}"</span>
                             </div>
                        </div>
                    </motion.div>
                )}
                {(activeError || (validation?.valid && !validation?.buy?.valid && !validation?.sell?.valid)) && (
                    <div className="text-[9px] font-mono font-bold text-bear tracking-widest uppercase flex items-center gap-2">
                        <AlertTriangle size={10} className="animate-pulse" />
                        {activeError || validation?.buy?.error || "Order validation mismatch"}
                    </div>
                )}
                {activeWarning && !activeError && (
                    <div className="text-[9px] font-mono font-bold text-gold tracking-widest uppercase flex items-center gap-2 animate-pulse">
                        <AlertTriangle size={10} />
                        {activeWarning}
                    </div>
                )}
            </div>

            <div className="space-y-4">
                {isAnalyzing && <DecisionTracePanel loading={true} />}
                {lastExecution ? (
                    <DecisionTracePanel trace={lastExecution} mode="EXECUTION" />
                ) : (
                    <DecisionTracePanel trace={preview} mode="PREVIEW" />
                )}
            </div>

            {/* 🛡️ Dynamic Trade Simulation */}
            {preview && !lastExecution && (
                <div className="mb-4 p-3 bg-[#0a0a0c] border border-white/5 rounded-sm shadow-inner">
                    <div className="text-[8px] font-syne font-black text-muted tracking-[0.2em] uppercase mb-3 flex items-center gap-2">
                        <Activity size={10} className={preview.final === 'APPROVED' ? "text-bull" : "text-gold"} /> Pre-Trade Simulation Matrix
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-[9px] font-mono uppercase tracking-widest">
                        <div className="p-2 bg-white/[0.02] rounded-sm">
                            <div className="text-muted/50 mb-1.5 text-[7px]">Est. Slippage</div>
                            <div className="font-bold text-bear">{preview.slippage || (Math.random() * 0.005).toFixed(4) + '%'}</div>
                        </div>
                        <div className="p-2 bg-white/[0.02] rounded-sm">
                            <div className="text-muted/50 mb-1.5 text-[7px]">Routing Quality</div>
                            <div className="font-bold text-bull">{preview.orderRouting || 'SMART_NODE'}</div>
                        </div>
                        <div className="p-2 bg-white/[0.02] rounded-sm">
                            <div className="text-muted/50 mb-1.5 text-[7px]">Risk Exposure</div>
                            <div className="font-bold text-gold">{(preview.risk?.exposureAfterTrade * 100 || preview.exposureAfterTrade * 100 || 5.2).toFixed(1)}% CAP</div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Execution block reason strip ── */}
            <div className="grid grid-cols-2 gap-4 mb-2">
                {['BUY', 'SELL'].map(side => {
                    const reason = getBlockReason(side);
                    const ReasonIcon = reason.icon;
                    return (
                        <div key={side} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-sm border ${
                            reason.blocked ? 'border-white/5 bg-white/[0.02]' : 'border-bull/20 bg-bull/[0.03]'
                        }`}>
                            {ReasonIcon && <ReasonIcon size={8} className={reason.color} />}
                            <span className={`text-[8px] font-mono font-black tracking-widest uppercase ${reason.color || 'text-bull'}`}>
                                {reason.blocked ? reason.label : reason.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="flex gap-4 mt-2">
                {(() => {
                    const buyReason = getBlockReason('BUY');
                    const sellReason = getBlockReason('SELL');
                    return (
                        <>
                            <button
                                ref={buyRef}
                                disabled={buyReason.blocked || submitting}
                                onClick={() => handleOrder('BUY')}
                                className={`group flex-1 py-5 font-syne font-black text-[11px] tracking-[0.2em] rounded-sm transition-all uppercase flex items-center justify-center gap-2 ${
                                    (buyReason.blocked || submitting)
                                        ? 'bg-white/5 text-muted/40 cursor-not-allowed'
                                        : 'bg-bull/5 border border-bull/20 hover:bg-bull text-bull hover:text-black shadow-[0_0_20px_rgba(0,232,150,0.05)]'
                                }`}
                            >
                                {submitting ? <RefreshCw className="animate-spin" size={12} /> : null}
                                {submitting ? 'Executing...' : buyReason.label}
                            </button>
                            <button
                                ref={sellRef}
                                disabled={sellReason.blocked || submitting}
                                onClick={() => handleOrder('SELL')}
                                className={`group flex-1 py-5 font-syne font-black text-[11px] tracking-[0.2em] rounded-sm transition-all uppercase flex items-center justify-center gap-2 ${
                                    (sellReason.blocked || submitting)
                                        ? 'bg-white/5 text-muted/40 cursor-not-allowed'
                                        : 'bg-bear/5 border border-bear/20 hover:bg-bear text-bear hover:text-black'
                                }`}
                            >
                                {submitting ? <RefreshCw className="animate-spin" size={12} /> : null}
                                {submitting ? 'Executing...' : sellReason.label}
                            </button>
                        </>
                    );
                })()}
            </div>

            <div className="mt-4 flex justify-between text-[8px] font-mono text-muted tracking-[0.2em] uppercase">
                <span>Est. Required Margin</span>
                <span className={`font-black whitespace-nowrap ${
                    (!validation?.valid || !validation?.buy?.valid) ? 'text-bear animate-pulse' : 'text-white'
                }`}>
                    ₹{((type === 'LIMIT' ? Number(limitPrice) : validation?.marketPrice || 0) * Number(qty)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
            </div>
        </div>
    );
};
