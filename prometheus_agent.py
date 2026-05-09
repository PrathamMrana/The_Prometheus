# Removed groq dependency
import yfinance as yf
import requests
import json
import pandas as pd
from datetime import datetime

# ── HELPERS ─────────────────────────────────────────────

def clean_ticker(ticker: str) -> str:
    return ticker.replace(".NS", "").replace(".BO", "").replace(".BSE", "")

# ── TICKER MAP ──────────────────────────────────────────

TICKER_MAP = {
    "RELIANCE":"RELIANCE.NS","TCS":"TCS.NS","HDFCBANK":"HDFCBANK.NS",
    "INFY":"INFY.NS","SBIN":"SBIN.NS","ICICIBANK":"ICICIBANK.NS",
    "BAJFINANCE":"BAJFINANCE.NS","BHARTIARTL":"BHARTIARTL.NS","ITC":"ITC.NS","LT":"LT.NS",
    "HINDUNILVR":"HINDUNILVR.NS","KOTAKBANK":"KOTAKBANK.NS","AXISBANK":"AXISBANK.NS",
    "ASIANPAINT":"ASIANPAINT.NS","MARUTI":"MARUTI.NS","SUNPHARMA":"SUNPHARMA.NS",
    "TITAN":"TITAN.NS","WIPRO":"WIPRO.NS","HCLTECH":"HCLTECH.NS","ULTRACEMCO":"ULTRACEMCO.NS",
    "NTPC":"NTPC.NS","NESTLEIND":"NESTLEIND.NS","POWERGRID":"POWERGRID.NS",
    "BAJAJFINSV":"BAJAJFINSV.NS","M&M":"M&M.NS", "TATAMOTORS":"TATAMOTORS.NS",
    "TATASTEEL":"TATASTEEL.NS", "JSWSTEEL":"JINDALSTEL.NS", "TECHM":"TECHM.NS",
    "INDUSINDBK":"INDUSINDBK.NS", "ADANIENT":"ADANIENT.NS", "ADANIPORTS":"ADANIPORTS.NS",
    "ONGC":"ONGC.NS", "COALINDIA":"COALINDIA.NS", "SHREECEM":"SHREECEM.NS",
    "HDFCLIFE":"HDFCLIFE.NS", "BAJAJ-AUTO":"BAJAJ-AUTO.NS", "BPCL":"BPCL.NS",
    "HEROMOTOCO":"HEROMOTOCO.NS", "DRREDDY":"DRREDDY.NS", "CIPLA":"CIPLA.NS",
    "BRITANNIA":"BRITANNIA.NS","EICHERMOT":"EICHERMOT.NS","GRASIM":"GRASIM.NS",
    "LARSEN": "LT.NS",
    # More Indian stocks
    "PIDILITIND":"PIDILITIND.NS", "DIVISLAB":"DIVISLAB.NS", "BAJAJHLDNG":"BAJAJHLDNG.NS",
    "SRF":"SRF.NS", "DABUR":"DABUR.NS", "GODREJCP":"GODREJCP.NS", "HAVELLS":"HAVELLS.NS",
    "ICICIPRULI":"ICICIPRULI.NS", "APOLLOHOSP":"APOLLOHOSP.NS", "SBILIFE":"SBILIFE.NS",
    "TATACONSUM":"TATACONSUM.NS", "ULTRATECHCEM":"ULTRACEMCO.NS", "BERGEPAINT":"BERGEPAINT.NS",
    # Major US stocks
    "AAPL": "AAPL", "MSFT": "MSFT", "NVDA": "NVDA", "TSLA": "TSLA", "GOOGL": "GOOGL",
    "META": "META", "AMZN": "AMZN", "NFLX": "NFLX", "BRK.B": "BRK-B", "JPM": "JPM",
    "V": "V", "UNH": "UNH", "HD": "HD", "PG": "PG", "MA": "MA", "DIS": "DIS",
    "PEP": "PEP", "KO": "KO", "MRK": "MRK", "ABBV": "ABBV", "COST": "COST",
    # Indices
    "S&P 500": "^GSPC", "SPX": "^GSPC", "NASDAQ": "^IXIC", "IXIC": "^IXIC",
    "NIFTY50": "^NSEI", "NSEI": "^NSEI", "SENSEX": "^BSESN", "BSESN": "^BSESN",
    "USDX": "DX-Y.NYB", "DXY": "DX-Y.NYB",
}

