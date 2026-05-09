class PrometheusCache {
    constructor() {
        this.cache = new Map();
    }
    set(key, value, ttlSeconds) {
        this.cache.set(key, { value, exp: Date.now() + ttlSeconds * 1000 });
    }
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.exp) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }
}
module.exports = new PrometheusCache();
