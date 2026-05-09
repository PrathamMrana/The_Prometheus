const BaseBroker = require('./BaseBroker');
const fetch = require('node-fetch');

class AlpacaAdapter extends BaseBroker {
    constructor(config) {
        super(config);
        this.baseUrl = config.baseUrl || 'https://paper-api.alpaca.markets';
        this.headers = {
            'APCA-API-KEY-ID': config.apiKey,
            'APCA-API-SECRET-KEY': config.secretKey,
            'Content-Type': 'application/json'
        };
    }

    async connect() {
        try {
            const res = await fetch(`${this.baseUrl}/v2/account`, { headers: this.headers });
            if (!res.ok) throw new Error(`ALPACA_CONN_ERROR: ${res.statusText}`);
            this.isConnected = true;
            console.log("✅ [ALPACA] Successfully connected to broker.");
            return true;
        } catch (e) {
            console.error("❌ [ALPACA] Connection failed:", e.message);
            return false;
        }
    }

    async getBalance() {
        const res = await fetch(`${this.baseUrl}/v2/account`, { headers: this.headers });
        const data = await res.json();
        return parseFloat(data.buying_power);
    }

    async placeOrder(order) {
        const payload = {
            symbol: order.symbol.split('.')[0], // Alpaca uses simple symbols
            qty: order.qty.toString(),
            side: order.side.toLowerCase(),
            type: order.type.toLowerCase(),
            time_in_force: 'gtc'
        };

        if (order.type === 'LIMIT') payload.limit_price = order.price.toString();

        const res = await fetch(`${this.baseUrl}/v2/orders`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(`ALPACA_ORDER_REJECTED: ${data.message || res.statusText}`);

        return {
            orderId: data.id,
            status: data.status,
            price: parseFloat(data.filled_avg_price || order.price),
            qty: parseFloat(data.filled_qty || 0),
            raw: data
        };
    }

    async cancelOrder(orderId) {
        const res = await fetch(`${this.baseUrl}/v2/orders/${orderId}`, {
            method: 'DELETE',
            headers: this.headers
        });
        return res.ok;
    }

    async getPositions() {
        const res = await fetch(`${this.baseUrl}/v2/positions`, { headers: this.headers });
        return await res.json();
    }
}

module.exports = AlpacaAdapter;
