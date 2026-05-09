import sys
import json
import logging
import yfinance as yf

logging.getLogger('yfinance').setLevel(logging.CRITICAL)

try:
    ticker = yf.Ticker("RELIANCE.NS")
    res = ticker.history(period="1d")
    print(res.to_json(orient='records'))
except Exception as e:
    print(f"Error: {e}")
