import sys
import json
import random
import time
import numpy as np
import yfinance as yf
import warnings
import gc
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor


warnings.filterwarnings("ignore", category=UserWarning)

try:
    from curl_cffi import requests
except ImportError:
    import requests


try:
    import pandas_ta as ta
except Exception:
    ta = None

USER_AGENTS = [
    "chrome110", "chrome116", "chrome104", "safari15_3", "safari15_5"
]

SECTORS = {
  "BANKING": ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "INDUSINDBK"],
  "IT": ["INFY", "TCS", "WIPRO", "HCLTECH", "TECHM", "LTIM"],
  "AUTO": ["MARUTI", "TATAMOTORS", "M&M", "HEROMOTOCO", "EICHERMOT", "BAJAJ-AUTO"],
  "ENERGY": ["RELIANCE", "ONGC", "NTPC", "BPCL", "COALINDIA", "POWERGRID"],
  "INFRA": ["LT", "ADANIENT", "ADANIPORTS", "ULTRACEMCO", "GRASIM"],
  "FMCG": ["ITC", "HINDUNILVR", "NESTLEIND", "BRITANNIA"],
}

# --- GLOBAL SESSION ---
session = requests.Session(impersonate="chrome110") if hasattr(requests, "Session") else requests.Session()

# --- UTILITIES ---

def normalize_quote(q):
    """🔴 2. Safe Default for Missing Fields (Data Hygiene)"""
    return {
        "symbol": q.get("symbol"),
        "price": q.get("regularMarketPrice") or q.get("price") or 0,
        "prev_close": q.get("regularMarketPreviousClose") or q.get("prev_close") or q.get("chartPreviousClose") or 0,
        "pct_change": q.get("regularMarketChangePercent") or q.get("pct_change") or 0,
    }

def parse_yahoo(data):
    """🔴 Universal Yahoo Guard - Handle v7, wrapped v8, and flat v8 schemas"""
    if not isinstance(data, dict):
        return {}

    # v7 format (quoteResponse)
    if "quoteResponse" in data:
        results = data.get("quoteResponse", {}).get("result", []) or []
        parsed = {}
        for q in results:
            sym = q.get("symbol")
            if not sym: continue
            price = q.get("regularMarketPrice") or 0
            prev = q.get("regularMarketPreviousClose") or price
            parsed[sym] = {
                "close": [price],
                "timestamp": [int(time.time())],
                "chartPreviousClose": prev,
            }
        return parsed

    # v8 wrapped spark format: {"spark": {"result": [...]}}
    if "spark" in data:
        results = data.get("spark", {}).get("result", []) or []
        out = {}
        for r in results:
            sym = r.get("symbol")
            resp = r.get("response", [{}])[0]
            quote = resp.get("indicators", {}).get("quote", [{}])[0]
            meta  = resp.get("meta", {})
            out[sym] = {
                "close":                      quote.get("close", []),
                "high":                       quote.get("high", []),
                "low":                        quote.get("low", []),
                "volumes":                    quote.get("volume", []),
                "timestamp":          resp.get("timestamp", []),
                "chartPreviousClose": meta.get("chartPreviousClose") or meta.get("previousClose") or 0,
                "regularMarketPreviousClose": meta.get("regularMarketPreviousClose"),
                "previousClose": meta.get("previousClose")
            }
        return out

    # 🔴 LIVE v8 flat format: {"TCS.NS": {close:[], timestamp:[], chartPreviousClose, ...}, ...}
    # Detected when the first value is a dict that contains a "close" list
    first = next(iter(data.values()), None)
    if isinstance(first, dict) and isinstance(first.get("close"), list):
        # Normalise chartPreviousClose → prefer chartPreviousClose, fall back to previousClose
        normalised = {}
        for sym, v in data.items():
            normalised[sym] = {
                "close":              v.get("close", []),
                "high":               v.get("high", []),
                "low":                v.get("low", []),
                "volumes":            v.get("volume", []),
                "timestamp":          v.get("timestamp", []),
                "chartPreviousClose": v.get("chartPreviousClose") or v.get("previousClose") or 0,
                "regularMarketPreviousClose": v.get("regularMarketPreviousClose"),
                "previousClose": v.get("previousClose")
            }
        return normalised

    return {}

def is_valid_symbol_data(v):
    """Ensure response has at least 2 valid price points."""
    if not isinstance(v, dict): return False
    closes = v.get("close", [])
    return closes and len([c for c in closes if c is not None]) >= 2

def is_active_symbol(v):
    """Filter out stale data from closed markets."""
    closes = [c for c in v.get("close", []) if c is not None]
    if len(closes) < 2: return False
    return closes[-1] != closes[0]

