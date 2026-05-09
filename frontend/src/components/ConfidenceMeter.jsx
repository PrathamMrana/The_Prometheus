import React, { useEffect, useRef } from 'react';
import './ConfidenceMeter.css';

/**
 * 🔱 [PHASE 20] ConfidenceMeter
 * Circular arc visualization of composite AI confidence score.
 * Shows grade badge and regime label. Animated on value change.
 */

const GRADE_COLORS = {
    'A+': '#00ffb3',
    'A':  '#4ade80',
    'B':  '#facc15',
    'C':  '#f97316',
    'D':  '#ef4444',
};

const GRADE_GLOW = {
    'A+': '0 0 16px #00ffb380',
    'A':  '0 0 12px #4ade8060',
    'B':  '0 0 10px #facc1550',
    'C':  '0 0 8px  #f9731640',
    'D':  '0 0 6px  #ef444430',
};

export default function ConfidenceMeter({ confidenceScore = 0, tradeGrade = 'D', regime = 'UNKNOWN' }) {
    const canvasRef = useRef(null);
    const prevScore = useRef(0);
    const animRef   = useRef(null);

    const color = GRADE_COLORS[tradeGrade] || '#888';
    const glow  = GRADE_GLOW[tradeGrade]  || 'none';

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx    = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2, cy = H / 2;
        const radius = W * 0.38;
        const lineW  = W * 0.07;

        const startAngle = Math.PI * 0.75;
        const endAngle   = Math.PI * 2.25;
        const totalArc   = endAngle - startAngle;

        let animStart = null;
        const from = prevScore.current;
        const to   = Math.min(100, Math.max(0, confidenceScore));
        const duration = 600;

        function draw(val) {
            ctx.clearRect(0, 0, W, H);

            // Track (background arc)
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, endAngle);
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.lineWidth = lineW;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Fill arc
            const fillEnd = startAngle + (val / 100) * totalArc;
            const grad = ctx.createLinearGradient(0, 0, W, H);
            grad.addColorStop(0, color + 'aa');
            grad.addColorStop(1, color);
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, fillEnd);
            ctx.strokeStyle = grad;
            ctx.lineWidth = lineW;
            ctx.lineCap = 'round';
            ctx.shadowColor = color;
            ctx.shadowBlur  = 14;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Score text
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.round(W * 0.18)}px 'Inter', monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Math.round(val), cx, cy - W * 0.04);

            // Label
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = `${Math.round(W * 0.08)}px 'Inter', monospace`;
            ctx.fillText('CONFIDENCE', cx, cy + W * 0.12);
        }

        function animate(ts) {
            if (!animStart) animStart = ts;
            const progress = Math.min((ts - animStart) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            draw(from + (to - from) * ease);
            if (progress < 1) {
                animRef.current = requestAnimationFrame(animate);
            } else {
                prevScore.current = to;
            }
        }

        cancelAnimationFrame(animRef.current);
        animRef.current = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(animRef.current);
    }, [confidenceScore, tradeGrade, color]);

    return (
        <div className="cm-wrapper">
            <canvas ref={canvasRef} className="cm-canvas" width={160} height={160} />
            <div className="cm-grade-badge" style={{ background: color + '22', borderColor: color, boxShadow: glow, color }}>
                {tradeGrade}
            </div>
            <div className="cm-regime">{regime}</div>
        </div>
    );
}
