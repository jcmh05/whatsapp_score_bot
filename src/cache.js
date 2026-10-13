class BoundedCache {
    constructor({ maximum = 500, ttlSeconds = 300 } = {}) {
        this.maximum = maximum; this.ttlSeconds = ttlSeconds; this.entries = new Map();
    }
    get(key) {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= Date.now()) { this.entries.delete(key); return undefined; }
        this.entries.delete(key); this.entries.set(key, entry);
        return entry.value;
    }
    set(key, value, ttlSeconds = this.ttlSeconds) {
        this.entries.delete(key);
        this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
        while (this.entries.size > this.maximum) this.entries.delete(this.entries.keys().next().value);
        return true;
    }
    del(key) { return Number(this.entries.delete(key)); }
    flushAll() { this.entries.clear(); }
    close() { this.entries.clear(); }
}
module.exports = { BoundedCache };