def is_tradable(q):
    """Exclude non-tradable symbols (indices/VIX)."""
    sym = q.get("symbol", "")
    return sym and not sym.startswith("^")

def fetch_single_symbol(sym):
    """🛡️ Fetch a single symbol with max fidelity using history for sparklines and accurate prev_close."""
    try:
        ticker = yf.Ticker(sym, session=session)
        
        # 🔱 [PHASE 1] PRIMARY DATA: 7-Day History (15m intervals)
        # Use raw prices (auto_adjust=False) to match exchange-reported numbers exactly.
        hist = ticker.history(period="7d", interval="15m", auto_adjust=False, back_adjust=False)
        if hist.empty:
            return None
            
        # 🔱 [PHASE 2] FALLBACK DATA: fast_info
        finfo = ticker.fast_info
        
        # Corrected keys for fast_info (camelCase required in some yf versions)
        last_price_fi = finfo.get('lastPrice') or finfo.get('last_price') or finfo.get('regularMarketPrice')
        prev_close_fi = finfo.get('previousClose') or finfo.get('previous_close') or finfo.get('regularMarketPreviousClose')

        # 🔱 [PHASE 3] PROCESS HISTORY
        last_ts = hist.index[-1]
        last_day = last_ts.date()
        
        # Find the PREVIOUS trading day's close for accurate pct_change
        # We look for the last candle whose date is strictly less than the last data point's date
        prev_day_data = hist[hist.index.date < last_day]
        if not prev_day_data.empty:
            prev_close = float(prev_day_data['Close'].iloc[-1])
        else:
            # If no previous day in hist (rare for 7d), fallback to fast_info or first candle
            prev_close = prev_close_fi or float(hist['Close'].iloc[0])

        curr_price = float(hist['Close'].iloc[-1])
        
        # If fast_info has a more recent price (spot price), prioritize it
        if last_price_fi and abs(last_price_fi - curr_price) / curr_price > 0.0001:
             curr_price = last_price_fi

        # 🔱 [SCHEMA FIX] Ensure we always have pct_change even if info() fails
        pct_change = 0
        if prev_close and prev_close > 0:
            pct_change = round(((curr_price - prev_close) / prev_close) * 100, 4)

        return sym, {
            "close": [float(c) for c in hist['Close'].tolist()],
            "high": [float(h) for h in hist['High'].tolist()],
            "low": [float(l) for l in hist['Low'].tolist()],
            "price": curr_price,
            "prev_close": prev_close,
            "pct_change": pct_change,
            "timestamp": [int(t.timestamp()) for t in hist.index],
            "data_timestamp": int(last_ts.timestamp() * 1000)
        }
    except Exception as e:
        print(f"Error fetching {sym}: {str(e)}", file=sys.stderr)
        return None


def fetch_quotes_api(symbols):
    """🚀 [INSTITUTIONAL] Direct Yahoo Quote API Sync."""
    if not symbols: return {}
    try:
        url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={','.join(symbols)}"
        headers = {"User-Agent": random.choice(USER_AGENTS)}
        resp = session.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("quoteResponse", {}).get("result", [])
            return {r["symbol"]: r for r in results}
    except Exception:
        pass
    return {}

def fetch_symbols_data(symbols):
    """🚀 [CONCURRENT] High-Performance Multi-Symbol Fetch with Quote Sync."""
    all_data = {}
    
    # 🔱 Step 1: Direct Quote API (Official % and Spot Price)
    official_quotes = fetch_quotes_api(symbols)
    
    # 🔱 Step 2: Historical/Detail Data (concurrent)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(fetch_single_symbol, symbols))
        for res in results:
            if res:
                sym, data = res
                # Merge official quote data if available
                if sym in official_quotes:
                    oq = official_quotes[sym]
                    data["official_pct"] = oq.get("regularMarketChangePercent")
                    data["official_price"] = oq.get("regularMarketPrice")
                    data["official_prev"] = oq.get("regularMarketPreviousClose")
                all_data[sym] = data
    return all_data

def get_trend(curr, prev):
    # Deterministic trend logic with 0.1 threshold to prevent jitter
    if curr is None or prev is None: return "FLAT"
    diff = curr - prev
    if abs(diff) < 0.1: return "FLAT"
    return "UP" if diff > 0 else "DOWN"

