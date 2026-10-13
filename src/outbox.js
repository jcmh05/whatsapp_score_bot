const { AsyncLocalStorage } = require('node:async_hooks');
const { withTimeout } = require('./timeout');
const { safeError } = require('./errors');

class Outbox {
    constructor({ stores, sessionId, lib, lease, logger = console, fail, ackTimeoutMs = 30000 }) {
        Object.assign(this, { stores, sessionId, lib, lease, logger, fail, ackTimeoutMs });
        this.scope = new AsyncLocalStorage(); this.busy = false; this.stopped = false;
    }
    async remember(message) {
        const id = this.scope.getStore();
        if (id) await this.stores.outbox.updateOne({ _id: id },
            { $set: { wirePayload: JSON.stringify(message, this.lib.BufferJSON.replacer) } });
        return message;
    }
    async getMessage(key) {
        const row = await this.stores.outbox.findOne({ sessionId: this.sessionId, wireId: key.id });
        return row?.wirePayload ? JSON.parse(row.wirePayload, this.lib.BufferJSON.reviver) : undefined;
    }
    async ack(wireId, error) {
        if (!wireId || this.stopped) return;
        await this.stores.outbox.updateOne({ sessionId: this.sessionId, wireId, ...(error ? { state: { $ne: 'sent' } } : {}) }, { $set: error ? {
            state: 'failed', lastError: `WhatsApp rechazó el envío (${error}).`
        } : { state: 'sent', sentAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400000) } });
    }
    async tick(socket) {
        if (!socket?.ws?.isOpen || this.stopped || this.busy) return;
        this.busy = true;
        try {
            const row = await this.stores.outbox.findOne({ sessionId: this.sessionId,
                state: { $in: ['pending', 'sending', 'awaiting_ack'] } }, { sort: { sequence: 1, slot: 1 } });
            if (!row || +row.nextAttemptAt > Date.now()) return;
            const attempts = row.attempts + 1;
            if (attempts > 8) {
                await this.stores.outbox.updateOne({ _id: row._id, state: { $ne: 'sent' } },
                    { $set: { state: 'failed', lastError: 'No llegó confirmación de WhatsApp tras ocho intentos.' } });
                return;
            }
            if (this.lease) await this.lease.fence();
            const claim = await this.stores.outbox.updateOne({ _id: row._id, state: { $in: ['pending', 'sending', 'awaiting_ack'] } }, { $set: {
                state: 'sending', attempts, nextAttemptAt: new Date(Date.now() + this.ackTimeoutMs)
            } });
            if (!claim.matchedCount || this.stopped || !socket.ws.isOpen) return;
            const payload = JSON.parse(row.payload, this.lib.BufferJSON.reviver);
            try {
                await this.scope.run(row._id, () => withTimeout(socket.sendMessage(payload.to, payload.content, {
                    messageId: row.wireId, ...(payload.quoted ? { quoted: payload.quoted } : {}),
                    getUrlInfo: async () => undefined
                }), 45000, 'Envío persistente'));
                await this.stores.outbox.updateOne({ _id: row._id, state: 'sending' },
                    { $set: { state: 'awaiting_ack', nextAttemptAt: new Date(Date.now() + this.ackTimeoutMs) } });
            } catch (error) {
                if (/Envío persistente: tiempo/.test(error.message)) { this.fail(error); return; }
                this.logger.error(`Envío pendiente (intento ${attempts}):`, error);
                await this.stores.outbox.updateOne({ _id: row._id, state: { $nin: ['sent', 'failed'] } }, { $set: {
                    state: 'pending', lastError: safeError(error).slice(0, 500),
                    nextAttemptAt: new Date(Date.now() + Math.min(60000, 1000 * 2 ** attempts))
                } });
            }
        } catch (error) { this.fail(error); }
        finally { this.busy = false; }
    }
}

module.exports = { Outbox };
