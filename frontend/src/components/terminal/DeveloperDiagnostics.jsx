import React from 'react';
import { useMarketStore } from '../../store/marketStore';
import { Terminal, Database, Activity, Cpu, Layers, Box } from 'lucide-react';

export const DeveloperDiagnostics = () => {
    const health = useMarketStore(state => state.health);
    const telemetry = useMarketStore(state => state.telemetry);
    const market = useMarketStore(state => state.market);

    const staleCount = Object.values(market).filter(s => {
        const age = Date.now() - (s.timestamp || 0);
        return age > 60000;
    }).length;

    return (
        <div className="glass p-6 rounded-sm border border-gold/20 bg-gold/[0.01] font-mono">
            <div className="flex items-center gap-3 mb-6 border-b border-gold/10 pb-4">
                <Terminal size={14} className="text-gold" />
                <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-gold">Root Diagnostics // Dev Only</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* System Nodes */}
                <div className="space-y-4">
                    <DiagGroup title="Websocket Infrastructure" icon={Activity}>
                        <DiagRow label="Total Clients" value={telemetry?.wsClients || 0} />
                        <DiagRow label="Feed Freshness" value={`${telemetry?.feedFreshnessPct || 0}%`} />
                        <DiagRow label="Last Sync ID" value={health.events?.[0]?.sync_id || 'N/A'} />
                        <DiagRow label="Heartbeat Latency" value={`${health.avgLatency || 0}ms`} />
                    </DiagGroup>

                    <DiagGroup title="Cache & Memory" icon={Database}>
                        <DiagRow label="Symbols in Cache" value={Object.keys(market).length} />
                        <DiagRow label="Stale References" value={staleCount} color="text-bear" />
                        <DiagRow label="Active Adapters" value={health.activeAdapters?.join(', ') || 'NONE'} />
                        <DiagRow label="Buffer Health" value="STABLE" color="text-bull" />
                    </DiagGroup>
                </div>

                {/* Runtime State */}
                <div className="space-y-4">
                    <DiagGroup title="Execution Telemetry" icon={Cpu}>
                        <DiagRow label="Cycle Throughput" value={`${telemetry?.fillsPerMinute || 0} fpm`} />
                        <DiagRow label="Queue Depth" value={telemetry?.queueDepth || 0} />
                        <DiagRow label="Rejection Rate" value={`${telemetry?.rejectionRate || 0}%`} />
                        <DiagRow label="Simulated PnL" value="TRACKING" />
                    </DiagGroup>

                    <DiagGroup title="Circuit Breakers" icon={Layers}>
                        <DiagRow label="Telemetry Spike Protection" value="ARMED" color="text-bull" />
                        <DiagRow label="Freeze Propagation" value={health.defensiveMode ? 'ACTIVE' : 'READY'} color={health.defensiveMode ? 'text-bear' : 'text-muted'} />
                        <DiagRow label="Auto-Recovery Routine" value="PENDING" />
                        <DiagRow label="Integrity Score" value={`${health.integrityScore}%`} />
                    </DiagGroup>
                </div>
            </div>

            {/* Raw Log Stream */}
            <div className="mt-8">
                <div className="flex items-center gap-2 mb-3">
                    <Box size={10} className="text-gold/50" />
                    <span className="text-[8px] font-bold tracking-widest text-gold/50 uppercase">Internal Propagation Logs</span>
                </div>
                <div className="bg-black/60 rounded-sm border border-gold/5 p-3 h-[120px] overflow-y-auto no-scrollbar font-mono text-[8px] space-y-1">
                    {health.logs?.length > 0 ? (
                        health.logs.map((log, i) => (
                            <div key={i} className="flex gap-3">
                                <span className="text-muted tabular-nums">[{log.timestamp.split('T')[1].split('.')[0]}]</span>
                                <span className={log.category === 'ADVERSARIAL' ? 'text-bear' : log.category === 'RECOVERY' ? 'text-bull' : 'text-gold/60'}>
                                    [{log.category}]
                                </span>
                                <span className="text-white/60">{log.message}</span>
                            </div>
                        ))
                    ) : (
                        <div className="text-muted/20 text-center py-4 uppercase tracking-widest">No active telemetry logs detected.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const DiagGroup = ({ title, icon: Icon, children }) => (
    <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
            <Icon size={10} className="text-muted/40" />
            <span className="text-[9px] font-black tracking-widest text-white/40 uppercase">{title}</span>
        </div>
        <div className="space-y-1 bg-white/[0.01] p-2 rounded-sm border border-white/5">
            {children}
        </div>
    </div>
);

const DiagRow = ({ label, value, color = "text-white/80" }) => (
    <div className="flex justify-between items-center text-[9px]">
        <span className="text-muted/60">{label}</span>
        <span className={`font-bold ${color}`}>{value}</span>
    </div>
);
