import React from 'react';
import { useMarketStore } from '../../store/marketStore';
import { Target } from 'lucide-react';

export const AnomalyRadar = () => {
    const anomalies = useMarketStore(state => state.anomalies);
    const display = anomalies.length > 0 ? anomalies.slice(0, 2) : [];

    return (
        <div className="glass p-5 rounded-sm border-l-2 border-bear">
            <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-3 text-bear">
                    <Target size={14} className="animate-pulse" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] uppercase">Anomaly Radar</span>
                </div>
            </div>
            <div className="space-y-3">
                {display.length > 0 ? display.map((err, i) => (
                    <div key={i} className="p-3 bg-bear/5 border border-bear/10 rounded-sm">
                        <div className="text-[8px] font-mono font-black text-bear tracking-[0.2em] mb-1 uppercase opacity-60 text-right">{err.level || err.severity}</div>
                        <div className="text-[10px] font-inter text-white/90 leading-relaxed font-semibold">"{err.text || err.msg}"</div>
                    </div>
                )) : (
                    <div className="p-3 border border-white/5 rounded-sm flex items-center justify-center min-h-[60px]">
                        <span className="text-[9px] font-mono tracking-widest text-muted">NO STRUCTURAL ANOMALIES</span>
                    </div>
                )}
            </div>
        </div>
    );
};
