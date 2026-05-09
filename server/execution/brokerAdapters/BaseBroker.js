/**
 * 🛡️ PROMETHEUS BROKER ABSTRACTION LAYER
 * Defines the mandatory interface for all institutional broker integrations.
 */
class BaseBroker {
    constructor(config) {
        this.config = config;
        this.isConnected = false;
    }

    // --- Lifecycle ---
    async connect() { throw new Error("NOT_IMPLEMENTED"); }
    async disconnect() { throw new Error("NOT_IMPLEMENTED"); }

    // --- Trading ---
    async placeOrder(order) { throw new Error("NOT_IMPLEMENTED"); }
    async modifyOrder(orderId, updates) { throw new Error("NOT_IMPLEMENTED"); }
    async cancelOrder(orderId) { throw new Error("NOT_IMPLEMENTED"); }

    // --- Data Sync ---
    async getHoldings() { throw new Error("NOT_IMPLEMENTED"); }
    async getPositions() { throw new Error("NOT_IMPLEMENTED"); }
    async getOrders() { throw new Error("NOT_IMPLEMENTED"); }
    async getBalance() { throw new Error("NOT_IMPLEMENTED"); }

    // --- Live Stream ---
    subscribeTicks(symbols, callback) { throw new Error("NOT_IMPLEMENTED"); }
}

module.exports = BaseBroker;
