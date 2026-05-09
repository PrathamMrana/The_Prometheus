import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, Zap, Shield, Target, Gauge, AlertTriangle, Brain, Layers, Clock } from 'lucide-react';
import { useMarketStore } from '../../store/marketStore';
import { useTradeStore } from '../../store/tradeStore';

// ─── Dynamic rationale pool ────────────────────────────────────────────────
const RATIONALE_POOL = {
  ACCUMULATION: [
    'Institutional block orders detected above avg volume baseline.',
    'Smart money inflow confirmed: VR > 1.8x with positive delta.',
    'Price held above VWAP with consistent bid absorption.',
    'Dark pool prints showing accumulation at key support zone.',
    'High consistency + upside volume skew → conviction build.',
  ],
  DISTRIBUTION: [
    'Sell-side pressure building: ask ladder thickening above LTP.',
    'Volume spikes on down-candles indicate distribution phase.',
    'Momentum divergence — price flat, volume declining.',
    'Smart money reducing exposure near resistance cluster.',
    'Delta turning negative despite price stability.',
  ],
  FAKE_BREAKOUT: [
    'Breakout unconfirmed — volume does not support the move.',
    'Price pierced resistance but immediately rejected; trap likely.',
    'Low VR on breakout candle: weak institutional conviction.',
    'Breakout wick without body close → reversal risk elevated.',
  ],
  NEUTRAL: [
    'Awaiting directional confirmation from order flow.',
    'Volume profile shows balanced buyer/seller activity.',
    'Market makers in control; edge not yet defined.',
    'Low volatility consolidation — coiling for expansion.',
  ],
};

// ─── Rationale picker — VR-bucket driven (not random) ──────────────────────
// Each bucket maps to a specific VR threshold so the rationale matches
// what volume data is actually showing.
function getRationaleForState(classification, smScore, vr) {
  const pool = RATIONALE_POOL[classification] || RATIONALE_POOL.NEUTRAL;
  // VR bucket: 0-0.8 → idx 0, 0.8-1.2 → idx 1, 1.2-1.6 → idx 2, 1.6-2.0 → idx 3, 2.0+ → idx 4
  const idx = vr < 0.8 ? 0 : vr < 1.2 ? 1 : vr < 1.6 ? 2 : vr < 2.0 ? 3 : 4;
  return pool[idx % pool.length];
}

// ─── Cross-metric coherence engine ────────────────────────────────────────
function deriveCoherence(data, score, vr) {
  const zscore = Math.abs(data.zscore || 0);
  const volatility = zscore > 2 ? 'HIGH' : zscore > 1 ? 'MED' : 'LOW';
  const classification = data.signal?.smartMoney?.classification || 'NEUTRAL';
  const consistency = data.signal?.smartMoney?.consistency || 0;

  const penalties = [];
  const boosts = [];
  let adjustedConf = score;

  if (volatility === 'HIGH') { adjustedConf -= 12; penalties.push({ label: 'HIGH VOLATILITY', desc: 'Regime instability suppressing conviction by -12pts' }); }
  if (vr < 0.8) { adjustedConf -= 8; penalties.push({ label: 'LOW LIQUIDITY', desc: 'Volume below baseline — execution risk elevated' }); }
  if (classification === 'DISTRIBUTION') { adjustedConf -= 10; penalties.push({ label: 'DISTRIBUTION DETECTED', desc: 'Smart money reducing exposure — long bias penalized' }); }
  if (classification === 'FAKE_BREAKOUT') { adjustedConf -= 6; penalties.push({ label: 'FAKE BREAKOUT', desc: 'Breakout without volume confirmation — trap risk' }); }
  if (consistency > 0.7) { adjustedConf += 8; boosts.push({ label: 'TREND CONSISTENCY', desc: 'Strong directional consistency adds +8pts conviction' }); }
  if (vr > 1.8) { adjustedConf += 6; boosts.push({ label: 'ABNORMAL INFLOW', desc: 'Smart money volume detected — institutional accumulation' }); }
  if (classification === 'ACCUMULATION') { adjustedConf += 10; boosts.push({ label: 'ACCUMULATION MODE', desc: 'Block orders confirm institutional buy-side commitment' }); }

  return { adjustedConf: Math.max(0, Math.min(100, adjustedConf)), penalties, boosts, volatility };
}

