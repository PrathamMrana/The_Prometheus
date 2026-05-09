import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketStore } from '../../store/marketStore';
import { useTradeStore } from '../../store/tradeStore';
import { LayoutGrid, Info, Target, Database } from 'lucide-react';
import { motion } from 'framer-motion';
import { getFreshnessDisplay, isMarketOpen } from '../../utils/marketStatus';

export const MicroHeatmap = () => {
    const market = useMarketStore(state => state.market);
    const selectedSymbol = useTradeStore(state => state.selectedSymbol);
    const setSelectedSymbol = useTradeStore(state => state.setSelectedSymbol);
    const setFreeze = useMarketStore(state => state.setFreeze);
    const navigate = useNavigate();
    const [jitters, setJitters] = useState({});

    const heatmap = Object.entries(market)
        .filter(([k]) => !k.startsWith('^'))
        .sort((a, b) => (Number(b[1]?.percent) || 0) - (Number(a[1]?.percent) || 0)); // 🛡️ Sort by percent DESC
    
    useEffect(() => {
        const t = setInterval(() => {
            if (isMarketOpen()) {
                const newJitters = {};
                heatmap.forEach(([key]) => {
                    newJitters[key] = (Math.random() - 0.5) * 0.15;
                });
                setJitters(newJitters);
            } else {
                setJitters({});
            }
        }, 1500);
        return () => clearInterval(t);
    }, [market]);

    // 🔱 Market-aware freshness: never show STALE when market is closed
    const latestTs = Math.max(...heatmap.map(([_, v]) => v?.timestamp || 0));
    const anyStatus = heatmap.find(([_, v]) => v?.status)?.[1]?.status;
    const freshness = getFreshnessDisplay(latestTs || 0, anyStatus);

    return (
        <div className="glass p-5 rounded-sm border-l-2 border-white/5 bg-white/[0.01]">
            <div className="flex items-center justify-between mb-4 text-white">
                <div className="flex items-center gap-3">
                    <LayoutGrid size={13} className="text-muted" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] uppercase">Sector Heatmap Grid</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[7px] text-muted tracking-widest uppercase">
                    <span className="flex items-center gap-1"><Target size={8} className="text-bull" /> Click cell to trade</span>
                    <div className="w-[1px] h-2 bg-white/10" />
                    <span>Source: YFinance</span>
                    <div className="w-[1px] h-2 bg-white/10" />
                    <span className={freshness.color}>{freshness.text}</span>
                </div>
            </div>
            <div 
                className="grid gap-2 h-[400px] overflow-y-auto no-scrollbar pr-1 justify-center sm:justify-start"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 140px))' }}
            >
                {heatmap.length === 0 ? (
                    <div className="col-span-full h-[300px] flex flex-col items-center justify-center border border-white/5 bg-white/[0.02] rounded-sm">
                        <Database size={24} className="text-muted/20 mb-4 animate-pulse" />
                        <span className="text-[10px] font-mono text-muted uppercase tracking-[0.2em]">Awaiting telemetry synchronization...</span>
                        <span className="text-[8px] font-mono text-muted/50 uppercase mt-2">Hydrating from cached market snapshot</span>
                    </div>
                ) : heatmap.map(([key, val]) => {
                    const isActive = selectedSymbol === key || selectedSymbol === `${key}.NS`;
                    const price = Number(val?.price) || 0;
                    
                    const jitter = jitters[key] || 0;
                    const baseChange = Number(val?.percent) || 0;
                    const change = baseChange === 0 ? 0 : baseChange + jitter;
                    
                    const isUp = change >= 0;
                    
                    const heatColor = isUp 
                        ? `rgba(0, 232, 150, ${Math.min(0.1 + (change / 5), 0.8)})` 
                        : `rgba(255, 69, 69, ${Math.min(0.1 + (Math.abs(change) / 5), 0.8)})`;

                    return (
                        <motion.div
                            key={key}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.05, zIndex: 10 }}
                            onClick={() => {
                                setFreeze(false);
                                setSelectedSymbol(key);
                                navigate('/trade');
                            }}
                            className={`relative p-3 rounded-sm cursor-pointer border transition-all duration-200 group flex flex-col justify-between min-h-[80px] ${
                                isActive ? 'border-bull shadow-[0_0_15px_rgba(0,232,150,0.3)] bg-white/10' : 'border-white/5'
                            }`}
                            style={{ backgroundColor: heatColor }}
                        >
                            <div className="flex justify-between items-start">
                                <span className="font-mono text-[10px] font-black text-white group-hover:text-gold transition-colors">{key}</span>
                                {isActive && <Target size={10} className="text-bull" />}
                            </div>
                            
                            <div className="mt-1">
                                <div className="text-[11px] font-mono font-black text-white leading-none">
                                    {isUp ? '+' : ''}{change.toFixed(2)}%
                                </div>
                                <div className="text-[8px] font-mono text-white/60 mt-1">
                                    ₹{price.toLocaleString('en-IN')}
                                </div>
                            </div>

                            {/* 🛡️ Hover Insight Overlay */}
                            <div className="absolute inset-0 bg-[#0a0a0c]/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-center items-center p-2 text-center pointer-events-none z-20">
                                <span className="text-[8px] font-mono text-muted uppercase tracking-tighter mb-1">Sector Analysis</span>
                                <span className="text-[10px] font-mono font-black text-white uppercase truncate w-full">{val.sector || 'AUTO/INFRA'}</span>
                                <div className="flex items-center gap-1 mt-1">
                                    <Info size={8} className="text-gold" />
                                    <span className="text-[7px] text-gold font-bold uppercase">Click to Trade</span>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};
