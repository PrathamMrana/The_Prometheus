const apiManager = require('../apiLayer/apiManager');
const { addToWatchlist } = require('../worker');
const { broadcast } = require('../realtime/socketServer');
const Persistence = require('../utils/persistence');
const { NSE_SYMBOLS } = require('../constants/symbols');

const lastSearch = new Map();

/**
 * 🛡️ [STEP 1] GLOBAL SYMBOL RESOLVER
 * Heuristically determines if a symbol is Indian (.NS) or US.
 */
function resolveSymbol(input) {
  const raw = input.trim().toUpperCase();
  
  if (raw.includes(".")) return raw;

  // Simple NSE fallback mapping: If no dot, assume .NS
  return `${raw}.NS`;
}

/**
 * 🚀 [STEP 2] INSTITUTIONAL SEARCH DISCOVERY & SUGGESTIONS
 * Performs immediate fetch, broadcasts to UI, and adds to persistent pipeline.
 * Handles both "Exact Discovery" (symbol) and "Suggestions" (q).
 */
async function searchSymbol(req, res) {
  try {
    const { symbol: input, q: query } = req.query;

    // 🕵️ [CASE A] MULTI-SUGGESTION SEARCH (Search-as-you-type)
    if (query) {
      const q = query.trim().toUpperCase();
      if (q.length < 1) return res.json({ success: true, results: [] });

      // 1. Fuzzy Logic (Symbol Inclusion + Relevance)
      const matches = NSE_SYMBOLS.filter(s => s.includes(q));

      // 2. Enrichment Logic (Hydrate with Cache Data)
      const cache = Persistence.load();
      const results = matches.slice(0, 8).map(s => {
        const canonical = s.split('.')[0].toUpperCase();
        const cached = cache.get(canonical);
        
        // Institutional Helper: Long Name Mapping (Extract from Symbol or use canonical)
        const longName = canonical
          .replace(/(_|-)/g, ' ')
          .split(' ')
          .map(word => word.charAt(0) + word.slice(1).toLowerCase())
          .join(' ');

        return {
          symbol: s,
          name: longName,
          price: cached?.price || 0,
          percent: cached?.percent || 0.00,
          status: cached?.status || 'SNAPSHOT'
        };
      });

      return res.json({ success: true, results });
    }

    // 🕵️ [CASE B] EXACT SYMBOL DISCOVERY (Press Enter / Select)
    if (!input) return res.status(400).json({ error: "Missing symbol or query" });


    const backendSymbol = resolveSymbol(input);
    const canonical = backendSymbol.split(".")[0].toUpperCase();

    // 🛡️ [RATE LIMIT] Prevent API spam
    const now = Date.now();
    const last = lastSearch.get(canonical) || 0;
    if (now - last < 1000) return res.status(429).json({ error: "Too fast" });
    lastSearch.set(canonical, now);

    console.log(`[DISCOVERY] Searching: ${backendSymbol} (Canonical: ${canonical})`);

    // 🔥 1. IMMEDIATE FETCH
    const results = await apiManager.fetchBatch("PRICE", [backendSymbol], 1);
    const entry = results[backendSymbol];

    // 🛡️ [STEP 3] LKG FALLBACK ( Institutional Resilience)
    // If live fetch fails (Rate Limited / Network), check Cache before 404
    let finalEntry = entry;
    if (!entry || !Number.isFinite(entry.price)) {
      const cache = Persistence.load();
      const cached = cache.get(canonical);
      if (cached && Number.isFinite(cached.price)) {
        console.log(`[DISCOVERY] Fell back to LKG Cache for ${canonical}`);
        finalEntry = cached;
      } else {
        return res.status(404).json({ error: "Symbol not found or provider rate-limited" });
      }
    }

    const payload = {
      type: "TICK",
      symbol: canonical,
      rawSymbol: backendSymbol,
      price: finalEntry.price,
      percent: finalEntry.percent || 0,
      timestamp: now,
      status: "LIVE",
      source: "YFINANCE"
    };

    // 🛡️ [CONTRACT ASSERTION]
    if (!payload.symbol || !Number.isFinite(payload.price)) {
      return res.status(500).json({ error: "Malformed data from provider" });
    }

    // 🔥 2. INSTANT BROADCAST (Double Push for safety)
    broadcast(payload);
    setTimeout(() => broadcast(payload), 100);

    // 🔥 3. CACHE INJECTION (Survival across refreshes)
    const cache = Persistence.load();
    cache.set(canonical, {
      ...entry,
      timestamp: now,
      status: "LIVE"
    });
    Persistence.save(cache);

    // 🔥 4. ADD TO PERSISTENT PIPELINE
    addToWatchlist(backendSymbol);

    return res.json({ success: true, data: payload });

  } catch (err) {
    console.error("[SEARCH ERROR]", err.message);
    return res.status(500).json({ error: "Internal discovery failure" });
  }
}

module.exports = { searchSymbol };