def resolve(ticker: str) -> str:
    return TICKER_MAP.get(ticker.upper(), ticker)

# ── RSI ─────────────────────────────────────────────────

def _rsi(series: pd.Series, period: int = 14) -> float:
    # BUG FIX #4: full try/except, no silent division by zero
    try:
        delta = series.diff().dropna()
        gain  = delta.clip(lower=0).rolling(period).mean()
        loss  = (-delta.clip(upper=0)).rolling(period).mean()
        last_loss = loss.iloc[-1]
        if last_loss == 0:
            return 100.0
        rs  = gain.iloc[-1] / last_loss
        return round(float(100 - (100 / (1 + rs))), 2)
    except Exception:
        return 50.0

# ── FETCH STOCK DATA ─────────────────────────────────────

def fetch_stock_data(ticker: str) -> dict:
    t = resolve(ticker)
    clean_t = clean_ticker(ticker.upper())
    
    # PREMIUM SYNC: Try local Node.js data engine first
    try:
        market = "india" if (".NS" in t or ".BO" in t) else "us"
        node_url = f"http://localhost:3001/api/{market}/quote?symbols={t}"
        resp = requests.get(node_url, timeout=1.5)
        if resp.ok:
            node_json = resp.json()
            if node_json.get("success") and node_json.get("data"):
                d = node_json["data"][0]
                # Success! Return high-fidelity data immediately
                return {
                    "ticker"      : clean_t,
                    "yf_symbol"   : t,
                    "timestamp"   : datetime.utcnow().isoformat() + "Z",
                    "currency"    : "INR" if market == "india" else "USD",
                    "price"       : d.get("price", 0),
                    "prev_close"  : d.get("prev_close", 0),
                    "change_pct"  : d.get("pct_change", 0),
                    "volume"      : d.get("volume", 0),
                    "avg_vol_20"  : d.get("avg_vol_20", 0),
                    "vol_ratio"   : d.get("vol_ratio", 1.0),
                    "52w_high"    : d.get("price", 0), # Fallback
                    "52w_low"     : d.get("price", 0),  # Fallback
                    "ma20"        : None, "ma50": None, "ma200": None,
                    "rsi"         : 50.0, "macd": 0.0, "macd_signal": 0.0,
                    "source"      : "prom_node_engine"
                }
    except Exception: pass

    # FALLBACK: Original yfinance logic for technicals and deep history
    try:
        tkr = yf.Ticker(t)
        hist = tkr.history(period="1y") 
        if hist.empty:
            return {"error": f"No data for {ticker} ({t})"}

        close = hist["Close"]
        info = tkr.info
        hist_close = float(close.iloc[-1])
        last  = round(float(info.get('currentPrice') or info.get('regularMarketPrice') or hist_close), 2)
        prev  = round(float(info.get('previousClose') or (close.iloc[-2] if len(close)>1 else last)), 2)
        pct   = round(((last - prev) / prev) * 100, 2) if prev > 0 else 0.0

        ma20  = round(float(close.rolling(20).mean().iloc[-1]), 2) if len(close) >= 20  else None
        ma50  = round(float(close.rolling(50).mean().iloc[-1]), 2) if len(close) >= 50  else None
        ma200 = round(float(close.rolling(200).mean().iloc[-1]), 2) if len(close) >= 200 else None

        ema12       = close.ewm(span=12, adjust=False).mean()
        ema26       = close.ewm(span=26, adjust=False).mean()
        macd_line   = ema12 - ema26
        signal_line = macd_line.ewm(span=9, adjust=False).mean()

        w52_high = round(float(close.rolling(252).max().iloc[-1]), 2) if len(close) >= 252 else last
        w52_low  = round(float(close.rolling(252).min().iloc[-1]), 2) if len(close) >= 252 else last

        vols = hist["Volume"].dropna()
        curr_vol = int(vols.iloc[-1]) if len(vols) > 0 else 0
        avg_vol  = float(vols.iloc[-21:-1].mean()) if len(vols) >= 21 else float(vols.mean())
        vol_ratio = round(curr_vol / avg_vol, 2) if avg_vol > 0 else 1.0

        return {
            "ticker"      : clean_t,
            "yf_symbol"   : t,
            "timestamp"   : datetime.utcnow().isoformat() + "Z",
            "currency"    : "INR" if (".NS" in t or ".BO" in t) else "USD",
            "price"       : last,
            "prev_close"  : prev,
            "change_pct"  : pct,
            "volume"      : curr_vol,
            "avg_vol_20"  : round(avg_vol, 0),
            "vol_ratio"   : vol_ratio,
            "52w_high"    : w52_high,
            "52w_low"     : w52_low,
            "ma20"        : ma20,
            "ma50"        : ma50,
            "ma200"       : ma200,
            "rsi"         : _rsi(close),
            "macd"        : round(float(macd_line.iloc[-1]), 4),
            "macd_signal" : round(float(signal_line.iloc[-1]), 4),
            "source"      : "yfinance_fallback"
        }
    except Exception as e:
        return {"error": str(e), "ticker": clean_t}

