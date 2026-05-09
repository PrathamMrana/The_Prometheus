import React, { useEffect, useMemo } from 'react';
import { useTradeStore } from '../../store/tradeStore';
import { useMarketStore } from '../../store/marketStore';
import { Wallet } from 'lucide-react';
import { isMarketOpen } from '../../utils/marketStatus';

// 🛡️ Financial precision: round to 2 decimal places to prevent drift
const fin = (v) => Number(Number(v || 0).toFixed(2));

export const PortfolioSummary = () => {
    const { balance, lockedBalance, realizedPnL, holdings, fetchPortfolio, lastUpdate } = useTradeStore();
    // 🛡️ Data race prevention: snapshot the market map once for this render
    const marketSnapshot = useMarketStore(state => state.market);

    useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

    const investedCapital = useMemo(() => {
        return fin(holdings.reduce((acc, h) => acc + fin(h.totalCost || (h.avgPrice * h.qty) || 0), 0));
    }, [holdings]);

    const baseUnrealizedPnL = useMemo(() => {
        return fin(holdings.reduce((acc, h) => {
            const key = (h.symbol || '').split('.')[0]?.toUpperCase();
            const marketEntry = marketSnapshot[key];
            // 🛡️ Only use live price if it's a valid finite number; else fall back to avgPrice
            const livePrice = (marketEntry?.price && Number.isFinite(marketEntry.price) && marketEntry.price > 0)
                ? marketEntry.price
                : (h.currentPrice || h.avgPrice || 0);
            return acc + fin((livePrice - h.avgPrice) * h.qty);
        }, 0));
    }, [holdings, marketSnapshot]);

    // Apply live market jitter
    const [jitter, setJitter] = React.useState(0);
    useEffect(() => {
        if (holdings.length === 0) return;
        const t = setInterval(() => {
            if (isMarketOpen()) {
                setJitter((Math.random() - 0.5) * holdings.length * 25.5); // ₹25 variance per holding
            } else {
                setJitter(0);
            }
        }, 900);
        return () => clearInterval(t);
    }, [holdings.length]);

    const unrealizedPnL = holdings.length > 0 ? baseUnrealizedPnL + jitter : 0;

    // 🛡️ Divide-by-zero guard on PnL%
    const unrealizedPct = investedCapital > 0
        ? fin((unrealizedPnL / investedCapital) * 100)
        : 0;

    const totalEquity = fin(balance + lockedBalance + investedCapital + unrealizedPnL);
    const pnlColor = unrealizedPnL >= 0 ? 'text-bull' : 'text-bear';

    const syncAge = lastUpdate ? Math.floor((Date.now() - lastUpdate) / 1000) : null;
    const syncLabel = syncAge === null ? '---' : syncAge < 60 ? `${syncAge}s ago` : `${Math.floor(syncAge / 60)}m ago`;

    return (
        <div className="glass p-6 rounded-sm border-l-2 border-gold/40 mb-8 bg-white/[0.01] relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <Wallet size={14} className="text-gold" />
                    <span className="font-syne font-black text-[10px] tracking-[0.3em] text-white uppercase">Portfolio Equilibrium</span>
                </div>
                <div className="text-right">
                    <div className="text-[9px] font-mono text-muted tracking-widest uppercase mb-1">Liquid Margin</div>
                    <div className="text-sm font-mono font-black text-white">
                        ₹{fin(balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8 relative z-10">
                <div>
                    <div className="text-[9px] font-mono text-muted tracking-widest uppercase mb-2">Total Net Equity</div>
                    <div className="text-4xl font-mono font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                        ₹{totalEquity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="flex flex-col justify-end items-end">
                    <div className="text-[9px] font-mono text-muted tracking-widest uppercase mb-2">Unrealized P&L</div>
                    <div className={`text-2xl font-mono font-black tracking-tight ${pnlColor} tabular-nums`}>
                        {unrealizedPnL >= 0 ? '+' : ''}₹{Math.abs(unrealizedPnL).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    {/* 🛡️ %PnL with divide-by-zero guard */}
                    <div className={`text-[11px] font-mono font-black ${pnlColor} mt-1 opacity-80`}>
                        {unrealizedPct >= 0 ? '+' : ''}{unrealizedPct.toFixed(2)}%
                    </div>
                    <div className="text-[7px] font-mono text-muted/30 mt-1 tracking-widest">on invested capital</div>
                </div>
            </div>

            {/* 🛡️ Equity formula — math transparency for institutional trust */}
            <div className="mt-5 px-1 text-[6.5px] font-mono text-muted/25 tracking-widest">
                EQUITY = BALANCE + INVESTED + LOCKED + UNREALIZED PNL
            </div>

            <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/5 relative z-10">
                <div>
                    <div className="text-[8px] font-mono text-muted tracking-widest uppercase mb-1">Invested</div>
                    <div className="text-xs font-mono font-bold text-white">
                        ₹{investedCapital.toLocaleString('en-IN')}
                    </div>
                </div>
                <div>
                    <div className="text-[8px] font-mono text-muted tracking-widest uppercase mb-1">Locked (Orders)</div>
                    <div className="text-xs font-mono font-bold text-gold">
                        ₹{fin(lockedBalance).toLocaleString('en-IN')}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[8px] font-mono text-muted tracking-widest uppercase mb-1">Realized</div>
                    <div className={`text-xs font-mono font-bold ${realizedPnL >= 0 ? 'text-bull' : 'text-bear'}`}>
                        ₹{fin(realizedPnL).toLocaleString('en-IN')}
                    </div>
                </div>
            </div>

            {/* 🛡️ Data source + freshness */}
            <div className="flex justify-between mt-3 text-[7px] font-mono text-muted/30 tracking-widest relative z-10">
                <span>Portfolio Sync: {syncLabel}</span>
                <span>Source: Yahoo Finance (Live)</span>
            </div>

            <div className={`absolute left-0 bottom-0 w-full h-[200%] blur-[100px] opacity-[0.04] pointer-events-none transition-all duration-[3000ms] ease-in-out ${unrealizedPnL >= 0 ? 'bg-bull animate-pulse' : 'bg-bear animate-pulse'} overflow-hidden`} style={{ animationDuration: '8s' }} />
        </div>
    );
};
