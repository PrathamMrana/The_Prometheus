'use strict';
/**
 * 🔱 PROMETHEUS — AUTH ROUTER (Phase 21)
 * JWT-based authentication with access + refresh token flow.
 * User store: JSON file for persistence across restarts.
 * Access token:  15 minutes
 * Refresh token: 7 days
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const fs       = require('fs');
const path     = require('path');
const router   = express.Router();

const ACCESS_SECRET  = process.env.JWT_SECRET         || 'prometheus_jwt_secret_2026_institutional';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'prometheus_refresh_secret_2026_institutional';
const ACCESS_TTL     = '15m';
const REFRESH_TTL    = '7d';

// ─── File-Based User Store ───────────────────────────────────────────────────
const USERS_FILE = path.join(__dirname, '../data/users.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, '../data'))) {
    fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });
}

let users = new Map();
let nextId = 1;

// Load users from disk
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            users = new Map(Object.entries(data));
            
            // Re-calculate nextId based on max existing ID
            let maxId = 0;
            for (const user of users.values()) {
                if (user.id > maxId) maxId = user.id;
            }
            nextId = maxId + 1;
        }
    } catch (e) {
        console.error('[AUTH] Failed to load users:', e.message);
    }
}

// Save users to disk
function saveUsers() {
    try {
        const data = Object.fromEntries(users);
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[AUTH] Failed to save users:', e.message);
    }
}

// Initial load
loadUsers();

// Maps refresh token → userId (for invalidation on logout)
// 🛡️ [PHASE 21] Persist to disk so tokens survive server restarts.
// Without this, every nodemon restart wipes the Set and causes 401s for all
// valid browser sessions that still hold their refresh token in localStorage.
const REFRESH_TOKENS_FILE = path.join(__dirname, '../data/refresh_tokens.json');
let refreshTokens = new Set();

function loadRefreshTokens() {
    try {
        if (fs.existsSync(REFRESH_TOKENS_FILE)) {
            const data = JSON.parse(fs.readFileSync(REFRESH_TOKENS_FILE, 'utf8'));
            // Filter out expired tokens on load to keep the file lean
            const now = Math.floor(Date.now() / 1000);
            const valid = (data.tokens || []).filter(t => {
                try {
                    const decoded = jwt.decode(t);
                    return decoded && decoded.exp > now;
                } catch { return false; }
            });
            refreshTokens = new Set(valid);
            console.log(`[AUTH] Loaded ${refreshTokens.size} valid refresh tokens from disk.`);
        }
    } catch (e) {
        console.warn('[AUTH] Could not load refresh tokens:', e.message);
        refreshTokens = new Set();
    }
}

function saveRefreshTokens() {
    try {
        const dir = path.dirname(REFRESH_TOKENS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = REFRESH_TOKENS_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ tokens: Array.from(refreshTokens) }));
        fs.renameSync(tmp, REFRESH_TOKENS_FILE);
    } catch (e) {
        console.warn('[AUTH] Could not persist refresh tokens:', e.message);
    }
}

// Load on startup
loadRefreshTokens();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateTokens(userId, email, name) {
    const payload = { sub: userId, email, name };
    const accessToken  = jwt.sign(payload, ACCESS_SECRET,  { expiresIn: ACCESS_TTL });
    const refreshToken = jwt.sign({ sub: userId },         REFRESH_SECRET, { expiresIn: REFRESH_TTL });
    refreshTokens.add(refreshToken);
    saveRefreshTokens(); // 🔱 Persist immediately
    return { accessToken, refreshToken };
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Middleware: verify access token ─────────────────────────────────────────
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'No access token.' });
    try {
        req.user = jwt.verify(token, ACCESS_SECRET);
        next();
    } catch (e) {
        const expired = e.name === 'TokenExpiredError';
        return res.status(401).json({ error: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN', message: e.message });
    }
}

// ─── POST /auth/register ─────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
    const { email, password, name } = req.body || {};

    if (!email || !password || !name)
        return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Email, password and name are required.' });

    if (!validateEmail(email))
        return res.status(400).json({ error: 'INVALID_EMAIL', message: 'Please enter a valid email address.' });

    if (password.length < 8)
        return res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' });

    const normalised = email.toLowerCase().trim();
    if (users.has(normalised))
        return res.status(409).json({ error: 'DUPLICATE_EMAIL', message: 'An account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const id = nextId++;
    users.set(normalised, { id, email: normalised, name: name.trim(), passwordHash, createdAt: Date.now() });
    saveUsers(); // Persist to disk

    const { accessToken, refreshToken } = generateTokens(id, normalised, name.trim());
    console.log(`[AUTH] Register: ${normalised} (id=${id})`);

    return res.status(201).json({
        message:      'Account created.',
        accessToken,
        refreshToken,
        user: { id, email: normalised, name: name.trim() }
    });
});

// ─── POST /auth/login ────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password)
        return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Email and password are required.' });

    const normalised = email.toLowerCase().trim();
    const user = users.get(normalised);
    if (!user)
        return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
        return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' });

    const { accessToken, refreshToken } = generateTokens(user.id, normalised, user.name);
    console.log(`[AUTH] Login: ${normalised}`);

    return res.json({
        message:      'Authenticated.',
        accessToken,
        refreshToken,
        user: { id: user.id, email: normalised, name: user.name }
    });
});

// ─── POST /auth/refresh ──────────────────────────────────────────────────────
router.post('/refresh', (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken || !refreshTokens.has(refreshToken))
        return res.status(401).json({ error: 'INVALID_REFRESH', message: 'Refresh token invalid or expired.' });

    try {
        const payload = jwt.verify(refreshToken, REFRESH_SECRET);
        // Find user by id
        const user = [...users.values()].find(u => u.id === payload.sub);
        if (!user)
            return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'Account no longer exists.' });

        // Rotate: invalidate old, issue new
        refreshTokens.delete(refreshToken);
        saveRefreshTokens(); // Keep disk in sync after rotation
        const tokens = generateTokens(user.id, user.email, user.name);

        return res.json({
            accessToken:  tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: { id: user.id, email: user.email, name: user.name }
        });
    } catch (e) {
        refreshTokens.delete(refreshToken);
        saveRefreshTokens(); // Keep disk in sync on expiry
        return res.status(401).json({ error: 'REFRESH_EXPIRED', message: 'Session expired. Please sign in again.' });
    }
});

// ─── POST /auth/logout ───────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
        refreshTokens.delete(refreshToken);
        saveRefreshTokens(); // Keep disk in sync on logout
    }
    console.log(`[AUTH] Logout`);
    return res.json({ message: 'Logged out.' });
});

// ─── GET /auth/me ────────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
    const user = [...users.values()].find(u => u.id === req.user.sub);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    return res.json({ user: { id: user.id, email: user.email, name: user.name } });
});

// Export middleware for protecting other routes
module.exports = router;
module.exports.requireAuth = requireAuth;
