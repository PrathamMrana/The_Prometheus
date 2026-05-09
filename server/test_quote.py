import sys
import json
import yfinance as yf
from curl_cffi import requests
import logging

logging.getLogger('yfinance').setLevel(logging.CRITICAL)

def get_quotes(symbols):
    if not symbols: return []
    results = []
    
    session = requests.Session(impersonate="chrome110", timeout=10)

    try:
        data = yf.download(
            tickers=symbols,
            period="5d",
            interval="1d",
            group_by='ticker',
            session=session,
            threads=True,
            progress=False
        )

        if data.empty: return []

        for symbol in symbols:
            try:
                ticker_data = data[symbol] if len(symbols) > 1 else data
                ticker_data = ticker_data.dropna(subset=["Close"])
                
                if ticker_data.empty: continue
                
                curr_price = float(ticker_data["Close"].iloc[-1])
                prev_close = float(ticker_data["Close"].iloc[-2]) if len(ticker_data) > 1 else curr_price
                
                pct_change = 0
                if prev_close > 0:
                    pct_change = round(((curr_price - prev_close) / prev_close) * 100, 2)

                curr_vol = int(ticker_data["Volume"].iloc[-1]) if "Volume" in ticker_data.columns else 0
                
                results.append({
                    "symbol": symbol,
                    "price": curr_price,
                    "prev_close": prev_close,
                    "pct_change": pct_change,
                    "volume": curr_vol,
                    "timestamp": int(ticker_data.index[-1].timestamp() * 1000),
                    "status": "LIVE"
                })
            except Exception as e:
                continue
    except Exception as e:
        sys.stderr.write(f"Batch download failed: {str(e)}\n")
        
    return results

if __name__ == "__main__":
    out = get_quotes(["RELIANCE.NS"])
    print(json.dumps(out))
