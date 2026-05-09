import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMarketStore } from '../store/marketStore';

import './LandingPage.css';

/**
 * 🔱 [PHASE 21] LandingPage — Institutional Dark Theme
 * Centered Hero, Advanced Interactive Hub Views
 */

const TICKERS = [
    { sym:'RELIANCE.NS', price:'₹2,456', chg:'+1.87%', up:true },
    { sym:'TCS.NS',      price:'₹3,890', chg:'+0.54%', up:true },
    { sym:'INFY.NS',     price:'₹1,678', chg:'-0.32%', up:false },
    { sym:'HDFCBANK.NS', price:'₹1,892', chg:'+2.10%', up:true },
    { sym:'TATAMOTORS',  price:'₹924',   chg:'-1.24%', up:false },
    { sym:'AAPL',        price:'$187.20', chg:'+0.43%', up:true },
    { sym:'MSFT',        price:'$405.30', chg:'+1.87%', up:true },
    { sym:'TSLA',        price:'$248.60', chg:'-2.34%', up:false },
    { sym:'NVDA',        price:'$875.40', chg:'+3.21%', up:true },
    { sym:'GOOGL',       price:'$165.80', chg:'+0.67%', up:true },
];

function CustomCursor() {
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [trailingPos, setTrailingPos] = useState({ x: 0, y: 0 });
    const [isHover, setIsHover] = useState(false);

    useEffect(() => {
        let frame;
        const posRef = { x: 0, y: 0 };
        const trailRef = { x: 0, y: 0 };

        const move = (e) => {
            posRef.x = e.clientX;
            posRef.y = e.clientY;
            setPos({ x: e.clientX, y: e.clientY });
        };
        const checkHover = (e) => {
            const target = e.target;
            setIsHover(target?.tagName?.toLowerCase() === 'a' || target?.tagName?.toLowerCase() === 'button' || target?.closest('a') || target?.closest('button'));
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mousemove', checkHover);

        const updateTrailing = () => {
            trailRef.x += (posRef.x - trailRef.x) * 0.15;
            trailRef.y += (posRef.y - trailRef.y) * 0.15;
            setTrailingPos({ x: trailRef.x, y: trailRef.y });
            frame = requestAnimationFrame(updateTrailing);
        };
        frame = requestAnimationFrame(updateTrailing);

        return () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mousemove', checkHover);
            cancelAnimationFrame(frame);
        };
    }, []);

    return (
        <>
            <div className="lp-cursor-dot" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} />
            <div className={`lp-cursor-trail ${isHover ? 'hover' : ''}`} style={{ transform: `translate(${trailingPos.x}px, ${trailingPos.y}px)` }} />
        </>
    );
}

function BackgroundMatrix() {
    const ref = useRef(null);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        let W, H, raf;
        const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
        resize();
        window.addEventListener('resize', resize);

        const particles = Array.from({ length: 80 }, () => ({
            x: Math.random() * W, y: Math.random() * H,
            size: Math.random() * 2 + 1, speedY: Math.random() * 0.5 + 0.1,
            opacity: Math.random() * 0.5 + 0.1
        }));

        function draw() {
            ctx.fillStyle = '#020509'; ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = 'rgba(220,160,40,0.05)';
            ctx.lineWidth = 1;
            const gridSize = 100;
            for(let x=0; x<W; x+=gridSize) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
            for(let y=0; y<H; y+=gridSize) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
            particles.forEach(p => {
                p.y -= p.speedY;
                if(p.y < 0) { p.y = H; p.x = Math.random() * W; }
                ctx.fillStyle = `rgba(220,160,40,${p.opacity})`;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
            });
            raf = requestAnimationFrame(draw);
        }
        draw();
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
    }, []);
    return (
        <>
            <canvas ref={ref} className="lp-bg-matrix" />
            <div className="lp-perspective-grid" />
        </>
    );
}

