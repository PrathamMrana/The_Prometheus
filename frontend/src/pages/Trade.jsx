import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useTradeStore } from '../store/tradeStore';
import { useMarketStore } from '../store/marketStore';
import { Search } from '../components/terminal/Search';
import { ChartPanel } from '../components/terminal/ChartPanel';
import { TradeTerminal } from '../components/terminal/TradeTerminal';
import { SymbolIntel } from '../components/terminal/SymbolIntel';
import {
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Info,
  Activity,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Trade = () => {
    const symbol = useTradeStore(state => state.selectedSymbol);
    const market = useMarketStore(state => state.market);
    
    // 🛡️ [PHASE 16] CONTEXT LOCK: Ensure all metrics are synced to the selected symbol
    const stock = useMemo(() => {
        const canonical = symbol.split('.')[0].toUpperCase();
        return market[canonical] || { price: 0, percent: 0, status: 'NO_DATA' };
    }, [symbol, market]);

    const isUp = (stock.percent || 0) >= 0;

    const buyBtnRef = React.useRef(null);
    const sellBtnRef = React.useRef(null);

    // ── Live timestamp tick ────────────────────────────────────────────────────
    const [tick, setTick] = useState(new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' }));
    useEffect(() => {
        const t = setInterval(() => setTick(new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' })), 1000);
        return () => clearInterval(t);
    }, []);

    // ── Signal history: last 5 decisions for this symbol ──────────────────────
    const orders = useTradeStore(state => state.orders) || [];
    const signalHistory = useMemo(() => {
        return orders
            .filter(o => o.symbol === symbol)
            .slice(-5)
            .reverse()
            .map(o => ({
                id: o.id,
                decision: o.side === 'BUY' ? 'BUY' : o.status === 'REJECTED' ? 'REJECT' : 'SELL',
                score: o.score ?? (o.side === 'BUY' ? 72 : 48),
                time: o.timestamp ? new Date(o.timestamp).toLocaleTimeString('en-IN', { hour12: false }) : '--:--:--',
                status: o.status
            }));
    }, [orders, symbol]);

    // ⚡ Keyboard Trading Matrix (Institutional)
    useEffect(() => {
        const handleKeys = (e) => {
            const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
            if (isInput) return;

            if (e.key === '/') {
                e.preventDefault();
                document.querySelector('input[placeholder*="SEARCH"]')?.focus();
            }
            if (e.key.toLowerCase() === 'b') {
                buyBtnRef.current?.click();
            }
            if (e.key.toLowerCase() === 's') {
                sellBtnRef.current?.click();
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, []);

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* 🪐 [TOP DECK] GLOBAL DISCOVERY & CONTEXT */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
                <div className="flex-1 w-full">
                    <Search />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* 📊 [ALPHA HUB] PRIMARY ANALYSIS (70%) */}
                <div className="lg:col-span-8 space-y-6">
                    <ChartPanel />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ── Left panel: SymbolIntel + Signal History + Safeguards ── */}
                <div className="glass p-6 rounded-sm border-l-2 border-gold flex flex-col bg-white/[0.01] space-y-6">
                    <SymbolIntel symbol={symbol} />

                    {/* 📊 SIGNAL HISTORY MINI-PANEL — fills center dead space */}
                    <div className="border-t border-white/5 pt-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Activity size={10} className="text-gold" />
                            <span className="text-[8px] font-syne font-black text-white/50 uppercase tracking-[0.3em]">Signal History</span>
                            <span className="ml-auto text-[7px] font-mono text-muted/30 flex items-center gap-1">
                                <Clock size={7} />{tick}
                            </span>
                        </div>
                        {signalHistory.length === 0 ? (
                            <div className="text-[8px] font-mono text-muted/30 tracking-widest uppercase py-3 text-center">
                                No executions yet for {symbol.split('.')[0]}
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <AnimatePresence initial={false}>
                                    {signalHistory.map((s, i) => (
                                        <motion.div
                                            key={s.id}
                                            initial={{ opacity: 0, x: -6 }}
                                            animate={{ opacity: i === 0 ? 1 : 0.5 - i * 0.1, x: 0 }}
                                            className="flex items-center justify-between px-2 py-1.5 rounded-sm bg-white/[0.02] border border-white/5"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                    s.decision === 'BUY' ? 'bg-bull' : s.decision === 'REJECT' ? 'bg-bear' : 'bg-gold'
                                                } ${i === 0 ? 'animate-pulse' : ''}`} />
                                                <span className={`text-[8px] font-mono font-black tracking-widest uppercase ${
                                                    s.decision === 'BUY' ? 'text-bull' : s.decision === 'REJECT' ? 'text-bear' : 'text-gold'
                                                }`}>{s.decision}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[7px] font-mono text-white/30">S:{s.score}</span>
                                                <span className="text-[7px] font-mono text-muted/40">{s.time}</span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    {/* Execution Safeguards — reduced visual weight */}
                    <div className="border-t border-white/5 pt-4">
                        <div className="flex items-center gap-2 mb-3">
                            <ShieldCheck size={10} className="text-gold/60" />
                            <span className="text-[8px] font-syne font-black text-white/40 uppercase tracking-[0.3em]">Execution Safeguards</span>
                        </div>
                        <ul className="space-y-2 font-mono text-[8px] text-muted tracking-widest uppercase">
                            <li className="flex justify-between">
                               <span>ML Entry Guard</span>
                               <span className={`${
                                   stock.signal?.entryGuard?.allowed ? 'text-bull' : 'text-bear'
                               } font-black`}>
                                   {stock.signal?.entryGuard?.allowed ? '● ENABLED' : '○ BLOCKED'}
                               </span>
                            </li>
                            <li className="flex justify-between">
                               <span>Dynamic Slippage</span>
                               <span className="text-gold font-black">
                                   {typeof stock.signal?.slippage === 'object'
                                       ? `±${((stock.signal.slippage.pct ?? 0.05) * 100).toFixed(2)}%`
                                       : (stock.signal?.slippage || '±0.05%')}
                               </span>
                            </li>
                            <li className="flex justify-between">
                               <span>Order Routing</span>
                               <span className="text-white font-black">
                                   {typeof stock.signal?.orderRouting === 'object'
                                       ? (stock.signal.orderRouting?.label || 'PROXIMAL')
                                       : (stock.signal?.orderRouting || 'PROXIMAL')}
                               </span>
                            </li>
                            <li className="flex justify-between">
                               <span>Auto-Exit Engine</span>
                               <span className={`${
                                   stock.signal?.autoExit === 'ARMED' ? 'text-bull animate-pulse' : 'text-muted/30'
                               } font-bold`}>
                                   {stock.signal?.autoExit === 'ARMED' ? '● ARMED' : '○ IDLE'}
                               </span>
                            </li>
                        </ul>
                    </div>
                </div>
                    </div>
                </div>

                {/* ⚡ [EXECUTION NODE] TRADE OPERATIONS (30%) */}
                <aside className="lg:col-span-4">
                    <div className="glass p-8 rounded-sm border-l-2 border-gold flex flex-col relative overflow-hidden bg-white/[0.02]">
                        {/* Background Gloss */}
                        <div className="absolute -top-24 -right-24 w-64 h-64 bg-gold/5 blur-[100px] rounded-full" />
                        
                        <div className="flex justify-between items-start mb-8 relative z-10">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap gap-2 items-center min-w-0">
                                    <h2 className="text-2xl md:text-3xl lg:text-4xl font-syne font-black text-white tracking-tighter mb-1 uppercase leading-none truncate">
                                        {symbol.split('.')[0]}
                                    </h2>
                                    <div className="flex items-center shrink-0 gap-1.5 px-2 py-0.5 rounded-sm bg-gold/10 border border-gold/20 text-[7px] font-mono font-black text-gold uppercase tracking-[0.2em] shadow-[0_0_15px_rgba(255,184,0,0.1)]">
                                        <ShieldCheck size={8} />
                                        CONTEXT LOCKED
                                    </div>
                                </div>
                                <div className="flex items-baseline gap-3">
                                    <span className="text-3xl font-mono font-black text-white tabular-nums tracking-tighter">
                                        ₹{stock.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className={`font-mono font-black text-[10px] px-2 py-0.5 rounded-sm bg-white/5 border border-white/5 ${isUp ? 'text-bull' : 'text-bear'}`}>
                                        {isUp ? '+' : ''}{stock.percent?.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                {/* 🔴 Live blinking status dot */}
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse shadow-[0_0_6px_rgba(0,232,150,0.8)]" />
                                    <span className="text-[7px] font-mono text-bull/70 tracking-widest">LIVE</span>
                                </div>
                                <div className={`px-3 py-1 rounded-sm text-[8px] font-mono font-black tracking-widest uppercase ${stock.status === 'SIM' ? 'bg-gold text-black border border-gold' : 'border border-bull/30 text-bull bg-bull/5'}`}>
                                    {stock.status || 'LIVE'}
                                </div>
                                {/* 🕒 Live IST clock */}
                                <span className="text-[7px] font-mono text-muted/30 tracking-widest">{tick} IST</span>
                            </div>
                        </div>

                        <TradeTerminal buyRef={buyBtnRef} sellRef={sellBtnRef} />
                    </div>

                    <div className="mt-6 p-4 rounded-sm border-l-2 border-white/5 bg-white/[0.01] flex items-center gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-muted group-hover:text-gold transition-colors">
                            <Info size={14} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-mono text-white font-black uppercase tracking-tighter">Decision Persistence</span>
                            <span className="text-[8px] font-mono text-muted uppercase tracking-widest leading-relaxed mt-1">
                                Terminal view is currently locked to {symbol.split('.')[0]} context for execution safety.
                            </span>
                        </div>
                    </div>
                </aside>
            </div>
        </motion.div>
    );
};

export default Trade;
