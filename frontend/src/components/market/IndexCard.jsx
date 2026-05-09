import React, { useState, useEffect } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { TrendingUp, TrendingDown, Clock, Lock } from 'lucide-react';
import { PriceFlash } from '../shared/PriceFlash';
import { SparkSvg } from '../shared/SparkSvg';
import { getSyncMessage } from '../../utils/telemetry';

const FreshnessAgo = ({ symbol }) => {
  const stock = useMarketStore(state => state.market[symbol]);
  const isClosed = stock?.status === 'CLOSED';
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const age = stock?.timestamp ? Math.max(0, now - stock.timestamp) : Infinity;
  const seconds = age === Infinity ? 0 : Math.floor(age / 1000);
  // 🔱 [PURITY LOCK] Closed market = data is always valid (Friday close IS real data)
  const label = isClosed ? "STATIC" : (age < 90000 ? "SYNCED" : age < 180000 ? "⚠ DELAYED" : "STALE");
  const color = isClosed ? "text-muted" : (age < 90000 ? "text-bull" : age < 180000 ? "text-gold" : "text-bear");

  // When closed, show "Apr 25 Close" style label instead of raw seconds
  const closeDateLabel = stock?.timestamp
    ? new Date(stock.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' Close'
    : 'Last Close';

  const source = stock?.source || 'YFINANCE';
  const quality = typeof stock?.quality === 'number' ? stock.quality : 100;
  const qualityColor = quality > 80 ? 'text-bull' : quality > 50 ? 'text-gold' : 'text-bear';

  return (
    <div className="flex flex-col items-end gap-0.5">
       <div className="flex items-center gap-1.5">
          <span className={`text-[7px] font-mono font-black tracking-tighter ${color}`}>{label}</span>
          {isClosed 
            ? <span className="text-[7px] font-mono text-muted tabular-nums opacity-40">{closeDateLabel}</span>
            : <span className="text-[7px] font-mono text-muted tabular-nums opacity-40">{seconds}s ago</span>
          }
       </div>
       <div className="flex items-center gap-1">
          <span className={`text-[6px] font-mono font-black ${qualityColor}`}>{quality}%</span>
          <div className="w-[1px] h-1.5 bg-white/10" />
          <div className="text-[6px] font-mono text-muted/20 uppercase tracking-[0.2em]">{source} DATA</div>
       </div>
    </div>
  );
};

export const IndexCard = ({ symbol, label, market: marketType = 'IN', onSelect, now }) => {
  const storeSymbol = symbol.replace('^', '').split('.')[0];
  const stock = useMarketStore(state => state.market[storeSymbol] || state.market[symbol]);
  const freeze = useMarketStore(state => state.freeze);
  
  if (!stock || stock.price === null) {
    return (
      <div 
        onClick={() => onSelect(symbol)}
        className="p-4 glass rounded-sm border-l-2 border-white/10 opacity-40 relative flex flex-col justify-center h-24 cursor-pointer"
      >
        <div className="flex justify-between items-start mb-2">
          <span className="font-syne font-bold text-[9px] tracking-widest text-muted">{label}</span>
        </div>
        <div className="font-mono text-xl font-bold tracking-tighter text-muted/30 italic">NO DATA</div>
      </div>
    );
  }

  const safePrice = Number.isFinite(stock?.price) ? stock.price : null;
  const safePercent = Number.isFinite(stock?.percent) ? stock.percent : null;
  const isUp = safePercent >= 0;

  const age = stock?.timestamp ? Math.max(0, now - stock.timestamp) : Infinity;
  const isClosedMode = stock?.status === 'CLOSED';
  
  let uiStatus = "SYNCED";
  if (freeze) {
      uiStatus = "LOCKED";
  } else if (isClosedMode) {
      uiStatus = "CLOSED"; // 🔱 [PURITY LOCK] Market closed = show data with CLOSED badge, never DEAD
  } else {
      if (age > 30000) uiStatus = "STALE";
      if (age > 90000) uiStatus = "DEAD";
  }

  if (uiStatus === "DEAD") {
     return (
        <div 
          onClick={() => onSelect(symbol)}
          className="p-4 glass rounded-sm border-l-2 border-bear opacity-50 relative overflow-hidden h-24 flex flex-col justify-center bg-bear/5 cursor-pointer"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="font-syne font-bold text-[9px] tracking-widest text-muted">{label}</span>
            <span className="text-bear font-mono text-[8px] animate-pulse">DISCONNECTED</span>
          </div>
          <div className="font-mono text-xl font-bold tracking-tighter text-bear/40 italic">OFFLINE</div>
        </div>
     );
  }
  
  return (
    <div 
      onClick={() => onSelect(symbol)}
      className="p-4 glass rounded-sm border-l-2 relative overflow-hidden group hover:bg-white/[0.04] hover:shadow-[0_0_20px_rgba(255,255,255,0.02)] transition-all duration-300 cursor-pointer" 
      style={{ borderLeftColor: isUp ? '#00e896' : '#ff3b6b' }}
    >
      <div className={`absolute top-0 right-0 w-16 h-16 blur-[40px] opacity-10 pointer-events-none transition-all duration-500 group-hover:opacity-20 ${isUp ? 'bg-bull' : 'bg-bear'}`} />
      <div className="flex justify-between items-start mb-2">
        <div className="flex flex-col">
          <span className="font-syne font-bold text-[9px] tracking-widest text-muted">{label}</span>
          {uiStatus === "LOCKED" && (
            <span className="text-[7px] font-mono text-bull/80 mt-1 flex items-center gap-1 uppercase tracking-[0.1em]">
              <Lock size={8} /> LOCKED
            </span>
          )}
          {uiStatus === "STALE" && (
            <span className="text-[7px] font-mono text-gold/60 mt-1 flex items-center gap-1 animate-pulse uppercase tracking-[0.1em]">
              <Clock size={8} /> CACHED
            </span>
          )}
          {uiStatus === "CLOSED" && (
            <span className="text-[7px] font-mono text-muted/60 mt-1 flex items-center gap-1 uppercase tracking-[0.1em]">
              <Clock size={8} /> CLOSED
            </span>
          )}
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-[8px] font-mono ${uiStatus === 'LOCKED' ? 'text-bull' : 'text-muted'}`}>
            {uiStatus === 'LOCKED' ? <span className="flex items-center gap-1 text-bull font-black uppercase tracking-widest leading-none">PULSE_ACTIVE</span> : <FreshnessAgo symbol={symbol} />}
          </span>
        </div>
      </div>
      <div className="font-mono text-xl font-bold tracking-tighter tabular-nums text-white">
        <PriceFlash value={safePrice} prefix={marketType === 'US' ? '$' : '₹'} />
      </div>
      <div className={`font-mono text-[11px] font-bold mt-1 flex items-center gap-1 ${isUp ? 'text-bull' : 'text-bear'}`}>
        {safePercent !== null && !getSyncMessage(safePrice, stock?.prevClose, safePercent) ? (
          <>
            {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            <span>
              {`${(isUp && safePercent > 0 ? '+' : '')}${safePercent.toFixed(2)}%`}
            </span>
          </>
        ) : (
          <span className="text-[7px] text-muted/40 uppercase tracking-widest animate-pulse">
            {getSyncMessage(safePrice, stock?.prevClose, safePercent) || "SYNCING..."}
          </span>
        )}
      </div>
      
      {stock.sparkline && stock.sparkline.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-10 opacity-30 pointer-events-none">
              <SparkSvg data={stock.sparkline} color={isUp ? '#00e896' : '#ff3b6b'} />
          </div>
      )}
    </div>
  );
};
