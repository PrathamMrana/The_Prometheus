import sys
import yfinance as yf
from curl_cffi import requests
import logging

logging.getLogger('yfinance').setLevel(logging.CRITICAL)

session = requests.Session(impersonate="chrome110")

try:
    data = yf.download(
        tickers="RELIANCE.NS",
        period="5d",
        interval="1d",
        session=session,
        threads=False,
        progress=False
    )
    print("SUCCESS")
    print(data)
except Exception as e:
    print(f"FAILED WITH EXC: {e}")
