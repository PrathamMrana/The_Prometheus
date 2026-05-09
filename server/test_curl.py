import sys, json
from curl_cffi import requests

def fetch(symbols):
    session = requests.Session(impersonate="chrome110")
    url = "https://query1.finance.yahoo.com/v7/finance/quote"
    params = {"symbols": ",".join(symbols)}
    resp = session.get(url, params=params, timeout=10)
    print("STATUS CODE:", resp.status_code)
    try:
        data = resp.json()
        print(json.dumps(data)[:200])
    except:
        print(resp.text[:200])

if __name__ == "__main__":
    fetch(["RELIANCE.NS", "TCS.NS"])
