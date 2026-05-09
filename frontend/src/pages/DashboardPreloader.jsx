import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * 🔱 [PHASE 21] DashboardPreloader
 * Shown during session restoration or while initial telemetry is syncing.
 * Provides a cinematic "institutional infrastructure booting online" feel.
 */

const SYMBOLS = ['RELIANCE.NS', 'AAPL', 'HDFCBANK.NS', 'NVDA', 'TSLA', 'TCS.NS', 'MSFT'];

export default function DashboardPreloader() {
    const [symIdx, setSymIdx] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setSymIdx(prev => (prev + 1) % SYMBOLS.length);
        }, 150);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            position: 'fixed', inset: 0, background: '#020509', zIndex: 9999,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"IBM Plex Mono", monospace', color: '#eef2ff'
        }}>
            {/* Background grid */}
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
                backgroundSize: '40px 40px', pointerEvents: 'none'
            }} />

            {/* Glowing orb / pulse */}
            <motion.div
                animate={{
                    boxShadow: ['0 0 20px rgba(220,160,40,0)', '0 0 80px rgba(220,160,40,0.4)', '0 0 20px rgba(220,160,40,0)']
                }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                    width: 120, height: 120, borderRadius: '50%',
                    border: '1px solid rgba(220,160,40,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 40, position: 'relative'
                }}
            >
                {/* Rotating scanner */}
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    style={{
                        position: 'absolute', inset: -10, borderRadius: '50%',
                        border: '1px solid transparent',
                        borderTopColor: '#dca028', borderRightColor: 'rgba(220,160,40,0.3)',
                    }}
                />
                <svg viewBox="0 0 36 36" fill="none" width="48" height="48">
                    <polygon points="18,2 34,30 2,30" stroke="#dca028" strokeWidth="1.5" fill="none" opacity="0.9"/>
                    <polygon points="18,10 28,26 8,26" fill="rgba(220,160,40,0.12)" stroke="#dca028" strokeWidth="0.5"/>
                    <circle cx="18" cy="20" r="2.5" fill="#dca028"/>
                </svg>
            </motion.div>

            {/* Syncing text */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 13, letterSpacing: '4px', color: '#dca028', fontWeight: 600 }}>
                    SYNCHRONIZING TELEMETRY
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#7a8fa8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} style={{ width: 6, height: 6, background: '#00e896', borderRadius: '50%' }} />
                        WS BRIDGE
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#dca028' }}>TARGET:</span> {SYMBOLS[symIdx]}
                    </div>
                </div>
            </div>

            {/* Sync bars */}
            <div style={{ display: 'flex', gap: 4, marginTop: 40, height: 32, alignItems: 'flex-end' }}>
                {Array.from({ length: 24 }).map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{ height: ['20%', `${Math.random() * 80 + 20}%`, '20%'] }}
                        transition={{ duration: 0.8 + Math.random(), repeat: Infinity, ease: 'easeInOut', delay: i * 0.05 }}
                        style={{ width: 4, background: 'rgba(220,160,40,0.3)', borderRadius: 2 }}
                    />
                ))}
            </div>
        </div>
    );
}
