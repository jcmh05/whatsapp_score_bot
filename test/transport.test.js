const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBaileys } = require('../src/baileys');
const { incomingMessage, OutputPlan } = require('../src/messages');
const { MessageMedia } = require('../src/media');
const { WhatsAppConnection } = require('../src/connection');
const { BoundedCache } = require('../src/cache');
const { FakeSocket, eventually } = require('./fixtures/socket.cjs');
const { checkTransport } = require('../scripts/check-transport');
const sender = '34123456789@s.whatsapp.net', group = '123456@g.us';

test('normaliza mensajes efímeros, PN/LID y claves de grupo sin importar historial o mensajes propios', async () => {
    const lib = await loadBaileys();
    const raw = { key: { id: 'native-id', remoteJid: group, participant: '987@lid', participantAlt: sender },
        messageTimestamp: 1791900000, pushName: 'Test',
        message: { ephemeralMessage: { message: { extendedTextMessage: { text: ' +1 ' } } } } };
    const message = incomingMessage(raw, lib);
    assert.equal(message.body, '+1'); assert.equal(message.phoneHint, '34123456789@c.us');
    assert.equal(message.author, '987@lid'); assert.equal(message.key.participant, '987@lid');
    assert.equal(incomingMessage({ ...raw, key: { ...raw.key, fromMe: true } }, lib), null);
    assert.equal(incomingMessage({ ...raw, message: { imageMessage: { caption: '+1' } } }, lib), null);
    const plan = new OutputPlan(message, { id: '34123456789@c.us', name: 'Test' });
    await plan.adaptedMessage().reply('1✅'); await plan.adaptedMessage().react('✅');
    await plan.sendMessage(group, new MessageMedia('image/png', Buffer.from('chart').toString('base64')), { caption: 'Progreso' });
    assert.deepEqual(plan.effects[0].quoted.key, message.key);
    assert.deepEqual(plan.effects[1].content.react.key, message.key);
    assert(Buffer.isBuffer(plan.effects[2].content.image));
});
test('reconecta una sola vez, persiste credenciales y descarta eventos de sockets anteriores', async () => {
    const lib = await loadBaileys(), sockets = [], failures = [];
    let saved = 0, invalidated = 0;
    const outbox = { getMessage: async () => undefined, remember: async m => m, ack: async () => {} };
    const connection = new WhatsAppConnection({ lib, options: { sessionId: 'test', botPhone: '12025550100' }, outbox,
        fail: e => failures.push(e), reconnectBaseMs: 5,
        socketFactory: config => { const socket = new FakeSocket(config); sockets.push(socket); return socket; },
        authFactory: async () => ({ state: { creds: lib.initAuthCreds(), keys: { get: async () => ({}), set: async () => {} } },
            saveCreds: async () => { saved++; }, flush: async () => {}, invalidate: async () => { invalidated++; } }) });
    try {
        await connection.start();
        assert.equal(sockets[0].config.syncFullHistory, false);
        const history = lib.proto.HistorySync.HistorySyncType;
        assert.equal(sockets[0].config.shouldSyncHistoryMessage({ syncType: history.INITIAL_BOOTSTRAP }), true);
        assert.equal(sockets[0].config.shouldSyncHistoryMessage({ syncType: history.RECENT }), false);
        assert.equal(sockets[0].config.shouldSyncHistoryMessage({ syncType: history.FULL }), false);
        sockets[0].ev.emit('creds.update', {}); sockets[0].open();
        await eventually(() => connection.ready);
        assert.equal(saved, 1);
        sockets[0].disconnect(); sockets[0].disconnect();
        await eventually(() => sockets.length === 2);
        assert(sockets[0].ended); assert.equal(connection.ready, false);
        sockets[0].ev.emit('connection.update', { connection: 'open' });
        await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(connection.ready, false);
        sockets[1].open(); await eventually(() => connection.ready);
        assert.deepEqual(await connection.resolveContact({ sender: '987@lid', pushName: 'Test' }), { id: '34123456789@c.us', name: 'Test' });
        sockets[1].disconnect(lib.DisconnectReason.loggedOut);
        await eventually(() => sockets.length === 3); assert.equal(invalidated, 1);
        assert.deepEqual(failures, []);
    } finally { await connection.stop(); }
});
test('una cuenta equivocada y una sesión reemplazada se detienen con un error explícito', async () => {
    const lib = await loadBaileys(), failures = [], accepted = []; let socket;
    const connection = new WhatsAppConnection({ lib, options: { sessionId: 'test', botPhone: '99999999999' },
        outbox: {}, fail: e => failures.push(e), socketFactory: config => (socket = new FakeSocket(config)),
        authFactory: async () => ({ state: { creds: lib.initAuthCreds(), keys: {} }, flush: async () => {} }) });
    try {
        connection.on('messages', update => accepted.push(update));
        await connection.start(); socket.open(); socket.ev.emit('messages.upsert', { type: 'notify', messages: [] });
        await eventually(() => failures.length === 1);
        assert.equal(failures[0].exitCode, 2); assert.equal(connection.ready, false);
        assert.deepEqual(accepted, [], 'No se acepta ningún mensaje de una cuenta equivocada.');
        socket.disconnect(lib.DisconnectReason.connectionReplaced); await eventually(() => failures.length === 2);
        assert.equal(failures[1].exitCode, 2);
    } finally { await connection.stop(); }
});
test('las caches no crecen con el historial ni guardan entradas expiradas', () => {
    const cache = new BoundedCache({ maximum: 2 });
    cache.set('a', 1); cache.set('b', 2); cache.get('a'); cache.set('c', 3);
    assert.equal(cache.get('b'), undefined); assert.equal(cache.get('a'), 1);
    cache.set('expired', 4, -1); assert.equal(cache.get('expired'), undefined); cache.close();
    assert.equal(cache.entries.size, 0);
});
test('las dependencias nativas generan credenciales, texto, imagen y reacción válidos', checkTransport);