# ── FETCH FEAR & GREED ───────────────────────────────────

def fetch_fear_and_greed_raw() -> dict:
    try:
        r = requests.get(
            "https://api.alternative.me/fng/?limit=1", timeout=5
        )
        return r.json()
    except Exception:
        return {"data": [{"value": "50", "value_classification": "NEUTRAL"}]}

# ── FETCH NEWS (cleaned) ─────────────────────────────────

def fetch_news_raw(ticker: str) -> list:
    # BUG FIX #5: extract only title + pubDate before returning
    t = resolve(ticker)
    try:
        raw = yf.Ticker(t).news or []
        cleaned = []
        for item in raw[:8]:
            content = item.get("content", {})
            title   = content.get("title") or item.get("title", "")
            pub     = content.get("pubDate") or item.get("providerPublishTime", "")
            if title:
                cleaned.append({
                    "ticker"   : clean_ticker(ticker),
                    "title"    : title,
                    "published": str(pub),
                })
        return cleaned
    except Exception:
        return []

# ── PROMPTS ──────────────────────────────────────────────

NEURAL_SIGNALS_SYSTEM = """
You are a quantitative signal engine for The Prometheus trading platform.

RULES:
1. Compute signal for EACH stock using ONLY the JSON data provided.
2. NEVER use training memory for any value.
3. Output clean ticker names — NO .NS .BSE suffix.

SIGNAL LOGIC:
RSI < 30  AND MACD > Signal  →  STRONG BUY   88-95%
RSI < 45  AND price > MA50   →  BUY          65-84%
RSI > 70  AND MACD < Signal  →  STRONG SELL  88-95%
RSI > 55  AND price < MA50   →  SELL         65-84%
Everything else               →  HOLD         45-64%

Return ONLY valid JSON:
{
  "signals": [
    {
      "ticker": "RELIANCE",
      "signal": "BUY",
      "confidence": 78,
      "rsi": 42.3,
      "change_pct": -1.07
    }
  ]
}
"""

SENTIMENT_SYSTEM = """
You are a market sentiment engine.
Use ONLY the Fear & Greed data provided.

SCORING:
0-25   → "EXTREME FEAR"  color "#FF3333"
26-45  → "FEAR"          color "#FF8800"
46-55  → "NEUTRAL"       color "#FFFF00"
56-75  → "GREED"         color "#88FF00"
76-100 → "EXTREME GREED" color "#00FF88"

Return ONLY valid JSON:
{
  "score": 13,
  "label": "EXTREME FEAR",
  "color": "#FF3333",
  "interpretation": "One sentence impact on Indian markets."
}
"""

NEWS_SYSTEM = """
You are a financial news engine for The Prometheus.

RULES:
1. Use ONLY headlines provided. Never generate news.
2. Strip .NS from all tickers in output.
3. Tag: [ALERT] [EARNINGS] [MARKET] [MACRO]
4. Sentiment: BULLISH / BEARISH / NEUTRAL

Return ONLY valid JSON:
{
  "news": [
    {
      "tag": "MARKET",
      "ticker": "RELIANCE",
      "sentiment": "BEARISH",
      "headline": "headline text",
      "published": "timestamp"
    }
  ]
}
"""

AGENT_SYSTEM_PROMPT = """
You are PROMETHEUS — elite institutional trading AI.

RULES:
1. Use ONLY numbers from the JSON data given. Zero exceptions.
2. NEVER use training memory for prices, RSI, PE, or any number.
3. NEVER say "typically" "usually" "historically".
4. If field is null → write N/A.
5. No .NS or .BSE in output ever.
"""

