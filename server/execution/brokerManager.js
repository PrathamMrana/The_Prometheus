const AlpacaAdapter = require('./brokerAdapters/AlpacaAdapter');
const PortfolioManager = require('./portfolioManager');

class BrokerManager {
    constructor() {
        this.broker = null;
        this.mode = process.env.BROKER_MODE || 'SIMULATION'; // SIMULATION | LIVE
        
        if (this.mode === 'LIVE') {
            this.broker = new AlpacaAdapter({
                apiKey: process.env.ALPACA_KEY,
                secretKey: process.env.ALPACA_SECRET,
                baseUrl: process.env.ALPACA_BASE_URL
            });
            this.broker.connect().then(success => {
                if (!success) {
                    console.warn("⚠️ [BROKER_MANAGER] Live connection failed. Falling back to LIVE_SIMULATION.");
                    this.mode = 'LIVE_SIMULATION';
                } else {
                    console.log("🚀 [BROKER_MANAGER] Running in LIVE PILOT mode.");
                }
            });
        } else {
            console.log("🛡️ [BROKER_MANAGER] Running in SIMULATION mode.");
        }
    }

    async placeOrder(order, marketCache) {
        if (this.mode === 'SIMULATION' || this.mode === 'LIVE_SIMULATION') {
            return null;
        }

        try {
            const result = await this.broker.placeOrder(order);
            return { success: true, ...result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async getExternalBalance() {
        if (this.mode === 'SIMULATION') return 0;
        return await this.broker.getBalance();
    }
}

module.exports = new BrokerManager();
