import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './BootSequence.css';

/**
 * 🔱 [PHASE 21] BootSequence
 * Cinematic institutional terminal boot experience.
 * Shows AI initialization sequence before dashboard loads.
 */

const BOOT_LINES = [
    { delay: 0,    text: 'PROMETHEUS TELEMETRY INFRASTRUCTURE v6.8',     accent: true },
    { delay: 150,  text: 'Establishing secure WebSocket sync bridge...   OK' },
    { delay: 300,  text: 'Initializing market regime classifier...       OK' },
    { delay: 500,  text: 'Loading smart money VSA flow engine...         OK' },
    { delay: 700,  text: 'Synchronizing local institutional watchlist... OK' },
    { delay: 900,  text: 'Calibrating confidence-weighted scoring...     OK' },
    { delay: 1100, text: 'Validating portfolio state telemetry...        OK' },
    { delay: 1300, text: 'Signal intelligence pipeline: ONLINE',           accent: true },
    { delay: 1500, text: 'Regime AI: SIDEWAYS → MONITORING BREADTH' },
    { delay: 1800, text: 'Opportunity board engine: ACTIVE' },
    { delay: 2100, text: 'Execution sizing telemetry: ADAPTIVE (1.0x)' },
    { delay: 2400, text: '──────────────────────────────────────────────────' },
    { delay: 2700, text: 'ALL SYSTEMS NOMINAL',                           accent: true },
    { delay: 3000, text: 'ENTERING PRIVATE WORKSPACE...' },
];

export default function BootSequence({ userName, onComplete }) {
    const [visible, setVisible] = useState([]);
    const [barWidth, setBarWidth] = useState(0);
    const [done, setDone] = useState(false);

    useEffect(() => {
        const timers = [];
        BOOT_LINES.forEach((line, i) => {
            const t = setTimeout(() => {
                setVisible(prev => [...prev, i]);
                setBarWidth(Math.round(((i + 1) / BOOT_LINES.length) * 100));
            }, line.delay);
            timers.push(t);
        });

        // Complete sequence at ~3.4s
        const complete = setTimeout(() => {
            setDone(true);
            setTimeout(onComplete, 600);
        }, 3400);
        timers.push(complete);

        return () => timers.forEach(clearTimeout);
    }, [onComplete]);

    return (
        <AnimatePresence>
            {!done && (
                <motion.div
                    className="boot-root"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)', transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }}
                >
                    {/* Background grid */}
                    <div className="boot-grid" />
                    <div className="boot-glow" />

                    <motion.div
                        className="boot-terminal"
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                        {/* Header */}
                        <div className="boot-header">
                            <div className="boot-logo-row">
                                <svg viewBox="0 0 36 36" fill="none" width="40" height="40">
                                    <polygon points="18,2 34,30 2,30" stroke="#dca028" strokeWidth="1.5" fill="none" opacity="0.9"/>
                                    <polygon points="18,10 28,26 8,26" fill="rgba(220,160,40,0.12)" stroke="#dca028" strokeWidth="0.5"/>
                                    <circle cx="18" cy="20" r="2.5" fill="#dca028"/>
                                    <line x1="18" y1="10" x2="18" y2="17" stroke="#dca028" strokeWidth="1" opacity="0.6"/>
                                </svg>
                                <div>
                                    <div className="boot-logo-name">THE PROMETHEUS</div>
                                    <div className="boot-logo-sub">Private Intelligence Workspace</div>
                                </div>
                            </div>
                            {userName && (
                                <div className="boot-user">
                                    SESSION: <span>{userName.toUpperCase()}</span>
                                </div>
                            )}
                        </div>

                        <div className="boot-divider" />

                        {/* Log output */}
                        <div className="boot-log">
                            {BOOT_LINES.map((line, i) => (
                                <motion.div
                                    key={i}
                                    className={`boot-line ${line.accent ? 'boot-line--accent' : ''} ${visible.includes(i) ? 'boot-line--visible' : ''}`}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={visible.includes(i) ? { opacity: 1, x: 0 } : {}}
                                    transition={{ duration: 0.2 }}
                                >
                                    {!line.accent && <span className="boot-prompt">▶</span>}
                                    {line.text}
                                </motion.div>
                            ))}

                            {/* Blinking cursor */}
                            {visible.length < BOOT_LINES.length && (
                                <span className="boot-cursor">█</span>
                            )}
                        </div>

                        <div className="boot-divider" style={{ marginTop: 16 }} />

                        {/* Progress bar */}
                        <div className="boot-progress-label">
                            <span>INITIALIZING WORKSPACE</span>
                            <span>{barWidth}%</span>
                        </div>
                        <div className="boot-progress-track">
                            <motion.div
                                className="boot-progress-fill"
                                animate={{ width: `${barWidth}%` }}
                                transition={{ duration: 0.15, ease: 'easeOut' }}
                            />
                        </div>

                        {/* Status row */}
                        <div className="boot-status-row">
                            <div className="boot-status-dot" />
                            <span>NODE SYNCED</span>
                            <span className="boot-status-sep">|</span>
                            <span>REGIME AI ONLINE</span>
                            <span className="boot-status-sep">|</span>
                            <span>SECURE WS</span>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
