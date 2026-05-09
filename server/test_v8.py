import sys, json
from curl_cffi import requests

def fetch_v8(symbol):
    session = requests.Session(impersonate="chrome110")
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"range": "1d", "interval": "1d"}
    resp = session.get(url, params=params, timeout=10)
    print("STATUS CODE:", resp.status_code)
    try:
        data = resp.json()
        print(json.dumps(data)[:200])
    except:
        print(resp.text[:200])

if __name__ == "__main__":
    fetch_v8("RELIANCE.NS")
