import React from 'react';
import { useMarketStore } from '../../store/marketStore';
import { Shield, Zap, Database, Activity, Cpu } from 'lucide-react';

export const SystemHealthMonitor = () => {
    const market = useMarketStore(state => state.market);
    const global = useMarketStore(state => state.global);
    const health = useMarketStore(state => state.health);
    const feedState = useMarketStore(state => state.feedState);

    const tickers = Object.values(market);
    const liveSymbols = tickers.filter(t => t.status === 'LIVE' || t.status === 'CLOSED').length;
    const totalSymbols = tickers.length || 1;
    const integrity = Math.round((liveSymbols / totalSymbols) * 100);

    const metrics = [
        { 
            label: 'Market Feed', 
            status: feedState === 'LIVE' ? 'ACTIVE' : feedState === 'RECOVERING' ? 'HYDRATING' : 'STALLED',
            color: feedState === 'LIVE' ? 'text-bull' : 'text-gold',
            icon: Database
        },
        { 
            label: 'IQ Core', 
            status: integrity > 80 ? 'READY' : 'WARMING',
            color: integrity > 80 ? 'text-bull' : 'text-gold',
            icon: Cpu
        },
        { 
            label: 'Execution', 
            status: health?.broker_mode || 'SIMULATION',
            color: health?.broker_mode === 'LIVE' ? 'text-bull' : 'text-gold',
            icon: Zap
        },
        { 
            label: 'Continuity', 
            status: 'STABLE',
            color: 'text-bull',
            icon: Shield
        }
    ];

    return (
        <div className="glass p-4 rounded-sm border border-white/5 bg-white/[0.01]">
            <div className="flex items-center gap-3 mb-4">
                <Activity size={14} className="text-muted" />
                <span className="font-syne font-black text-[10px] tracking-[0.3em] uppercase text-white/80">Orchestration Health</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                {metrics.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-white/[0.02] rounded-sm border border-white/5">
                        <m.icon size={12} className={m.color} />
                        <div>
                            <div className="text-[7px] font-mono text-muted uppercase tracking-tighter">{m.label}</div>
                            <div className={`text-[10px] font-mono font-black uppercase ${m.color}`}>{m.status}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center">
                <span className="text-[7px] font-mono text-muted uppercase tracking-widest">Telemetry Integrity</span>
                <div className="flex items-center gap-2">
                    <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${integrity > 80 ? 'bg-bull' : 'bg-gold'}`} style={{ width: `${integrity}%` }} />
                    </div>
                    <span className="text-[9px] font-mono font-bold text-white">{integrity}%</span>
                </div>
            </div>
        </div>
    );
};