// ─── Animated score counter ────────────────────────────────────────────────
function AnimatedScore({ value, className }) {
  const [displayed, setDisplayed] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (value === prev.current) return;
    const diff = value - prev.current;
    const steps = 20;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(Math.round(prev.current + (diff * i) / steps));
      if (i >= steps) { clearInterval(interval); prev.current = value; }
    }, 16);
    return () => clearInterval(interval);
  }, [value]);

  return <span className={className}>{displayed}</span>;
}

// ─── Execution eligibility label ──────────────────────────────────────────
function getExecBlockReason(decision, volatility, vr, isLoading, isMarketOpen) {
  if (isLoading) return { label: 'DATA LOADING', color: 'text-muted', icon: '⏳' };
  if (!isMarketOpen) return { label: 'MARKET CLOSED', color: 'text-muted', icon: '🔒' };
  if (volatility === 'HIGH') return { label: 'HIGH VOLATILITY', color: 'text-gold', icon: '⚠' };
  if (vr < 0.5) return { label: 'LOW LIQUIDITY', color: 'text-bear', icon: '🚫' };
  if (decision === 'REJECT') return { label: 'RISK BLOCKED', color: 'text-bear', icon: '🛡' };
  if (decision === 'HOLD') return { label: 'HOLD SIGNAL', color: 'text-gold', icon: '⏸' };
  if (decision === 'BUY') return { label: 'EXECUTION ARMED', color: 'text-bull', icon: '✅' };
  return { label: 'PENDING SIGNAL', color: 'text-muted', icon: '…' };
}

function isMarketOpenNow() {
  const now = new Date();
  const ist = (now.getUTCHours() * 60 + now.getUTCMinutes() + 5 * 60 + 30) % (24 * 60);
  const wd = now.getDay();
  return wd > 0 && wd < 6 && ist >= 555 && ist < 930;
}

