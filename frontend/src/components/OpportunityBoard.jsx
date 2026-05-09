import React, { useEffect, useState } from 'react';
import { useMarketStore } from '../store/marketStore';
import { isMarketOpen } from '../utils/marketStatus';
import './OpportunityBoard.css';

/**
 * 🔱 [PHASE 20] OpportunityBoard
 * Institutional live-ranked opportunity leaderboard.
 * Reads OPPORTUNITY_BOARD WebSocket payload from Zustand store.
 * No flickering — uses keyed stable list with CSS transitions.
 */

const GRADE_STYLE = {
    'A+': { background: 'rgba(0,255,179,0.15)',  border: '#00ffb3', color: '#00ffb3', glow: '0 0 10px #00ffb340' },
    'A':  { background: 'rgba(74,222,128,0.12)', border: '#4ade80', color: '#4ade80', glow: '0 0 8px  #4ade8030' },
    'B':  { background: 'rgba(250,204,21,0.10)', border: '#facc15', color: '#facc15', glow: 'none' },
    'C':  { background: 'rgba(249,115,22,0.08)', border: '#f97316', color: '#f97316', glow: 'none' },
    'D':  { background: 'rgba(239,68,68,0.06)',  border: '#ef4444', color: '#ef4444', glow: 'none' },
};

const SM_LABELS = {
    HEAVY_ACCUMULATION:  { label: '⚡ HVY.ACCUM', color: '#00ffb3' },
    QUIET_ACCUMULATION:  { label: '↑ Q.ACCUM',   color: '#4ade80' },
    PASSIVE_BUYING:      { label: '↗ PASS.BUY',  color: '#86efac' },
    NEUTRAL_FLOW:        { label: '— NEUTRAL',   color: '#888' },
    PASSIVE_SELLING:     { label: '↘ PASS.SELL', color: '#fca5a5' },
    SMART_DISTRIBUTION:  { label: '↓ S.DIST',    color: '#f97316' },
    STOP_HUNT:           { label: '⚠ ST.HUNT',   color: '#ef4444' },
    RETAIL_FOMO:         { label: '⚠ FOMO.TRP',  color: '#ef4444' },
    LIQUIDITY_TRAP:      { label: '☠ LIQ.TRAP',  color: '#dc2626' },
    ABSORPTION:          { label: '🛡 ABSORP',   color: '#facc15' },
};

function ConfBar({ value }) {
    const pct = Math.min(100, Math.max(0, value));
    const color = pct >= 80 ? '#00ffb3' : pct >= 70 ? '#4ade80' : pct >= 55 ? '#facc15' : '#f97316';
    return (
        <div className="ob-bar-track">
            <div className="ob-bar-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
    );
}

export default function OpportunityBoard() {
    const board = useMarketStore(state => state.opportunityBoard);
    const regime = useMarketStore(state => state.global?.regime || 'SIDEWAYS');
    const [prev, setPrev] = useState([]);
    const [variances, setVariances] = useState({});

    const bannerColors = {
        'TRENDING_BULL': 'bg-bull/20 text-bull border-bull/30',
        'TRENDING_BEAR': 'bg-bear/20 text-bear border-bear/30',
        'SIDEWAYS': 'bg-white/5 text-muted border-white/10',
        'PANIC': 'bg-bear/40 text-bear border-bear font-black animate-pulse',
        'VOLATILE': 'bg-gold/20 text-gold border-gold/30',
        'MEAN_REVERSION': 'bg-gold/20 text-gold border-gold/30',
        'MOMENTUM_EXPANSION': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    const activeColor = bannerColors[regime] || bannerColors['SIDEWAYS'];

    useEffect(() => {
        if (board && board.length > 0) setPrev(board);
    }, [board]);

    useEffect(() => {
        const t = setInterval(() => {
            if (isMarketOpen()) {
                const newV = {};
                (board || []).forEach(op => {
                    newV[op.symbol] = (Math.random() - 0.5) * 1.8;
                });
                setVariances(newV);
            } else {
                setVariances({});
            }
        }, 800);
        return () => clearInterval(t);
    }, [board]);

    const data = (board && board.length > 0) ? board : prev;

    if (!data || data.length === 0) {
        return (
            <div className="ob-container">
                <div className="ob-header">
                    <span className="ob-title">🔱 OPPORTUNITY BOARD</span>
                    <span className="ob-status ob-status--waiting">AWAITING DATA</span>
                </div>
                <div className="ob-empty">Ranking signals from next cycle...</div>
            </div>
        );
    }

    return (
        <div className="ob-container">
            <div className="ob-header">
                <span className="ob-title">🔱 OPPORTUNITY BOARD</span>
                <div className={`px-2 py-0.5 rounded-sm border text-[8px] font-mono font-black uppercase tracking-widest ${activeColor}`}>
                    {regime.replace('_', ' ')}
                </div>
                <span className="ob-status ob-status--live ml-auto">● LIVE</span>
                <span className="ob-count">{data.length} RANKED</span>
            </div>

            <div className="ob-cols">
                <span>#</span>
                <span>SYMBOL</span>
                <span>CONFIDENCE</span>
                <span>GRADE</span>
                <span>SCORE</span>
                <span>SMART MONEY</span>
                <span>DECISION</span>
            </div>

            <div className="ob-list">
                {data.map((item, idx) => {
                    const gs  = GRADE_STYLE[item.grade] || GRADE_STYLE['D'];
                    const sm  = SM_LABELS[item.smartMoney] || { label: item.smartMoney || '—', color: '#888' };
                    const isTop = idx < 2;
                    const v = variances[item.symbol] || 0;
                    
                    return (
                        <div
                            key={item.symbol}
                            className={`ob-row${isTop ? ' ob-row--top' : ''}`}
                            style={isTop ? { background: gs.background, boxShadow: gs.glow } : {}}
                        >
                            <span className="ob-rank">{idx + 1}</span>

                            <span className="ob-symbol">
                                {isTop && <span className="ob-star">★</span>}
                                {item.symbol}
                            </span>

                            <span className="ob-conf-cell">
                                <span className="ob-conf-val" style={{ color: gs.color }}>
                                    {(item.confidence + (Math.random()*0.4 - 0.2)).toFixed(1)}
                                </span>
                                <ConfBar value={item.confidence} />
                            </span>

                            <span
                                className="ob-grade"
                                style={{ color: gs.color, borderColor: gs.border, background: gs.background }}
                            >
                                {item.grade}
                            </span>

                            <span className="ob-score">{(item.score + (Math.random()*0.2 - 0.1)).toFixed(1)}</span>

                            <span className="ob-sm" style={{ color: sm.color }}>
                                {sm.label}
                            </span>

                            <span className={`ob-decision ob-decision--${(item.decision || '').toLowerCase().replace(/_/g, '-').replace(/ /g, '-')}`}>
                                {item.decision || 'HOLD'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
