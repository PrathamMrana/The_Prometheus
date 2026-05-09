import sys
import asyncio
from curl_cffi.requests import AsyncSession

async def fetch_charts(symbols):
    async with AsyncSession(impersonate="chrome110") as session:
        tasks = []
        for sym in symbols:
            url = f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}?range=1d&interval=1m"
            tasks.append(session.get(url))
        
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        results = {}
        for sym, resp in zip(symbols, responses):
            if isinstance(resp, Exception): continue
            data = resp.json()
            if "chart" in data and data["chart"]["result"]:
                res = data["chart"]["result"][0]
                results[sym] = {
                    "closes": res["indicators"]["quote"][0].get("close", []),
                    "volumes": res["indicators"]["quote"][0].get("volume", [])
                }
        return results

print(asyncio.run(fetch_charts(["AAPL", "MSFT", "TSLA", "NVDA"])))
