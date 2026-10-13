const { randomUUID } = require('node:crypto');

async function initStores(mongoose, sessionId) {
    const db = mongoose.connection.db;
    const stores = Object.fromEntries(['state', 'leases', 'inbox', 'outbox', 'auth'].map(name =>
        [name, db.collection(name === 'auth' ? 'baileys_auth' : `bot_${name}`)]));
    await Promise.all([
        stores.inbox.createIndex({ sessionId: 1, sequence: 1 }, { unique: true }),
        stores.inbox.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        stores.outbox.createIndex({ sessionId: 1, wireId: 1 }, { unique: true }),
        stores.outbox.createIndex({ sessionId: 1, state: 1, nextAttemptAt: 1, sequence: 1, slot: 1 }),
        stores.outbox.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        stores.auth.createIndex({ sessionId: 1, generation: 1, category: 1, keyId: 1 }, { unique: true })
    ]);
    await stores.state.updateOne({ _id: sessionId }, { $setOnInsert: {
        cutoverAt: new Date(), shouldReply: true, sequence: 0, authGeneration: 1
    } }, { upsert: true });
    return stores;
}

class InstanceLease {
    constructor(stores, sessionId, { durationMs = 45000, owner = randomUUID() } = {}) {
        Object.assign(this, { stores, sessionId, durationMs, owner });
        this.held = false;
    }
    get valid() { return this.held && +this.expiresAt > Date.now(); }
    async acquire() {
        const now = new Date();
        try {
            const result = await this.stores.leases.findOneAndUpdate({ _id: this.sessionId,
                $or: [{ owner: this.owner }, { expiresAt: { $lte: now } }] },
            { $set: { owner: this.owner, expiresAt: new Date(+now + this.durationMs) }, $inc: { generation: 1 } },
            { upsert: true, returnDocument: 'after' });
            this.held = Boolean(result);
            this.expiresAt = result?.expiresAt;
            return this.held;
        } catch (error) { if (error.code === 11000) { this.held = false; return false; } throw error; }
    }
    async renew() {
        const now = new Date();
        const result = await this.stores.leases.updateOne({ _id: this.sessionId, owner: this.owner, expiresAt: { $gt: now } },
            { $set: { expiresAt: new Date(+now + this.durationMs) } });
        if (!result.matchedCount) throw Object.assign(new Error('La instancia ha perdido la lease de WhatsApp.'), { fatal: true });
        this.expiresAt = new Date(+now + this.durationMs);
    }
    async fence(session) {
        const result = await this.stores.leases.updateOne({ _id: this.sessionId, owner: this.owner, expiresAt: { $gt: new Date() } },
            { $inc: { checkpoint: 1 } }, { session });
        if (!result.matchedCount) throw Object.assign(new Error('Otra instancia posee la sesión; operación cancelada.'), { fatal: true });
    }
    async release() {
        await this.stores.leases.deleteOne({ _id: this.sessionId, owner: this.owner });
        this.held = false;
    }
}

module.exports = { initStores, InstanceLease };
