import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import './AuthPage.css';

// ─── Animated particle canvas ─────────────────────────────────────────────────
function ParticleCanvas() {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let W = canvas.width = window.innerWidth;
        let H = canvas.height = window.innerHeight;
        const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
        window.addEventListener('resize', onResize);

        // Particle nodes
        const N = 60;
        const pts = Array.from({ length: N }, () => ({
            x: Math.random() * W, y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
            r: Math.random() * 1.5 + 0.5
        }));

        let raf;
        function draw() {
            ctx.clearRect(0, 0, W, H);
            // Move + draw nodes
            pts.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
                if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(220,160,40,0.4)';
                ctx.fill();
            });
            // Connect nearby nodes
            for (let i = 0; i < N; i++) {
                for (let j = i + 1; j < N; j++) {
                    const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.moveTo(pts[i].x, pts[i].y);
                        ctx.lineTo(pts[j].x, pts[j].y);
                        ctx.strokeStyle = `rgba(220,160,40,${(1 - dist / 120) * 0.12})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
            raf = requestAnimationFrame(draw);
        }
        draw();
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
    }, []);
    return <canvas ref={canvasRef} className="ap-particle-canvas" />;
}

// ─── Input field component ────────────────────────────────────────────────────
function AuthInput({ id, label, type = 'text', value, onChange, placeholder, autoFocus }) {
    const [focused, setFocused] = useState(false);
    return (
        <div className={`ap-field ${focused || value ? 'ap-field--active' : ''}`}>
            <label className="ap-label" htmlFor={id}>{label}</label>
            <input
                id={id}
                type={type}
                className="ap-input"
                value={value}
                onChange={e => onChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={placeholder}
                autoFocus={autoFocus}
                autoComplete={type === 'password' ? 'current-password' : type === 'email' ? 'email' : 'name'}
            />
            <div className={`ap-field-line ${focused ? 'ap-field-line--focused' : ''}`} />
        </div>
    );
}

// ─── Main AuthPage ────────────────────────────────────────────────────────────
export default function AuthPage({ onSuccess }) {
    const [mode, setMode]         = useState('signin'); // 'signin' | 'signup'
    const [name, setName]         = useState('');
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [localErr, setLocalErr] = useState('');

    const { login, register, isLoading, error, clearError } = useAuthStore();

    // Clear error when switching mode
    useEffect(() => { clearError(); setLocalErr(''); }, [mode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalErr('');
        clearError();

        // Client-side validation
        if (mode === 'signup') {
            if (!name.trim())           return setLocalErr('Please enter your full name.');
            if (name.trim().length < 2) return setLocalErr('Name must be at least 2 characters.');
        }
        if (!email.trim())    return setLocalErr('Please enter your email address.');
        if (!password.trim()) return setLocalErr('Please enter your password.');
        if (mode === 'signup' && password.length < 8)
            return setLocalErr('Password must be at least 8 characters.');

        const result = mode === 'signin'
            ? await login(email, password)
            : await register(email, password, name);

        if (result.success) onSuccess();
    };

    const displayError = localErr || error;

    return (
        <div className="ap-root">
            <ParticleCanvas />

            {/* Background grid */}
            <div className="ap-grid-bg" />

            {/* Gold radial glow */}
            <div className="ap-glow" />

            {/* Logo bar */}
            <div className="ap-topbar">
                <div className="ap-logo">
                    <svg viewBox="0 0 36 36" fill="none" width="32" height="32">
                        <polygon points="18,2 34,30 2,30" stroke="#dca028" strokeWidth="1.5" fill="none" opacity="0.9"/>
                        <polygon points="18,10 28,26 8,26" fill="rgba(220,160,40,0.12)" stroke="#dca028" strokeWidth="0.5"/>
                        <circle cx="18" cy="20" r="2.5" fill="#dca028"/>
                    </svg>
                    <span className="ap-logo-text">THE <span>PROMETHEUS</span></span>
                </div>
                <div className="ap-version">BUILD 6.8.0-PROD</div>
            </div>

            {/* Auth card */}
            <motion.div
                className="ap-card"
                initial={{ opacity: 0, y: 32, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
                {/* Mode tabs */}
                <div className="ap-tabs">
                    <button
                        id="tab-signin"
                        className={`ap-tab ${mode === 'signin' ? 'ap-tab--active' : ''}`}
                        onClick={() => setMode('signin')}
                    >Sign In</button>
                    <button
                        id="tab-signup"
                        className={`ap-tab ${mode === 'signup' ? 'ap-tab--active' : ''}`}
                        onClick={() => setMode('signup')}
                    >Create Account</button>
                    <div className={`ap-tab-indicator ${mode === 'signup' ? 'ap-tab-indicator--right' : ''}`} />
                </div>

                {/* Form */}
                <AnimatePresence mode="wait">
                    <motion.form
                        key={mode}
                        className="ap-form"
                        onSubmit={handleSubmit}
                        initial={{ opacity: 0, x: mode === 'signup' ? 20 : -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: mode === 'signup' ? -20 : 20 }}
                        transition={{ duration: 0.28, ease: 'easeInOut' }}
                    >
                        <div className="ap-form-header">
                            <h1 className="ap-form-title">
                                {mode === 'signin' ? 'Authenticate to Workspace.' : 'Initialize Secure Access.'}
                            </h1>
                            <p className="ap-form-sub">
                                {mode === 'signin'
                                    ? 'Establish secure connection to the Prometheus telemetry hub.'
                                    : 'Request a private intelligence workspace.'}
                            </p>
                        </div>

                        {mode === 'signup' && (
                            <AuthInput
                                id="auth-name"
                                label="Full Name"
                                value={name}
                                onChange={setName}
                                placeholder="Your full name"
                                autoFocus
                            />
                        )}
                        <AuthInput
                            id="auth-email"
                            label="Email Address"
                            type="email"
                            value={email}
                            onChange={setEmail}
                            placeholder="your@email.com"
                            autoFocus={mode === 'signin'}
                        />
                        <AuthInput
                            id="auth-password"
                            label="Password"
                            type="password"
                            value={password}
                            onChange={setPassword}
                            placeholder={mode === 'signup' ? 'Minimum 8 characters' : '••••••••'}
                        />

                        {/* Error message */}
                        <AnimatePresence>
                            {displayError && (
                                <motion.div
                                    className="ap-error"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <span className="ap-error-icon">⚠</span>
                                    {displayError}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Submit */}
                        <button
                            id="auth-submit"
                            type="submit"
                            className="ap-submit"
                            disabled={isLoading}
                        >
                            {isLoading
                                ? <span className="ap-spinner" />
                                : (mode === 'signin' ? 'AUTHORIZE SESSION' : 'INITIALIZE WORKSPACE')}
                        </button>

                        {/* Switch mode */}
                        <div className="ap-switch">
                            {mode === 'signin'
                                ? <>No workspace allocated?&nbsp;<button type="button" onClick={() => setMode('signup')}>Request Access</button></>
                                : <>Already have clearance?&nbsp;<button type="button" onClick={() => setMode('signin')}>Authenticate</button></>
                            }
                        </div>
                    </motion.form>
                </AnimatePresence>
            </motion.div>

            {/* Disclaimer */}
            <div className="ap-disclaimer">
                ⚠ Prometheus is a quantitative research tool. Signal telemetry is probabilistic, not deterministic. Not financial advice.
            </div>
        </div>
    );
}
