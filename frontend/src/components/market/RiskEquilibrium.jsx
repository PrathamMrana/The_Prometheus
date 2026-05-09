import React from 'react';
import { useMarketStore } from '../../store/marketStore';
import { motion } from 'framer-motion';

export const RiskEquilibrium = () => {
    const riskControl = useMarketStore(state => state.global.risk) || 'MEDIUM';
    // 🛡️ [FIX] Store strips '^' from all symbols — key is 'INDIAVIX' not '^INDIAVIX'
    const vixRaw = useMarketStore(state =>
        state.market['INDIAVIX']?.price ??
        state.market['^INDIAVIX']?.price ??
        null
    );
    const vixValue = (Number.isFinite(Number(vixRaw)) && Number(vixRaw) > 0)
        ? Number(vixRaw)
        : null;

    // 🛡️ MAX_VIX=40 = industry-safe extreme ceiling
    const MAX_VIX = 40;
    const riskPercent = vixValue !== null
        ? Math.min((vixValue / MAX_VIX) * 100, 100)
        : 35;

    // 🛡️ Dynamic risk classification derived from VIX (independent of backend label)
    const computedRisk = vixValue !== null
        ? (vixValue >= 20 ? 'HIGH' : vixValue >= 14 ? 'MEDIUM' : 'LOW')
        : riskControl;

    const riskColors = {
        "LOW":    "text-bull bg-bull/10",
        "MEDIUM": "text-gold bg-gold/10",
        "HIGH":   "text-bear bg-bear/10"
    };

    const riskBarColors = {
        "LOW":    "bg-bull shadow-[0_0_10px_#00e896]",
        "MEDIUM": "bg-gold shadow-[0_0_10px_#facc15]",
        "HIGH":   "bg-bear shadow-[0_0_10px_#ff4545]"
    };

    const borderColor = computedRisk === 'HIGH' ? '#ff4545' : computedRisk === 'MEDIUM' ? '#facc15' : '#00e896';

    const interpretationText = vixValue !== null
        ? `VIX: ${vixValue.toFixed(2)} → ${computedRisk} RISK (${Math.round(riskPercent)}%)`
        : `RISK: ${computedRisk}`;

    return (
        <div className="p-6 glass border-l-2 flex flex-col justify-center min-h-[140px]" style={{ borderColor }}>
            <div className="flex justify-between items-center mb-4">
                <span className="font-syne font-black text-[10px] tracking-[0.4em] text-muted uppercase">Risk Equilibrium</span>
                <span className={`font-mono text-[9px] font-black px-2 py-0.5 rounded ${riskColors[computedRisk] || riskColors.MEDIUM}`}>
                    {computedRisk}
                </span>
            </div>
            <div className="relative h-2 w-full bg-white/5 rounded-sm overflow-hidden mt-1 border border-white/5">
                {/* 🛡️ Background Track Zones */}
                <div className="absolute inset-0 flex opacity-20">
                    <div className="h-full bg-bull" style={{ width: '35%' }} /> {/* LOW < 14 */}
                    <div className="h-full bg-gold" style={{ width: '15%' }} /> {/* MED 14-20 */}
                    <div className="h-full bg-bear" style={{ width: '50%' }} /> {/* HIGH > 20 */}
                </div>
                
                <motion.div
                    className={`h-full ${riskBarColors[computedRisk] || riskBarColors.MEDIUM} relative z-10 border-r border-white/40`}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    animate={{ width: `${riskPercent}%` }}
                >
                    <div className="absolute right-0 top-[-4px] bottom-[-4px] w-0.5 bg-white shadow-[0_0_8px_white] z-20" />
                </motion.div>
            </div>
            
            <div className="mt-4 flex flex-col gap-1">
                <span className={`font-mono text-[10px] font-black tracking-widest uppercase ${riskColors[computedRisk]?.split(' ')[0]}`}>
                    {interpretationText}
                </span>
                <div className="flex justify-between font-mono text-[7px] text-muted tracking-tight uppercase opacity-60">
                    <span>Zones: LOW (0–14) | MED (14–20) | HIGH (20–40)</span>
                    <span>▲ Current Pos</span>
                </div>
            </div>
            
            <div className="flex justify-between mt-3 font-mono text-[8px] text-muted tracking-widest uppercase">
                <div className="flex items-center gap-2">
                    <span className="opacity-40">VOLATILITY</span>
                    <span className={vixValue !== null ? (computedRisk === 'HIGH' ? 'text-bear font-black' : computedRisk === 'MEDIUM' ? 'text-gold font-black' : 'text-bull font-black') : 'text-muted/40'}>
                        {vixValue !== null ? vixValue.toFixed(2) : '---'}
                    </span>
                    <span className="text-[6px] opacity-20 tracking-tighter">({computedRisk} RISK)</span>
                </div>
                <span className="text-muted/40 font-black">SCALE 0–40</span>
            </div>
            <div className="flex justify-between mt-2 font-mono text-[6px] tracking-widest">
                <span className="text-bull/60">LOW &lt;14</span>
                <span className="text-gold/60">MED 14–20</span>
                <span className="text-bear/60">HIGH &gt;20</span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
                <div className="text-[7px] font-mono text-muted/40 uppercase tracking-widest">
                    Source: Yahoo Finance (Live WS)
                </div>
                <div className="text-[7px] font-mono text-bull/60 uppercase tracking-widest">
                    Pulsing · 0.5s intervals
                </div>
            </div>
        </div>
    );
};
