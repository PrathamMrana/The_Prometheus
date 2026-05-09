import React from 'react';
import { useMarketStore } from '../../store/marketStore';
import { AlertTriangle, Database, Info, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const HealthBanner = () => {
    const global = useMarketStore(state => state.global);
    const health = global.data_health || 'LIVE';
    const brokerMode = useMarketStore(state => state.health?.broker_mode) || 'SIMULATION';
    const quality = global.data_quality_avg || 0;
    const gapCount = global.gap_count || 0;
    const activeSource = global.active_source || 'YFINANCE';

    if (health === 'LIVE' && brokerMode !== 'LIVE') return null;

    const config = {
        LIVE: {
            bg: 'bg-gold/10',
            border: 'border-gold/50',
            text: 'text-gold font-black',
            icon: ShieldCheck,
            msg: 'LIVE PILOT ARMED: Autonomous Execution Engine is ACTIVE via Alpaca Brokerage.'
        },
        DEGRADED: {
            bg: 'bg-gold/10',
            border: 'border-gold/30',
            text: 'text-gold',
            icon: Info,
            msg: `DATA FEED DEGRADED: Using secondary source (${activeSource}).`
        },
        PARTIAL: {
            bg: 'bg-bear/10',
            border: 'border-bear/30',
            text: 'text-bear',
            icon: AlertTriangle,
            msg: `DATA PARTIAL: ${gapCount} symbols missing from live feed (Using LKG Fallback).`
        },
        CRITICAL: {
            bg: 'bg-bear/20',
            border: 'border-bear/50',
            text: 'text-bear font-bold',
            icon: AlertTriangle,
            msg: 'DATA CRITICAL: Primary and Secondary sources failing. System in RECOVERY_MODE.'
        },
        RECOVERING: {
            bg: 'bg-gold/5',
            border: 'border-gold/20',
            text: 'text-gold',
            icon: Database,
            msg: 'TELEMETRY RECOVERY: Backend is hydrating from cached market snapshot. Live sync pending.'
        }
    };

    const current = (health === 'LIVE' && brokerMode === 'LIVE') ? config.LIVE : (config[health] || config.DEGRADED);
    const Icon = current.icon;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className={`mb-6 overflow-hidden`}
            >
                <div className={`p-3 rounded-sm border ${current.bg} ${current.border} flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                        <Icon size={14} className={current.text} />
                        <span className={`text-[10px] font-mono tracking-widest uppercase ${current.text}`}>
                            {current.msg}
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <span className="text-[7px] font-mono text-muted uppercase tracking-tighter">Avg Quality</span>
                            <span className={`text-[10px] font-mono font-black ${quality > 80 ? 'text-bull' : quality > 50 ? 'text-gold' : 'text-bear'}`}>
                                {quality}%
                            </span>
                        </div>
                        <div className="h-6 w-[1px] bg-white/10" />
                        <Database size={14} className="text-muted/40" />
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
