// 🔱 [PHASE 10.1] PRE-BIND PORT CLEAR — runs synchronously before anything else
// Prevents EADDRINUSE crashes when restarting without explicit kill command.
try {
    const { execSync } = require('child_process');
    const PORT_TO_CLEAR = process.env.PORT || 3001;
    execSync(`lsof -ti:${PORT_TO_CLEAR} | xargs kill -9 2>/dev/null || true`, { shell: true, stdio: 'ignore' });
} catch (_) { /* silent — port was already free */ }

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

// 🧠 [PHASE 15.2] INTERCEPT SYSTEM LOGS FOR AI TERMINAL
global.systemLogs = [];
const originalLog = console.log;
console.log = function(...args) {
    originalLog.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    if (msg.includes('[ML_') || msg.includes('[RISK_') || msg.includes('[PROMETHEUS]')) {
        global.systemLogs.unshift({ timestamp: Date.now(), msg });
        if (global.systemLogs.length > 50) global.systemLogs.pop();
    }
};

const usRoutes = require('./routes/us');
const indiaRoutes = require('./routes/india');
const feargreedRoutes = require('./routes/feargreed');
const newsRoutes = require('./routes/news');
const indiaNewsRoutes = require('./routes/india_news');
const socialRoutes = require('./routes/social');
const technicalsRoutes = require('./routes/technicals');
const fundamentalsRoutes = require('./routes/fundamentals');
const macroRoutes = require('./routes/macro');
const proRoutes = require('./routes/pro');
const sentimentRoutes = require('./routes/sentiment');
const trendsRoutes = require('./routes/trends');
const intelligenceRoutes = require('./routes/intelligence');
const executionRoutes = require('./routes/execution');
const { searchSymbol } = require('./controllers/searchController');
const chartRoutes = require('./routes/chart'); // 📈 Phase 16: Institutional Chart Engine
const portfolioIntelRoutes = require('./routes/portfolioIntelligence'); // 🧠 Phase 18: AI Portfolio + Analytics
const FallbackTracker = require('./apiLayer/fallbackTimer');
const apiManager = require('./apiLayer/apiManager');
const { init: initSocketServer } = require('./realtime/socketServer'); // 🚀 [PRO] Real-Time Sync Hub
const monitor = require('./utils/monitor');

const app = express();
app.use(helmet()); // 🔐 Security Headers
app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true
}));
app.use(express.json());

// 🛡️ API Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per window
    message: { success: false, error: "TOO_MANY_REQUESTS" }
});
app.use('/api/', apiLimiter);

// 🔐 [PHASE 21] JWT AUTH ROUTES (must be first)
const authRouter = require('./routes/auth');
const { requireAuth } = authRouter; // Extract middleware
app.use('/auth', authRouter);

const Persistence = require('./utils/persistence');