function TerminalView() {
    const market = useMarketStore(state => state.market);
    const global = useMarketStore(state => state.global);
    const [activeTab, setActiveTab] = useState('opportunity');
    
    // Extract real scores for the demo view
    const rel = market['RELIANCE'] || { signal: { score: 87 } };
    const infy = market['INFY'] || { signal: { score: 72 } };
    const hdfc = market['HDFCBANK'] || { signal: { score: 65 } };
    const aapl = market['AAPL'] || { signal: { score: 82 } };

    const [meter, setMeter] = useState(87);
    const [logs, setLogs] = useState([
        'SYS: WebSocket telemetry linked.',
        'ENG: Regime AI [TRENDING_BULL] calibrated.',
        'NET: Fetching order book depth...'
    ]);
    const [globalStats, setGlobalStats] = useState({
        latency: 14, throughput: 1842, regimes: 3, signals: 47, uptime: 99.97
    });

    useEffect(() => {
        const ticker = setInterval(() => {
            setMeter(prev => { 
                const target = global.confidence ? global.confidence * 100 : 87;
                const n = prev + (target - prev) * 0.1 + (Math.random() - 0.5) * 1; 
                return Math.round(n); 
            });
            setGlobalStats(prev => ({
                latency: Math.max(8, Math.round(prev.latency + (Math.random() - 0.5) * 4)),
                throughput: Math.max(1500, Math.round(prev.throughput + (Math.random() - 0.5) * 80)),
                regimes: prev.regimes,
                signals: Object.keys(market).length || prev.signals,
                uptime: 99.97
            }));
        }, 1200);
        const logTicker = setInterval(() => {
            const possible = [
                'VSA: Institutional block detected on RELIANCE.',
                'AI: Confidence score recalibrated to 87.4.',
                'ENG: Recalculating EMA cross signal.',
                'SYS: Integrity checksum PASSED.',
                'NET: Avg latency 14ms — nominal.',
                'REGIME: TRENDING_BULL confirmed.',
                'RISK: Drawdown threshold clear.',
                'EXEC: Position sizing validated.'
            ];
            setLogs(prev => { const n = [...prev, possible[Math.floor(Math.random()*possible.length)]]; if (n.length > 6) n.shift(); return n; });
        }, 2500);
        return () => { clearInterval(ticker); clearInterval(logTicker); };
    }, []);

    return (
        <motion.div className="view-fullscreen" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.6 }}>
            <div className="view-header">
                <div className="view-label">TERMINAL</div>
                <h2 className="view-title">Dynamic Interactive Telemetry.</h2>
            </div>
            <div className="lp-terminal-wrap">
                <div className="lp-terminal-header">
                    <div className="lp-terminal-dots"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
                    <div className="lp-terminal-tabs">
                        <span className={activeTab === 'opportunity' ? 'active' : ''} onClick={() => setActiveTab('opportunity')} style={{cursor:'none'}}>OPPORTUNITY BOARD</span>
                        <span className={activeTab === 'global' ? 'active' : ''} onClick={() => setActiveTab('global')} style={{cursor:'none'}}>GLOBAL TELEMETRY</span>
                    </div>
                    <div className="lp-terminal-status"><span className="ping" /> NODE ONLINE</div>
                </div>

                {activeTab === 'opportunity' && (
                    <div className="lp-terminal-body">
                        <div className="lp-term-col lp-term-ranks">
                            <div className="lp-term-title">LIVE RANKINGS</div>
                            <div className="lp-row header"><span>SYM</span><span>SCORE</span><span>GRADE</span><span>BIAS</span></div>
                            <div className="lp-row"><span className="sym">RELIANCE</span><span className="score" style={{color:'#00e896'}}>{(rel?.signal?.score || 0).toFixed(1)}</span><span className="grade a-plus">A+</span><span className="bias lp-up">BULL</span></div>
                            <div className="lp-row"><span className="sym">AAPL</span><span className="score" style={{color:'#00e896'}}>{(aapl?.signal?.score || 0).toFixed(1)}</span><span className="grade a">A</span><span className="bias lp-up">BULL</span></div>
                            <div className="lp-row"><span className="sym">INFY</span><span className="score">{(infy?.signal?.score || 0).toFixed(1)}</span><span className="grade b">B</span><span className="bias">NEUTRAL</span></div>
                            <div className="lp-row"><span className="sym">HDFCBANK</span><span className="score" style={{color:'#ff3b6b'}}>{(hdfc?.signal?.score || 0).toFixed(1)}</span><span className="grade c">C</span><span className="bias lp-down">BEAR</span></div>
                        </div>
                        <div className="lp-term-col lp-term-center">
                            <div className="lp-term-title">COMPOSITE CONFIDENCE</div>
                            <div className="lp-dyn-meter">
                                <svg viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="40" className="bg" />
                                    <circle cx="50" cy="50" r="40" className="fg" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * meter) / 100} />
                                </svg>
                                <div className="val">{meter}<span>%</span></div>
                            </div>
                            <div className="lp-regime-hud"><div className="tag">{global.regime || 'TRENDING_BULL'}</div><div className="sub">EXPANSION REGIME ACTIVE</div></div>
                        </div>
                        <div className="lp-term-col lp-term-logs">
                            <div className="lp-term-title">EXECUTION TELEMETRY</div>
                            <div className="lp-log-stream">
                                <AnimatePresence>
                                    {logs.map((log, i) => (
                                        <motion.div key={log + i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="log-line">
                                            <span className="arr">{'>'}</span> {log}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                            <div className="lp-scanline" />
                        </div>
                    </div>
                )}

                {activeTab === 'global' && (
                    <div className="lp-global-telem">
                        <div className="lgt-grid">
                            <div className="lgt-stat">
                                <div className="lgt-label">AVG LATENCY</div>
                                <div className="lgt-bar"><div className="lgt-bar-fill" style={{width:`${Math.min(100,(globalStats.latency/50)*100)}%`, background: globalStats.latency < 20 ? '#00e896' : '#ff3b6b'}} /></div>
                            </div>
                            <div className="lgt-stat">
                                <div className="lgt-label">DATA THROUGHPUT</div>
                                <div className="lgt-bar"><div className="lgt-bar-fill" style={{width:`${Math.min(100,(globalStats.throughput/2000)*100)}%`}} /></div>
                            </div>
                            <div className="lgt-stat">
                                <div className="lgt-label">ACTIVE SIGNALS</div>
                                <div className="lgt-bar"><div className="lgt-bar-fill" style={{width:`${Math.min(100,(globalStats.signals/60)*100)}%`}} /></div>
                            </div>
                            <div className="lgt-stat">
                                <div className="lgt-label">ENGINE UPTIME</div>
                                <div className="lgt-bar"><div className="lgt-bar-fill" style={{width:`${globalStats.uptime}%`, background:'#00e896'}} /></div>
                            </div>
                            <div className="lgt-stat">
                                <div className="lgt-label">LIVE REGIMES</div>
                                <div className="lgt-bar"><div className="lgt-bar-fill" style={{width:'60%'}} /></div>
                            </div>
                            <div className="lgt-stat">
                                <div className="lgt-label">TRACKED SYMBOLS</div>
                                <div className="lgt-bar"><div className="lgt-bar-fill" style={{width:'95%'}} /></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function TelemetryView() {
    const METRICS = [
        { label: 'DIRECTIONAL ALPHA', value: 87, color: '#dca028' },
        { label: 'REGIME ADAPTATION', value: 92, color: '#dca028' },
        { label: 'DRAWDOWN RESISTANCE', value: 78, color: '#dca028' },
        { label: 'CONFIDENCE CALIBRATION', value: 84, color: '#dca028' },
        { label: 'EXECUTION LATENCY', value: 96, color: '#dca028' },
        { label: 'SIGNAL ACCURACY', value: 81, color: '#dca028' },
    ];
    const [vals, setVals] = useState(METRICS.map(m => m.value));
    useEffect(() => {
        const t = setInterval(() => {
            setVals(prev => prev.map(v => Math.max(50, Math.min(99, Math.round(v + (Math.random()-0.5)*3)))));
        }, 1500);
        return () => clearInterval(t);
    }, []);

    return (
        <motion.div className="view-fullscreen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <div className="view-header">
                <div className="view-label">TELEMETRY</div>
                <h2 className="view-title">Validation Matrix.</h2>
            </div>
            <div className="telemetry-live">
                <div className="tl-left">
                    <div className="tl-radar">
                        <div className="tl-ring r1" />
                        <div className="tl-ring r2" />
                        <div className="tl-ring r3" />
                        <svg viewBox="0 0 100 100" className="tm-poly-svg">
                            <motion.polygon
                                fill="rgba(220,160,40,0.15)"
                                stroke="#dca028"
                                strokeWidth="1.5"
                                animate={{
                                    points: [
                                        '50,8 88,38 74,88 26,88 12,38',
                                        '50,18 83,33 78,83 22,80 17,42',
                                        '50,8 88,38 74,88 26,88 12,38'
                                    ]
                                }}
                                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        </svg>
                        <div className="tl-center-dot" />
                    </div>
                </div>
                <div className="tl-right">
                    {METRICS.map((m, i) => (
                        <div className="tl-metric" key={m.label}>
                            <div className="tl-metric-header">
                                <span className="tl-metric-label">{m.label}</span>
                            </div>
                            <div className="tl-track">
                                <motion.div
                                    className="tl-fill"
                                    animate={{ width: `${vals[i]}%` }}
                                    transition={{ duration: 1, ease: 'easeOut' }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

const PIPELINE = [
    { num: '01', title: 'MARKET INGESTION', desc: 'Raw OHLCV streams ingested from global exchanges via WebSocket. 57 symbols synchronized per cycle.', stat: '57 symbols / 12s cycle' },
    { num: '02', title: 'REGIME CLASSIFICATION', desc: 'AI volatility engine classifies current market regime: TRENDING, MEAN_REVERSION, PANIC, or BREAKOUT.', stat: '4 regime states' },
    { num: '03', title: 'VSA DETECTION', desc: 'Volume Spread Analysis isolates institutional footprints, smart money flow, and accumulation zones.', stat: 'Smart Money Index' },
    { num: '04', title: 'EDGE SCORING', desc: 'Multi-factor scoring engine produces a 0-100 edge score fusing momentum, breakout, and volume signals.', stat: 'Score 0–100' },
    { num: '05', title: 'RISK FILTRATION', desc: 'Drawdown calibration, position limits, and capital caps enforce strict execution discipline.', stat: 'Max 10 positions' },
    { num: '06', title: 'CONFIDENCE OUTPUT', desc: 'Final probabilistic confidence grade assigned. Only A/B grade signals pass to execution.', stat: 'Threshold ≥ 70' },
];

function ProcessView() {
    const [active, setActive] = useState(null);
    return (
        <motion.div className="view-fullscreen view-process" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <div className="view-header">
                <div className="view-label">PROCESS</div>
                <h2 className="view-title">Execution Pipeline.</h2>
            </div>
            <div className="process-tunnel">
                <div className="pt-beam" />
                <div className="pt-nodes">
                    {PIPELINE.map((step, i) => (
                        <motion.div 
                            key={step.num} 
                            className="pt-node"
                            onHoverStart={() => setActive(i)}
                            onHoverEnd={() => setActive(null)}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.15 }}
                        >
                            <div className={`pt-dot-wrap ${active === i ? 'active' : ''}`}>
                                <div className="pt-dot" />
                                <div className="pt-pulse" style={{ animationDelay: `${i * 0.4}s` }} />
                            </div>
                            <div className={`pt-content ${active === i ? 'active' : ''}`}>
                                <div className="pt-details">
                                    <h3>{step.title}</h3>
                                    <p>{step.desc}</p>
                                    <div className="pt-stat">{step.stat}</div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

function ArchitectureView() {
    const NODES = [
        { id: 1, x: 50, y: 15, title: 'TELEMETRY INGEST', desc: 'Raw OHLCV Websockets' },
        { id: 2, x: 20, y: 40, title: 'REGIME CLASSIFIER', desc: 'Volatility & Momentum AI' },
        { id: 3, x: 80, y: 40, title: 'VSA ENGINE', desc: 'Institutional Volume Flow' },
        { id: 4, x: 30, y: 70, title: 'EDGE SCORING', desc: 'Multi-factor technicals' },
        { id: 5, x: 70, y: 70, title: 'RISK FILTER', desc: 'Drawdown calibration' },
        { id: 6, x: 50, y: 90, title: 'CONFIDENCE SYNTHESIS', desc: 'Final Probabilistic Output' },
    ];
    const [hovered, setHovered] = useState(null);

    return (
        <motion.div className="view-fullscreen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <div className="view-header">
                <div className="view-label">ARCHITECTURE</div>
                <h2 className="view-title">Neural Network Topology.</h2>
            </div>
            <div className="arch-map">
                <svg className="arch-lines">
                    <line x1="50%" y1="15%" x2="20%" y2="40%" stroke="rgba(220,160,40,0.6)" strokeWidth="3" className="arch-line-anim" />
                    <line x1="50%" y1="15%" x2="80%" y2="40%" stroke="rgba(220,160,40,0.6)" strokeWidth="3" className="arch-line-anim delay-1" />
                    <line x1="20%" y1="40%" x2="30%" y2="70%" stroke="rgba(220,160,40,0.6)" strokeWidth="3" className="arch-line-anim delay-2" />
                    <line x1="80%" y1="40%" x2="70%" y2="70%" stroke="rgba(220,160,40,0.6)" strokeWidth="3" className="arch-line-anim delay-3" />
                    <line x1="30%" y1="70%" x2="50%" y2="90%" stroke="rgba(220,160,40,0.6)" strokeWidth="3" className="arch-line-anim delay-4" />
                    <line x1="70%" y1="70%" x2="50%" y2="90%" stroke="rgba(220,160,40,0.6)" strokeWidth="3" className="arch-line-anim delay-5" />
                    {/* Glowing static backdrop lines */}
                    <line x1="50%" y1="15%" x2="20%" y2="40%" stroke="rgba(220,160,40,0.15)" strokeWidth="1" />
                    <line x1="50%" y1="15%" x2="80%" y2="40%" stroke="rgba(220,160,40,0.15)" strokeWidth="1" />
                    <line x1="20%" y1="40%" x2="30%" y2="70%" stroke="rgba(220,160,40,0.15)" strokeWidth="1" />
                    <line x1="80%" y1="40%" x2="70%" y2="70%" stroke="rgba(220,160,40,0.15)" strokeWidth="1" />
                    <line x1="30%" y1="70%" x2="50%" y2="90%" stroke="rgba(220,160,40,0.15)" strokeWidth="1" />
                    <line x1="70%" y1="70%" x2="50%" y2="90%" stroke="rgba(220,160,40,0.15)" strokeWidth="1" />
                </svg>
                {NODES.map(n => (
                    <div className="arch-node-wrapper" key={n.id} style={{ left: `${n.x}%`, top: `${n.y}%` }} onMouseEnter={()=>setHovered(n.id)} onMouseLeave={()=>setHovered(null)}>
                        <div className={`arch-node-dot ${hovered===n.id?'hover':''}`} />
                        <div className="arch-node-label">{n.title}</div>
                        <motion.div className="arch-node-info" initial={{ opacity: 0 }} animate={{ opacity: hovered===n.id ? 1 : 0 }}>
                            <div className="arch-ndesc">{n.desc}</div>
                        </motion.div>
                    </div>
                ))}
            </div>
        </motion.div>
    );
}

function HomeView({ navTo }) {
    return (
        <motion.div className="view-home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
            <section className="lp-hero-centered">
                <div className="lp-hero-content-center">
                    <motion.div className="lp-hero-badge" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
                        <span className="lp-badge-dot" />INSTITUTIONAL QUANTITATIVE INFRASTRUCTURE
                    </motion.div>
                    <motion.h1 className="lp-hero-title-mega" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.4, duration: 0.8 }}>
                        THE PROMETHEUS
                    </motion.h1>
                    <motion.p className="lp-hero-sub-center" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}>
                        A hyper-advanced market intelligence node designed to classify regimes, detect institutional flow, and generate confidence-weighted directional probabilities.
                    </motion.p>
                    <motion.div className="lp-hero-actions-center" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.8 }}>
                        <a href="/auth" className="lp-btn-primary lp-btn-mega">
                            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M8 1L15 8L8 15M1 8H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            INITIALIZE WORKSPACE
                            <div className="lp-btn-primary-sweep" />
                        </a>
                    </motion.div>
                </div>
                <div className="lp-hero-core-glow" />
            </section>

            <section className="lp-advancements">
                <div className="view-header" style={{ marginBottom: 80 }}>
                    <div className="view-label">PLATFORM ADVANCEMENTS</div>
                    <h2 className="view-title">Unprecedented Market Clarity.</h2>
                </div>
                <div className="adv-grid">
                    <div className="adv-card">
                        <div className="adv-icon">⚡</div>
                        <h3>Sub-Millisecond Engine</h3>
                        <p>Powered by local-first edge computation. WebSocket streams bypass standard retail latency bottlenecks for immediate regime analysis.</p>
                    </div>
                    <div className="adv-card">
                        <div className="adv-icon">🧠</div>
                        <h3>Adaptive Neural Weights</h3>
                        <p>The intelligence layer dynamically recalibrates confidence thresholds based on real-time VIX and historical drawdown patterns.</p>
                    </div>
                    <div className="adv-card">
                        <div className="adv-icon">🛡️</div>
                        <h3>Institutional Encryption</h3>
                        <p>All workspaces are secured with AES-256 JWT pipelines. Portfolio state and tactical data remain isolated within your execution node.</p>
                    </div>
                </div>
            </section>

            <section className="lp-global-integration">
                <div className="lpg-content">
                    <h2>Global Liquidity Integration</h2>
                    <p>Prometheus operates autonomously across global equities, ingesting millions of data points per cycle to form a unified thesis on institutional accumulation.</p>
                    <button onClick={(e) => navTo('architecture', e)} className="lp-btn-secondary">VIEW ARCHITECTURE</button>
                </div>
                <div className="lpg-visual">
                    <div className="lpg-sphere">
                        <div className="lpg-rings-container">
                            <div className="lpg-radar-sweep" />
                            <div className="lpg-ring r1" />
                            <div className="lpg-ring r2" />
                            <div className="lpg-ring r3" />
                            <div className="lpg-ring r4" />
                        </div>
                        <div className="lpg-core">
                            <div className="lpg-core-inner" />
                            <div className="lpg-core-pulse" />
                        </div>
                        <div className="lpg-float f1">
                            <div className="lpg-float-val">57</div>
                            <div className="lpg-float-lbl">GLOBAL EQUITIES</div>
                        </div>
                        <div className="lpg-float f2">
                            <div className="lpg-float-val">1.2M</div>
                            <div className="lpg-float-lbl">DATA POINTS / SEC</div>
                        </div>
                        <div className="lpg-float f3">
                            <div className="lpg-float-val">SUB-MS</div>
                            <div className="lpg-float-lbl">EXECUTION LATENCY</div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="lp-final-cta">
                <div className="lp-cta-glow-massive" />
                <div className="lp-cta-content">
                    <h2>Abandon static indicators.<br/>Adopt probabilistic intelligence.</h2>
                    <a href="/auth" className="lp-btn-primary lp-btn-mega" style={{ marginTop: 40 }}>
                        REQUEST CLEARANCE
                        <div className="lp-btn-primary-sweep" />
                    </a>
                </div>
            </section>
        </motion.div>
    );
}

export default function LandingPage() {
    const [activeView, setActiveView] = useState('home');
    const [open, setOpen] = useState(false);
    
    // 🛡️ [PHASE 21] No WebSocket on public landing page — avoids 401 noise.
    // Market store is already populated by AppShell when the user is authenticated.
    // Unauthenticated visitors fall back to the static TICKERS array below.

    useEffect(() => {
        const check = () => {
            const now = new Date();
            const ist = (now.getUTCHours()*60+now.getUTCMinutes()+5*60+30) % (24*60);
            const wd = now.getDay();
            setOpen(wd > 0 && wd < 6 && ist >= 555 && ist < 930);
        };
        check(); const t = setInterval(check, 60000); return () => clearInterval(t);
    }, []);

    const market = useMarketStore(state => state.market);
    const tickersFromStore = Object.values(market)
        .filter(t => t.price > 0)
        .sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent))
        .slice(0, 15) // Show more for better coverage
        .slice(0, 15)
        .map(real => {
            const isNSE = real.currency === 'INR' || (real.symbol||'').includes('.NS');
            const pct = real.percent || 0;
            const isNeutral = Math.abs(pct) < 0.01;
            return {
                sym: real.rawSymbol || real.symbol,
                price: `${isNSE ? '₹' : '$'}${real.price.toLocaleString()}`,
                chg: `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`,
                colorClass: isNeutral ? 'lp-neutral' : (pct > 0 ? 'lp-up' : 'lp-down'),
                icon: isNeutral ? '•' : (pct > 0 ? '▲' : '▼')
            };
        });

    const displayTickers = tickersFromStore.length > 0 ? tickersFromStore : TICKERS;

    const navTo = (view, e) => {
        if(e) e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setActiveView(view);
    };

    return (
        <div className="lp-root">
            <BackgroundMatrix />
            <CustomCursor />

            <nav className="lp-nav">
                <a href="#home" onClick={(e)=>navTo('home', e)} className="lp-nav-logo">
                    <svg viewBox="0 0 36 36" fill="none" width="32" height="32">
                        <polygon points="18,2 34,30 2,30" stroke="#dca028" strokeWidth="1.5" fill="none" opacity="0.9"/>
                        <polygon points="18,10 28,26 8,26" fill="rgba(220,160,40,0.12)" stroke="#dca028" strokeWidth="0.5"/>
                        <circle cx="18" cy="20" r="2.5" fill="#dca028"/>
                        <line x1="18" y1="10" x2="18" y2="17" stroke="#dca028" strokeWidth="1" opacity="0.6"/>
                    </svg>
                </a>
                <div className="lp-nav-center">
                    <button onClick={()=>navTo('home')} className={`lp-nav-link ${activeView==='home'?'active':''}`}>Home</button>
                    <button onClick={()=>navTo('terminal')} className={`lp-nav-link ${activeView==='terminal'?'active':''}`}>Terminal</button>
                    <button onClick={()=>navTo('architecture')} className={`lp-nav-link ${activeView==='architecture'?'active':''}`}>Architecture</button>
                    <button onClick={()=>navTo('telemetry')} className={`lp-nav-link ${activeView==='telemetry'?'active':''}`}>Telemetry</button>
                    <button onClick={()=>navTo('process')} className={`lp-nav-link ${activeView==='process'?'active':''}`}>Process</button>
                </div>
                <div className="lp-nav-right">
                    <div className="lp-market-pill">
                        <span className={`lp-market-dot ${open ? 'lp-market-dot--open' : ''}`} />
                        <span>{open ? 'NSE OPEN' : 'NSE CLOSED'}</span>
                    </div>
                    <a href="/auth" className="lp-btn-launch">Launch Platform</a>
                </div>
            </nav>

            <main className="lp-main-content">
                <AnimatePresence mode="wait">
                    {activeView === 'home' && <HomeView key="home" navTo={navTo} />}
                    {activeView === 'terminal' && <TerminalView key="terminal" />}
                    {activeView === 'architecture' && <ArchitectureView key="arch" />}
                    {activeView === 'telemetry' && <TelemetryView key="telemetry" />}
                    {activeView === 'process' && <ProcessView key="process" />}
                </AnimatePresence>
            </main>

            <div className="lp-ticker-wrap lp-ticker-fixed">
                <div className="lp-ticker-track">
                    {[...displayTickers, ...displayTickers, ...displayTickers].map((t, i) => (
                        <div key={i} className="lp-ticker-item">
                            <span className="lp-ticker-sym">{t.sym}</span>
                            <span className="lp-ticker-price">{t.price}</span>
                            <span className={`lp-ticker-chg ${t.colorClass}`}>
                                {t.icon} {t.chg}
                            </span>
                            <span className="lp-ticker-dot" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
