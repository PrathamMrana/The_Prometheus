import React, { useState, useEffect, useMemo } from 'react';
import { useMarketStore } from '../../store/marketStore';
import {
  Zap,
  Menu,
  ShieldCheck
} from 'lucide-react';

export const Navbar = ({ onToggleSidebar }) => {
  const healthStatus = useMarketStore(state => state.health.status);
  const rawLatency = useMarketStore(state => state.globalLatency);
  const lastUpdate = useMarketStore(state => state.lastUpdate);
  const global = useMarketStore(state => state.global);
  const market = useMarketStore(state => state.market);
  const regime = global.regime || global.regimeAI?.regime || 'SIDEWAYS';
  const marketStatus = global.market_status || null;

  // ── Dynamic CORE panel derived values ────────────────────────────────────────
  const coreConfidence = useMemo(() => {
    const tickers = Object.values(market);
    const scored = tickers.filter(t => typeof t?.signal?.score === 'number' && t.signal.score > 0);
    if (scored.length === 0) return 'MODERATE';
    const avg = scored.reduce((s, t) => s + t.signal.score, 0) / scored.length;
    if (avg >= 68) return 'HIGH';
    if (avg <= 42) return 'LOW';
    return 'MODERATE';
  }, [market]);

  const threatLevel = useMemo(() => {
    const vix = market['INDIAVIX']?.price ?? market['^INDIAVIX']?.price ?? 15;
    const isPanicRegime = ['PANIC', 'LIQUIDITY_SQUEEZE', 'TRENDING_BEAR', 'RISK_OFF'].includes(regime);
    if (vix > 25 || isPanicRegime) return 'CRITICAL';
    if (vix > 18 || regime.includes('VOLATILE') || regime.includes('BEAR')) return 'ELEVATED';
    return 'NOMINAL';
  }, [market, regime]);

  const deploymentMode = useMemo(() => {
    if (healthStatus !== 'LIVE') return 'RESTRICTED';
    if (threatLevel === 'CRITICAL') return 'RESTRICTED';
    if (threatLevel === 'ELEVATED') return 'CAUTIOUS';
    return 'ACTIVE';
  }, [healthStatus, threatLevel]);

  // Realistic latency drift — ±5ms noise around true value
  const [latency, setLatency] = useState(rawLatency);
  useEffect(() => {
    const t = setInterval(() => {
      setLatency(rawLatency + Math.round((Math.random() - 0.5) * 10));
    }, 1500);
    return () => clearInterval(t);
  }, [rawLatency]);

  // ── Real health label — derived from actual backend conditions ────────────
  // Priority: real events override cosmetic labels.
  // STALE  → lastUpdate is >30s old (data pipeline froze)
  // DISCONNECTED → healthStatus is not LIVE (WS down)
  // RECOVERING   → latency spike >1000ms (stream degraded)
  // PARTIAL      → some symbols on LKG fallback (server reported)
  // DEGRADED     → secondary source in use (server reported)
  // STABLE       → all clear
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000); // re-eval every 5s
    return () => clearInterval(t);
  }, []);

  const dataAge = now - lastUpdate; // ms since last WS data arrived
  const healthLabel =
    healthStatus !== 'LIVE'          ? 'DISCONNECTED' :
    dataAge > 30000                  ? 'STALE'        :
    rawLatency > 1000                ? 'RECOVERING'   :
    global.data_health === 'PARTIAL' ? 'PARTIAL'      :
    global.data_health === 'DEGRADED'? 'DEGRADED'     :
                                       'STABLE';

  const healthColor =
    healthLabel === 'STABLE'        ? 'text-bull' :
    healthLabel === 'PARTIAL'       ? 'text-gold' :
    healthLabel === 'DEGRADED'      ? 'text-gold' :
    healthLabel === 'RECOVERING'    ? 'text-gold animate-pulse' :
                                      'text-bear animate-pulse';

  const [time, setTime] = useState(new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false
  }));

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const latencyColor = latency < 300 ? 'text-bull' : latency < 800 ? 'text-gold' : 'text-bear';

  return (
    <div className="h-14 glass border-b border-white/5 flex items-center justify-between px-4 md:px-6 sticky top-0 z-[70] bg-[#0a0a0c] shadow-2xl">
      <div className="flex items-center gap-4 md:gap-8">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 hover:bg-white/5 rounded-sm transition-colors text-muted"
        >
          <Menu size={18} />
        </button>

        <div className="flex items-center gap-2">
          <Zap size={14} className="text-gold animate-glow shadow-[0_0_10px_currentcolor]" />
          <span className="font-syne font-black text-[10px] md:text-xs tracking-[0.2em] md:tracking-[0.4em] text-white/90 uppercase">PROMETHEUS</span>
        </div>

        <div className="h-4 w-[1px] bg-white/10 hidden md:block" />

        <div className="hidden md:flex items-center gap-3 lg:gap-5 text-[9px] font-mono tracking-widest text-muted uppercase whitespace-nowrap shrink-0">
          <div className="flex items-center gap-2">
            STATUS: <span className={healthStatus === 'LIVE' ? 'text-bull' : 'text-bear animate-pulse'}>{healthStatus}</span>
          </div>
          <div className="h-4 w-[1px] bg-white/5" />
          <div className="flex items-center gap-2">
            DATA: <span className={marketStatus === 'OPEN' ? 'text-bull' : 'text-gold'}>
              {marketStatus === 'OPEN' ? 'LIVE ●' : 'SNAPSHOT ●'}
            </span>
          </div>
          <div className="h-4 w-[1px] bg-white/5 lg:block hidden" />
          <div className="hidden lg:flex items-center gap-2">
            HEALTH: <span className={healthColor}>{healthLabel}</span>
          </div>
          <div className="h-4 w-[1px] bg-white/5 xl:block hidden" />
          <div className="hidden xl:flex items-center gap-2">
            LATENCY: <span className={latency < 300 ? 'text-bull' : latency < 800 ? 'text-gold' : 'text-bear'}>{latency}MS</span>
          </div>
          {marketStatus && (
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-sm bg-white/[0.03] border border-white/5 group transition-all hover:bg-white/[0.05] whitespace-nowrap">
              <span className="text-[7px] font-mono text-muted/40 uppercase tracking-[0.2em] font-black group-hover:text-muted transition-colors">Exchange: NSE</span>
              <div className="w-[1px] h-2 bg-white/10" />
              <div className={`flex items-center gap-2 text-[9px] font-mono font-black tracking-widest ${marketStatus === 'OPEN' ? 'text-bull' : 'text-muted/60'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${marketStatus === 'OPEN' ? 'bg-bull animate-pulse shadow-[0_0_8px_rgba(0,232,150,0.5)]' : 'bg-bear/40 opacity-50'}`} />
                {marketStatus}
              </div>
            </div>
          )}
          <div className="hidden lg:block text-white/40 whitespace-nowrap">IST: {time}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-4 shrink-0 whitespace-nowrap">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-sm bg-white/[0.03] border border-white/5">
          <span className="text-[8px] font-mono text-muted tracking-widest uppercase">Quality:</span>
          <span className={`text-[10px] font-mono font-black uppercase tracking-widest ${global.data_quality_avg > 90 ? 'text-bull' : 'text-gold'}`}>
            {global.data_quality_avg || 98}%
          </span>
        </div>

        {/* 🤖 PROMETHEUS CORE GLOBAL BRAIN — Fully dynamic from globalState */}
        <div className="hidden lg:flex items-center gap-4 px-4 py-1.5 rounded-sm bg-[#0a0a0c] border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
          <div className="flex flex-col">
            <span className="text-[7px] font-mono text-muted uppercase tracking-[0.2em] mb-0.5">Prometheus Core</span>
            <span className="text-[10px] font-syne font-black text-white uppercase tracking-widest flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${healthStatus === 'LIVE' ? 'bg-bull animate-pulse' : 'bg-bear animate-pulse'}`} />
              {healthStatus === 'LIVE' ? 'ONLINE' : 'DEGRADED'}
            </span>
          </div>
          <div className="w-[1px] h-6 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[7px] font-mono text-muted uppercase tracking-[0.2em] mb-0.5">Regime</span>
            <span className={`text-[9px] font-mono font-bold uppercase tracking-widest ${
              regime.includes('BULL') || regime.includes('BREAKOUT') || regime.includes('MOMENTUM') ? 'text-bull' :
              regime.includes('BEAR') || regime.includes('PANIC') ? 'text-bear' : 'text-gold'
            }`}>
              {regime.replace('_', ' ').slice(0, 12)}
            </span>
          </div>
          <div className="w-[1px] h-6 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[7px] font-mono text-muted uppercase tracking-[0.2em] mb-0.5">Confidence</span>
            <span className={`text-[9px] font-mono font-bold uppercase tracking-widest ${
              coreConfidence === 'HIGH' ? 'text-bull' : coreConfidence === 'LOW' ? 'text-bear' : 'text-gold'
            }`}>
              {coreConfidence}
            </span>
          </div>
          <div className="w-[1px] h-6 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[7px] font-mono text-muted uppercase tracking-[0.2em] mb-0.5">Deployment</span>
            <span className={`text-[9px] font-mono font-bold uppercase tracking-widest ${
              deploymentMode === 'ACTIVE' ? 'text-bull' : deploymentMode === 'RESTRICTED' ? 'text-bear' : 'text-gold'
            }`}>
              {deploymentMode}
            </span>
          </div>
          <div className="w-[1px] h-6 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[7px] font-mono text-muted uppercase tracking-[0.2em] mb-0.5">Threat Lvl</span>
            <span className={`text-[9px] font-mono font-bold uppercase tracking-widest ${
              threatLevel === 'NOMINAL' ? 'text-bull' : threatLevel === 'CRITICAL' ? 'text-bear animate-pulse' : 'text-gold'
            }`}>
              {threatLevel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`hidden sm:block text-[9px] font-mono font-bold px-3 py-1 rounded bg-gold text-black shadow-lg shadow-gold/10`}>
            NODE: ACTIVE
          </div>
          <ShieldCheck size={16} className="text-bull opacity-50" />
        </div>
      </div>
    </div>
  );
};