AGENT_USER_PROMPT = """
TARGET : {ticker}
TIME   : {timestamp}

LIVE DATA:
{live_data}

Write this exact report using only the numbers above:

⚡ PROMETHEUS INTELLIGENCE REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TARGET     : {ticker}
📡 DATA AS OF : {timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 PRICE ACTION
  Price      : [price] {currency}
  Change     : [change_pct]%
  Volume     : [volume]
  52W High   : [52w_high]
  52W Low    : [52w_low]

📊 TECHNICALS
  RSI (14)   : [rsi] → [OVERBOUGHT if >70 / OVERSOLD if <30 / NEUTRAL]
  MACD       : [macd] vs Signal [macd_signal] → [BULLISH/BEARISH]
  MA20       : [ma20] — Price [ABOVE/BELOW]
  MA50       : [ma50] — Price [ABOVE/BELOW]
  MA200      : [ma200] — Price [ABOVE/BELOW]
  Trend      : [UPTREND/DOWNTREND/CONSOLIDATING]

😰 MARKET MOOD
  Fear&Greed : [score]/100 — [label]
  Insight    : [interpretation from fng data]

📰 NEWS PULSE
  Sentiment  : [overall sentiment from headlines]
  Top Story  : [most important headline]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 NEURAL VERDICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SIGNAL     : [STRONG BUY/BUY/HOLD/SELL/STRONG SELL]
  CONFIDENCE : [X]%
  RISK       : [LOW/MEDIUM/HIGH]
  CATALYST   : [key reason from data]
  WATCH AT   : [key price level]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Not financial advice.
"""

# ── AGENT FUNCTIONS ──────────────────────────────────────

def get_all_signals(tickers: list, groq_api_key: str = None) -> list:
    # BUG FIX #2: Local computation without Groq API
    try:
        all_signals = []
        for t in tickers:
            data = fetch_stock_data(t)
            if "error" not in data:
                rsi = data.get("rsi", 50)
                macd = data.get("macd", 0)
                signal = data.get("macd_signal", 0)
                price = data.get("price", 0)
                ma50 = data.get("ma50", 0)
                
                if rsi < 30 and macd > signal:
                    sig, conf = "STRONG BUY", 92
                elif rsi < 45 and price > ma50:
                    sig, conf = "BUY", 78
                elif rsi > 70 and macd < signal:
                    sig, conf = "STRONG SELL", 91
                elif rsi > 55 and price < ma50:
                    sig, conf = "SELL", 76
                else:
                    sig, conf = "HOLD", 54
                    
                all_signals.append({
                    "ticker"     : clean_ticker(t),
                    "signal"     : sig,
                    "confidence" : conf,
                    "rsi"        : rsi,
                    "change_pct" : data.get("change_pct", 0)
                })
        return all_signals
    except Exception as e:
        print(f"Signals Error: {e}")
        return []


def get_live_fng(groq_api_key: str = None) -> dict:
    try:
        raw_fng = fetch_fear_and_greed_raw()
        fng_entry = raw_fng.get("data", [{}])[0]
        val_str = fng_entry.get("value", "50")
        try:
            score = int(val_str)
        except ValueError:
            score = 50

        if score <= 25:
            label, color = "EXTREME FEAR", "#FF3333"
        elif score <= 45:
            label, color = "FEAR", "#FF8800"
        elif score <= 55:
            label, color = "NEUTRAL", "#FFFF00"
        elif score <= 75:
            label, color = "GREED", "#88FF00"
        else:
            label, color = "EXTREME GREED", "#00FF88"
            
        return {
            "score": score,
            "label": label,
            "color": color,
            "interpretation": f"Market mood currently reflects {label.lower()}."
        }
    except Exception as e:
        print(f"Sentiment Error: {e}")
        return {"score": 50, "label": "NEUTRAL", "color": "#FFFF00", "interpretation": "Market data unavailable."}


