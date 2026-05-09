import React, { useState } from 'react';
import { Search as SearchIcon, Zap, Loader2 } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { useTradeStore } from '../../store/tradeStore';
import { useMarketStore } from '../../store/marketStore';
import { AnimatePresence, motion } from 'framer-motion';

export const Search = () => {
    const selectedSymbol = useTradeStore(state => state.selectedSymbol);
    const setSelectedSymbol = useTradeStore(state => state.setSelectedSymbol);
    const market = useMarketStore(state => state.market);
    const symbolLoading = useMarketStore(state => state.symbolLoading);
    const setFreeze = useMarketStore(state => state.setFreeze);
    
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [focusedIndex, setFocusedIndex] = useState(-1);

    const handleInput = async (e) => {
        const val = e.target.value.toUpperCase();
        setQuery(val);
        if (!val) { setSuggestions([]); return; }

        try {
            const res = await apiFetch(`/api/market/search?q=${val}`);
            const data = await res.json();
            if (data.success && data.results) {
                setSuggestions(data.results);
            }
        } catch (err) {
            const local = Object.keys(market).filter(k => k.includes(val) && !k.startsWith('^'));
            setSuggestions(local.slice(0, 5));
        }
        setFocusedIndex(-1);
    };

    const executeSelect = async (s) => {
        if (!s) return;
        // Handle both string and object results from search
        const symbol = typeof s === 'string' ? s : s.symbol;
        
        const upper = symbol.trim().toUpperCase();
        const normalized = upper.includes('.') ? upper : `${upper}.NS`;
        const canonical = normalized.split('.')[0];
        
        setQuery("");
        setSuggestions([]);
        setFreeze(false);
        setSelectedSymbol(normalized);

        // Instant background fetch to warm the cache for the selection
        if (!market[canonical]) {
            try {
                await apiFetch(`/api/market/search?symbol=${normalized}`);
            } catch (e) { }
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setFocusedIndex(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setFocusedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            if (focusedIndex >= 0 && suggestions[focusedIndex]) {
                executeSelect(suggestions[focusedIndex]);
            } else if (query) {
                executeSelect(query);
            }
        } else if (e.key === "Escape") {
            setSuggestions([]);
            setFocusedIndex(-1);
        }
    };

    const CATEGORIES = [
        { label: 'NIFTY 50', query: 'NIFTY' },
        { label: 'BANKING', query: 'BANK' },
        { label: 'IT SECTOR', query: 'HCL' },
        { label: 'FMCG', query: 'ITC' },
        { label: 'AUTO', query: 'TATA' },
        { label: 'F&O', query: 'NIFTY' },
        { label: 'HIGH VOL', query: 'ADANI' }
    ];

    return (
        <div className="relative group w-full">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                {symbolLoading ? (
                    <Loader2 size={12} className="text-gold animate-spin" />
                ) : (
                    <SearchIcon size={12} className="text-muted group-hover:text-gold transition-colors" />
                )}
            </div>
            <input 
                type="text" 
                placeholder="PROMETHEUS COMMAND: SEARCH INSTRUMENTS / SYMBOLS..." 
                value={query}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                className="w-full bg-white/[0.02] border border-white/5 rounded-sm py-4 pl-12 pr-4 font-mono font-black text-[9px] tracking-[0.2em] text-white focus:border-gold/30 focus:bg-white/[0.04] outline-none transition-all placeholder:text-muted/30 uppercase"
            />
            
            <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {CATEGORIES.map(cat => (
                    <button 
                        key={cat.label}
                        onClick={() => { setQuery(cat.query); handleInput({ target: { value: cat.query } }); }}
                        className="px-2.5 py-1 rounded-sm bg-white/5 border border-white/5 text-[7.5px] font-mono font-black text-white/40 hover:text-white hover:bg-gold/10 hover:border-gold/20 transition-all uppercase tracking-widest whitespace-nowrap"
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            <AnimatePresence>
                {suggestions.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 right-0 z-[100] mt-2 glass border border-white/10 shadow-2xl overflow-hidden rounded-sm"
                    >
                        <div className="bg-white/5 px-4 py-2 border-b border-white/5 text-[7px] font-mono text-muted/40 tracking-[0.3em] uppercase flex justify-between">
                            <span>Vector Discovery Hub</span>
                            <span>Institutional Feed</span>
                        </div>
                        {suggestions.map((s, i) => {
                            const sym = typeof s === 'string' ? s : s.symbol;
                            const name = typeof s === 'string' ? sym.split('.')[0] : s.name;
                            const price = s.price || 0;
                            const delta = s.percent || 0;
                            const isUp = delta >= 0;

                            return (
                                <div 
                                    key={sym}
                                    onClick={() => executeSelect(s)}
                                    className={`px-4 py-3 font-mono border-b border-white/5 cursor-pointer flex justify-between items-center transition-all ${
                                        focusedIndex === i ? 'bg-gold text-black' : 'hover:bg-white/[0.02] text-muted hover:text-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-1 h-8 rounded-full ${isUp ? 'bg-bull' : 'bg-bear'} opacity-40`} />
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black tracking-tight">{name}</span>
                                            <span className="text-[7px] opacity-40 uppercase tracking-[0.2em]">{sym}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-8">
                                        {price > 0 && (
                                            <div className="text-right">
                                                <div className={`text-[11px] font-black tabular-nums ${focusedIndex === i ? 'text-black' : 'text-white'}`}>
                                                    ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </div>
                                                <div className={`text-[8px] font-bold tabular-nums ${focusedIndex === i ? 'text-black' : (isUp ? 'text-bull' : 'text-bear')}`}>
                                                    {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}%
                                                </div>
                                            </div>
                                        )}
                                        <div className={`px-2.5 py-1 border rounded-sm text-[7px] font-black tracking-[0.2em] transition-all ${
                                            focusedIndex === i ? 'bg-black text-gold border-black' : 'border-white/10 text-gold/40'
                                        }`}>
                                            EXECUTE
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
