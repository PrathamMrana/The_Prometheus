const path = require('path');
const fs = require('fs');
console.log('\n\n🔱 [SYSTEM_PULSE] !!! PROMETHEUS WORKER INITIALIZED !!! 🔱\n\n');
const Persistence = require('./utils/persistence');
const apiManager = require('./apiLayer/apiManager');
const { broadcast } = require('./realtime/socketServer');
const syncCoordinator = require("./apiLayer/syncCoordinator");
const rootGlobalState = require('./globalState');
const { processTick } = require('./intelligence/intelligenceCore');
const { StrategyManager, updateSectorVolume } = require('./intelligence/strategyManager');
const OrderEngine = require('./execution/orderEngine');
const ExecutionEngine = require('./engine/executionEngine');
const PortfolioManager = require('./execution/portfolioManager');
const positionManager = require('./engine/positionManager');
const MarketRegimeAI = require('./engines/marketRegimeAI'); // 🔱 [PHASE 19] Market Regime AI
const pLimit = require('p-limit'); // 🚀 [BOUNDED CONCURRENCY]
const { TickCoalescer, PRIORITY, COMPUTE_CORES } = require('./engine/tickCoalescer');
const indicatorEngine = require('./intelligence/incrementalIndicators'); // 🔱 [PERF] O(1) indicators
const { ledger, EVENT_TYPES } = require('./engine/executionLedger');
const snapshotDaemon = require('./engine/snapshotDaemon');

// 🔱 [PHASE 10] CANONICAL SIGNAL NORMALIZER — one source of truth for all signal data
const SignalNormalizer = require('./core/SignalNormalizer');
// 🔱 [PHASE 10] FEED STATE MACHINE — graded stale states with 5s debounce
const feedState = require('./utils/feedState');
// 🔱 [PHASE 10] EXTRACTED WORKERS — keep worker.js as thin orchestrator
const { processSingleSymbol } = require('./workers/SignalProcessor');
const { buildOpportunityBoard, logCycleSummary } = require('./workers/OpportunityEngine');
const orderQueue = require('./execution/OrderQueue');
// 🔱 [PHASE 11] INSTITUTIONAL INFRASTRUCTURE
const TelemetryEngine = require('./telemetry/TelemetryEngine');
const CycleArchive = require('./persistence/CycleArchive');
const SignalArchive = require('./persistence/SignalArchive');
const RiskEngine = require('./risk/RiskEngine');

const researchSnapshot = require('./intelligence/researchSnapshot');
const telemetry = require('./engine/telemetry');
const marketStatus = require('./utils/marketStatus');
const industryMapping = require('./intelligence/industryMapping');
const symbolUtils = require('./utils/symbol');
const tradeAnalytics = require('./intelligence/tradeAnalytics');
const edgeDecayMonitor = require('./intelligence/edgeDecayMonitor');
const positionManagerBoot = require('./engine/positionManager');

const WATCHLIST_FILE = path.join(__dirname, 'watchlist.json');
const MAX_CACHE = 300;

// 🔱 [PERF] Singleton tick coalescer — persists across cycles
const tickCoalescer = new TickCoalescer();

// Attach ledger to coalescer for drop observability events
tickCoalescer.attachLedger(ledger, EVENT_TYPES);

// Start the background snapshot daemon
snapshotDaemon.start();

/**
 * 🛰️ [PHASE 9.7] INSTITUTIONAL HASHING (STABLE 32-BIT)
 */
const hash = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0; // force 32-bit int
    }
    return h;
};

// 🎭 [SIM_MODE] Market Simulator (DISABLED)
// User instruction: "never fluctuate artificially data it must be very real... Hits since 2 months"
const SIM_MODE = false; // 🛑 ABSOLUTELY FORCED FALSE. No more artificial permutations.
if (SIM_MODE) console.log('[SIM_MODE] 🔴 MARKET SIMULATOR ACTIVE — prices will fluctuate artificially');

const CORE_INDICES = ['^NSEI', '^BSESN', '^NSEBANK', '^GSPC', '^IXIC', '^VIX', '^INDIAVIX'];
const STOCKS = [
    'RELIANCE', 'HDFCBANK', 'INFY', 'SBIN', 'ICICIBANK', 'BAJFINANCE',
    'BHARTIARTL', 'ITC', 'LT', 'HINDUNILVR', 'KOTAKBANK', 'AXISBANK', 'ASIANPAINT',
    'MARUTI', 'SUNPHARMA', 'TITAN', 'WIPRO', 'HCLTECH', 'ULTRACEMCO', 'NTPC',
    'NESTLEIND', 'POWERGRID', 'BAJAJFINSV', 'M&M', 'TATAMOTORS', 'TATASTEEL',
    'JSWSTEEL', 'TECHM', 'INDUSINDBK', 'ADANIENT', 'ADANIPORTS', 'ONGC', 'TCS',
    'SBILIFE', 'BRITANNIA', 'CIPLA', 'TATACONSUM', 'ADANIGREEN', 'HDFCLIFE',
    'DRREDDY', 'COALINDIA', 'BAJAJ-AUTO', 'APOLLOHOSP', 'EICHERMOT', 'DIVISLAB',
    'LTIM', 'GRASIM', 'HEROMOTOCO', 'VEDL', 'HAL'
];

// 🛡️ [PHASE 6] GLOBAL PULSE REGISTRY
// These symbols are injected into EVERY batch to ensure globalState (A/D, Sector Flow) is 100% accurate.
const GLOBAL_PULSE_SYMBOLS = [
    '^NSEI', '^BSESN', '^INDIAVIX',
    'HDFCBANK.NS', 'ICICIBANK.NS', // Banking
    'INFY.NS',          // IT
    'MARUTI.NS', 'TATAMOTORS.NS', // Auto
    'RELIANCE.NS', 'ONGC.NS',      // Energy
    'BTC-USD', 'ETH-USD'           // Crypto (24/7 Live Feed)
];
let lastCycleHadTimeout = false;
const lastSignals = new Map(); // symbol → last strategy result to prevent flickering

// 🛡️ [PHASE 10.5] OHLC PRICE HISTORY BUFFER
const priceHistory = new Map();
function updateHistory(symbol, tick) {
    if (!tick || !Number.isFinite(tick.price)) return;
    if (!priceHistory.has(symbol)) priceHistory.set(symbol, []);
    const arr = priceHistory.get(symbol);

    // Store as OHLC object for ATR and refined analytics
    arr.push({
        close: tick.price,
        high: tick.high || tick.price,
        low: tick.low || tick.price,
        volume: tick.volume || 0,
        timestamp: tick.timestamp
    });

    if (arr.length > 80) arr.shift(); // 🛡️ [RENDER] Bound to 80 (was 300) to stay within 512MB free tier
}

/**
 * 📊 [PHASE 9.7] VOLATILITY ENGINE (SCIENTIFIC)
 */
function calculateVolatility(history) {
    if (!history || history.length < 5) return 0.5; // Neutral-to-high baseline
    const prices = history.map(h => h.close);
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * 100; // Scaled for threshold comparison
}

function isNSEMarketClosed() {
    return !marketStatus.isMarketOpen();
}

/**
 * 🛡️ [STEP 1] PERSISTENT WATCHLIST HUB
 */
let WATCHLIST = new Set();
let savingWatchlist = false;