def get_live_news_feed(tickers: list, groq_api_key: str = None) -> list:
    try:
        all_news = []
        for t in tickers:
            raw = fetch_news_raw(t)
            for item in raw:
                title = str(item.get("title", ""))
                title_lower = title.lower()
                
                # Basic sentiment heuristic
                if any(w in title_lower for w in ["surge", "jump", "soar", "growth", "buy", "profit", "beat", "up", "rally"]):
                    sent = "BULLISH"
                elif any(w in title_lower for w in ["plunge", "fall", "drop", "loss", "sell", "miss", "down", "crash"]):
                    sent = "BEARISH"
                else:
                    sent = "NEUTRAL"
                    
                # Basic tagging heuristic
                tag = "MARKET"
                if "earnings" in title_lower or "quarter" in title_lower:
                    tag = "EARNINGS"
                elif "fed" in title_lower or "inflation" in title_lower or "rate" in title_lower:
                    tag = "MACRO"
                elif "alert" in title_lower or "breaking" in title_lower:
                    tag = "ALERT"
                    
                all_news.append({
                    "tag": tag,
                    "ticker": item.get("ticker", ""),
                    "sentiment": sent,
                    "headline": title,
                    "published": item.get("published", "")
                })
        return all_news[:15]
    except Exception as e:
        print(f"News Error: {e}")
        return []


def run_prometheus_agent(ticker: str, groq_api_key: str = None, res: dict = None) -> str:
    try:
        import requests
        import json
        from datetime import datetime
        
        if not res:
            return "⚠️ Prometheus Engine failed to bind context from LSTM."

        # Extract precise data from the LSTM pipeline
        p = res['current_price']
        vol = res['volume']
        rsi = res.get('rsi', 50.0)
        macd = res.get('macd_val', 0.0)
        signal = res.get('macd_signal', 0.0)
        
        data = res.get('raw_data')
        if data is not None and not data.empty:
            ma20 = float(data['Close'].rolling(20).mean().iloc[-1])
            ma50 = float(data['Close'].rolling(50).mean().iloc[-1])
            ma200 = float(data['Close'].rolling(200).mean().iloc[-1]) if len(data) >= 200 else ma50
        else:
            ma20 = ma50 = ma200 = p

        bb_upper = res.get('bb_upper', 0.0)
        bb_lower = res.get('bb_lower', 0.0)
        
        # Format the system prompt to demand an incredibly advanced output
        sys_prompt = f"""
You are PROMETHEUS, an elite $80M institutional quantitative AI engine.
Analyze the provided neural metrics for {ticker} and generate a highly advanced, precisely structured, multi-paragraph intelligence terminal report for high-net-worth algorithmic traders.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

# ⚡ NEURAL INTELLIGENCE REPORT: {ticker}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 1. MACRO & LIQUIDITY CONTEXT
[1-2 sentences on volume, moving averages context, and general market footprint]

### 2. QUANTITATIVE ALGORITHMIC SETUP
[A deep dive into RSI, MACD convergence/divergence, and Bollinger Band positioning. Mention order block probabilities.]

### 3. ASYMMETRIC RISK/REWARD THESIS
[What is the probabilistic trade here based on the LSTM Neural prediction vs current Action?]

### 4. ACTIONABLE TRADE PLAN
* **VERDICT**: [STRONG BUY / BUY / HOLD / SELL / STRONG SELL]
* **ENTRY ZONE**: [Precise price range]
* **PRIMARY TARGET**: [Precise price target]
* **INVALIDATION (STOP)**: [Precise stop loss]

Make it sound extremely sophisticated, elite, and data-driven. Use exact numbers provided. NO generic financial advice disclaimers. Use markdown formatting.
"""

        user_prompt = f"""
LIVE TERMINAL DATA FOR {ticker}:
- Price: {p:.2f}
- Volume: {vol:,.0f}
- RSI (14): {rsi:.2f}
- MACD: {macd:.2f} (Signal: {signal:.2f})
- MA20: {ma20:.2f} | MA50: {ma50:.2f} | MA200: {ma200:.2f}
- Bollinger Upper: {bb_upper:.2f} | Lower: {bb_lower:.2f}
- 52W High: {res.get('52w_high', 0):.2f} | 52W Low: {res.get('52w_low', 0):.2f}
- LSTM Neural Projected target: {res.get('target_price', p):.2f}
- LSTM R² Accuracy: {res.get('r2', 0):.4f}

EXECUTE ANALYSIS.
"""
        
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {groq_api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama3-70b-8192", 
                "messages": [
                    {"role": "system", "content": sys_prompt.strip()},
                    {"role": "user", "content": user_prompt.strip()}
                ],
                "temperature": 0.2,
                "max_tokens": 800
            },
            timeout=15
        )
        
        if response.status_code == 200:
            return response.json()['choices'][0]['message']['content'].strip()
        else:
            return f"⚠️ Groq API Error: {response.status_code} - {response.text}"

    except Exception as e:
        return f"⚠️ Prometheus Error: {str(e)}"
