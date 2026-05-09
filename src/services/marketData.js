const API = 'http://localhost:3001/api'

let cache = {}
let lastFetch = {}

const call = async (url, key) => {
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        cache[key] = json
        lastFetch[key] = Date.now()
        return json
    } catch (err) {
        console.error(`[Prometheus] ${key} failed:`, err.message)
        return cache[key] || null
    }
}

// US Market
export const fetchUSQuotes = () => call(`${API}/us/quotes`, 'us_quotes')
export const fetchUSStatus = () => call(`${API}/us/status`, 'us_status')
export const fetchUSQuote = (sym) => call(`${API}/us/quote/${sym}`, `us_${sym}`)

// India Market
export const fetchIndiaQuotes = () => call(`${API}/india/quotes`, 'india_quotes')
export const fetchIndiaStatus = () => call(`${API}/india/status`, 'india_status')
export const fetchIndiaMovers = () => call(`${API}/india/movers`, 'india_movers')
export const fetchIndiaQuote = (sym) => call(`${API}/india/quote/${sym}`, `in_${sym}`)

// Shared
export const fetchFearGreed = () => call(`${API}/feargreed`, 'feargreed')
export const fetchNews = () => call(`${API}/news`, 'news')
export const fetchSparkline = (sym) => call(`${API}/sparkline/${encodeURIComponent(sym)}`, `spark_${sym}`)
export const searchStocks = (q) => call(`${API}/search/${q}`, `search_${q}`)

// Helpers
export const formatINR = (n) => n ? `₹${parseFloat(n).toLocaleString('en-IN')}` : '—'
export const formatUSD = (n) => n ? `$${parseFloat(n).toLocaleString('en-US')}` : '—'
export const formatPct = (n) => {
    if (n === null || n === undefined) return { text: '—', positive: null }
    return { text: `${n >= 0 ? '+' : ''}${parseFloat(n).toFixed(2)}%`, positive: n >= 0 }
}

export const getFreshness = (key) => {
    const age = lastFetch[key] ? Date.now() - lastFetch[key] : null
    if (!age) return { label: 'OFFLINE', color: '#555555' }
    if (age < 15000) return { label: 'LIVE', color: '#00ff88' }
    if (age < 60000) return { label: 'RECENT', color: '#f0a500' }
    return { label: 'DELAYED', color: '#ff3b3b' }
}
