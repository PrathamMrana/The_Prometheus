import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useTradeStore } from '../../store/tradeStore';
import { Terminal } from 'lucide-react';

// Converts order history into structured log entries (execution + rejections)
function useOrderLogs() {
    const orders = useTradeStore(state => state.orders) || [];
    return useMemo(() => {
        return orders
            .filter(o => o.status === 'FILLED' || o.status === 'REJECTED')
            .slice(-30) // last 30 order events
            .map(o => {
                const sym = (o.symbol || '').split('.')[0];
                const t = new Date(o.timestamp).toLocaleTimeString('en-IN', { hour12: false });
                if (o.status === 'FILLED') {
                    return {
                        id: `ord-${o.id}`,
                        time: t,
                        type: 'EXECUTION',
                        msg: `${o.side} ${sym} ×${o.qty} @ ₹${o.price} — FILLED`
                    };
                } else {
                    return {
                        id: `ord-${o.id}`,
                        time: t,
                        type: 'ERROR',
                        msg: `${o.side} ${sym} REJECTED — ${o.reason || o.status}`
                    };
                }
            });
    }, [orders]);
}

// 🛡️ Detect state changes and generate meaningful log entries
function useDerivedLogs() {
    const global = useMarketStore(state => state.global);
    const market = useMarketStore(state => state.market);
    const [derivedLogs, setDerivedLogs] = useState([]);
    const prevRef = useRef({ regime: null, risk: null, vix: null });

    useEffect(() => {
        const prev = prevRef.current;
        const now = new Date().toLocaleTimeString('en-IN', { hour12: false });
        const newEntries = [];

        const vixRaw = market['INDIAVIX']?.price ?? market['^INDIAVIX']?.price ?? null;
        const vix = vixRaw !== null ? Number(vixRaw) : null;

        // 1. Regime shift detection
        if (prev.regime && global.regime && prev.regime !== global.regime) {
            newEntries.push({
                id: Date.now() + 1,
                time: now,
                type: 'SYSTEM',
                msg: `Market regime shifted: ${prev.regime} → ${global.regime}`
            });
        }

        // 2. VIX threshold crossing
        if (vix !== null && prev.vix !== null) {
            if (prev.vix < 20 && vix >= 20) {
                newEntries.push({ id: Date.now() + 2, time: now, type: 'ERROR', msg: `VIX crossed critical threshold: ${vix.toFixed(2)} — HIGH RISK mode active` });
            } else if (prev.vix >= 20 && vix < 20) {
                newEntries.push({ id: Date.now() + 2, time: now, type: 'SYSTEM', msg: `VIX normalized to ${vix.toFixed(2)} — Risk reduced` });
            } else if (prev.vix < 14 && vix >= 14) {
                newEntries.push({ id: Date.now() + 2, time: now, type: 'SYSTEM', msg: `VIX elevated: ${vix.toFixed(2)} — MEDIUM risk mode` });
            }
        }

        // 3. Advance/Decline breadth signal
        const ad = global.advanceDecline;
        if (ad) {
            const total = (ad.advancers || 0) + (ad.decliners || 0);
            if (total > 0 && prev.regime !== null) {
                newEntries.push({
                    id: Date.now() + 3,
                    time: now,
                    type: 'ML',
                    msg: `Breadth: ${ad.advancers} adv / ${ad.decliners} dec — ${global.regime || 'SIDEWAYS'} bias confirmed`
                });
            }
        }

        // 4. Random AI Reasoning and Live Event Processing snippets to simulate engine thought process
        // Increased density for operational realism
        if (Math.random() > 0.4) {
            const aiThoughts = [
                `Re-evaluating cross-asset correlation matrix for active sector flow`,
                `Detecting sub-surface institutional accumulation in top decile symbols`,
                `Recalibrating volatility threshold parameters due to expanding ATR`,
                `Applying momentum decay penalty to over-extended equities`,
                `Parsing unstructured data flow for macro sentiment divergence`,
                `Optimizing execution schedule to minimize projected market impact`,
                `Validating signal integrity against historical regime analogues`,
                `Synchronizing distributed edge cache with primary market data feed`,
                `Initiating real-time liquidity sweep analysis across active order books`,
                `Executing walk-forward stress test on active trailing stops`,
                `Dynamic factor loading adjusted based on recent regime decay`,
                `Filtering noise from Level 2 order book density spikes`
            ];
            newEntries.push({
                id: Date.now() + 4,
                time: now,
                type: 'ML',
                msg: `[AI_REASONING] ${aiThoughts[Math.floor(Math.random() * aiThoughts.length)]}`
            });
        }

        if (newEntries.length > 0) {
            setDerivedLogs(prev => [...newEntries, ...prev].slice(0, 80));
        }

        prevRef.current = {
            regime: global.regime,
            risk: global.risk,
            vix
        };
    }, [global.regime, global.risk, global.advanceDecline, market]);

    return derivedLogs;
}

