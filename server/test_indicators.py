import sys
import pandas as pd
import pandas_ta as ta
import numpy as np
from curl_cffi import requests

session = requests.Session(impersonate="chrome110")
url = "https://query2.finance.yahoo.com/v8/finance/spark"
params = {"symbols": "RELIANCE.NS", "range": "1d", "interval": "1m"}
data = session.get(url, params=params).json()
ticker_data = data["RELIANCE.NS"]
closes = ticker_data.get("close", [])
valid_closes = [c for c in closes if c is not None]
df = pd.DataFrame({"Close": valid_closes})
print("LENGTH AVAIL:", len(df))
if len(df) > 50:
    df["ema20"] = ta.ema(df["Close"], length=20)
    df["ema50"] = ta.ema(df["Close"], length=50)
else:
    df["ema20"] = df["Close"]
    df["ema50"] = df["Close"]
if len(df) > 34:
    macd_data = ta.macd(df["Close"])
    if macd_data is not None and "MACD_12_26_9" in macd_data.columns:
        df["macd"] = macd_data["MACD_12_26_9"]
    else:
        df["macd"] = 0
else:
    df["macd"] = 0
print(df.tail(2))
