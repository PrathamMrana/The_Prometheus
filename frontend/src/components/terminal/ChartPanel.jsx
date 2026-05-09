import React, { useEffect, useRef, useState } from 'react';
import * as LWC from 'lightweight-charts';
import { useTradeStore } from '../../store/tradeStore';
import { useMarketStore } from '../../store/marketStore';
import { Loader2, TrendingUp, TrendingDown, Clock, Activity, AlertCircle, BarChart2, Layers } from 'lucide-react';
import { apiFetch } from '../../utils/api';

const { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries } = LWC;

// ─── Skeleton shimmer ────────────────────────────────────────────────────────
const ChartSkeleton = () => (
  <div className="absolute inset-0 flex flex-col z-10 bg-[#0a0a0c]/80 backdrop-blur-sm p-4 gap-3">
    <div className="h-3 w-1/3 rounded bg-white/5 animate-pulse" />
    <div className="flex-1 flex items-end gap-1 px-2 pb-2">
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-white/[0.04] animate-pulse"
          style={{ height: `${20 + Math.random() * 60}%`, animationDelay: `${i * 30}ms` }}
        />
      ))}
    </div>
    <div className="flex items-center gap-2 justify-center">
      <Loader2 size={14} className="text-gold animate-spin" />
      <span className="font-mono text-[9px] text-gold tracking-[0.4em] uppercase animate-pulse">Loading Chart Data…</span>
    </div>
  </div>
);

// ─── Compute VWAP from OHLCV data ────────────────────────────────────────────
function computeVWAP(data) {
  let cumVP = 0, cumVol = 0;
  return data.map(d => {
    const typical = (d.high + d.low + d.close) / 3;
    cumVP += typical * (d.volume || 0);
    cumVol += (d.volume || 0);
    return { time: d.time, value: cumVol > 0 ? cumVP / cumVol : typical };
  });
}

// ─── Compute SMA ─────────────────────────────────────────────────────────────
function computeSMA(data, period) {
  return data.map((d, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((s, x) => s + x.close, 0) / period;
    return { time: d.time, value: avg };
  }).filter(Boolean);
}

