import sys, json
from curl_cffi import requests

session = requests.Session(impersonate="chrome110")

def get_quotes(symbols):
    url = "https://query1.finance.yahoo.com/v7/finance/quote"
    
    params = {"symbols": ",".join(symbols)}
    res = session.get(url, params=params)
    data = res.json()

    results = []
    
    for item in data.get("quoteResponse", {}).get("result", []):
        sym = item.get("symbol")
        
        # Calculate exactly what the Node backend expects:
        # symbol, price, prev_close, pct_change, volume, timestamp, status
        
        curr_price = float(item.get("regularMarketPrice", 0))
        prev_close = float(item.get("regularMarketPreviousClose", curr_price))
        pct_change = float(item.get("regularMarketChangePercent", 0))
        volume = int(item.get("regularMarketVolume", 0))
        timestamp = int(item.get("regularMarketTime", 0)) * 1000

        results.append({
            "symbol": sym,
            "price": curr_price,
            "prev_close": prev_close,
            "pct_change": round(pct_change, 2),
            "volume": volume,
            "timestamp": timestamp,
            "status": "LIVE"
        })

    return results

if __name__ == "__main__":
    out = get_quotes(["RELIANCE.NS", "TCS.NS"])
    print(json.dumps(out))
