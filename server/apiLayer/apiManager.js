/**
 * apiManager - Central Orchestration Hub.
 */
const rateLimiter = require('./rateLimiter');
const cacheManager = require('./cacheManager');
const fallbackManager = require('./fallbackManager');
const metricsLogger = require('./metricsLogger');
const pLimit = require('p-limit');

const FredAdapter = require('./adapters/FredAdapter');
const GroqAdapter = require('./adapters/GroqAdapter');
const YFinanceAdapter = require('./adapters/YFinanceAdapter');
const symbolMapper = require('./symbolMapper');
const ValidationEngine = require('./validationEngine');
const syncCoordinator = require('./syncCoordinator');
const FreshnessGuard = require('./freshnessGuard');

const symbolTypeDetector = require('./symbolTypeDetector');
const blockedSymbolCache = require('./blockedSymbolCache');
const dataFusionEngine = require('./dataFusionEngine');
const providerScorer = require('./providerScorer');
const symbolCache = require('./symbolCache');
const lkgCache = require('./lkgCache');
const dataQualityEvaluator = require('./dataQualityEvaluator');

const TwelveDataAdapter = require('./adapters/TwelveDataAdapter');

const PRIMARY_TIMEOUT = 7000;
const SECONDARY_TIMEOUT = 5000;
const FALLBACK_COOLDOWN = 10000; 

class ApiManager {
    constructor() {
        this.adapters = new Map();
        this.inFlight = new Map();
        this.limit = pLimit(2); // 🛡️ [PHASE 8] STRICT CONCURRENCY CAP
        this.cycleCache = new Map();
        this.fallbackCooldowns = new Map(); // Symbol -> Timestamp of last failure
        
        // Register Adapters
        this.registerAdapter('FRED', new FredAdapter());
        this.registerAdapter('GROQ', new GroqAdapter());
        this.registerAdapter('YFINANCE', new YFinanceAdapter());
        this.registerAdapter('TWELVE_DATA', new TwelveDataAdapter());

        this.priority = {
            PRICE: ["YFINANCE", "TWELVE_DATA"],
            INDEX: ["YFINANCE", "TWELVE_DATA"], 
            TECHNICALS: ["YFINANCE"],
            FUNDAMENTALS: ["YFINANCE"],
            MACRO: ["FRED"],
            INSIGHTS: ["GROQ"]
        };
    }

    getProviders(symbolType, symbol = "") {
        return ["YFINANCE", "TWELVE_DATA"];
    }

    /**
     * 🛡️ [UTILITY] fetchWithRetry
     */
    async fetchWithRetry(fn, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (e) {
                if (i === retries - 1) throw e;
                const delay = 500 * (i + 1);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    shouldSkip(sourceName, symbol) {
        // 1. Check Block Cache
        if (blockedSymbolCache.isBlocked(symbol, sourceName)) {
            return true;
        }

        const type = symbolTypeDetector.detect(symbol);
        const capableProviders = this.getProviders(type, symbol);
        
        if (!capableProviders.includes(sourceName)) {
            return true;
        }

        return false;
    }

    registerAdapter(name, adapter) {
        this.adapters.set(name, adapter);
    }

    getProviderStatus() {
        const statuses = {};
        this.adapters.forEach((adapter, name) => {
            const isAllowed = rateLimiter.isAllowed(name);
            statuses[name] = isAllowed ? 'OK' : 'DEGRADED';
        });
        return statuses;
    }

    async fetchBatch(type, symbols, priority = 3, sync_id = 0) {
        if (!symbols || symbols.length === 0) return {};

        // 🛡️ [PHASE 8] REQUEST DEDUPLICATION CACHE (3s TTL)
        const cacheKey = symbols.sort().join(',');
        const cachedBatch = this.cycleCache.get(cacheKey);
        if (cachedBatch && Date.now() - cachedBatch.ts < 3000) {
            return cachedBatch.data;
        }

        const primaryAdapter = this.adapters.get("YFINANCE");
        const secondaryAdapter = this.adapters.get("TWELVE_DATA");

        // 🚀 [PHASE 16] INSTITUTIONAL PARALLEL RACE STRATEGY
        console.log(`[DATA_RACE] Initiating parallel fetch for ${symbols.length} symbols...`);
        
        const fetchWithTimeout = (promise, ms) => Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
        ]);

        const primaryTask = async () => {
            if (!primaryAdapter) throw new Error("YFINANCE_MISSING");
            return this.fetchWithRetry(() => fetchWithTimeout(primaryAdapter.getPrices(symbols), PRIMARY_TIMEOUT));
        };

        const secondaryTask = async () => {
            if (!secondaryAdapter) throw new Error("TWELVE_DATA_MISSING");
            // TwelveData often needs per-symbol for quotes if not pro, but let's assume it has batch for now or falls back gracefully
            return this.fetchWithRetry(() => fetchWithTimeout(secondaryAdapter.getPrices(symbols), SECONDARY_TIMEOUT));
        };

        try {
            const results = await Promise.allSettled([primaryTask(), secondaryTask()]);
            
            // Find the first successful response
            const winner = results.find(r => r.status === "fulfilled" && r.value && r.value.quotes);
            
            let finalQuotes = {};
            let finalGlobal = {};
            let activeSource = "NONE";

            if (winner) {
                const res = winner.value;
                finalQuotes = res.quotes || {};
                finalGlobal = res.global || {};
                activeSource = (winner.value === results[0].value) ? "YFINANCE" : "TWELVE_DATA";
                console.log(`[DATA_RACE] WINNER: ${activeSource}`);
            }

            // 🛡️ Fill Gaps with LKG
            const finalResults = {};
            let gapsFilled = 0;
            symbols.forEach(s => {
                if (finalQuotes[s]) {
                    finalResults[s] = { ...finalQuotes[s], source: activeSource, quality: dataQualityEvaluator.calculate(finalQuotes[s], activeSource) };
                    lkgCache.store(s, finalQuotes[s]);
                } else {
                    const lkg = lkgCache.lastKnownGood(s);
                    finalResults[s] = { ...lkg, source: 'LKG', status: 'RECOVERY_MODE', quality: 0 };
                    gapsFilled++;
                }
            });

            const finalData = {
                quotes: finalResults,
                global: {
                    ...finalGlobal,
                    data_health: gapsFilled === 0 ? 'LIVE' : 'PARTIAL',
                    active_source: activeSource,
                    gap_count: gapsFilled,
                    sync_id
                }
            };

            this.cycleCache.set(cacheKey, { data: finalData, ts: Date.now() });
            return finalData;

        } catch (e) {
            console.error(`[CRITICAL DATA FAIL] Parallel race failed: ${e.message}`);
            const disasterResults = {};
            symbols.forEach(s => { 
                const lkg = lkgCache.lastKnownGood(s);
                disasterResults[s] = { ...lkg, source: 'LKG', status: 'RECOVERY_MODE', quality: 0 }; 
            });
            return { quotes: disasterResults, global: { data_health: 'CRITICAL', data_quality_avg: 0 } };
        }
    }

