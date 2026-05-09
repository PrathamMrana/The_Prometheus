import React from 'react';
import { useMarketStore } from '../../store/marketStore';
import { Shield, Activity, Database, AlertCircle, CheckCircle2, Zap, Clock, Terminal } from 'lucide-react';
import { motion } from 'framer-motion';

export const TelemetryHealthPanel = () => {
    const health = useMarketStore(state => state.health);
    const telemetry = useMarketStore(state => state.telemetry);

    const isDefensive = health.status === 'DEFENSIVE';
    const isDegraded = health.status === 'DEGRADED';
    const statusColor = isDefensive ? 'text-bear' : isDegraded ? 'text-gold' : 'text-bull';
    const statusBg = isDefensive ? 'bg-bear/10' : isDegraded ? 'bg-gold/10' : 'bg-bull/10';
    const statusBorder = isDefensive ? 'border-bear/20' : isDegraded ? 'border-gold/20' : 'border-bull/20';

    return (
        <div className="glass p-6 rounded-sm border border-white/5 bg-gradient-to-br from-[#0a0a0c] to-[#121216]">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 ${statusBg} rounded-sm border ${statusBorder}`}>
                        <Shield size={18} className={statusColor} />
                    </div>
                    <div>
                        <h2 className="text-xs font-syne font-black tracking-[0.3em] uppercase text-white/90">Institutional Telemetry Hub</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-sm ${statusBg} ${statusColor} border ${statusBorder}`}>
                                {health.status} MODE
                            </span>
                            <span className="text-[8px] font-mono text-muted uppercase tracking-widest">
                                Integrity: {health.integrityScore}%
                            </span>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[8px] font-mono text-muted uppercase tracking-widest mb-1">Cycle Health</div>
                    <div className="text-lg font-mono font-black text-white">{health.integrityScore}%</div>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <MetricBox 
                    label="Feed Latency" 
                    value={`${health.avgLatency || 0}ms`} 
                    icon={Clock} 
                    color={health.avgLatency > 5000 ? 'text-bear' : health.avgLatency > 2000 ? 'text-gold' : 'text-bull'} 
                />
                <MetricBox 
                    label="Packet Loss" 
                    value={`${health.packetLoss || 0}%`} 
                    icon={Activity} 
                    color={health.packetLoss > 5 ? 'text-bear' : 'text-bull'} 
                />
                <MetricBox 
                    label="Stale Symbols" 
                    value={health.staleSymbols || 0} 
                    icon={AlertCircle} 
                    color={health.staleSymbols > 5 ? 'text-bear' : 'text-bull'} 
                />
                <MetricBox 
                    label="Active Adapters" 
                    value={health.activeAdapters?.length || 0} 
                    icon={Database} 
                    color="text-gold" 
                />
            </div>

            {/* Event Timeline */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                    <Terminal size={12} className="text-muted" />
                    <span className="text-[9px] font-syne font-bold tracking-[0.2em] uppercase text-muted">Telemetry Event Timeline</span>
                </div>
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 no-scrollbar">
                    {health.events?.length > 0 ? (
                        health.events.map((event, i) => (
                            <EventRow key={i} event={event} />
                        ))
                    ) : (
                        <div className="text-[9px] font-mono text-muted/30 italic py-4 text-center border border-dashed border-white/5 rounded-sm">
                            Waiting for telemetry synchronization events...
                        </div>
                    )}
                </div>
            </div>

            {/* Defensive Mode Banner */}
            {health.defensiveMode && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-4 bg-bear/10 border border-bear/30 rounded-sm flex items-center gap-4"
                >
                    <div className="p-2 bg-bear/20 rounded-sm animate-pulse">
                        <AlertCircle size={20} className="text-bear" />
                    </div>
                    <div>
                        <div className="text-[10px] font-syne font-black text-bear uppercase tracking-widest">Defensive Mode Active</div>
                        <div className="text-[9px] font-mono text-bear/70 mt-0.5">Execution propagation frozen due to telemetry integrity failure.</div>
                    </div>
                    <button className="ml-auto px-3 py-1 bg-bear/20 hover:bg-bear/30 border border-bear/30 text-[8px] font-mono font-bold text-bear uppercase tracking-widest rounded-sm transition-all">
                        Force Recovery
                    </button>
                </motion.div>
            )}
        </div>
    );
};

const MetricBox = ({ label, value, icon: Icon, color }) => (
    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-sm">
        <div className="flex justify-between items-start mb-2">
            <div className="text-[8px] font-mono text-muted uppercase tracking-widest">{label}</div>
            <Icon size={12} className={color} />
        </div>
        <div className={`text-sm font-mono font-black ${color}`}>{value}</div>
    </div>
);

const EventRow = ({ event }) => {
    const isError = event.type.includes('ERROR') || event.type.includes('FAILURE');
    return (
        <div className="flex items-center justify-between p-2 rounded-sm bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
            <div className="flex items-center gap-3">
                <div className={`w-1 h-1 rounded-full ${isError ? 'bg-bear' : 'bg-bull'}`} />
                <span className="text-[9px] font-mono font-black text-white/80 uppercase">{event.type}</span>
                <span className="text-[8px] font-mono text-muted uppercase truncate max-w-[200px]">
                    {event.sync_id ? `SID: ${event.sync_id}` : ''} {event.integrity ? `INT: ${event.integrity}%` : ''}
                </span>
            </div>
            <span className="text-[8px] font-mono text-muted/40">
                {new Date(event.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
            </span>
        </div>
    );
};
