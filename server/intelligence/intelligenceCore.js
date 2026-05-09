const seenAnomalies = new Set();

function computePriority(data, global) {
  if (!global) return "NORMAL";
  
  if (data.anomaly === "CRITICAL") return "CRITICAL"

  if (global.regime === "BEARISH" && data.signal?.label === "SELL") return "HIGH"

  if (global.regime === "BULLISH" && data.signal?.label === "BUY") return "HIGH"

  return "NORMAL"
}

function processTick(data, global) {
  if (!data || !data.symbol || !Number.isFinite(data.price)) return null;

  const alerts = [];
  const z = Number.isFinite(data.zscore) ? data.zscore : 0;

  if (data.anomaly === "VOLUME_SPIKE" && !seenAnomalies.has(data.symbol + "_VOL")) {
    seenAnomalies.add(data.symbol + "_VOL");
    alerts.push({
      type: "HIGH",
      message: `Volume spike in ${data.symbol}`
    });
    setTimeout(() => seenAnomalies.delete(data.symbol + "_VOL"), 60000); 
  }

  if (Math.abs(z) > 2.5 && !seenAnomalies.has(data.symbol + "_Z")) {
    seenAnomalies.add(data.symbol + "_Z");
    alerts.push({
      type: "CRITICAL",
      message: `Z-score anomaly in ${data.symbol}`
    });
    setTimeout(() => seenAnomalies.delete(data.symbol + "_Z"), 60000);
  }

  return {
    symbol: data.symbol,
    price: data.price,
    change: data.change || 0,
    pct_change: data.pct_change || data.percent || 0,
    signal: data.signal,
    anomaly: data.anomaly || null,
    zscore: z,
    alerts,
    timestamp: data.timestamp || Date.now(),
    priority: computePriority(data, global),
    source: data.source || 'UNKNOWN',
    quality: data.quality || 0,
    status: data.status || 'LIVE'
  };
}

module.exports = { processTick };