export const ChartPanel = () => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const vwapSeriesRef = useRef(null);
  const sma20Ref = useRef(null);
  const sma50Ref = useRef(null);

  const symbol = useTradeStore(state => state.selectedSymbol);
  const market = useMarketStore(state => state.market);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState({ label: '15M', range: '1d', interval: '15m' });
  const [overlays, setOverlays] = useState({ vwap: true, sma20: true, sma50: false, volume: true });
  const [chartStats, setChartStats] = useState(null);

  const TIMEFRAMES = [
    { label: '1M',  range: '1d',  interval: '1m'  },
    { label: '5M',  range: '1d',  interval: '5m'  },
    { label: '15M', range: '1d',  interval: '15m' },
    { label: '1H',  range: '1mo', interval: '60m' },
    { label: '1D',  range: '1y',  interval: '1d'  },
  ];

  const stock = market[symbol.split('.')[0]] || {};
  const isUp = (stock.percent || 0) >= 0;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let chart, isDisposed = false;

    try {
      chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: 'rgba(148,163,184,0.8)',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.03)' },
          horzLines: { color: 'rgba(255,255,255,0.03)' },
        },
        crosshair: {
          mode: 1,
          vertLine: { labelBackgroundColor: '#1a1a2e', color: 'rgba(255,184,0,0.4)', style: 2 },
          horzLine: { labelBackgroundColor: '#1a1a2e', color: 'rgba(255,184,0,0.4)', style: 2 },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.08, bottom: 0.28 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: true,
        handleScale: true,
      });
    } catch (e) {
      setError('CHART_INIT_ERROR');
      return;
    }

    chartRef.current = chart;

    // ── Candlestick series ───────────────────────────────────────────────────
    let series;
    try {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#00e896',
        downColor: '#ff4d4d',
        borderVisible: false,
        wickUpColor: 'rgba(0,232,150,0.7)',
        wickDownColor: 'rgba(255,77,77,0.7)',
      });
    } catch (e) {
      setError('API_MISMATCH');
      chart.remove();
      return;
    }
    seriesRef.current = series;

    // ── Volume histogram ─────────────────────────────────────────────────────
    let volumeSeries;
    try {
      volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.75, bottom: 0 },
        visible: false,
      });
      volumeSeriesRef.current = volumeSeries;
    } catch (_) { /* graceful: volume bars optional */ }

    // ── VWAP line ────────────────────────────────────────────────────────────
    let vwapSeries;
    try {
      vwapSeries = chart.addSeries(LineSeries, {
        color: 'rgba(255,184,0,0.8)',
        lineWidth: 1,
        lineStyle: 2, // dashed
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      vwapSeriesRef.current = vwapSeries;
    } catch (_) {}

    // ── SMA20 — subtle warm white, not blue (avoid rainbow) ─────────────────
    let sma20Series;
    try {
      sma20Series = chart.addSeries(LineSeries, {
        color: 'rgba(255,255,255,0.35)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      sma20Ref.current = sma20Series;
    } catch (_) {}

    // ── SMA50 — muted, off by default ────────────────────────────────────────
    let sma50Series;
    try {
      sma50Series = chart.addSeries(LineSeries, {
        color: 'rgba(167,139,250,0.45)',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      sma50Ref.current = sma50Series;
    } catch (_) {}

    const handleResize = () => {
      if (isDisposed || !chartContainerRef.current) return;
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });
    };
    window.addEventListener('resize', handleResize);

    const loadInitData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/market/chart/${symbol}?range=${timeframe.range}&interval=${timeframe.interval}`);
        const json = await res.json();
        if (isDisposed) return;
        if (!json.success || !json.data) throw new Error(json.error || 'AWAITING_DATA');

        const { timestamp, indicators } = json.data;
        if (!timestamp || !indicators?.quote?.[0]) throw new Error('MALFORMED_DATA');

        const quote = indicators.quote[0];
        const volumes = quote.volume || [];
        const rawData = timestamp.map((t, i) => ({
          time: t,
          open: quote.open[i],
          high: quote.high[i],
          low: quote.low[i],
          close: quote.close[i],
          volume: volumes[i] || 0,
        })).filter(d => d.open != null && d.close != null && d.high != null && d.low != null);

        if (!rawData.length) throw new Error('NO_SESSION_DATA');
        rawData.sort((a, b) => a.time - b.time);

        series.setData(rawData.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));

        // Volume bars with up/down colour
        if (volumeSeries && overlays.volume) {
          volumeSeries.setData(rawData.map(d => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? 'rgba(0,232,150,0.25)' : 'rgba(255,77,77,0.25)',
          })));
        }

        // VWAP
        if (vwapSeries && overlays.vwap) {
          vwapSeries.setData(computeVWAP(rawData));
        }

        // SMA20
        if (sma20Series && overlays.sma20 && rawData.length >= 20) {
          sma20Series.setData(computeSMA(rawData, 20));
        }

        // SMA50
        if (sma50Series && overlays.sma50 && rawData.length >= 50) {
          sma50Series.setData(computeSMA(rawData, 50));
        }

        chart.timeScale().fitContent();

        // Stats for the header
        const last = rawData[rawData.length - 1];
        const first = rawData[0];
        const high = Math.max(...rawData.map(d => d.high));
        const low = Math.min(...rawData.map(d => d.low));
        const totalVol = rawData.reduce((s, d) => s + d.volume, 0);
        setChartStats({ high, low, open: first.open, close: last.close, volume: totalVol, candles: rawData.length });

        setLoading(false);
      } catch (err) {
        if (isDisposed) return;
        const msg = err.message === 'NO_SESSION_DATA' ? 'Post-Market — Last Session' : err.message;
        setError(msg);

        // Sparkline fallback
        if (stock.sparkline?.length > 5) {
          const now = Math.floor(Date.now() / 1000);
          const sparkData = stock.sparkline.map((p, i) => ({
            time: now - (stock.sparkline.length - i) * 300,
            open: p, high: p, low: p, close: p, volume: 0,
          }));
          series.setData(sparkData);
          chart.timeScale().fitContent();
          setError(null);
        }

        setLoading(false);
      }
    };

    loadInitData();

    return () => {
      isDisposed = true;
      window.removeEventListener('resize', handleResize);
      if (chart) chart.remove();
    };
  }, [symbol, timeframe]); // eslint-disable-line

  return (
    <div className="relative w-full h-[480px] glass border border-white/5 bg-white/[0.01] rounded-sm flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex justify-between items-center px-4 py-2.5 border-b border-white/5 bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-gold" />
            <span className="font-syne font-black text-[10px] tracking-[0.2em] text-white uppercase">{symbol.split('.')[0]}</span>
            {chartStats && (
              <span className="text-[8px] font-mono text-muted hidden md:inline">
                H: ₹{chartStats.high?.toFixed(2)} · L: ₹{chartStats.low?.toFixed(2)}
              </span>
            )}
          </div>
          {/* Timeframe */}
          <div className="flex items-center gap-0.5 p-0.5 bg-black/40 rounded-sm border border-white/5">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.label}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded-sm font-mono text-[8px] font-black tracking-tighter transition-all ${
                  timeframe.label === tf.label
                    ? 'bg-gold text-black shadow-[0_0_8px_rgba(255,184,0,0.3)]'
                    : 'text-muted hover:text-white hover:bg-white/5'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Overlay toggles */}
          <div className="hidden md:flex items-center gap-1 p-0.5 bg-black/40 rounded-sm border border-white/5">
            {[
              { key: 'vwap', label: 'VWAP', color: 'text-gold' },
              { key: 'sma20', label: 'SMA20', color: 'text-blue-400' },
              { key: 'sma50', label: 'SMA50', color: 'text-purple-400' },
              { key: 'volume', label: 'VOL', color: 'text-white/40' },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setOverlays(o => ({ ...o, [key]: !o[key] }))}
                className={`px-2 py-1 rounded-sm font-mono text-[7px] font-black tracking-tighter transition-all ${
                  overlays[key] ? `bg-white/5 ${color}` : 'text-white/20 hover:text-white/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Live badge + % change */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-bull/10 border border-bull/20 text-[8px] font-mono font-bold tracking-widest text-bull uppercase">
            <div className="w-1 h-1 rounded-full bg-bull animate-pulse" />
            LIVE
          </div>
          <div className={`text-[10px] font-mono font-black ${isUp ? 'text-bull' : 'text-bear'}`}>
            {isUp ? '+' : ''}{stock.percent?.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* ── Chart area ── */}
      <div ref={chartContainerRef} className="flex-1 relative min-h-0">
        {loading && !error && <ChartSkeleton />}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-[#0a0a0c]/60 backdrop-blur-sm">
            <AlertCircle size={28} className="text-gold mb-3" />
            <span className="font-mono text-[9px] text-gold tracking-[0.3em] uppercase text-center px-4">{error}</span>
            {stock.sparkline?.length > 0 && (
              <span className="text-[7px] font-mono text-muted mt-2 tracking-widest">Using sparkline fallback</span>
            )}
          </div>
        )}
      </div>

      {/* ── Legend strip ── */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-white/5 bg-white/[0.01] shrink-0">
        {overlays.vwap && <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-gold/60" style={{borderTop:'1px dashed rgba(255,184,0,0.6)'}} /><span className="text-[7px] font-mono text-gold/60">VWAP</span></div>}
        {overlays.sma20 && <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-white/30" /><span className="text-[7px] font-mono text-white/30">SMA20</span></div>}
        {overlays.sma50 && <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-purple-400/40" /><span className="text-[7px] font-mono text-purple-400/40">SMA50</span></div>}
        {chartStats && (
          <div className="ml-auto flex items-center gap-3 text-[7px] font-mono text-muted">
            <span>Candles: {chartStats.candles}</span>
            {chartStats.volume > 0 && <span>Vol: {(chartStats.volume / 1e6).toFixed(1)}M</span>}
          </div>
        )}
        {/* Price watermark */}
        <div className="ml-auto flex items-baseline gap-1.5">
          <span className="font-mono text-xl font-black text-white/90 tabular-nums">₹{stock.price?.toLocaleString()}</span>
          <span className="text-[7px] font-mono text-muted/50 uppercase tracking-widest">LTP</span>
        </div>
      </div>
    </div>
  );
};