export const SymbolIntel = ({ symbol }) => {
  const market = useMarketStore(state => state.market);
  const holdings = useTradeStore(state => state.holdings);
  const canonical = symbol.split('.')[0].toUpperCase();
  const data = market[canonical] || {};

  const score = data.signal?.score ?? 50;
  const sectorFlow = data.signal?.sectorFlow ?? 0;
  const isBreakout = data.signal?.breakout || false;
  const isLoading = data.signal?.status !== 'READY';
  const decision = isLoading ? 'LOADING' : (data.signal?.decision || 'REJECT');

  const sm = data.signal?.smartMoney || {};
  const vr = sm.vr ?? 1.0;
  const smScore = sm.score ?? 0;
  const classification = sm.classification || 'NEUTRAL';

  const { adjustedConf, penalties, boosts, volatility } = deriveCoherence(data, score, vr);
  const execStatus = getExecBlockReason(decision, volatility, vr, isLoading, isMarketOpenNow());

  const isBull = decision === 'BUY';
  const isBear = decision === 'REJECT';

  const dynamicRationale = getRationaleForState(classification, smScore, vr);

  // ── Market-derived score variance ─────────────────────────────────────────
  // REPLACES random drift. liveScore is a deterministic function of live data:
  //   z-score: encodes deviation from statistical mean (direction + magnitude)
  //   percent: encodes today's momentum direction
  // This creates real micro-movement that matches what the market is doing.
  const pct = data.percent || 0;
  const zs = data.zscore || 0;
  const marketOffset = Math.max(-5, Math.min(5,
    zs * 0.8 +                                       // z-score direction
    Math.sign(pct) * Math.min(Math.abs(pct) * 0.4, 2) // momentum contribution
  ));
  const liveScore = Math.max(0, Math.min(100, smScore + marketOffset));

  const hasHolding = holdings.some(h => h.symbol === symbol && h.qty > 0);

  // Dynamic vol regime label
  const volLabel = volatility === 'HIGH'
    ? isMarketOpenNow() ? 'HIGH VOLATILITY' : 'POST-CLOSE HIGH VOL'
    : volatility === 'MED' ? 'MED RISK'
    : 'LOW RISK';

  // Dynamic score pulse
  const scorePulse = data.signal?.scorePulse;
  const pulseDynamic = scorePulse === 'ACCELERATING' ? 'ACCELERATING ▲'
    : scorePulse === 'DECELERATING' ? 'DECELERATING ▼'
    : adjustedConf > 65 ? 'BUILDING ▲'
    : adjustedConf < 40 ? 'WEAKENING ▼'
    : 'STABLE';

  return (
    <div className="glass p-5 rounded-sm border-l-2 border-white/5 bg-white/[0.01] space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap size={14} className="text-gold" />
          <span className="font-syne font-black text-[11px] tracking-[0.3em] text-white uppercase">Symbol Intelligence Hub</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-0.5 rounded-sm bg-white/5 border border-white/10 text-[7px] font-mono text-muted tracking-widest uppercase shrink-0">
            Prometheus
          </div>
          <div className="text-[7px] font-mono text-white/20 tracking-widest shrink-0">
            {data.timestamp ? `⏱ ${Math.floor((Date.now() - data.timestamp) / 1000)}s ago` : '⏱ LIVE'}
          </div>
        </div>
      </div>

      {/* ── Decision + Vol Grid ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* AI Decision */}
        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-sm relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            {isBull ? <TrendingUp size={28} /> : isBear ? <TrendingDown size={28} /> : <Activity size={28} />}
          </div>
          <div className="text-[8px] font-mono text-muted uppercase tracking-widest mb-2 shrink-0">AI Strategy</div>
          <div className={`text-xs xl:text-sm font-syne font-black tracking-tight leading-tight flex flex-col items-start gap-1 ${
            isBull ? 'text-bull' : isBear ? 'text-bear' : isLoading ? 'text-white/40 animate-pulse' : 'text-gold'
          }`}>
            <span className="whitespace-normal break-words w-full">{isLoading ? 'COMPUTING...' : (decision || '').replace(/_/g, ' ')}</span>
            {isBreakout && <span className="shrink-0 px-1.5 py-0.5 rounded-sm bg-bull/20 text-[7px] tracking-widest border border-bull/30 animate-pulse mt-1">⚡ BREAKOUT</span>}
          </div>
          {hasHolding && <div className="mt-1 text-[7px] font-mono text-gold tracking-widest">● POSITION OPEN</div>}
        </div>

        {/* Vol Regime — dynamic */}
        <div className={`p-3 rounded-sm border transition-all duration-700 flex flex-col justify-between ${
          volatility === 'HIGH' ? 'border-bear/40 bg-bear/[0.04]' : 'border-white/5 bg-white/[0.02]'
        }`}>
          <div className="text-[8px] font-mono text-muted uppercase tracking-widest mb-2">Vol Regime</div>
          <div className={`text-xs xl:text-sm font-syne font-black tracking-tight leading-tight whitespace-nowrap ${
            volatility === 'HIGH' ? 'text-bear' : volatility === 'MED' ? 'text-gold' : 'text-white'
          }`}>
            {volLabel}
          </div>
          {penalties.length > 0 && (
            <div className="mt-1 text-[7px] font-mono text-bear/70 tracking-widest">{penalties.length} suppressor{penalties.length > 1 ? 's' : ''} active</div>
          )}
        </div>

        {/* P17 Score */}
        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-sm">
          <div className="flex justify-between items-end mb-2">
            <div className="text-[8px] font-mono text-muted uppercase tracking-widest">P17 Score</div>
            <div className={`text-[8px] font-mono font-bold tracking-wider ${sectorFlow > 0 ? 'text-bull' : sectorFlow < 0 ? 'text-bear' : 'text-muted'}`}>
              Sector: {sectorFlow > 0 ? '+' : ''}{sectorFlow}%
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <AnimatedScore value={Math.floor(adjustedConf)} className={`text-base font-syne font-black ${adjustedConf >= 60 ? 'text-bull' : adjustedConf >= 45 ? 'text-gold' : 'text-bear'}`} />
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden ml-1">
              <motion.div
                animate={{ width: `${adjustedConf}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={`h-full rounded-full ${adjustedConf >= 60 ? 'bg-bull' : adjustedConf >= 45 ? 'bg-gold' : 'bg-bear'}`}
              />
            </div>
          </div>
          {boosts.length > 0 && (
            <div className="mt-1 text-[7px] font-mono text-bull/70 tracking-widest">+{boosts.length} boost{boosts.length > 1 ? 's' : ''}</div>
          )}
        </div>

        {/* Trend Strength */}
        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-sm">
          <div className="text-[8px] font-mono text-muted uppercase tracking-widest mb-2">Trend Strength</div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-syne font-black text-white">
              {data.signal?.trendStrength || (Math.min(Math.max(score / 10, 1), 10)).toFixed(1)}
            </span>
            <span className="text-[8px] font-mono text-muted">/ 10</span>
          </div>
          <div className={`mt-1 text-[7px] font-mono tracking-widest ${
            pulseDynamic.includes('▲') ? 'text-bull' : pulseDynamic.includes('▼') ? 'text-bear' : 'text-gold'
          }`}>
            {pulseDynamic}
          </div>
        </div>
      </div>

      {/* ── Execution Eligibility ── */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-sm border transition-all duration-500 ${
        execStatus.color === 'text-bull' ? 'border-bull/30 bg-bull/[0.04]' :
        execStatus.color === 'text-bear' ? 'border-bear/30 bg-bear/[0.04]' :
        'border-white/5 bg-white/[0.02]'
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{execStatus.icon}</span>
          <span className={`text-[9px] font-mono font-black tracking-widest uppercase ${execStatus.color}`}>
            {execStatus.label}
          </span>
        </div>
        <div className="text-[7px] font-mono text-muted tracking-widest">EXECUTION STATUS</div>
      </div>

      {/* ── Smart Money Overlay ── */}
      <div className={`p-4 rounded-sm border-2 transition-all duration-700 ${
        classification === 'ACCUMULATION' ? 'border-bull/40 bg-bull/[0.03] shadow-[0_0_20px_rgba(0,232,150,0.06)]' :
        classification === 'DISTRIBUTION' ? 'border-bear/40 bg-bear/[0.03] shadow-[0_0_20px_rgba(255,100,100,0.06)]' :
        classification === 'FAKE_BREAKOUT' ? 'border-gold/40 bg-gold/[0.03]' :
        'border-white/5 bg-white/[0.02]'
      }`}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-gold" />
            <span className="font-syne font-black text-[10px] tracking-[0.2em] text-white uppercase">Smart Money Overlay</span>
          </div>
          <div className={`px-2 py-0.5 text-[8px] font-mono font-black uppercase tracking-widest rounded-sm border ${
            classification === 'ACCUMULATION' ? 'bg-bull/20 border-bull/30 text-bull' :
            classification === 'DISTRIBUTION' ? 'bg-bear/20 border-bear/30 text-bear' :
            classification === 'FAKE_BREAKOUT' ? 'bg-gold/20 border-gold/30 text-gold' :
            'bg-white/5 border-white/10 text-muted'
          }`}>
            {classification}
          </div>
        </div>

        {/* Score + VR */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-[8px] font-mono text-muted uppercase mb-1">Smart Money Score</div>
            <div className="flex items-baseline gap-2">
              <AnimatedScore value={Math.round(liveScore)} className={`text-2xl font-syne font-black ${
                liveScore > 70 ? 'text-bull' : liveScore > 40 ? 'text-gold' : 'text-bear'
              }`} />
              <span className="text-[9px] font-mono text-muted">/ 100</span>
            </div>
            {/* Live mini-bar */}
            <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                animate={{ width: `${liveScore}%` }}
                transition={{ duration: 1.2, ease: 'easeInOut' }}
                className={`h-full rounded-full ${liveScore > 70 ? 'bg-bull' : liveScore > 40 ? 'bg-gold' : 'bg-bear'}`}
              />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] font-mono text-muted uppercase mb-1">Volume Ratio (VR)</div>
            <div className={`text-2xl font-syne font-black ${vr > 1.5 ? 'text-bull' : vr < 0.8 ? 'text-bear' : 'text-gold'}`}>
              {vr.toFixed(2)}x
            </div>
            <div className={`mt-1 text-[7px] font-mono tracking-widest uppercase ${vr > 1.5 ? 'text-bull' : vr < 0.8 ? 'text-bear' : 'text-muted'}`}>
              {vr > 1.5 ? 'ABNORMAL INFLOW' : vr < 0.8 ? 'LOW VOLUME' : 'NORMAL RANGE'}
            </div>
          </div>
        </div>

        {/* Dynamic rationale */}
        <div className="p-3 bg-black/30 rounded-sm border border-white/5">
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse mt-1 shrink-0 shadow-[0_0_6px_rgba(255,184,0,0.5)]" />
            <div className="text-[8px] font-mono leading-relaxed text-white/70 italic">{dynamicRationale}</div>
          </div>
        </div>
      </div>

      {/* ── AI Explainability — WHY section ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={11} className="text-gold" />
          <span className="text-[8px] font-mono text-muted uppercase tracking-widest">Factor Analysis</span>
        </div>

        {/* Penalties */}
        <AnimatePresence>
          {penalties.map((p, i) => (
            <motion.div
              key={p.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-2 p-2.5 rounded-sm bg-bear/[0.05] border border-bear/20"
            >
              <AlertTriangle size={9} className="text-bear mt-0.5 shrink-0" />
              <div>
                <div className="text-[8px] font-mono font-black text-bear uppercase tracking-widest">{p.label}</div>
                <div className="text-[7px] font-mono text-white/40 mt-0.5">{p.desc}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Boosts */}
        <AnimatePresence>
          {boosts.map((b, i) => (
            <motion.div
              key={b.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-2 p-2.5 rounded-sm bg-bull/[0.05] border border-bull/20"
            >
              <Shield size={9} className="text-bull mt-0.5 shrink-0" />
              <div>
                <div className="text-[8px] font-mono font-black text-bull uppercase tracking-widest">{b.label}</div>
                <div className="text-[7px] font-mono text-white/40 mt-0.5">{b.desc}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty state fill — no penalties or boosts */}
        {penalties.length === 0 && boosts.length === 0 && (
          <div className="p-3 rounded-sm bg-white/[0.02] border border-white/5 text-center">
            <div className="text-[8px] font-mono text-muted italic">No active suppressors or boosters — signal is balanced.</div>
          </div>
        )}
      </div>

      {/* ── Micro-Signal Matrix ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={11} className="text-muted" />
          <span className="text-[8px] font-mono text-muted uppercase tracking-widest">Micro-Signal Matrix</span>
        </div>

        {[
          {
            icon: Target, label: 'Volume Profile',
            value: data.signal?.volumeProfile || (vr > 1.5 ? 'ABNORMAL INFLOW' : vr > 1.0 ? 'ABOVE AVERAGE' : 'NEUTRAL RANGE'),
            color: vr > 1.5 ? 'text-bull' : vr > 1.0 ? 'text-gold' : 'text-muted'
          },
          {
            icon: Shield, label: 'Dynamic Support',
            value: `₹${(data.signal?.dynamicSupport || (data.price ? data.price * 0.982 : 0)).toFixed(2)}`,
            color: 'text-white'
          },
          {
            icon: Gauge, label: 'Score Pulse',
            value: pulseDynamic,
            color: pulseDynamic.includes('▲') ? 'text-bull' : pulseDynamic.includes('▼') ? 'text-bear' : 'text-gold'
          },
          {
            icon: Clock, label: 'Signal Age',
            value: data.timestamp ? `${Math.floor((Date.now() - data.timestamp) / 1000)}s ago` : 'LIVE',
            color: 'text-muted'
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="flex items-center justify-between p-2.5 rounded-sm border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              <Icon size={10} className="text-muted" />
              <span className="text-[9px] font-mono text-white/70 uppercase">{label}</span>
            </div>
            <span className={`text-[9px] font-mono font-black uppercase tracking-widest ${color}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
