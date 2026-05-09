import sys, json
from curl_cffi import requests

session = requests.Session(impersonate="chrome110")

def get_raw(symbols):
    url = "https://query1.finance.yahoo.com/v7/finance/quote"
    params = {"symbols": ",".join(symbols)}
    res = session.get(url, params=params)
    return res.text

if __name__ == "__main__":
    out = get_raw(["RELIANCE.NS", "TCS.NS"])
    print(out)