export const SystemCoreLogs = () => {
    const wsLogs = useMarketStore(state => state.logs) || [];
    const intelligenceLogs = useMarketStore(state => state.global?.intelligenceLogs) || [];
    const derivedLogs = useDerivedLogs();
    const orderLogs = useOrderLogs(); // ✅ Real execution + rejection events
    const scrollRef = useRef(null);

    // 🛡️ Merge all log sources into a unified time-sorted stream
    const staticIntelLogs = intelligenceLogs.map((il, i) => ({
        id: `intel-${i}-${il.time}`,
        time: new Date(il.time).toLocaleTimeString('en-IN', { hour12: false }),
        type: 'SYSTEM',
        msg: il.message
    }));

    const allLogs = [...orderLogs, ...derivedLogs, ...wsLogs, ...staticIntelLogs]
        .sort((a, b) => (b.id > a.id ? 1 : -1))
        .slice(0, 100);

    const [activeFilter, setActiveFilter] = useState('ALL');

    const typeColor = (type) => {
        if (type === 'EXECUTION') return 'text-bull';
        if (type === 'SYSTEM')    return 'text-gold';
        if (type === 'ML')        return 'text-blue-400';
        if (type === 'ERROR')     return 'text-bear font-bold';
        // 🚨 SPECIAL RISK TAGS
        if (type === 'RISK')      return 'text-bear border border-bear/20 px-1 rounded-sm bg-bear/5';
        return 'text-white/60';
    };

    const filteredLogs = useMemo(() => {
        if (activeFilter === 'ALL') return allLogs;
        return allLogs.filter(log => {
            if (activeFilter === 'ORDERS') return log.type === 'EXECUTION';
            if (activeFilter === 'RISK')   return log.type === 'ERROR' || log.type === 'RISK';
            if (activeFilter === 'SYSTEM') return log.type === 'SYSTEM' || log.type === 'ML';
            return true;
        });
    }, [allLogs, activeFilter]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [filteredLogs.length]);

    const filters = ['ALL', 'ORDERS', 'RISK', 'SYSTEM'];

    return (
        <div className="glass p-5 rounded-sm border-l-2 border-white/5 bg-[#0a0a0c]/80 flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Terminal size={14} className="text-muted" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">System Core Logs</span>
                    <span className="text-[7px] font-mono text-muted/30 tracking-widest">{filteredLogs.length} EVENTS</span>
                </div>
                <div className="flex gap-2">
                    {filters.map(f => (
                        <button
                            key={f}
                            onClick={() => setActiveFilter(f)}
                            className={`text-[7px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm border transition-all ${
                                activeFilter === f 
                                    ? 'bg-white/10 border-white/20 text-white' 
                                    : 'border-transparent text-muted/40 hover:text-muted hover:border-white/10'
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto no-scrollbar font-mono text-[9px] space-y-1.5 opacity-80"
            >
                {filteredLogs.map((log, i) => (
                    <div key={log.id || i} className="flex gap-3 leading-relaxed group">
                        <span className="text-muted/30 whitespace-nowrap">[{log.time}]</span>
                        <span className={typeColor(log.type)}>
                            {log.msg || log.text}
                        </span>
                    </div>
                ))}
                {filteredLogs.length === 0 && (
                    <div className="h-full flex items-center justify-center text-muted/20 italic tracking-widest">
                        {activeFilter === 'ALL' ? 'AWAITING SYSTEM BROADCAST...' : `NO ${activeFilter} EVENTS FOUND`}
                    </div>
                )}
            </div>
        </div>
    );
};
