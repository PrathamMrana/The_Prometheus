import sys, json
from curl_cffi import requests

def fetch_spark(symbols):
    session = requests.Session(impersonate="chrome110")
    url = f"https://query2.finance.yahoo.com/v8/finance/spark"
    params = {"symbols": ",".join(symbols), "range": "1d", "interval": "1d"}
    resp = session.get(url, params=params, timeout=10)
    data = resp.json()
    print(json.dumps(data, indent=2))

if __name__ == "__main__":
    fetch_spark(["RELIANCE.NS"])
