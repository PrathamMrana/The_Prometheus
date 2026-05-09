// Finnhub WebSocket — US stocks stream in real-time free
export class PrometheusWebSocket {
    constructor(onTrade, onStatus) {
        this.onTrade = onTrade
        this.onStatus = onStatus
        this.socket = null
        this.timer = null
        this.apiKey = null
        // US stocks only — WebSocket works for these
        this.symbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'META', 'AMZN', 'NFLX', 'JPM', 'NFLX']
    }

    connect(apiKey) {
        this.apiKey = apiKey
        try {
            this.socket = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`)

            this.socket.onopen = () => {
                this.onStatus?.('LIVE')
                this.symbols.forEach(s => {
                    this.socket.send(JSON.stringify({ type: 'subscribe', symbol: s }))
                })
            }

            this.socket.onmessage = (e) => {
                const msg = JSON.parse(e.data)
                if (msg.type === 'trade') {
                    msg.data?.forEach(t => {
                        this.onTrade({ symbol: t.s, price: parseFloat(t.p.toFixed(2)), volume: t.v })
                    })
                }
            }

            this.socket.onclose = () => {
                this.onStatus?.('RECONNECTING')
                this.timer = setTimeout(() => this.connect(this.apiKey), 5000)
            }

            this.socket.onerror = () => this.onStatus?.('ERROR')

        } catch (err) {
            console.error('[WS] Failed:', err)
        }
    }

    disconnect() {
        clearTimeout(this.timer)
        if (this.socket) {
            this.symbols.forEach(s => {
                try { this.socket.send(JSON.stringify({ type: 'unsubscribe', symbol: s })) } catch { }
            })
            this.socket.close()
        }
    }
}
