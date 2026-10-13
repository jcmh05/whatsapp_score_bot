// Prueba optativa de la primera conexión real, sin vincular ninguna cuenta.
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { loadBaileys } = require('../src/baileys');
const { initStores, InstanceLease } = require('../src/stores');
const { WhatsAppConnection } = require('../src/connection');
const { withTimeout } = require('../src/timeout');
const { safeError } = require('../src/errors');
const database = `bot_pair_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
async function main() {
    let connection, lease;
    try {
        await mongoose.connect(process.env.MONGODB_URI, { dbName: database, serverSelectionTimeoutMS: 15000 });
        assert.equal(mongoose.connection.db.databaseName, database);
        const stores = await initStores(mongoose, 'anonymous-pairing-check');
        lease = new InstanceLease(stores, 'anonymous-pairing-check'); assert(await lease.acquire());
        const lib = await loadBaileys();
        let rejectFailure;
        const failure = new Promise((_resolve, reject) => { rejectFailure = reject; });
        connection = new WhatsAppConnection({ mongoose, stores, lease, options: { sessionId: 'anonymous-pairing-check' }, lib,
            outbox: { getMessage: async () => undefined, remember: async m => m, ack: async () => {} }, fail: rejectFailure });
        const qr = new Promise(resolve => connection.once('qr', value => { assert(value.length > 50); resolve(); }));
        await connection.start(); await withTimeout(Promise.race([qr, failure]), 30000, 'QR inicial de WhatsApp');
        assert.equal(connection.state, 'awaiting_qr'); assert.equal(connection.ready, false);
        console.log(`Conexión real comprobada: handshake con WhatsApp y QR inicial generado. Sin vincular cuenta. RSS ${Math.round(process.memoryUsage().rss / 1048576)} MiB.`);
    } finally {
        if (connection) await connection.stop();
        if (lease?.held) await lease.release();
        try {
            if (mongoose.connection.readyState === 1) {
                assert(/^bot_pair_[a-f0-9]{24}$/.test(database)); assert.equal(mongoose.connection.db.databaseName, database);
                await mongoose.connection.db.dropDatabase();
            }
        } finally { await mongoose.disconnect(); }
    }
}
main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
