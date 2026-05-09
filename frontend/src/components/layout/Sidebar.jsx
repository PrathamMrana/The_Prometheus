import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutGrid, 
  Activity, 
  Briefcase, 
  BarChart3, 
  Settings,
  ShieldAlert,
  Cpu,
  LogOut,
  Wifi
} from 'lucide-react';
import { useMarketStore } from '../../store/marketStore';
import { useAuthStore } from '../../store/authStore';
import { useTradeStore } from '../../store/tradeStore';

export const Sidebar = ({ isOpen, onClose }) => {
  const healthStatus = useMarketStore(state => state.health.status);
  const global = useMarketStore(state => state.global);
  const opportunityBoard = useMarketStore(state => state.opportunityBoard);
  const holdings = useTradeStore(state => state.holdings);
  const { user, logout } = useAuthStore();

  // Live system load fluctuation
  const [sysLoad, setSysLoad] = useState(33);
  const [uptime, setUptime] = useState(0);
  useEffect(() => {
    const t1 = setInterval(() => {
      setSysLoad(l => Math.max(15, Math.min(85, l + (Math.random() - 0.48) * 4)));
    }, 3000);
    const t2 = setInterval(() => setUptime(u => u + 1), 1000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  const uptimeStr = `${String(Math.floor(uptime/60)).padStart(2,'0')}:${String(uptime%60).padStart(2,'0')}`;

  const isMarketOpen = () => {
    const now = new Date();
    const ist = (now.getUTCHours()*60+now.getUTCMinutes()+5*60+30)%(24*60);
    const wd = now.getDay();
    return wd>0 && wd<6 && ist>=555 && ist<930;
  };
  const marketOpen = isMarketOpen();

  const signals = opportunityBoard?.filter(o => o.grade === 'A' || o.grade === 'B').length || 0;
  const openPositions = holdings.filter(h => h.qty > 0).length;

  const navItems = [
    { icon: LayoutGrid,  label: 'Dashboard',  path: '/', badge: signals > 0 ? signals : null, badgeColor: 'bg-bull' },
    { icon: Cpu,         label: 'Terminal',   path: '/trade', badge: openPositions > 0 ? openPositions : null, badgeColor: 'bg-gold' },
    { icon: Briefcase,   label: 'Portfolio',  path: '/portfolio', badge: null },
    { icon: BarChart3,   label: 'Analytics',  path: '/analytics', badge: null },
    { icon: ShieldAlert, label: 'Adversarial', path: '/adversarial', accent: 'text-bear', badge: null },
    { icon: Activity,    label: 'Research',   path: '/research-command', accent: 'text-gold', badge: null },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-[90]
        w-64 lg:w-20 xl:w-64 border-r border-white/5 bg-[#0a0a0c] flex flex-col 
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${healthStatus === 'LIVE' ? 'bg-bull' : 'bg-bear'} animate-pulse shadow-[0_0_10px_currentcolor]`} />
          <span className="hidden xl:block font-syne font-black text-xs tracking-[0.3em] text-white">PROMETHEUS</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-4 px-4 py-3.5 rounded-sm transition-all group relative
                ${isActive ? 'bg-white/5 text-gold' : 'text-muted hover:bg-white/[0.02] hover:text-white'}
              `}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} className={isActive ? 'text-gold' : item.accent ? `${item.accent} opacity-70 group-hover:opacity-100` : 'group-hover:text-white'} />
                  <span className="hidden xl:block font-syne font-black text-[10px] tracking-[0.2em] uppercase whitespace-nowrap flex-1">
                    {item.label}
                  </span>
                  {/* Live badge */}
                  {item.badge !== null && item.badge !== undefined && (
                    <span className={`hidden xl:flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-black text-black ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 bg-gold shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5 space-y-2">
          <NavLink
              to="/settings"
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-4 px-4 py-3.5 rounded-sm transition-all group
                ${isActive ? 'bg-white/5 text-gold' : 'text-muted hover:bg-white/[0.02] hover:text-white'}
              `}
          >
            <Settings size={18} />
            <span className="hidden xl:block font-syne font-black text-[10px] tracking-[0.2em] uppercase">Settings</span>
          </NavLink>
          
          <div className="px-4 py-3 hidden xl:block space-y-2">
              {/* WS + Market phase */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Wifi size={9} className={healthStatus === 'LIVE' ? 'text-bull' : 'text-bear'} />
                  <span className="text-[7px] font-mono text-muted tracking-widest uppercase">{healthStatus === 'LIVE' ? 'WS LIVE' : 'WS STALLED'}</span>
                </div>
                <div className={`px-1.5 py-0.5 rounded-sm text-[6px] font-mono font-black tracking-widest uppercase ${
                  marketOpen ? 'bg-bull/20 text-bull' : 'bg-white/5 text-muted'
                }`}>
                  {marketOpen ? '● MARKET OPEN' : '◯ CLOSED'}
                </div>
              </div>

              {/* User info */}
              {user && (
                <div className="p-3 rounded-sm bg-white/[0.02] border border-white/5">
                  <div className="text-[7px] font-mono text-muted tracking-widest uppercase mb-1">Operator</div>
                  <div className="text-[10px] font-syne font-bold text-white/80 truncate">{user.name}</div>
                  <div className="text-[8px] font-mono text-muted/50 truncate">{user.email}</div>
                </div>
              )}

              {/* System load — animated */}
              <div className="p-3 rounded-sm bg-white/[0.02] border border-white/5">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="text-[7px] font-mono text-muted tracking-widest uppercase">System Load</div>
                  <div className={`text-[8px] font-mono font-black ${
                    sysLoad > 70 ? 'text-bear' : sysLoad > 50 ? 'text-gold' : 'text-bull'
                  }`}>{sysLoad.toFixed(0)}%</div>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${
                      sysLoad > 70 ? 'bg-bear' : sysLoad > 50 ? 'bg-gold' : 'bg-bull/60'
                    }`}
                    style={{ width: `${sysLoad}%` }}
                  />
                </div>
                <div className="mt-1 text-[7px] font-mono text-muted/40">⏱ {uptimeStr} uptime</div>
              </div>

              {/* Logout */}
              <button
                id="btn-logout"
                onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-muted hover:bg-white/[0.03] hover:text-bear transition-all group"
              >
                <LogOut size={13} className="group-hover:text-bear transition-colors" />
                <span className="text-[9px] font-syne font-black tracking-[0.2em] uppercase">Sign Out</span>
              </button>
          </div>
        </div>
      </aside>
    </>
  );
};
