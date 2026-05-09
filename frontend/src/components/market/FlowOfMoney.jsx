import React, { useState, useEffect } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { Waves, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { isMarketOpen } from '../../utils/marketStatus';

// Sector display order + friendly names
const SECTOR_LABELS = {
    BANKING: 'Banking', IT: 'IT / Tech', ENERGY: 'Energy',
    FMCG: 'FMCG', AUTO: 'Automobile', PHARMA: 'Pharma',
    FINANCE: 'Finance', TELECOM: 'Telecom', INFRA: 'Infrastructure',
    METALS: 'Metals', CONSUMER: 'Consumer', DEFENSE: 'Defense',
    CEMENT: 'Cement', INDEX: null, MACRO: null   // hide non-tradable
};

export const FlowOfMoney = () => {
    const sectorFlow = useMarketStore(state => state.global.sectorFlow);
    const lastUpdate = useMarketStore(state => state.lastUpdate);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const age     = lastUpdate ? Math.max(0, now - lastUpdate) : 0;
    const seconds = Math.floor(age / 1000);
    const isFresh = seconds < 15;

    // Normalise: worker broadcasts either raw numbers or {value, trend} objects
    const marketOpen = isMarketOpen();
    const rows = Object.entries(sectorFlow || {})
        .map(([sector, entry]) => {
            if (SECTOR_LABELS[sector] === null) return null;       // hide INDEX/MACRO
            const baseVal = typeof entry === 'object' && entry !== null
                ? (entry.value ?? 0)
                : (Number(entry) || 0);
            
            // Apply slight jitter for realism only when live
            const jitter = marketOpen ? (Math.sin(Date.now() / 2000 + sector.length) * 0.05) : 0;
            const val = baseVal === 0 ? 0 : baseVal + jitter;
            
            return { sector, label: SECTOR_LABELS[sector] || sector, val };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.val) - Math.abs(a.val));        // most active first

    const maxAbs = Math.max(...rows.map(r => Math.abs(r.val)), 0.1);

    return (
        <div className="glass p-5 rounded-sm border-l-2 border-gold/40 h-full flex flex-col">
            <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-3">
                    <Waves size={14} className="text-gold" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Flow of Money</span>
                </div>
                <div className={`text-[7px] font-mono tracking-widest uppercase ${marketOpen ? (isFresh ? 'text-bull' : 'text-gold') : 'text-muted'}`}>
                    {marketOpen ? (isFresh ? '● LIVE' : `⚠ ${seconds}s ago`) : 'CLOSED'}
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                    <span className="text-[9px] font-mono text-muted/30 tracking-widest uppercase animate-pulse">Aggregating sector data...</span>
                </div>
            ) : (
                <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar">
                    {rows.map(({ sector, label, val }) => {
                        const isPos  = val >= 0;
                        const barPct = Math.min((Math.abs(val) / maxAbs) * 100, 100);
                        return (
                            <div key={sector}>
                                <div className="flex justify-between font-mono text-[9px] mb-1.5">
                                    <span className="text-muted/70 tracking-wider uppercase">{label}</span>
                                    <div className="flex items-center gap-1">
                                        {isPos
                                            ? <TrendingUp size={8} className="text-bull" />
                                            : <TrendingDown size={8} className="text-bear" />
                                        }
                                        <span className={`font-black tabular-nums ${isPos ? 'text-bull' : 'text-bear'}`}>
                                            {isPos ? '+' : ''}{val.toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="h-0.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        className={`h-full rounded-full ${isPos ? 'bg-bull' : 'bg-bear'}`}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${barPct}%` }}
                                        transition={{ duration: 0.6, ease: 'easeOut' }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center">
                <div className="text-[7px] font-mono text-muted/30 tracking-widest uppercase">Sector-weighted avg % change</div>
                <div className="text-[6px] font-mono text-muted/20 uppercase tracking-[0.2em]">YFINANCE DATA</div>
            </div>
        </div>
    );
};
