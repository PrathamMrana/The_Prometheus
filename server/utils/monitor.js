const os = require('os');

class Monitor {
    constructor() {
        this.startTime = Date.now();
        this.metrics = {
            orders_processed: 0,
            failed_orders: 0,
            reconnects: 0,
            last_heartbeat: Date.now()
        };
    }

    getHealth() {
        const brokerManager = require('../execution/brokerManager');
        return {
            status: 'OPERATIONAL',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: os.loadavg(),
            metrics: this.metrics,
            broker_mode: brokerManager.mode,
            timestamp: Date.now()
        };
    }

    increment(metric) {
        if (this.metrics[metric] !== undefined) {
            this.metrics[metric]++;
        }
    }
}

module.exports = new Monitor();