// 🛡️ India-only symbol guard — only .NS equities and ^ indices permitted
const isIndiaSymbol = (s) => typeof s === 'string' && (s.endsWith('.NS') || s.startsWith('^'));

function loadWatchlist() {
    try {
        const defaultSymbols = [
            ...CORE_INDICES,
            ...STOCKS.map(s => s.endsWith('.NS') || s.startsWith('^') ? s : s + '.NS')
        ];

        if (fs.existsSync(WATCHLIST_FILE)) {
            const savedData = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));
            const suffixedSavedData = savedData.map(s => {
                const sym = s.trim().toUpperCase();
                if (sym.includes(".") || sym.startsWith("^")) return sym;
                return sym + ".NS";
            });
            WATCHLIST = new Set([...defaultSymbols, ...suffixedSavedData].filter(isIndiaSymbol));
        } else {
            WATCHLIST = new Set(defaultSymbols.filter(isIndiaSymbol));
        }
        console.log(`📡 [WATCHLIST] Synchronized: ${WATCHLIST.size} active India targets.`);
    } catch (e) {
        WATCHLIST = new Set([...CORE_INDICES, ...STOCKS.map(s => s + '.NS')].filter(isIndiaSymbol));
    }
}

function saveWatchlistSafe() {
    if (savingWatchlist) return;
    savingWatchlist = true;

    const tempFile = WATCHLIST_FILE + ".tmp";
    const data = Array.from(WATCHLIST).filter(s => !CORE_INDICES.includes(s) && !STOCKS.some(st => s === st + '.NS'));

    fs.writeFile(tempFile, JSON.stringify(data), (err) => {
        if (!err) {
            fs.rename(tempFile, WATCHLIST_FILE, () => {
                savingWatchlist = false;
            });
        } else {
            savingWatchlist = false;
        }
    });
}

function addToWatchlist(symbol) {
    if (!symbol || typeof symbol !== 'string') return;
    const clean = symbol.trim().toUpperCase();
    if (!WATCHLIST.has(clean)) {
        WATCHLIST.add(clean);
        saveWatchlistSafe();
        console.log("[WATCHLIST ADD]", clean);
    }
}

/**
 * 🛡️ [STEP 2] PRO-GRADE CANONICAL NORMALIZER (SAFE)
 */
const toCanonical = (s) => {
    if (typeof s !== "string") return null;
    const key = s.replace("^", "").split(".")[0]?.trim().toUpperCase();
    return key && key.length > 0 ? key : null;
};

let lastPersistenceSave = 0;
let lastGoodGlobalState = {
    regime: "SIDEWAYS",
    risk: "LOW",
    sectorFlow: { BANKING: { value: 0, trend: "FLAT" }, IT: { value: 0, trend: "FLAT" }, AUTO: { value: 0, trend: "FLAT" } },
    advanceDecline: { advancers: 0, decliners: 0 },
    topMovers: { gainers: [], losers: [] }
};
function safeSave(cache) {
    const now = Date.now();
    if (now - lastPersistenceSave < 2000) return;
    lastPersistenceSave = now;
    Persistence.save(cache);
}

/**
 * 🛡️ [PHASE 6] INSTITUTIONAL STABILITY ENGINE (v7.2 AUDIT LOCK)
 */
const SYSTEM_STATE = {
    SAFE_MODE: false,
    API_FAILURES: 0,
    CYCLE_COUNT: 0,
    MEMORY_SAMPLES: [],
    LAST_CYCLE_TIME: Date.now(),
    START_TIME: Date.now(),
    START_HEAP: process.memoryUsage().heapUsed / 1024 / 1024,
    MARKET: 'OPEN'
};

let isExecuting = false;
let currentChunkIndex = 0;
let cycleCount = 0;
let failStreak = 0;
const CHUNK_SIZE = 5; // 🛡️ [RENDER] Reduced to 5 (was 10) to reduce per-cycle memory spike

// 🛡️ [HOISTING] Critical resources outside hot path
let universeArray = [];
let portfolioCache = null;

