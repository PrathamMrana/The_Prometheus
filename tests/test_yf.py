from curl_cffi import requests
import yfinance as yf
import json

session = requests.Session(impersonate="chrome110")
data = yf.download(tickers="RELIANCE.NS", period="5d", interval="1d", session=session, progress=False, group_by="ticker")
print(data.to_json())
