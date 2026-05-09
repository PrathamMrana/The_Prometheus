import React, { useState, useEffect } from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { Toaster, toast } from 'react-hot-toast';
import { useTradeStore } from '../../store/tradeStore';
import { useMarketStore } from '../../store/marketStore';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const getContextualTelemetry = (path) => {
  switch (path) {
    case '/trade': return [
      { type: 'SYS', msg: 'EXECUTION ENGINE ARMED — LATENCY 14MS', color: 'text-white/60' },
      { type: 'INFO', msg: 'REGIME DETECTED: VOLATILITY CONTRACTION', color: 'text-bull' },
      { type: 'WARN', msg: 'SLIPPAGE TOLERANCE AT 0.08% BOUNDARY', color: 'text-gold' },
      { type: 'SYS', msg: 'ROUTING ORDER TO PRIMARY EXCHANGE', color: 'text-white/60' },
      { type: 'CRIT', msg: 'MARKET MAKERS WITHDRAWING LIQUIDITY', color: 'text-bear' }
    ];
    case '/portfolio': return [
      { type: 'INFO', msg: 'REBALANCING HEDGE RATIOS...', color: 'text-bull' },
      { type: 'SYS', msg: 'CAPITAL ALLOCATION WITHIN 2% OF TARGET', color: 'text-white/60' },
      { type: 'WARN', msg: 'SECTOR CONCENTRATION ALERT (IT > 30%)', color: 'text-gold' },
      { type: 'INFO', msg: 'BETA EXPOSURE NEUTRALIZED', color: 'text-bull' },
      { type: 'CRIT', msg: 'TAIL RISK HEDGES DEPLOYED', color: 'text-bear' }
    ];
    case '/analytics': return [
      { type: 'INFO', msg: 'CALCULATING ROLLING SHARPE (L50)', color: 'text-bull' },
      { type: 'SYS', msg: 'UPDATING DIVERSITY METRICS', color: 'text-white/60' },
      { type: 'WARN', msg: 'INSUFFICIENT OOS SAMPLE FOR VALIDATION', color: 'text-gold' },
      { type: 'INFO', msg: 'FACTOR LOADINGS NORMALIZED', color: 'text-bull' },
      { type: 'SYS', msg: 'STATISTICAL ROBUSTNESS PASSED', color: 'text-white/60' }
    ];
    case '/adversarial': return [
      { type: 'CRIT', msg: 'SYNTHETIC ATTACK VECTOR #12 FAILED', color: 'text-bear' },
      { type: 'WARN', msg: 'WALK-FORWARD CONFIDENCE BELOW 68%', color: 'text-gold' },
      { type: 'INFO', msg: 'MONTE CARLO SURVIVAL RATE: 82%', color: 'text-bull' },
      { type: 'SYS', msg: 'INJECTING 4-SIGMA LIQUIDITY SHOCK', color: 'text-white/60' },
      { type: 'CRIT', msg: 'EDGE DECAY DETECTED IN NIFTYAI_05', color: 'text-bear' }
    ];
    case '/research-command': return [
      { type: 'SYS', msg: 'BAYESIAN ENGINE RECALIBRATED', color: 'text-white/60' },
      { type: 'INFO', msg: 'EVIDENCE ACCUMULATION AT 12%', color: 'text-bull' },
      { type: 'WARN', msg: 'OVERFIT PROBABILITY INCREASED', color: 'text-gold' },
      { type: 'CRIT', msg: 'DEPLOYMENT DENIED: INSUFFICIENT DATA', color: 'text-bear' },
      { type: 'SYS', msg: 'SYNCING REGIME MEMORY...', color: 'text-white/60' }
    ];
    default: return [
      { type: 'SYS', msg: 'PROMETHEUS INTELLIGENCE ENGINE ONLINE', color: 'text-bull' },
      { type: 'INFO', msg: 'AWAITING MARKET PULSE', color: 'text-white/60' },
      { type: 'SYS', msg: 'REBUILDING FACTOR WEIGHTS...', color: 'text-white/60' },
      { type: 'WARN', msg: 'DEPLOYMENT GATE ACTIVE', color: 'text-gold' }
    ];
  }
};

export const MainLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tradeToast = useTradeStore(state => state.tradeToast);
  const health = useMarketStore(state => state.health);
  const location = useLocation();

  const [telemetryIndex, setTelemetryIndex] = useState(0);
  const telemetryFeed = getContextualTelemetry(location.pathname);

  // Rotate telemetry message every 3.5 seconds
  useEffect(() => {
    setTelemetryIndex(0); // reset on route change
    const timer = setInterval(() => {
      setTelemetryIndex(prev => (prev + 1) % telemetryFeed.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [location.pathname, telemetryFeed.length]);

  const activeMsg = telemetryFeed[telemetryIndex];

  // 🍞 [TOAST INTEGRATION]
  useEffect(() => {
    if (!tradeToast) return;
    if (tradeToast.type === 'SUCCESS') toast.success(tradeToast.msg);
    else if (tradeToast.type === 'REJECT') toast.error(tradeToast.msg);
    else if (tradeToast.type === 'ERROR') toast.error(tradeToast.msg);
    else toast(tradeToast.msg);
  }, [tradeToast]);

  return (
    <div className="h-screen bg-background text-white flex flex-col font-inter overflow-hidden select-none">
      <AnimatePresence>
        {(health.status === 'DISCONNECTED' || health.status === 'STALLED' || health.status === 'SYNCING') && (
          <motion.div 
            initial={{ height: 0 }} 
            animate={{ height: 'auto' }} 
            exit={{ height: 0 }}
            className="bg-bear text-white text-[10px] font-mono font-black py-1 px-4 flex items-center justify-between z-[100]"
          >
            <div className="flex items-center gap-2">
              <WifiOff size={12} />
              <span>CONNECTION INTERRUPTED // ATTEMPTING RECONNECT...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      
      <div className="flex-1 flex overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        <main className="flex-1 h-full overflow-y-auto no-scrollbar relative bg-[#0a0a0c]">
          <div className="p-4 md:p-8 pb-32 max-w-[1440px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <footer className="h-10 bg-[#0a0a0c] border-t border-white/5 flex items-center overflow-hidden z-[100]">
        <div className="px-6 bg-gold text-black h-full flex items-center z-10 font-syne font-black text-[10px] tracking-[0.3em] whitespace-nowrap">
          SYSTEM PULSE
        </div>
        <div className="flex-1 h-full flex items-center pl-6 font-mono text-[9px] uppercase tracking-[0.2em] relative overflow-hidden bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.02)_50%,transparent_100%)] bg-[length:200%_100%] animate-pulse">
          <AnimatePresence mode="wait">
             <motion.div
                key={`${location.pathname}-${telemetryIndex}`}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-3 absolute"
             >
                <span className={`font-black ${activeMsg.color}`}>[{activeMsg.type}]</span>
                <span className="text-white/70">{activeMsg.msg}</span>
             </motion.div>
          </AnimatePresence>
        </div>
      </footer>

      <Toaster 
        position="bottom-center"
        toastOptions={{
          className: 'glass border-white/10 text-white font-mono text-xs',
          duration: 4000,
          style: {
            background: 'rgba(10, 10, 12, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '2px',
          }
        }}
      />
    </div>
  );
};