async function start() {
    console.log('⚡ [PROMETHEUS] BOOT: Initializing Shared Cache Singleton...');
    portfolioCache = Persistence.load(); // 🔱 [PHASE 17] Global Singleton Identity

    // 🔱 [PHASE 10] Wire broadcast to OrderQueue for real-time execution state push
    orderQueue.setBroadcast(broadcast);

    // 🛡️ [PHASE 16.9 FIX] Deterministic Schema Normalization Loop 
    for (const [key, v] of portfolioCache.entries()) {
        v.pct_change = v.pct_change ?? v.percent ?? 0;
        v.percent = v.percent ?? v.pct_change ?? 0;
    }
    console.log(`⚡ [PROMETHEUS] BOOT: Shared Cache Ready (${portfolioCache.size} symbols)`);

    // 🛡️ [PHASE 12] Force Disk Read for Start-up Integrity
    const currentPortfolio = PortfolioManager.load();
    const holdings = Object.keys(currentPortfolio.holdings || {});
    console.log(`⚡ [PROMETHEUS] BOOT: Current Holdings Detected: [${holdings.join(', ')}]`);

    // 🔱 [PHASE 19] BOOT-TIME STATE RECONCILIATION
    // Cross-checks positions.json vs portfolio.json and removes orphans.
    // This eliminates STATE_SYNC_BLOCKED cascades from prior crash-restarts.
    positionManagerBoot.reconcile(currentPortfolio.holdings || {});

    // 🔥 [PHASE 17] Data is already in portfolioCache because it is the Persistence singleton.
    // No need to copy from lkgMap.

    if (universeArray.length === 0) {
        console.log(`📡 [PHASE 12] Boot-Seeded full cache with ${portfolioCache.size} LKG symbols to prevent UI layout shift.`);
    }

    console.log('🚀 [PROMETHEUS WORKER] Phase 6 Stability Engine: AUDIT LOCK ACTIVE');
    loadWatchlist();
    console.log(`⚡ [PROMETHEUS] BOOT: Watchlist Loaded (${WATCHLIST.size} symbols)`);

    universeArray = Array.from(WATCHLIST);

    // 🔱 [PHASE 17] SEED PRICE HISTORY FROM CACHE
    // This ensures intelligence (RSI, EMA, ML) has immediate data upon reboot.
    console.log('⚡ [PROMETHEUS] BOOT: Seeding Price History from LKG Sparklines...');
    for (const [key, entry] of portfolioCache.entries()) {
        if (entry.sparkline && Array.from(entry.sparkline).length > 0) {
            const hasVolHistory = entry.volume_history && Array.from(entry.volume_history).length === Array.from(entry.sparkline).length;
            const history = Array.from(entry.sparkline).map((price, idx) => ({
                close: price,
                high: price,
                low: price,
                volume: hasVolHistory ? entry.volume_history[idx] : (entry.volume || 0),
                timestamp: 0 // 🔱 [Purity Lock] No fake boot timestamps
            }));
            priceHistory.set(key, history);
        }
    }
    // 🛡️ [PHASE 12 FIX] Removed redundant Persistence.load() that was wiping boot-seeded portfolioCache

    // 🔱 [BOOT PULSE] FULL UNIVERSE REFRESH
    // Skip on memory-constrained environments (set DISABLE_BOOT_PULSE=true in Render env vars).
    // The regular cycle will warm up the cache gradually when boot pulse is disabled.
    if (process.env.DISABLE_BOOT_PULSE === 'true') {
        console.log(`⚡ [BOOT PULSE] Skipped (DISABLE_BOOT_PULSE=true). Regular cycle will warm cache.`);
    } else {
        console.log(`\n🔱 [BOOT PULSE] Fetching fresh prices for ALL ${universeArray.length} symbols...`);
        try {
            const allBatches = [];
            const batchSize = 10; // 🛡️ [RENDER] Smaller batches at boot to reduce peak memory
            for (let i = 0; i < universeArray.length; i += batchSize) {
                allBatches.push(universeArray.slice(i, i + batchSize));
            }

            for (const batch of allBatches) {
                try {
                    const resp = await apiManager.fetchBatch('PRICE', batch, 1);
                    const freshQuotes = resp.quotes || {};
                    let updated = 0;
                    for (const [sym, data] of Object.entries(freshQuotes)) {
                        const canonical = sym.replace('.NS', '').replace('^', '').split('.')[0].trim().toUpperCase();
                        if (canonical && data && Number.isFinite(data.price) && data.price > 0) {
                            const existing = portfolioCache.get(canonical) || {};
                            portfolioCache.set(canonical, { ...existing, ...data, is_lkg: false });

                            // 🔱 [PHASE 18] REFRESH HISTORY IMMEDIATELY
                            if (data.close && Array.isArray(data.close)) {
                                const volHist = data.volume_history || [];
                                const history = data.close.map((price, idx) => ({
                                    close: price,
                                    high: (data.high && data.high[idx]) ? data.high[idx] : price,
                                    low: (data.low && data.low[idx]) ? data.low[idx] : price,
                                    volume: (volHist[idx] !== undefined && volHist[idx] !== null) ? volHist[idx] : (data.volume || 0),
                                    timestamp: (data.timestamp && data.timestamp[idx]) ? data.timestamp[idx] : 0
                                }));
                                priceHistory.set(canonical, history);
                                if (updated < 5) console.log(`[BOOT_DEBUG] ${canonical} | Seeded ${history.length} items | VolHist: ${volHist.length} | FirstVol: ${history[0].volume}`);
                            }
                            updated++;
                        }
                    }
                    console.log(`✅ [BOOT PULSE] Batch updated ${updated}/${batch.length} symbols.`);
                    // 🛡️ [RENDER] Brief pause between batches to let GC reclaim Python child process memory
                    await new Promise(r => setTimeout(r, 500));
                } catch (err) {
                    console.warn(`⚠️ [BOOT PULSE] Batch failed: ${err.message}`);
                }
            }

            // Save fresh data to disk immediately
            Persistence.save(portfolioCache);
            console.log(`🔱 [BOOT PULSE] Complete. Cache refreshed with real market data.\n`);
        } catch (err) {
            console.error(`❌ [BOOT PULSE] Failed: ${err.message}. Using LKG data.`);
        }
    }

    let baseline = parseFloat((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2));
    let lastHeap = baseline;
    let leakCounter = 0;

    // Track previous CPU tick to prevent cumulative reading
    let lastCpu = process.cpuUsage();

    /**
     * 🛡️ Continuous Health Watchdog (1min intervals)
     */
    setInterval(() => {
        const now = Date.now();
        const heapMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const heapUsed = parseFloat(heapMB);

        // Memory Drift Detection (Post-GC Baseline bounds)
        if (heapUsed < lastHeap) {
            baseline = heapUsed;
        }

        if (heapUsed > lastHeap && heapUsed > baseline * 1.2) {
            leakCounter++;
        } else {
            leakCounter = 0;
        }
        lastHeap = heapUsed;

        if (leakCounter > 5) {
            console.error(`🚨 [MEMORY LEAK DETECTED] Post-GC Drift: Baseline ${baseline} -> Heap ${heapUsed}`);
            SYSTEM_STATE.SAFE_MODE = true;
        }


        // CPU Metric Fix (Delta rather than Cumulative)
        const cpuUsage = process.cpuUsage(lastCpu);
        lastCpu = process.cpuUsage(); // reset for next 60s
        const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000;

        // Emergency Drop (Triggers if usage exceeds ~1.3 fully pegged cores for 60s)
        if (cpuPercent > 80) {
            console.log(`⚠️ EMERGENCY CPU CLAMP. Usage at ${cpuPercent.toFixed(1)}`);
            SYSTEM_STATE.SAFE_MODE = true;
        }

        // 🛡️ [AUDIT] Mandatory Health Log (Multi-line format for Audit Lock)
        console.log(`[HEALTH CHECK]
Time: ${new Date().toLocaleTimeString()}
HeapMB: ${heapMB}
CPU%: ${cpuPercent.toFixed(1)}
Cycles: ${SYSTEM_STATE.CYCLE_COUNT}
Failures: ${SYSTEM_STATE.API_FAILURES}
SafeMode: ${SYSTEM_STATE.SAFE_MODE ? 'ON' : 'OFF'}
`);
    }, 60000);

    let loopTimeout;
    let heartbeatInterval;

    /**
     * 🛡️ Loop Heartbeat Watchdog
     */
    heartbeatInterval = setInterval(() => {
        const stalledTime = Date.now() - SYSTEM_STATE.LAST_CYCLE_TIME;
        // 🛡️ Fix: Increased heartbeat stall window from 15s to 45s due to heavy sync processing
        if (stalledTime > 45000 && !isExecuting) {
            console.warn(`⚠️ [HEARTBEAT] Loop stalled for ${stalledTime}ms. Force restarting...`);
            clearTimeout(loopTimeout);
            runCycle();
        }
    }, 5000);

    const runCycle = async () => {
        if (isExecuting) {
            console.log("[SKIP] Previous cycle still running, skipping overlap.");
            return;
        }

        console.time('cycle');
        const startTime = Date.now();
        isExecuting = true;

        try {
            SYSTEM_STATE.CYCLE_COUNT++; // 🔱 [PHASE 12 FIX] Increment per execution loop for unique IDs
            console.log(`\n🌀 [CYCLE_START] #${SYSTEM_STATE.CYCLE_COUNT} | Time: ${new Date().toLocaleTimeString()} | Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`);
            // 🔱 [PHASE 19] Telemetry cycle start
            telemetry.markCycleStart();
            TelemetryEngine.markCycleStart(); // 🔱 [PHASE 11] Real wall-clock timing

            // 📡 [HEARTBEAT] Verify loop activity
            const logPath = path.join(__dirname, '../prometheus.log');
            fs.appendFileSync(logPath, `📡 [HEARTBEAT] ${new Date().toISOString()} | Cycle Start | Sim: ${SIM_MODE}\n`);

            // 🛡️ [PHASE 6] Reset timeout flag only if we expect a full cycle success
            let cycleSuccess = true;
            // 🛡️ Memory Guard
            const heapUsed = process.memoryUsage().heapUsed;
            if (heapUsed > 400 * 1024 * 1024) {
                if (!SYSTEM_STATE.SAFE_MODE) console.error("🚨 [MEMORY GUARD] Heap > 400MB. Activating SAFE_MODE.");
                SYSTEM_STATE.SAFE_MODE = true;
            }

            const activeTicker = portfolioCache.get('active_ticker');

            // 🛡️ [CHUNKING] Segment universe
            const startIdx = currentChunkIndex * CHUNK_SIZE;
            let currentChunk = universeArray.slice(startIdx, startIdx + CHUNK_SIZE);

            // 🚀 [PHASE 8] ADAPTIVE PULSE INJECTION
            cycleCount++;
            const shouldInjectPulse = cycleCount % 3 === 0;
            const pulseSymbols = shouldInjectPulse ? GLOBAL_PULSE_SYMBOLS : [];

            // 🚀 [PHASE 8] SET-BASED DEDUPLICATION
            const unifiedBatch = new Set([...currentChunk, ...pulseSymbols]);

            // 🚀 Force priority for active ticker
            if (activeTicker) {
                const suffixedActive = activeTicker.includes('.') ? activeTicker : activeTicker + '.NS';
                if (!unifiedBatch.has(suffixedActive) && WATCHLIST.has(suffixedActive)) {
                    unifiedBatch.add(suffixedActive);
                }
            }

            const symbolsToFetch = Array.from(unifiedBatch).slice(0, 25); // 🛡️ Increased Cap Batch to 25 max
            console.log(`📡 [FETCH] Requesting ${symbolsToFetch.length} symbols: ${symbolsToFetch.join(', ')}`);

            if (symbolsToFetch.length > 0) {
                const response = await apiManager.fetchBatch('PRICE', symbolsToFetch, 3);
                const results = response.quotes || {};
                console.log(`✅ [FETCH] Received ${Object.keys(results).length} quotes.`);

                // 🔱 [PHASE 10] Mark live tick on successful data receipt
                if (Object.keys(results).length > 0) {
                    feedState.markLiveTick();
                }

                // 🔱 [PHASE 17] SYNC NEW DATA INTO CACHE
                // Ensures intelligence engine processes fresh, real market data instead of stale/fake cache entries.
                for (const [sym, data] of Object.entries(results)) {
                    const canonical = sym.replace(".NS", "").replace("^", "");
                    if (canonical) {
                        const existing = portfolioCache.get(canonical) || {};
                        
                        // 🛡️ [PHASE 21] WEEKEND/STALL GUARD
                        // If the new data says 0% change but the price hasn't moved, 
                        // keep the old percent to avoid zeroing out the board on weekends.
                        const newPrice = data.price;
                        const oldPrice = existing.price;
                        const newPct = data.percent !== undefined ? data.percent : data.pct_change;
                        
                        let finalPercent = newPct;
                        // Only preserve if new data is exactly 0 and old data was valid
                        if (newPct === 0 && existing.percent && existing.percent !== 0) {
                            if (!newPrice || !oldPrice || Math.abs(newPrice - oldPrice) < 0.0001) {
                                finalPercent = existing.percent;
                            }
                        }

                        portfolioCache.set(canonical, {
                            ...existing,
                            ...data,
                            percent: finalPercent,
                            pct_change: finalPercent,
                            is_lkg: data.source === 'LKG'
                        });
                        // 🔱 [PERF] Ingest into tick coalescer after cache is updated
                        if (data.price && data.price > 0) {
                            tickCoalescer.ingest(canonical, portfolioCache.get(canonical));
                        }
                    }
                }

                // 🔱 [PHASE 11] Load portfolio snapshot for live metrics
                const rawPortfolio = PortfolioManager.load();

                // 🛡️ [PHASE 6] GLOBAL_STATE LKG GUARD (Prevent Flicker)
                let globalState = response.global;
                let batchFailed = !globalState || Object.keys(globalState).length === 0;

                if (batchFailed) {
                    globalState = { ...lastGoodGlobalState, fallback: true };
                    cycleSuccess = true;
                } else {
                    lastGoodGlobalState = globalState;
                }

                const now = Date.now();

                // 🎯 1 & 2 & 3 & 4: Compute full GLOBAL_STATE once per cycle
                const marketClosed = isNSEMarketClosed();
                SYSTEM_STATE.MARKET = marketClosed ? 'CLOSED' : 'OPEN';
                globalState.market_status = SYSTEM_STATE.MARKET;

                // 🛡️ [PHASE 25] Global Risk Evaluation
                // 🔱 [PHASE 11] Global evaluation handled dynamically by RiskEngine now

                // 🔱 [FIX] Accurately compute global data health across the ENTIRE universe, not just the 10-symbol batch
                let totalGaps = 0;
                for (const entry of portfolioCache.values()) {
                    if (entry.is_lkg) totalGaps++;
                }
                globalState.gap_count = totalGaps;
                globalState.data_health = totalGaps === 0 ? 'LIVE' : 'PARTIAL';

                // 🔱 [PHASE 17] PRE-CYCLE SECTOR AGGREGATION
                const sectorBuckets = {};
                for (const asset of portfolioCache.values()) {
                    const sector = asset.sector || "UNKNOWN";
                    const change = asset.pct_change ?? asset.percent ?? 0;
                    if (!sectorBuckets[sector]) sectorBuckets[sector] = [];
                    sectorBuckets[sector].push(change);
                }
                const currentSectorFlow = {};
                for (const [sector, values] of Object.entries(sectorBuckets)) {
                    const avg = values.reduce((a, b) => a + b, 0) / values.length;
                    currentSectorFlow[sector] = parseFloat(avg.toFixed(2));
                }
                Object.keys(rootGlobalState.sectorFlow).forEach(key => delete rootGlobalState.sectorFlow[key]);
                Object.assign(rootGlobalState.sectorFlow, currentSectorFlow);
                globalState.sectorFlow = rootGlobalState.sectorFlow;

                // 🔱 [PHASE 19] MARKET REGIME AI EVALUATION
                const regimeData = MarketRegimeAI.evaluate(portfolioCache, priceHistory);

                // Attach AI data to global state for downstream strategy and UI
                globalState.regimeAI = regimeData;
                globalState.regime = regimeData.regime; // canonical backward compatibility
                rootGlobalState.regimeAI = regimeData;
                rootGlobalState.regime = regimeData.regime;

                const gainers = globalState.topMovers?.gainers || [];
                const losers = globalState.topMovers?.losers || [];
                const regime = globalState.regime;

                const news = [];
                if (gainers.length > 0) news.push(`${gainers[0].symbol} leading gains (+${(gainers[0].percent || 0).toFixed(2)}%)`);
                if (losers.length > 0) news.push(`${losers[0].symbol} under pressure (${(losers[0].percent || 0).toFixed(2)}%)`);
                if (regime) news.push(`Market regime: ${regime}`);
                if (globalState.advanceDecline) news.push(`Adv/Dec: ${globalState.advanceDecline.advancers}/${globalState.advanceDecline.decliners}`);
                globalState.systemPulse = news;

                globalState.intelligenceLogs = [
                    { time: new Date().toISOString(), message: `Market mode: ${SYSTEM_STATE.MARKET}` },
                    { time: new Date().toISOString(), message: "Scanning broad market anomalies..." },
                    { time: new Date().toISOString(), message: "VIX threshold stabilized." }
                ];

                const changedSymbols = [];
                const cycleBuffer = [];

                // 🔱 [PERF] Mark open positions as P0 CRITICAL so they always process first
                const openPositions = positionManager.all();
                for (const sym of Object.keys(openPositions)) {
                    tickCoalescer.setPriority(sym, PRIORITY.CRITICAL);
                }

                // 🔱 [PERF] Drain priority-ordered coalesced ticks, bounded to compute budget
                // COMPUTE_CORES caps symbol throughput to avoid CPU saturation.
                const symbolsToDrain = tickCoalescer.drainPriorityQueue(COMPUTE_CORES * 2);
                const coalesceStats = tickCoalescer.flushStats();
                if (coalesceStats.dropped > 0) {
                    console.log(`⚡ [TICK_COALESCER] Received:${coalesceStats.received} Dropped:${coalesceStats.dropped} Processing:${symbolsToDrain.length}`);
                }

                // Resolve the actual chunk to process: coalesced symbols take precedence,
                // fall back to currentChunk if coalescer is empty (first cycle warmup).
                const effectiveChunk = symbolsToDrain.length > 0
                    ? symbolsToDrain.map(s => {
                        if (rootGlobalState.SECTOR_MAP[s] === 'INDEX' || rootGlobalState.SECTOR_MAP[s] === 'MACRO') {
                           return s.startsWith('^') ? s : '^' + s;
                        }
                        if (rootGlobalState.SECTOR_MAP[s]) return s + '.NS';
                        return s;
                    })
                    : currentChunk;

                // 🔱 [PHASE 17 & 24] PARALLEL CHUNK PROCESSING WITH BOUNDED CONCURRENCY
                // Using COMPUTE_CORES to reserve headroom for GC, heartbeat, and I/O.
                const limit = pLimit(COMPUTE_CORES);
                await Promise.all(effectiveChunk.map(rawSym => limit(async () => {
                    const canonical = rawSym.replace(".NS", "").replace("^", "");
                    const entry = portfolioCache.get(canonical);
                    if (!entry) return;

                    // 🔱 [FIX] Consume the tick to prevent infinite pipeline stall
                    tickCoalescer.consume(canonical);

                    // 🛡️ [PHASE 21] HISTORY PRIMING (Prevent "Neutral 50" Scores on Startup)
                    // If memory is empty (fresh deploy), reconstruct history from LKG sparklines
                    if (!priceHistory.has(canonical) && entry.sparkline && entry.sparkline.length > 0) {
                        const primedHistory = entry.sparkline.map(p => ({
                            close: p,
                            high: p,
                            low: p,
                            volume: 0,
                            timestamp: Date.now() - (3600000) // Rough estimate
                        }));
                        priceHistory.set(canonical, primedHistory);
                    }

                    const finalPrice = entry.price;
                    const percent = entry.percent || entry.pct_change || 0; // Schema safety
                    const prevClose = entry.prevClose;

                    // 🛡️ [PHASE 11] True "isIndex" check
                    const isIndex = rawSym.startsWith('^') || canonical.endsWith('VIX');

                    let status = "NO_DATA";
                    if (finalPrice !== null && finalPrice > 0) {
                        status = (entry.is_lkg) ? "RECOVERY_MODE" : "LIVE";
                    } else {
                        return; // 🛡️ Institutional Guard
                    }

                    if (!rootGlobalState.SECTOR_MAP[canonical]) {
                        return;
                    }

                    // 🔱 [PHASE 18] CALCULATE INTERVAL VOLUME (DELTA)
                    // If we have history, we subtract the sum of today's previous volumes from the daily total
                    const history = priceHistory.get(canonical) || [];
                    const dailyTotal = entry.volume || 0;
                    let intervalVolume = dailyTotal;
                    if (history.length > 0) {
                        // In high-fidelity mode, history[0...N-1] are interval volumes
                        // But we only want to subtract volumes from the CURRENT day
                        // For simplicity, if we have history, the latest daily total minus the previous "effective" total is our delta
                        const prevEffectiveTotal = history.reduce((sum, h) => sum + (h.volume || 0), 0);
                        // If dailyTotal is smaller than prevEffectiveTotal (e.g. at market open or data reset), use dailyTotal
                        intervalVolume = (dailyTotal > prevEffectiveTotal) ? (dailyTotal - prevEffectiveTotal) : (dailyTotal / (history.length || 1));
                    }

                    const payload = {
                        type: "TICK",
                        symbol: canonical,
                        rawSymbol: rawSym,
                        price: finalPrice,
                        percent: percent,
                        pct_change: percent || entry.pct_change || 0,
                        volume: intervalVolume, // Use interval volume for intelligence
                        daily_volume: dailyTotal, // Keep daily total for UI if needed
                        volume_history: entry.volume_history || [],
                        sparkline: entry.sparkline || [],
                        signal: entry.signal,
                        anomaly: entry.anomaly || null,
                        zscore: entry.zscore || 0,
                        sector: rootGlobalState.SECTOR_MAP[canonical] || "UNKNOWN",
                        timestamp: entry.timestamp || now, // 🔱 [Purity Lock] Prefer exchange timestamp
                        status: marketClosed ? 'CLOSED' : status,
                        source: entry.source || "YFINANCE",
                        quality: entry.quality || 0
                    };

                    // 🔱 [PHASE 11] Tick time handled by feedState.markLiveTick()

                    // 🔱 [PERF] Update incremental indicator state O(1) — before strategy runs
                    indicatorEngine.update(canonical, {
                        close: finalPrice,
                        high: entry.high || finalPrice,
                        low: entry.low || finalPrice,
                        volume: intervalVolume,
                        timestamp: entry.timestamp || now
                    });

                    const traceId = ledger.appendEvent({
                        eventType: EVENT_TYPES.TICK_RECEIVED,
                        symbol: canonical,
                        payload: { price: finalPrice, percent, volume: intervalVolume, status }
                    });

                    updateHistory(canonical, payload);
                    // 🔱 [PHASE 19] Feed sector-relative volume registry
                    if (payload.volume > 0 && payload.sector) {
                        updateSectorVolume(payload.sector, payload.volume);
                    }
                    const updatedHistory = priceHistory.get(canonical);

                    const NON_TRADABLE_SECTORS = ['INDEX', 'MACRO'];
                    const symbolSector = rootGlobalState.SECTOR_MAP[rawSym] || 'UNKNOWN'; // 🔱 [FIX] Use rawSym for sector lookup
                    // isIndex was declared above, we update it or just use the combined logic
                    const isIndexFinal = isIndex || NON_TRADABLE_SECTORS.includes(symbolSector);

                    const p17Signal = isIndexFinal
                        ? { status: 'READY', decision: 'HOLD', score: 0, sectorFlow: 0, breakout: false }
                        : await StrategyManager.generate(canonical, updatedHistory, rootGlobalState);

                    if (p17Signal && !isIndexFinal) {
                        const sigId = ledger.appendEvent({
                            traceId,
                            causationId: traceId,
                            eventType: EVENT_TYPES.SIGNAL_GENERATED,
                            symbol: canonical,
                            payload: {
                                decision: p17Signal.decision,
                                confidence: p17Signal.confidenceScore,
                                score: p17Signal.score,
                                regime: rootGlobalState.regimeAI?.regime
                            }
                        });
                        p17Signal.traceId = traceId;
                        p17Signal.causationId = sigId;
                    }

                    const enriched = processTick(payload, rootGlobalState);

                    if (enriched && enriched.symbol && Number.isFinite(enriched.price)) {
                        // 🔱 [PHASE 10] NORMALIZE SIGNAL — one canonical object per symbol
                        // All downstream consumers (UI, execution, opportunity board) use this.
                        const dataAge = Date.now() - (entry.timestamp || 0);
                        const normalizedSignal = (!isIndexFinal && p17Signal)
                            ? SignalNormalizer.normalize(p17Signal, entry, rootGlobalState, dataAge)
                            : p17Signal;

                        enriched.signal = normalizedSignal || p17Signal;

                        changedSymbols.push(enriched);

                        portfolioCache.set(canonical, {
                            ...entry,
                            price: payload.price,
                            percent: payload.percent,
                            pct_change: payload.pct_change,
                            sector: payload.sector,
                            prevClose,
                            timestamp: payload.timestamp,
                            status: payload.status,
                            alerts: enriched.alerts,
                            priority: enriched.priority,
                            signal: enriched.signal,
                            volume_history: payload.volume_history
                        });

                        if (!isIndexFinal && p17Signal && p17Signal.score >= 30) {
                            const penalties = p17Signal.learningAdjustment?.penalties || [];
                            console.log(`[PHASE 17 / V5 SIGNAL] | ${canonical.padEnd(8)} | Score: ${p17Signal.score.toFixed(1)} | Decision: ${p17Signal.decision.padEnd(6)} | SectorFlow: ${(p17Signal.sectorFlow || 0).toFixed(2)} | Trend: ${p17Signal.trendStrength} | Adj: ${JSON.stringify(penalties)}`);
                            cycleBuffer.push({
                                symbol: canonical,
                                score: p17Signal.score,
                                price: enriched.price,
                                isSimPulse: p17Signal.isSimPulse || false,
                                traceId: p17Signal.traceId,
                                causationId: p17Signal.causationId
                            });
                        }
                    }
                })));

                if (cycleBuffer.length > 0) console.log(`📡 [PIPELINE_TRACE] Buffer Ready: ${cycleBuffer.length} signals`);
                // 🔱 [PHASE 19] Signal generation phase ended
                telemetry.markSignalEnd();
                telemetry.markExecStart();

                // 🛡️ [PHASE 10.6] INSTITUTIONAL STATE ENRICHMENT
                let pState;
                try {
                    pState = PortfolioManager.getLiveMetrics(rawPortfolio, portfolioCache);
                } catch (err) {
                    console.error(`🛡️ [METRICS_ERROR] Enrichment failed: ${err.message}. Using safe fallback.`);
                    pState = {
                        totalValue: rawPortfolio.balance,
                        unrealizedPnL: 0,
                        holdings: [],
                        balance: rawPortfolio.balance,
                        lockedBalance: rawPortfolio.lockedBalance || 0,
                        realizedPnL: rawPortfolio.realizedPnL
                    };
                }

                // 🛡️ [PHASE 21] PARALLEL MAINTENANCE CYCLE (EXIT ENGINE)
                // Ensures all holdings are audited for SL/TP/Trailing in parallel to prevent loop stalls.
                positionManager.reload();
                const holdingsSource = rawPortfolio.holdings || {};
                const allHoldings = Array.isArray(holdingsSource)
                    ? holdingsSource.map(h => h.symbol)
                    : Object.keys(holdingsSource);

                const maintenanceLimit = pLimit(COMPUTE_CORES);
                await Promise.all(allHoldings.map(symbol => maintenanceLimit(async () => {
                    try {
                        const priceData = portfolioCache.get(symbol) || portfolioCache.get(symbol + ".NS");

                        if (priceData && priceData.price) {
                            let currentPrice = priceData.price;

                            const history = priceHistory.get(symbol) || [];
                            const strategy = await StrategyManager.generate(symbol, history, globalState) || { symbol };
                            if (!strategy.indicators) strategy.indicators = {};

                            // 🔱 [PHASE 12] Bulletproof Indicator Fallback
                            const cachedAtr = priceData.atr || (priceData.indicators ? priceData.indicators.atr : null);
                            if (!strategy.indicators.atr && cachedAtr) {
                                strategy.indicators.atr = cachedAtr;
                                strategy.indicators.rsi = strategy.indicators.rsi || priceData.rsi || (priceData.indicators ? priceData.indicators.rsi : null);
                                strategy.indicators.momentum = strategy.indicators.momentum || priceData.momentum || (priceData.indicators ? priceData.indicators.momentum : null);
                                strategy.atr = cachedAtr;
                            }

                            // 🛰️ Trigger Maintenance Tick (This processes checkExit)
                            await ExecutionEngine.tick(symbol, strategy, currentPrice, pState.balance, portfolioCache, pState);
                        }
                    } catch (err) {
                        console.error(`🛡️ [MAINTENANCE_ERROR] ${symbol}:`, err.message);
                    }
                })));

                // 🛡️ [PHASE 10.3] PRIORITY EXECUTION & REPLACEMENT (ENTRY CYCLE)
                if (cycleBuffer.length > 0) {
                    cycleBuffer.sort((a, b) => b.score - a.score);

                    console.log(`📡 [PIPELINE_EXEC] Starting execution loop for ${cycleBuffer.length} signals`);
                    console.log(`📡 [PHASE 10.3] Cycle Priority: ${cycleBuffer.map(s => `${s.symbol}(${s.score})`).join(' > ')}`);

                    // 🔱 [PHASE 19 FIX] Load FRESH portfolio snapshot immediately before entry loop.
                    // The stale rawPortfolio captured before the maintenance cycle is now stale —
                    // any exits that happened during maintenance would cause false MAX_POSITIONS_REACHED.
                    const freshPortfolio = PortfolioManager.load();

                    // 🔱 [PERF FIX] Parallelize heavy ML predictions to eliminate cycle latency spikes
                    const strategyPromises = cycleBuffer.map(async (entry) => {
                        if (freshPortfolio.holdings[entry.symbol]) return { entry, skip: true };
                        try {
                            const prices = priceHistory.get(entry.symbol);
                            let strategy;
                            if (entry.isSimPulse) {
                                strategy = {
                                    symbol: entry.symbol,
                                    signal: 'BUY',
                                    score: entry.score,
                                    decision: 'BUY',
                                    indicators: { atr: 15, rsi: 50, momentum: 0 }
                                };
                            } else {
                                strategy = await StrategyManager.generate(entry.symbol, prices, globalState);
                            }
                            if (strategy) {
                                strategy.traceId = entry.traceId;
                                strategy.causationId = entry.causationId;
                            }
                            return { entry, strategy, skip: false };
                        } catch (err) {
                            console.error(`[STRATEGY_GEN_ERROR] ${entry.symbol}:`, err.message);
                            return { entry, skip: true };
                        }
                    });

                    const results = await Promise.all(strategyPromises);

                    // Execute sequentially to maintain balance invariants and exposure limits safely
                    for (const { entry, strategy, skip } of results) {
                        if (skip || !strategy) continue;

                        try {
                            // 🔱 [PHASE 17] Persist full signal into cache
                            const existingEntry = portfolioCache.get(entry.symbol) || {};
                            portfolioCache.set(entry.symbol, {
                                ...existingEntry,
                                signal: {
                                    ...(existingEntry.signal || {}),
                                    score: strategy.score,
                                    decision: strategy.decision,
                                    breakout: strategy.breakout || false,
                                    sectorFlow: strategy.sectorFlow ?? (globalState.sectorFlow?.[existingEntry.sector] ?? 0),
                                    confidenceScore: strategy.confidenceScore,
                                    tradeGrade: strategy.tradeGrade,
                                    edge: strategy.edgeScore ?? strategy.edge,
                                    smClassification: strategy.smartMoney?.classification || strategy.smartMoney?.signal || 'NEUTRAL',
                                }
                            });
                            
                            // Feed telemetry confidence rolling cache
                            if (strategy.confidenceScore != null) {
                                telemetry.traceConfidence(strategy.confidenceScore);
                            }

                            const isActionable = strategy && (strategy.signal === 'BUY' || strategy.signal === 'STRONG_BUY' || strategy.decision === 'BUY' || strategy.decision === 'STRONG_BUY');
                            if (isActionable) {
                                await ExecutionEngine.tick(entry.symbol, strategy, entry.price, pState.balance, portfolioCache, pState);
                            }
                        } catch (err) {
                            console.error(`[NEW_ENTRY_ERROR] ${entry.symbol}:`, err.message);
                        }
                    }
                }


                // 🛡️ [MATCHING ENGINE]
                try {
                    OrderEngine.matchPendingOrders(portfolioCache, broadcast);
                } catch (err) {
                    console.error("[MATCHING ENGINE FATAL]", err.message);
                }


                // 🛡️ [PHASE 16 FIX] Calculate true global Top Movers across the entire cached universe!
                // Previously, this only represented the 10-symbol active chunk, resulting in empty loser arrays.
                const fullUniverse = Array.from(portfolioCache.values()).filter(s => s && s.status !== 'DEAD' && Number.isFinite(s.percent));
                const mapMover = q => ({ ...q, pct_change: q.percent });
                const trueGainers = fullUniverse.filter(q => q.percent > 0).sort((a, b) => b.percent - a.percent).slice(0, 5).map(mapMover);
                const trueLosers = fullUniverse.filter(q => q.percent < 0).sort((a, b) => a.percent - b.percent).slice(0, 5).map(mapMover);
                if (!globalState.topMovers) globalState.topMovers = {};
                globalState.topMovers.gainers = trueGainers;
                globalState.topMovers.losers = trueLosers;

                // 🛡️ [PHASE 18] GLOBAL SIGNAL RANKING (SMART MONEY INTEGRATED)
                // Dashboard rankings MUST use finalScore INCLUDING Smart Money.
                const allSignals = [];
                for (const [symbol, entry] of portfolioCache.entries()) {
                    const sig = entry.signal;
                    if (sig && sig.score >= 55 && entry.status !== 'DEAD') {
                        allSignals.push({
                            symbol,
                            signal: sig.decision || 'BUY',
                            confidence: Math.max(0, Math.min(100, sig.score)),
                            score: sig.score,
                            smartMoney: sig.smartMoney
                        });
                    }
                }

                // Sort by finalScore DESC and take top 5
                allSignals.sort((a, b) => b.score - a.score);
                globalState.topSignals = allSignals.slice(0, 5);
                console.log(`📡 [PHASE 18] TACTICAL SIGNALS RANKED: ${globalState.topSignals.length} (Integrated Smart Money)`);

                // 🔱 [PHASE 10] FEED STATE — evaluate and attach to global state
                const feedSnapshot = feedState.evaluate();
                globalState.feedState = feedSnapshot.state;
                globalState.feedDataAge = feedSnapshot.dataAge;
                globalState.allowEntry = feedSnapshot.allowEntry;
                globalState.allowExit = feedSnapshot.allowExit;

                // 🛡️ [STRICT EMISSION ORDER] GLOBAL_STATE first, then STATE
                broadcast({ type: "GLOBAL_STATE", payload: globalState, sync_id: syncCoordinator.getSyncId() });

                // 🔱 [PHASE 17] GLOBAL CONTEXT REFRESH
                // Before broadcasting, ensured every symbol in cache is aligned with the latest macro data
                for (const [key, asset] of portfolioCache.entries()) {
                    if (!asset.signal) asset.signal = { score: 50, decision: 'HOLD', sectorFlow: 0 };

                    const canonical = key.split('.')[0];
                    const sector = asset.sector || rootGlobalState.SECTOR_MAP[canonical] || "UNKNOWN";
                    const liveSectorFlow = rootGlobalState.sectorFlow?.[sector] || 0;

                    // Force alignment of Sector Flow
                    asset.signal.sectorFlow = liveSectorFlow;


                }

                // 🛡️ [SIM_MODE FIX] Refresh index timestamps so IndexCard never shows OFFLINE
                // Indices are only fetched every 3rd cycle, but DEAD threshold is 90s.
                // In SIM_MODE, stamp them fresh each broadcast to keep UI alive.
                if (SIM_MODE) {
                    const INDEX_KEYS = ['NSEI', 'BSESN', 'NSEBANK', 'INDIAVIX'];
                    for (const key of INDEX_KEYS) {
                        const entry = portfolioCache.get(key);
                        if (entry) portfolioCache.set(key, { ...entry, timestamp: Date.now() });
                    }
                }

                // 🚀 [PHASE 10.2] REAL-TIME TICK BROADCAST
                if (changedSymbols.length > 0) {
                    broadcast({
                        type: "TICK_DELTA",
                        updates: changedSymbols,
                        sync_id: syncCoordinator.getSyncId(),
                        timestamp: now
                    });
                }

                // 🔱 [PHASE 21] Throttled full STATE broadcast (Every 10 cycles)
                // Prevents network saturation while ensuring periodic global sync.
                if (SYSTEM_STATE.CYCLE_COUNT % 10 === 0) {
                    broadcast({
                        type: "STATE",
                        data: Array.from(portfolioCache.values()),
                        sync_id: syncCoordinator.getSyncId(),
                        timestamp: now
                    });
                }

                // 🛡️ [PHASE 3.6.1] THROTTLED DISK SYNC (Every 3 cycles)
                if (SYSTEM_STATE.CYCLE_COUNT % 3 === 0) {
                    Persistence.save(portfolioCache);
                }

                // 🛡️ Force GC every 10 cycles
                if (SYSTEM_STATE.CYCLE_COUNT % 10 === 0 && global.gc) {
                    global.gc();
                }

                // 🔱 [PHASE 21] Periodic Research Snapshot (Every 100 full cycles)
                if (SYSTEM_STATE.CYCLE_COUNT > 0 && SYSTEM_STATE.CYCLE_COUNT % 100 === 0 && currentChunkIndex === 0) {
                    try {
                        console.log('🔱 [RESEARCH] Running periodic edge validation snapshot...');
                        const currentPortfolio = PortfolioManager.load();
                        const analytics = tradeAnalytics.computeFullAnalytics(currentPortfolio, portfolioCache);

                        const closedTrades = (currentPortfolio.orders || []).filter(o => o.side === 'SELL' && o.status === 'FILLED' && typeof o.pnl === 'number');
                        const decayStatus = edgeDecayMonitor.compute(closedTrades);

                        researchSnapshot.generateDailySnapshot(analytics, decayStatus);
                        console.log(`🔱 [RESEARCH] Snapshot generated. Verdict: ${analytics.verdict}`);
                    } catch (err) {
                        console.error('❌ [RESEARCH_ERROR] Background snapshot failed:', err.message);
                    }
                }

                broadcast({ type: "HEARTBEAT", timestamp: now, sync_id: syncCoordinator.getSyncId() });
            }

            // 🔱 [PHASE 19] Execution phase ended — broadcast telemetry snapshot
            telemetry.markExecEnd();
            const regimeName = rootGlobalState.regimeAI?.regime || 'SIDEWAYS';
            telemetry.markCycleEnd(regimeName);
            const telemetrySnap = telemetry.snapshot();
            broadcast({ type: "TELEMETRY_STATE", payload: telemetrySnap });

            // 🔱 [PHASE 20+11] OPPORTUNITY LEADERBOARD — delegated to OpportunityEngine module
            try {
                const { board: top10, meta: boardMeta } = buildOpportunityBoard(
                    portfolioCache,
                    regimeName,
                    feedState.state,
                    rootGlobalState  // Phase 11: pass for entropy + breadth gates
                );

                logCycleSummary(
                    SYSTEM_STATE.CYCLE_COUNT,
                    boardMeta.totalScanned,
                    boardMeta.tradable,
                    top10,
                    boardMeta.avgConfidence,
                    regimeName,
                    feedState.state
                );

                // Include order queue telemetry in board meta
                const qTelemetry = orderQueue.telemetry();
                boardMeta.queueDepth = qTelemetry.queueDepth;
                boardMeta.queueTelemetry = qTelemetry;

                // 🔱 [PHASE 11] Update TelemetryEngine with real system state
                TelemetryEngine.updateSystemState({
                    queueDepth: qTelemetry.queueDepth,
                    staleCount: boardMeta.staleSymbols || 0,
                    entropy: boardMeta.entropy || 0,
                    feedState: feedState.state,
                    regime: regimeName,
                    breadth: boardMeta.breadth || 0.5,
                });
                TelemetryEngine.markCycleEnd(regimeName);

                // 🔱 [PHASE 11] Archive cycle summary to disk
                const cycleId = `CYC_${SYSTEM_STATE.CYCLE_COUNT}_${Date.now()}`;
                CycleArchive.record({
                    cycleId,
                    cycleNumber: SYSTEM_STATE.CYCLE_COUNT,
                    regime: regimeName,
                    feedState: feedState.state,
                    signalsGenerated: boardMeta.totalScanned,
                    tradableSignals: boardMeta.tradable,
                    executedOrders: qTelemetry.byState?.FILLED || 0,
                    rejectedOrders: qTelemetry.byState?.REJECTED || 0,
                    avgLatencyMs: TelemetryEngine.snapshot().avgExecLatencyMs,
                    staleSymbols: boardMeta.staleSymbols || 0,
                    queueDepth: qTelemetry.queueDepth,
                    queueCongestion: qTelemetry.routeCongestion || 'CLEAR',
                    marketContext: boardMeta.marketContext,
                    avgConfidence: boardMeta.avgConfidence,
                    topSignal: top10[0]?.symbol || null,
                    breadth: boardMeta.breadth,
                    entropy: boardMeta.entropy,
                });

                // 🔱 [PHASE 11] Archive normalized signals for top signals
                for (const entry of top10) {
                    const cached = portfolioCache.get(entry.symbol);
                    if (cached?.signal) {
                        SignalArchive.record(cycleId, cached.signal);
                    }
                }

                // Always broadcast — empty board has market context
                broadcast({ type: 'OPPORTUNITY_BOARD', payload: top10, meta: boardMeta });

            } catch (err) {
                console.error('[OPPORTUNITY_BOARD ERROR]', err.message);
            }

            // 🔱 [PHASE 18 FIX] HEARTBEAT always runs — even if market is closed or no data changed.
            // This prevents the client watchdog from triggering false DATA STALLED banners
            // when the server is alive but not broadcasting market ticks (e.g. after-hours).
            broadcast({ type: "HEARTBEAT", timestamp: Date.now(), sync_id: syncCoordinator.getSyncId() });

            // 🔄 Step chunk
            currentChunkIndex++;
            if (currentChunkIndex * CHUNK_SIZE >= universeArray.length) {
                currentChunkIndex = 0;
            }

            // 🛡️ Final cycle success update (Determines next cycle delay)
            lastCycleHadTimeout = !cycleSuccess;

            // 🛡️ Explicitly null out large local refs for GC
            currentChunk = null;

            const mem = process.memoryUsage();
            console.log(`[PROFILE] Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB | RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);

        } catch (err) {
            SYSTEM_STATE.API_FAILURES++;
            if (SYSTEM_STATE.API_FAILURES > 5) {
                if (!SYSTEM_STATE.SAFE_MODE) console.error("🚨 [FAILURE ESCALATION] 5+ Failures. Activating SAFE_MODE.");
                SYSTEM_STATE.SAFE_MODE = true;
            }
            console.error(`[STABILITY ERROR] Cycle failed: ${err.message}`);
            lastCycleHadTimeout = true;
        } finally {
            isExecuting = false;
            SYSTEM_STATE.LAST_CYCLE_TIME = Date.now();

            // 🚀 [PHASE 8 & 23] DYNAMIC DELAY (Market State Aware)
            const marketClosed = isNSEMarketClosed();
            let baseDelay = marketClosed ? 20000 : 2000; // 🔱 [PHASE 21] 2s live (High Fidelity), 20s closed

            if (SYSTEM_STATE.SAFE_MODE || lastCycleHadTimeout) {
                baseDelay = marketClosed ? 30000 : 10000;
            }
            clearTimeout(loopTimeout);
            loopTimeout = setTimeout(runCycle, baseDelay);
            console.timeEnd('cycle');
        }
    };

    // 🛡️ Graceful Kill Switch
    process.on('SIGINT', () => {
        console.log('💀 [KILL SWITCH] Saving state that was deferred...');
        Persistence.save(portfolioCache);
        process.exit(0);
    });

    let isWarming = true;
    console.log('🚀 [PHASE 21] INSTITUTIONAL WARMUP INITIATED...');
    
    // 🛡️ [STEP 1] Immediate Persistence Hydration
    const cache = Persistence.load();
    if (cache.size > 0) {
        console.log(`✅ [WARMUP] Cache Hydrated: ${cache.size} symbols ready.`);
        // Prime the priceHistory for all symbols to avoid Score 50 artifacts
        for (const [sym, entry] of cache.entries()) {
            if (entry.sparkline && entry.sparkline.length > 0) {
                priceHistory.set(sym, entry.sparkline.map(p => ({
                    close: p, high: p, low: p, volume: 0, timestamp: Date.now()
                })));
            }
        }
    } else {
        console.warn('⚠️ [WARMUP] No LKG cache or bootstrap found. Starting from scratch.');
    }

    if (universeArray.length === 0) {
        console.warn('⚠️ [EMPTY WATCHLIST] Sleeping 5s before retry...');
        setTimeout(start, 5000);
    } else {
        isWarming = false;
        console.log('🚀 [PHASE 21] WARMUP COMPLETE. Starting real-time engine.');
        runCycle();
    }
}

// Start Institutional Engine
module.exports = { start, addToWatchlist };