    async fetch(type, symbol, priority = 1, syncId = null) {
        const baseResolved = symbolMapper.resolve(symbol, 'DEFAULT');
        
        // 1. [STEP C] CACHING LAYER (10s TTL for Prices)
        const cached = cacheManager.get(baseResolved, type === 'PRICE' ? 'HOT' : 'WARM');
        if (cached && (Date.now() - new Date(cached.timestamp).getTime() < 10000)) {
            return { ...cached, status: 'LIVE', source: 'CACHE', sync_id: syncId };
        }

        // 2. [STEP D] IN-FLIGHT DEDUPLICATION
        const key = `${type}:${baseResolved}`;
        if (this.inFlight.has(key)) {
            return this.inFlight.get(key);
        }

        const fetchPromise = (async () => {
            const providers = ["YFINANCE"];
            return await this.fetchWithFallback(symbol, providers, type, priority, syncId);
        })().finally(() => {
            this.inFlight.delete(key);
        });

        this.inFlight.set(key, fetchPromise);
        return fetchPromise;
    }

    async fetchWithFallback(symbol, providers, type, priority, syncId) {
        const baseResolved = symbolMapper.resolve(symbol, 'DEFAULT');
        const sourceName = "YFINANCE"; // Only strategy allowed for local stability
        const adapter = this.adapters.get(sourceName);

        try {
            const callStart = Date.now();
            
            // 🛡️ [STEP T] ADAPTIVE TIMEOUT GUARD (4.0s)
            const fetchWithTimeout = (promise, ms = 4000) =>
                Promise.race([
                    promise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
                ]);

            let res = await fetchWithTimeout(adapter.getPrice(symbol), 4000);

            if (res && res !== 'PLAN_RESTRICTED') {
                res.symbol = baseResolved;
                res.source = sourceName;
                // 🔱 [Purity Lock] Do NOT override res.timestamp with Date.now()

                if (ValidationEngine.validate(res).valid) {
                    lkgCache.store(baseResolved, res);
                    return { ...res, status: 'LIVE', sync_id: syncId };
                }
            }
        } catch (e) {
            console.error(`[STABILITY] Provider failed for ${symbol}: ${e.message}`);
        }

        return { ...lkgCache.lastKnownGood(baseResolved), symbol: baseResolved, sync_id: syncId };
    }

    getHealth() {
        return metricsLogger.getHealth();
    }

    async getPrice(symbol) {
        return this.fetch('PRICE', symbol, 3);
    }

    async getQuote(symbol) {
        return this.fetch('QUOTE', symbol, 2);
    }

    async getIndicators(symbol) {
        return this.fetch('INDICATORS', symbol, 2);
    }

    async getFundamentals(symbol) {
        return this.fetch('FUNDAMENTALS', symbol, 1);
    }

    async getInsights(symbol) {
        return this.fetch('INSIGHTS', symbol, 1);
    }
}

module.exports = new ApiManager();