// 🚀 [PRO] HIGH-SPEED STREAM ENDPOINT
app.get('/api/stats', (req, res) => {
    try {
        const cache = Persistence.load();
        res.json({ success: true, data: Object.fromEntries(cache) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 🧠 [PHASE 15.2] EXPOSE SYSTEM LOGS TO FRONTEND
app.get('/api/system/logs', (req, res) => {
    res.json({ success: true, logs: global.systemLogs || [] });
});

// 🔒 INSTITUTIONAL SYNC COORDINATOR
const syncCoordinator = require('./apiLayer/syncCoordinator');
app.get('/api/sync/snapshot', (req, res) => {
    res.json({ success: true, snapshot: syncCoordinator.getSnapshot() });
});

// 🎯 DYNAMIC PRIORITY CONTROLLER
app.post('/api/active_ticker', requireAuth, (req, res) => {
    const { ticker } = req.body;
    if (ticker) {
        const cache = Persistence.load();
        cache.set('active_ticker', ticker);
        Persistence.save(cache);
        res.json({ success: true, active: ticker });
    } else {
        res.status(400).json({ success: false, error: "TICKER_REQUIRED" });
    }
});

// Healthcheck (Public)
app.get('/health', (req, res) => res.json(monitor.getHealth()));

// Observability Metrics (Public or Internal)
app.get('/api/metrics', (req, res) => res.json(monitor.getHealth()));

app.use('/api/us', requireAuth, usRoutes);
app.use('/api/india', requireAuth, indiaRoutes);
app.use('/api/feargreed', feargreedRoutes); // Public sentiment
app.use('/api/news', requireAuth, newsRoutes);
app.use('/api/india_news', requireAuth, indiaNewsRoutes);
app.use('/api/social', requireAuth, socialRoutes); 
app.use('/api/technicals', requireAuth, technicalsRoutes); 
app.use('/api/fundamentals', requireAuth, fundamentalsRoutes); 
app.use('/api/macro', requireAuth, macroRoutes); 
app.use('/api/pro', requireAuth, proRoutes); 
app.use('/api/sentiment', requireAuth, sentimentRoutes); 
app.use('/api/trends', requireAuth, trendsRoutes); 
app.use('/api/intelligence', requireAuth, intelligenceRoutes); 
app.use('/api/trade', requireAuth, executionRoutes); 
app.use('/ml', requireAuth, require('./routes/ml')); 
app.get('/api/market/search', requireAuth, searchSymbol); 
app.use('/api/market/chart', requireAuth, chartRoutes);   
app.use('/api/portfolio', requireAuth, portfolioIntelRoutes); 
app.use('/api/analytics', requireAuth, portfolioIntelRoutes); 
app.use('/api/strategy',  requireAuth, portfolioIntelRoutes); 
app.use('/api/research',  requireAuth, require('./routes/researchCommand'));
// 🔱 [PHASE 11] INSTITUTIONAL AUDIT + REPLAY + FAILURE TESTING
app.use('/api/replay',  requireAuth, require('./persistence/ReplayEngine'));
app.use('/api/testing', requireAuth, require('./testing/FailureSimulator').router);

// 📊 ORCHESTRATION HEALTH MONITOR
app.get('/api/data/orchestration-health', (req, res) => {
    console.log('[DIAGNOSTIC] Health Check Triggered');
    res.json({ 
        success: true, 
        health: 'ACTIVE',
        ping: Date.now(),
        providers: apiManager.getProviderStatus(),
        fallback: FallbackTracker.getStatus()
    });
});

const http = require('http');

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// 🚀 [PRO] Start Background Data Worker
require('./worker').start();

// 💡 Attach WebSocket Sync Hub
initSocketServer(server);

server.listen(PORT, () => {
    logger.info(`🚀 [PROMETHEUS ENGINE] RUNNING ON ${PORT}`);
    
    // 🔍 [FORENSIC TRACE] Validate PortfolioManager integrity during boot
    const PortfolioManager = require('./execution/portfolioManager');
    const methods = Object.getOwnPropertyNames(PortfolioManager).filter(m => typeof PortfolioManager[m] === 'function');
    console.log(`\n🔍 [RUNTIME_METHOD_TRACE] PortfolioManager methods: [${methods.join(', ')}]`);
    if (!methods.includes('getLiveMetrics')) {
        console.error('❌ [CRITICAL_FATAL] PortfolioManager.getLiveMetrics MISSING at runtime!');
    } else {
        console.log('✅ [RUNTIME_VERIFIED] PortfolioManager.getLiveMetrics is present.\n');
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${PORT} in use — killing existing process and retrying...`);
        try {
            const { execSync } = require('child_process');
            execSync(`kill -9 $(lsof -t -i:${PORT}) 2>/dev/null || true`, { shell: true });
        } catch (_) {}
        setTimeout(() => {
            server.close();
            server.listen(PORT, () => console.log(`🚀 [PROMETHEUS ENGINE] RUNNING ON ${PORT} (rebound)`));
        }, 1000);
    }
});


// Graceful shutdown
process.on('SIGTERM', () => { server.close(() => process.exit(0)) });
process.on('SIGINT', () => { server.close(() => process.exit(0)) });
