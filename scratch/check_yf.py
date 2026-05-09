import yfinance as yf
import pandas as pd

ticker = yf.Ticker("RELIANCE.NS")
hist = ticker.history(period="1d", interval="15m")
print(hist[['Close', 'Volume']])
