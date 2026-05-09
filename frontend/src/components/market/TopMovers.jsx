import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketStore } from '../../store/marketStore';
import { useTradeStore } from '../../store/tradeStore';
import { Flame, TrendingUp, TrendingDown, Activity, ArrowRight, Gauge } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFreshnessDisplay, isMarketOpen } from '../../utils/marketStatus';

export const TopMovers = () => {
    const gainers = useMarketStore(state => state.global.topMovers?.gainers || []);
    const losers  = useMarketStore(state => state.global.topMovers?.losers  || []);
    const regime  = useMarketStore(state => state.global.regime || 'SIDEWAYS');
    const setSelectedSymbol = useTradeStore(state => state.setSelectedSymbol);
    const setFreeze = useMarketStore(state => state.setFreeze);
    const navigate = useNavigate();
    
    const safeGainers = Array.isArray(gainers) ? gainers : [];
    const safeLosers = Array.isArray(losers) ? losers : [];
    const allMovers = [...safeGainers, ...safeLosers].filter(m => m && typeof m === 'object');
    
    // 🔱 Market-aware freshness
    const latestTs = allMovers.length > 0 ? Math.max(...allMovers.map(m => m.timestamp || 0)) : 0;
    const anyStatus = allMovers.find(m => m?.status)?.status;
    const freshness = getFreshnessDisplay(latestTs, anyStatus);
    const marketClosed = !isMarketOpen();

    const MoverRow = ({ q, side }) => {
        const isUp = side === 'gainer';
        const pct  = typeof q.pct_change === 'number' ? q.pct_change : 0;
        const sm = q.signal?.smartMoney;
        const classification = sm?.classification || 'NEUTRAL';
        const smScore = sm?.score || 0;

        return (
            <div 
                onClick={() => {
                    setFreeze(false);
                    setSelectedSymbol(q.symbol);
                    navigate('/trade');
                }}
                className={`flex justify-between items-center py-2 px-2 border-b border-white/[0.04] last:border-0 cursor-pointer transition-all duration-300 ${
                    classification === 'ACCUMULATION' ? 'bg-bull/[0.03] border-l-2 border-l-bull shadow-[inset_4px_0_10px_rgba(0,232,150,0.05)]' :
                    classification === 'DISTRIBUTION' ? 'bg-bear/[0.03] border-l-2 border-l-bear shadow-[inset_4px_0_10px_rgba(255,100,100,0.05)]' :
                    classification === 'FAKE_BREAKOUT' ? 'bg-gold/[0.03] border-l-2 border-l-gold' :
                    'hover:bg-white/[0.02]'
                }`}
            >
                <div className="flex flex-col">
                    <span className="font-mono text-[10px] font-black text-white/90 tracking-tight">
                        {(q.symbol || '').split('.')[0]}
                    </span>
                    {sm && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[6px] font-black tracking-tighter uppercase ${
                                classification === 'ACCUMULATION' ? 'text-bull' : 
                                classification === 'DISTRIBUTION' ? 'text-bear' : 
                                'text-muted'
                            }`}>
                                SM: {smScore.toFixed(1)}
                            </span>
                            <span className="text-[5px] text-white/20">|</span>
                            <span className="text-[6px] font-mono text-muted/60">VR: {sm.vr?.toFixed(1)}x</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {classification !== 'NEUTRAL' && (
                        <span className={`text-[7px] font-black tracking-widest px-1.5 py-0.5 rounded shadow-sm ${
                            classification === 'ACCUMULATION' ? 'bg-bull text-black' : 
                            classification === 'DISTRIBUTION' ? 'bg-bear text-white' : 
                            'bg-gold/20 text-gold'
                        }`}>{classification}</span>
                    )}
                    <span className={`font-mono text-[10px] font-bold tabular-nums ${ isUp ? 'text-bull' : 'text-bear' }`}>
                        {isUp ? '+' : ''}{pct.toFixed(2)}%
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="glass p-5 rounded-sm border-l-2 border-gold/40">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Flame size={14} className="text-gold" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Top Movers</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[7px] text-muted tracking-widest uppercase">
                    <span>Source: YFinance</span>
                    <div className="w-[1px] h-2 bg-white/10" />
                    <span className={freshness.color}>{freshness.text}</span>
                </div>
            </div>
            <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
                {/* 🟢 TOP GAINERS */}
                <div>
                    <div className="flex items-center gap-2 mb-3 px-2 py-1 rounded bg-bull/5 border border-bull/10">
                        <TrendingUp size={10} className="text-bull" />
                        <span className="text-[9px] font-mono text-bull font-black tracking-widest uppercase">Top Gainers</span>
                    </div>
                    <div className="space-y-1">
                        {safeGainers.length > 0 ? safeGainers.map((q, i) => (
                            <MoverRow key={i} q={q} side="gainer" />
                        )) : (
                            <div className="text-[7px] font-mono text-muted/20 py-4 text-center border border-dashed border-white/5 uppercase">No Gainer Data</div>
                        )}
                    </div>
                </div>

                {/* 🔴 TOP LOSERS */}
                <div>
                    <div className="flex items-center gap-2 mb-3 px-2 py-1 rounded bg-bear/5 border border-bear/10">
                        <TrendingDown size={10} className="text-bear" />
                        <span className="text-[9px] font-mono text-bear font-black tracking-widest uppercase">Top Losers</span>
                    </div>
                    <div className="space-y-1">
                        {safeLosers.length > 0 ? safeLosers.map((q, i) => (
                            <MoverRow key={i} q={q} side="loser" />
                        )) : (
                            <div className="text-[7px] font-mono text-muted/20 py-4 text-center border border-dashed border-white/5 uppercase">No Loser Data</div>
                        )}
                    </div>
                </div>

                {/* ⚖️ ALPHA SPREAD (3rd Column) */}
                <div className="hidden lg:block border-l border-white/5 pl-6">
                    <div className="flex items-center justify-between mb-3 px-2 py-1 rounded bg-gold/5 border border-gold/10">
                        <div className="flex items-center gap-2">
                            <Activity size={10} className="text-gold" />
                            <span className="text-[9px] font-mono text-gold font-black tracking-widest uppercase">Alpha Spread</span>
                        </div>
                        {/* 🛡️ SYNC STATUS LED — market-aware */}
                        <div className="flex items-center gap-1.5">
                            <span className={`w-1 h-1 rounded-full ${
                                marketClosed ? 'bg-muted opacity-40' :
                                freshness.color.includes('bull') ? 'bg-bull animate-pulse shadow-[0_0_5px_rgba(0,232,150,0.5)]' :
                                freshness.color.includes('gold') ? 'bg-gold' : 'bg-bear'
                            }`} />
                            <span className="text-[6px] font-mono text-muted/40 uppercase tracking-tighter">
                                {marketClosed ? 'CLOSED' : freshness.text}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col justify-center h-full min-h-[160px] bg-white/[0.01] border border-white/5 rounded-sm p-5 text-center relative overflow-hidden group">
                        {/* 🛡️ BACKGROUND VOLATILITY PULSE */}
                        <div className={`absolute inset-0 opacity-[0.03] pointer-events-none transition-colors duration-1000 ${!marketClosed && freshness.color.includes('bull') ? 'bg-gold' : 'bg-transparent'}`} />
                        
                        <div className="relative z-10">
                            <AnimatePresence mode="wait">
                                    <motion.div 
                                        key={safeGainers.length > 0 && safeLosers.length > 0 ? ((Number(safeGainers[0]?.pct_change || 0) - Number(safeLosers[0]?.pct_change || 0)).toFixed(2)) : 'empty'}
                                        initial={{ opacity: 0.8, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-[24px] font-mono font-black text-white tabular-nums leading-none tracking-tighter"
                                    >
                                        {safeGainers.length > 0 && safeLosers.length > 0 ? (
                                            (Number(safeGainers[0]?.pct_change || 0) - Number(safeLosers[0]?.pct_change || 0)).toFixed(2)
                                        ) : '---'}%
                                    </motion.div>
                            </AnimatePresence>
                            <div className="text-[7px] font-mono text-muted uppercase tracking-[0.2em] mt-3 font-bold">Market Dispersion</div>
                            
                            {/* 🛡️ SPREAD DETAILS (Institutional Clarity) */}
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <div className="p-1.5 bg-white/[0.02] border border-white/5 rounded-sm">
                                    <div className="text-[6px] text-muted/40 uppercase mb-0.5">High</div>
                                    <div className="text-[8px] font-mono font-black text-bull">+{safeGainers[0]?.pct_change?.toFixed(2) || '0.00'}%</div>
                                </div>
                                <div className="p-1.5 bg-white/[0.02] border border-white/5 rounded-sm">
                                    <div className="text-[6px] text-muted/40 uppercase mb-0.5">Low</div>
                                    <div className="text-[8px] font-mono font-black text-bear">{safeLosers[0]?.pct_change?.toFixed(2) || '0.00'}%</div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-white/5 relative z-10">
                            <div className="flex items-center justify-center gap-2 text-[8px] font-mono text-muted/50 uppercase leading-relaxed font-bold">
                                <Gauge size={10} className="text-gold/40" />
                                <span>Regime: <span className="text-gold tracking-widest">{regime}</span></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
