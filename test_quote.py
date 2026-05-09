from curl_cffi import requests
import json

session = requests.Session(impersonate="chrome110", timeout=10)
res = session.get("https://query1.finance.yahoo.com/v7/finance/quote?symbols=RELIANCE.NS")
print(json.dumps(res.json(), indent=2))
