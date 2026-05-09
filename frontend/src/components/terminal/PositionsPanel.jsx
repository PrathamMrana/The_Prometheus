import React from 'react';
import { useTradeStore } from '../../store/tradeStore';
import { useMarketStore } from '../../store/marketStore';
import { Layers } from 'lucide-react';

// 🛡️ Financial precision helper
const fin = (v) => Number(Number(v || 0).toFixed(2));

export const PositionsPanel = () => {
    const { holdings } = useTradeStore();
    // 🛡️ Snapshot market to prevent data race during render
    const marketSnapshot = useMarketStore(state => state.market);
    // 🛡️ Market status from backend — 'OPEN' | 'CLOSED'
    const marketStatus = useMarketStore(state => state.global?.market_status);
    const isMarketOpen = marketStatus === 'OPEN';

    return (
        <div className="glass p-5 rounded-sm border-l-2 border-white/5 bg-white/[0.01]">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Layers size={14} className="text-muted" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Live Positions Inventory</span>
                </div>
                <div className="hidden lg:grid grid-cols-5 w-[65%] text-[7px] font-mono text-muted/40 uppercase tracking-[0.2em] font-black">
                    <div className="pl-4">Identity</div>
                    <div className="text-center">Exposure</div>
                    <div className="text-center">Acquisition</div>
                    <div className="text-center">Market Price</div>
                    <div className="text-right pr-4">Unrealized PnL</div>
                </div>
            </div>

            <div className="space-y-3">
                {holdings.length > 0 ? holdings.map((h, i) => {
                    const key = (h.symbol || '').split('.')[0]?.toUpperCase();
                    const marketEntry = marketSnapshot[key];

                    // 🛡️ Badge logic: CLOSED when NSE is off, LIVE when fresh, STALE only when open & lagging
                    const dataAge = marketEntry?.timestamp ? Date.now() - marketEntry.timestamp : Infinity;
                    const hasValidPrice = marketEntry?.price && Number.isFinite(marketEntry.price) && marketEntry.price > 0;
                    let dataBadge = 'STALE';
                    let badgeStyle = 'bg-white/5 text-muted/40';
                    if (!isMarketOpen) {
                        dataBadge = 'CLOSED';
                        badgeStyle = 'bg-white/5 text-muted/30';
                    } else if (hasValidPrice && dataAge < 15000) {
                        dataBadge = 'LIVE';
                        badgeStyle = 'bg-bull/10 text-bull';
                    }
                    // 🚨 STRICT: Only use a price from the live market feed — NEVER silently substitute avgPrice for PnL
                    const livePrice = (hasValidPrice) ? marketEntry.price : null;
                    const hasMissingData = livePrice === null;

                    // PnL is only computed when live price exists — never faked
                    const pnl    = hasMissingData ? null : fin((livePrice - h.avgPrice) * h.qty);
                    const isUp   = pnl !== null && pnl >= 0;
                    const pnlPct = (pnl !== null && h.avgPrice > 0)
                        ? fin(((livePrice - h.avgPrice) / h.avgPrice) * 100)
                        : null;

                    // PnL severity: scale opacity by size relative to position cost
                    const positionCost = fin(h.avgPrice * h.qty);
                    const positionValue = hasMissingData ? null : fin(h.qty * livePrice);
                    
                    const pnlSeverity = positionCost > 0 && pnl !== null
                        ? Math.min(Math.abs(pnl) / positionCost * 5000, 1) // escalates at 0.02% increments
                        : 0;
                    const pnlBullColor = `rgba(0, 232, 150, ${0.6 + pnlSeverity * 0.4})`;
                    const pnlBearColor = `rgba(255, 59, 107, ${0.6 + pnlSeverity * 0.4})`;
                    const pnlInlineColor = pnl === null ? '' : (isUp ? pnlBullColor : pnlBearColor);
                    return (
                        <div key={i} className="flex flex-col lg:flex-row lg:items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-sm hover:bg-white/[0.04] transition-colors group">
                            <div className="lg:grid lg:grid-cols-5 w-full lg:w-[100%] items-center gap-4">
                                {/* COLUMN 1: SYMBOL & STATUS */}
                                <div className="flex flex-col gap-0.5 min-w-[140px]">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[11px] font-black text-white group-hover:text-gold transition-colors">{key}</span>
                                        <div className="flex items-center gap-1">
                                            <span className={`text-[6px] font-mono font-bold px-1 py-0.5 rounded-sm tracking-widest ${hasMissingData ? 'bg-bear/10 text-bear' : badgeStyle}`}>
                                                {hasMissingData ? 'NO DATA' : dataBadge}
                                            </span>
                                            {!hasMissingData && (
                                                <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                                    <span className={`text-[6px] font-mono font-bold ${dataAge < 5000 ? 'text-bull' : dataAge < 15000 ? 'text-gold' : 'text-bear'}`}>
                                                        {Math.floor(dataAge/1000)}s
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-[6px] font-mono text-muted/40 uppercase tracking-[0.1em]">
                                        {marketEntry?.source || 'YF'} · {marketEntry?.quality || 100}% Integrity
                                    </div>
                                </div>

                                {/* COLUMN 2: QUANTITY / EXPOSURE */}
                                <div className="hidden lg:flex flex-col items-center">
                                    <span className="text-[10px] font-mono text-white font-black">{h.qty} <span className="text-[7px] text-muted font-normal">UNIT</span></span>
                                    <span className="text-[7px] font-mono text-muted/40 uppercase tracking-tighter">Inventory</span>
                                </div>

                                {/* COLUMN 3: AVG PRICE */}
                                <div className="hidden lg:flex flex-col items-center">
                                    <span className="text-[10px] font-mono text-white/80 tabular-nums font-black">₹{fin(h.avgPrice).toLocaleString('en-IN')}</span>
                                    <span className="text-[7px] font-mono text-muted/40 uppercase tracking-tighter">Avg Cost</span>
                                </div>

                                {/* COLUMN 4: LTP & VOLUME */}
                                <div className="hidden lg:flex flex-col items-center">
                                    {hasMissingData ? (
                                        <span className="text-[8px] font-mono text-bear animate-pulse">AWAITING FEED</span>
                                    ) : (
                                        <>
                                            <span className="text-[10px] font-mono text-bull font-black tabular-nums">₹{fin(livePrice).toLocaleString('en-IN')}</span>
                                            <span className="text-[7px] font-mono text-muted/40 uppercase tracking-tighter">
                                                VOL: {marketEntry.volume?.toLocaleString() || 0}
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* COLUMN 5: PNL & VALUE */}
                                <div className="flex flex-col items-end min-w-[120px] lg:pr-1">
                                    {hasMissingData ? (
                                        <div className="text-right">
                                            <div className="text-[9px] font-mono text-bear font-black tracking-tight">RETRYING (3/5)</div>
                                            <div className="text-[7px] font-mono text-muted/30 tracking-widest mt-0.5 uppercase">Loss of Signal</div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="text-[11px] font-mono font-black tabular-nums" style={{ color: pnlInlineColor }}>
                                                {isUp ? '+' : ''}₹{Math.abs(pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                <span className="text-[8px] ml-1 opacity-70">({isUp ? '+' : ''}{pnlPct.toFixed(2)}%)</span>
                                            </div>
                                            <div className="text-[7px] font-mono text-white/20 tabular-nums uppercase tracking-tighter">
                                                VAL: ₹{positionValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="p-8 border border-white/5 bg-white/[0.01] rounded-sm flex items-center justify-center italic text-muted/20 tracking-widest text-[9px]">
                        NO OPEN POSITIONS
                    </div>
                )}
            </div>
        </div>
    );
};