def get_quotes(input_symbols):
    # 0. INITIAL SETUP & CACHE
    now_ms = int(time.time() * 1000)
    CORE_INDICES = ["^NSEI", "^BSESN", "^VIX", "^INDIAVIX"]
    
    # 🛡️ EMPTY INPUT GUARD: return UNKNOWN state immediately if no symbols requested
    if not input_symbols:
        return {
            "quotes": [],
            "global": {
                "regime": "UNKNOWN", "risk": "UNKNOWN", "riskReason": "NO_SYMBOLS",
                "advanceDecline": {"advancers": 0, "decliners": 0},
                "sectorFlow": {}, 
                "topMovers": {"gainers": [], "losers": []},
                "timestamp": now_ms
            }
        }

    # 🛡️ PRE-FETCH: Use all input symbols + core indices
    symbols = list(set(input_symbols + CORE_INDICES))
    if not symbols:
        return {
            "quotes": [],
            "global": {
                "regime": "UNKNOWN", "risk": "UNKNOWN", "riskReason": "NO_VALID_SYMBOLS",
                "advanceDecline": {"advancers": 0, "decliners": 0},
                "sectorFlow": {}, 
                "topMovers": {"gainers": [], "losers": []},
                "timestamp": 0
            }
        }
    
    try:
        with open(".prometheus_cache.json", "r") as f:
            prev_sector_flow = json.load(f)
    except:
        prev_sector_flow = {}

    # 1. FETCH ADAPTIVE Universe
    all_data = fetch_symbols_data(symbols)

    # GLOBAL FAIL-SAFE (NO DATA)
    if not all_data:
        return {
            "quotes": [],
            "global": {
                "regime": "UNKNOWN", "risk": "UNKNOWN", "riskReason": "DATA_OUTAGE",
                "advanceDecline": {"advancers": 0, "decliners": 0},
                "sectorFlow": {}, 
                "topMovers": {"gainers": [], "losers": []},
                "timestamp": 0
            }
        }

    # --- PASS 1: ESTABLISH GLOBAL CONTEXT ---
    results_raw = []
    advancers = 0
    decliners = 0
    nifty_change = 0
    
    # Resilient VIX/Index extraction
    vix_ticker = all_data.get("^INDIAVIX") or all_data.get("^VIX")
    vix_value = None # 🔱 [PURITY] No default 15
    if vix_ticker and "close" in vix_ticker:
        closes = [c for c in vix_ticker.get("close", []) if c is not None]
        if closes: vix_value = closes[-1]

    sector_changes = {sector: [] for sector in SECTORS}
    
    for sym, ticker in all_data.items():
        if not isinstance(ticker, dict): continue
        closes = [c for c in ticker.get("close", []) if c is not None]
        times = ticker.get("timestamp", [])
        if not closes or len(closes) < 2: continue
        
        # 🔱 [PURITY LOCK] Use fast_info-adjusted price (regularMarketPrice) as primary.
        # fetch_single_symbol already compared hist close vs fast_info and picked the more accurate one.
        # Falls back to closes[-1] only if no fast_info price is available.
        fi_price = ticker.get("price")  # Set by fetch_single_symbol from fast_info.lastPrice
        curr_price = fi_price if (fi_price and fi_price > 0) else closes[-1]
        last_day = datetime.fromtimestamp(times[len(closes)-1]).date()
        
        # 🛡️ [STATUS_INTEGRITY] Determine if market is LIVE or CLOSED (30-min threshold)
        market_status = "LIVE" if (int(time.time()) - times[-1]) < 1800 else "CLOSED"

        # 🛡️ [PHASE 6] PRO-GRADE PREV CLOSE FALLBACK CHAIN
        # Prioritize the explicitly calculated prev_close from fetch_single_symbol
        meta_prev = ticker.get("prev_close") or ticker.get("official_prev") or ticker.get("regularMarketPreviousClose") or ticker.get("previousClose")
        
        spark_prev = None
        if not meta_prev:
            for j in range(len(closes)-2, -1, -1):
                if datetime.fromtimestamp(times[j]).date() < last_day:
                    spark_prev = closes[j]
                    break
        
        prev_close = meta_prev or spark_prev or ticker.get("chartPreviousClose") or curr_price
        
        # Division Safety
        # 🔱 [PHASE 21] NSE/INDEX CLOSING ACCURACY ENGINE
        official_pct = ticker.get("official_pct")
        official_prev = ticker.get("official_prev") or ticker.get("regularMarketPreviousClose")
        
        # 1. Use official percent if available and non-zero
        if official_pct is not None and abs(official_pct) > 0.0001:
            pct_change = round(official_pct, 4)
        # 2. Recalculate using official previous close vs current price (Best for weekends)
        elif official_prev and official_prev > 0 and abs(curr_price - official_prev) > 0.0001:
            pct_change = round(((curr_price - official_prev) / official_prev) * 100, 4)
        # 3. WEEKEND DEEP-SCAN: Find the last real session move
        else:
            pct_change = 0
            if len(closes) > 1:
                # Find the last price of today's (or Friday's) session
                last_price = closes[-1]
                last_day_ts = datetime.fromtimestamp(times[-1]).date()
                
                # Scan backwards to find the last price of the PREVIOUS session
                for j in range(len(closes)-2, -1, -1):
                    if datetime.fromtimestamp(times[j]).date() < last_day_ts:
                        prev_session_close = closes[j]
                        if abs(last_price - prev_session_close) > 0.0001:
                            pct_change = round(((last_price - prev_session_close) / prev_session_close) * 100, 4)
                        break
        
        if sym == "^NSEI": nifty_change = pct_change
        
        # Breadth Calculation: only active (intraday-moving) non-index symbols
        if not sym.startswith("^") and is_active_symbol(ticker):
            if pct_change > 0.05: advancers += 1
            elif pct_change < -0.05: decliners += 1

        # Sector Flow: ALL non-index .NS symbols with a valid pct_change (market-hours independent)
        if sym.endswith(".NS") and pct_change != 0:
            base_sym = sym.split(".")[0]
            for sector, sc_stocks in SECTORS.items():
                if base_sym in sc_stocks:
                    sector_changes[sector].append(pct_change)

        # 🛡️ [PHASE 10.5] OHLC Vector Extraction (Reduced for memory)
        results_raw.append({
            "symbol": sym, "price": curr_price, "prev_close": prev_close,
            "pct_change": pct_change, "session_closes": session_closes,
            "volumes": ticker.get("volumes", []),
            "last_day": last_day, "is_active": is_active_symbol(ticker), "market_status": market_status,
            "volume": ticker.get("volume", 0), "data_timestamp": ticker.get("data_timestamp")
        })

    # --- REGIME DETECTION ---
    # Primary: use live A/D breadth (intraday active symbols)
    # Fallback: when market is closed (A/D both 0), derive regime from pct_change distribution
    if advancers + decliners == 0:
        pos = sum(1 for r in results_raw if not r["symbol"].startswith("^") and r["pct_change"] > 0.05)
        neg = sum(1 for r in results_raw if not r["symbol"].startswith("^") and r["pct_change"] < -0.05)
        if pos > neg * 1.5:   regime = "BULLISH"
        elif neg > pos * 1.5: regime = "BEARISH"
        else:                 regime = "SIDEWAYS"
        # Use pct-based counts as proxy so downstream logic has a valid regime
        advancers, decliners = pos, neg
    elif advancers > decliners * 1.5: regime = "BULLISH"
    elif decliners > advancers * 1.5: regime = "BEARISH"
    else: regime = "SIDEWAYS"
    
    # --- PASS 2: APPLY INTELLIGENCE ---
    final_quotes = []
    for q in results_raw:
        # 🛡️ [PHASE 11] Data Sanity Guard
        if q.get("price") is None or q.get("prev_close") is None:
            continue

        pct = q["pct_change"]
        
        # Signal Engine
        label = "NEUTRAL"
        if regime == "BEARISH" and (pct and pct < -2): label = "SELL"
        elif regime == "BULLISH" and (pct and pct > 2): label = "BUY"
        confidence = round(min(95.0, abs(pct or 0) * 20), 2)
        
        # 🛡️ [MEMORY OPTIMIZATION] Native Z-Score (Avoid Pandas overhead)
        session_closes = q["session_closes"]
        if len(session_closes) < 10: session_closes = session_closes[-40:]
        
        zscore = 0
        if len(session_closes) > 10:
            try:
                # Use simple numpy for performance and lower overhead than pandas
                prices = np.array(session_closes, dtype=float)
                rets = np.diff(prices) / (prices[:-1] + 1e-9)
                m = np.mean(rets)
                s = np.std(rets)
                zscore = round((rets[-1] - m) / s, 2) if s > 0.0001 else 0
            except:
                zscore = 0

        anomaly = "CRITICAL" if (pct and abs(pct) > 4 or abs(zscore) > 2.5) else None
        
        # Priority
        if anomaly == "CRITICAL": priority = "CRITICAL"
        elif pct and abs(pct) > 4: priority = "CRITICAL"
        elif pct and abs(pct) > 2: priority = "HIGH"
        else: priority = "NORMAL"

        sym_base = q["symbol"].replace("^", "").split(".")[0]
        assigned_sector = "UNKNOWN"
        for sec, syms in SECTORS.items():
            if sym_base in syms:
                assigned_sector = sec
                break
        if assigned_sector == "UNKNOWN":
            assigned_sector = "INFRA"

        # Ensure volume_sparkline matches the length and period of session_closes (sparkline)
        volume_sparkline = []
        if q.get("volumes"):
            volume_sparkline = [float(v) for v in q["volumes"][-40:]]

        final_quotes.append({
            "symbol": q["symbol"], "price": round(q["price"], 2), "prev_close": round(q["prev_close"], 2),
            "pct_change": pct, "priority": priority, "volume": q.get("volume", 0),
            "volume_history": volume_sparkline,
            "sparkline": [round(float(c), 2) for c in session_closes[-40:]],
            "timestamp": q.get("data_timestamp") or 0, "status": q["market_status"],
            "signal": {"label": label, "confidence": confidence},
            "anomaly": anomaly, "zscore": zscore,
            "sector": assigned_sector
        })
    
    gc.collect() # Force cleanup before final JSON dump

    # --- SECTOR TRENDS & MOVERS ---
    sector_flow_raw = {s: round(np.mean(v), 2) if v else 0.0 for s, v in sector_changes.items()}
    sector_flow_final = {s: {"value": v, "trend": get_trend(v, prev_sector_flow.get(s))} for s, v in sector_flow_raw.items()}

    tradable_quotes = [q for q in final_quotes if is_tradable(q)]
    
    reasons = list(filter(None, [
        "Weak breadth" if decliners > advancers else None,
        "High volatility" if vix_value and vix_value > 18 else None
    ]))
    global_intelligence = {
        "regime": regime,
        "risk": "HIGH" if (vix_value and vix_value >= 18) else "MEDIUM",
        "riskReason": " + ".join(reasons) if reasons else "Stable market",
        "advanceDecline": {"advancers": advancers, "decliners": decliners},
        "sectorFlow": sector_flow_final,
        "topMovers": {
            "gainers": sorted([q for q in tradable_quotes if q["pct_change"] and q["pct_change"] > 0], key=lambda x: x["pct_change"], reverse=True)[:5],
            "losers": sorted([q for q in tradable_quotes if q["pct_change"] and q["pct_change"] < 0], key=lambda x: x["pct_change"])[:5]
        },
        "timestamp": max([q["timestamp"] for q in final_quotes]) if final_quotes else 0
    }
    
    # SAVE CACHE
    try:
        with open(".prometheus_cache.json", "w") as f:
            json.dump(sector_flow_raw, f)
    except:
        pass

    # --- FINAL DETERMINISM GUARD ---
    # 🛡️ Only return quotes that were explicitly requested by the user
    # This prevents internal indices or leaked symbols from appearing in the UI quotes list
    user_symbols = set(input_symbols)
    strict_quotes = [q for q in final_quotes if q["symbol"] in user_symbols]
    
    # 🔒 Enforce deterministic sort order
    strict_quotes.sort(key=lambda x: x["symbol"])

    return {"quotes": strict_quotes, "global": global_intelligence}

