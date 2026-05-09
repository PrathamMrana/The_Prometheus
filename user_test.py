import sys, json
from curl_cffi import requests

session = requests.Session(impersonate="chrome110")

def fetch(symbols):
    url = "https://query1.finance.yahoo.com/v7/finance/quote"
    params = {"symbols": ",".join(symbols)}
    res = session.get(url, params=params)
    data = res.json()
    result = {}
    for item in data.get("quoteResponse", {}).get("result", []):
        sym = item.get("symbol")
        result[sym] = {
            "price": item.get("regularMarketPrice"),
            "change": item.get("regularMarketChangePercent"),
            "volume": item.get("regularMarketVolume")
        }
    return result

if __name__ == "__main__":
    out = fetch(["RELIANCE.NS"])
    print(json.dumps(out))