def safe_print(data):
    """Guaranteed Node communication wrapper — BrokenPipe & EPIPE safe."""
    try:
        sys.stdout.write(json.dumps(data) + "\n")
        sys.stdout.flush()
    except (BrokenPipeError, OSError):
        # Pipe closed by Node before we finished writing — exit silently
        try:
            sys.stderr.close()
        except Exception:
            pass
        sys.exit(0)

if __name__ == "__main__":
    # --- GLOBAL FAIL-SAFE WRAPPER ---
    try:
        if len(sys.argv) < 2:
            safe_print({"error": "No symbols provided"})
            sys.exit(1)
            
        # 🛡️ [PHASE 12] Robust CLI Argument Handling
        # Supports both "SYM1,SYM2" and SYM1 SYM2 formats
        raw_args = sys.argv[1:]
        symbols_list = []
        for arg in raw_args:
            symbols_list.extend([s.strip().upper() for s in arg.split(",") if s.strip()])
        
        # Remove duplicates while preserving order
        symbols_list = list(dict.fromkeys(symbols_list))
        
        output = get_quotes(symbols_list)
        safe_print(output)
        
    except Exception as e:
        fallback = {
            "global": {
                "regime": "UNKNOWN", "risk": "UNKNOWN", "riskReason": str(e),
                "advanceDecline": {"advancers": 0, "decliners": 0},
                "sectorFlow": {}, 
                "topMovers": {"gainers": [], "losers": []},
                "timestamp": int(time.time() * 1000)
            },
            "quotes": []
        }
        safe_print(fallback)
