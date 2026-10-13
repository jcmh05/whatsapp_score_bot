const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const axios = require('axios');
const moment = require('moment');
const User = require('../models/User');
const Fact = require('../models/Fact');
const MessageReceipt = require('../models/MessageReceipt');
const { recordScore } = require('../src/score');
const { ensureCurrentYear } = require('../src/year');
const { safeError } = require('../src/errors');
const { Supervisor } = require('../src/supervisor');
const { withTimeout } = require('../src/timeout');
const { NO_TEMPORAL_DATA } = require('../src/statistics');
const { loadBaileys } = require('../src/baileys');
const { initStores, InstanceLease } = require('../src/stores');
const { mongoAuthState } = require('../src/auth-store');
const { incomingMessage } = require('../src/messages');
const { Jobs } = require('../src/jobs');
const { Outbox } = require('../src/outbox');
const { eventually } = require('./fixtures/socket.cjs');
const database = `bot_check_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
const userId = '34123456789@c.us', sessionId = 'integration';
const date = '2026-10-13T19:00:00+02:00';
const silent = { error() {}, log() {} };
let stores, lease, lib, jobs;
const failures = [];

function incoming(body, id = randomUUID(), extra = {}) {
    return incomingMessage({ key: { id, remoteJid: 'fixture@g.us', participant: '987@lid', participantAlt: '34123456789@s.whatsapp.net' },
        messageTimestamp: Math.floor(+new Date(date) / 1000), pushName: 'Test', message: { conversation: body }, ...extra }, lib);
}
function makeJobs() {
    return new Jobs({ mongoose, stores, lease, sessionId, lib, logger: silent, fail: error => failures.push(error),
        resolveContact: async m => ({ id: m.phoneHint || m.sender, name: m.pushName }), prepareYear: async () => {} });
}
async function processMessage(body) {
    const message = incoming(body); await jobs.capture(message); await jobs.tick();
    const row = await stores.inbox.findOne({ _id: `${sessionId}/${message.id._serialized}` });
    assert.equal(row.state, 'done', `${body}: ${row.lastError || row.state}`);
    const effects = await stores.outbox.find({ sequence: row.sequence }).sort({ slot: 1 }).toArray();
    return { message, row, effects: effects.map(e => JSON.parse(e.payload, lib.BufferJSON.reviver)) };
}

async function businessTests() {
    await User.create({ _id: userId, displayName: 'Test', scoreYear: 2026, monthlyScores: { enero: 30, octubre: 19 },
        totalScore: 49, hours: {}, week: {}, importMetadata: { test: true } });
    const input = { id: userId, name: 'Test', body: '+1', date };
    const result = await Promise.all([recordScore({ ...input, messageId: 'same' }), recordScore({ ...input, messageId: 'same' })]);
    assert.equal(result.filter(r => r.duplicate).length, 1);
    assert.equal((await User.findById(userId)).totalScore, 50);
    await Promise.all([1, 2, 3].map(i => recordScore({ ...input, messageId: `parallel-${i}` })));
    assert.equal((await User.findById(userId)).totalScore, 53);
    assert.equal((await User.findById(userId)).importMetadata.test, true);
    await assert.rejects(recordScore({ ...input, date: '2027-01-01T12:00:00Z', messageId: 'wrong-year' }), /año/);
    assert.equal(await MessageReceipt.countDocuments({ _id: 'wrong-year' }), 0);
    console.log('Contadores: concurrencia, deduplicación, conservación de metadatos y rollback verificados.');

    await stores.state.updateOne({ _id: sessionId }, { $set: { cutoverAt: new Date(0) } });
    jobs = makeJobs();
    const pending = incoming('+1'); await jobs.capture(pending);
    const row = await stores.inbox.findOne({ _id: `${sessionId}/${pending.id._serialized}` });
    const commit = jobs.commit;
    jobs.commit = async () => { throw new Error('Caída simulada después de modificar puntos, antes de confirmar respuestas.'); };
    await assert.rejects(jobs.execute(row), /Caída simulada/);
    assert.equal((await User.findById(userId)).totalScore, 53);
    assert.equal(await MessageReceipt.countDocuments({ _id: pending.id._serialized }), 0);
    assert.equal(await stores.outbox.countDocuments({ sequence: row.sequence }), 0);
    jobs.commit = commit;
    jobs = makeJobs(); await jobs.tick();
    assert.equal((await User.findById(userId)).totalScore, 54);
    await jobs.capture(pending); await jobs.tick(); assert.equal((await User.findById(userId)).totalScore, 54);
    const done = await stores.inbox.findOne({ _id: row._id }); assert.equal(done.message, undefined);
    // Orden +1, -1, número incluso después de recrear el procesador.
    for (const body of ['+1', '-1', '25']) await jobs.capture(incoming(body));
    jobs = makeJobs(); for (let i = 0; i < 3; i++) await jobs.tick();
    let user = await User.findById(userId); assert.equal(user.monthlyScores.get('octubre'), 25); assert.equal(user.totalScore, 55);
    console.log('Cola: caída en transacción, recuperación de pendientes, orden y duplicados sin volver a sumar verificados.');

    await User.updateOne({ _id: userId }, { $set: { hours: {}, week: {}, 'monthlyScores.febrero': 10, totalScore: 65 } });
    const originalGet = axios.get; let downloads = 0;
    axios.get = async () => { downloads++; throw new Error('No se debe descargar una gráfica sin datos.'); };
    try {
        for (const body of ['/hours', '/hourschart', '/week', '/weekchart']) {
            const reply = await processMessage(body); assert.equal(reply.effects[0].content.text, NO_TEMPORAL_DATA);
        }
        assert.equal(downloads, 0);
        const png = await require('sharp')({ create: { width: 32, height: 32, channels: 3, background: 'brown' } }).png().toBuffer();
        axios.get = async url => {
            if (url.includes('geocoding')) return { data: { results: [{ name: 'Jaén', country: 'España', latitude: 37.77, longitude: -3.79 }] } };
            if (url.includes('open-meteo.com')) return { data: { daily: { time: ['2026-10-13', '2026-10-14'],
                temperature_2m_max: [25, 26], temperature_2m_min: [10, 11], weathercode: [0, 1], precipitation_probability_max: [5, 10] } } };
            downloads++; return { data: png };
        };
        await processMessage('+1');
        for (const body of ['/hourschart', '/weekchart', '/progress']) {
            const reply = await processMessage(body); assert(reply.effects.some(e => Buffer.isBuffer(e.content.image)), body);
        }
        await mongoose.connection.db.collection('users2025').insertOne({ _id: userId, displayName: 'Test', totalScore: 60, monthlyScores: { enero: 60 } });
        for (let i = 0; i < 2; i++) {
            const reply = await processMessage('/year:2025');
            assert.equal(reply.effects.filter(e => e.content.image).length, 2);
            assert(reply.effects.some(e => e.content.text?.includes('60')));
        }
        for (const body of ['hola', 'ping', '/average', '/commands', '/fluky:a,b', '/mes', '/status', '/top', '/hours', '/week', '/rewind', '/rewindchart', '/weather', '/weather:Jaen']) {
            const reply = await processMessage(body); assert(reply.effects.length > 0, body);
            if (body.startsWith('/rewind')) assert(reply.effects[0].content.text.includes('20 de diciembre'));
        }
    } finally { axios.get = originalGet; }
    await processMessage('/noreply'); jobs = makeJobs();
    const muted = await processMessage('27'); assert.equal(muted.effects.length, 0);
    await processMessage('/reply'); const unmuted = await processMessage('28'); assert.equal(unmuted.effects[0].content.react.text, '✅');
    const previousAdmin = process.env.ADMIN; process.env.ADMIN = userId;
    try {
        await processMessage('/addfact:dato de prueba'); assert.equal(await Fact.countDocuments(), 1);
        const factMessage = incoming('/fact'); await jobs.capture(factMessage);
        const factJob = await stores.inbox.findOne({ _id: `${sessionId}/${factMessage.id._serialized}` });
        const realCommit = jobs.commit; jobs.commit = async () => { throw new Error('Caída después de borrar el hecho.'); };
        try { await assert.rejects(jobs.execute(factJob), /Caída/); } finally { jobs.commit = realCommit; }
        assert.equal(await Fact.countDocuments(), 1, 'El hecho se conserva si no pudo confirmar su respuesta.');
        await jobs.tick(); assert.equal(await Fact.countDocuments(), 0);
        const factReply = await stores.outbox.findOne({ sequence: factJob.sequence });
        assert.equal(JSON.parse(factReply.payload).content.text, 'dato de prueba');
    } finally { if (previousAdmin === undefined) delete process.env.ADMIN; else process.env.ADMIN = previousAdmin; }
    const invalid = incoming('999999999999999999999'); await jobs.capture(invalid); await jobs.tick();
    assert.equal((await User.findById(userId)).monthlyScores.get('octubre'), 28);
    assert.equal((await stores.inbox.findOne({ _id: `${sessionId}/${invalid.id._serialized}` })).state, 'failed');
    const poison = incoming('29'); await jobs.capture(poison);
    await stores.inbox.updateOne({ _id: `${sessionId}/${poison.id._serialized}` }, { $set: { state: 'processing', attempts: 3 } });
    await jobs.tick(); assert.equal((await User.findById(userId)).monthlyScores.get('octubre'), 28);
    assert.equal((await stores.inbox.findOne({ _id: `${sessionId}/${poison.id._serialized}` })).state, 'failed');
    await processMessage('/top');
    console.log('Comandos: puntajes, gráficas, /year repetido, estadísticas vacías, rewind, mute persistente y hechos atómicos verificados.');

    await ensureCurrentYear('2027-01-01T12:00:00Z');
    user = await User.findById(userId); assert.equal(user.scoreYear, 2027); assert.equal(user.totalScore, 0);
    const archived = await mongoose.connection.db.collection('users2026').findOne({ _id: userId });
    assert.equal(archived.monthlyScores.octubre, 28);
    await ensureCurrentYear('2027-01-01T12:00:00Z'); assert.equal(await mongoose.connection.db.collection('users2026').countDocuments(), 1);
    assert.deepEqual(failures, []);
    console.log('Archivo anual: transición atómica e idempotente verificada.');
}

async function persistenceTests() {
    let auth = await mongoAuthState({ mongoose, stores, lease, sessionId, lib });
    auth.state.creds.registered = true; await auth.saveCreds();
    const key = { public: Buffer.from([1, 2, 3]), private: Buffer.from([4, 5, 6]) };
    await auth.state.keys.set({ 'pre-key': { '123': key }, 'app-state-sync-key': { '456': { keyData: Buffer.from([7, 8]) } } });
    auth = await mongoAuthState({ mongoose, stores, lease, sessionId, lib });
    assert.equal(auth.state.creds.registered, true);
    assert.deepEqual((await auth.state.keys.get('pre-key', ['123']))['123'], key);
    assert(Buffer.isBuffer((await auth.state.keys.get('app-state-sync-key', ['456']))['456'].keyData));
    await auth.state.keys.set({ 'pre-key': { '123': null } }); assert.deepEqual(await auth.state.keys.get('pre-key', ['123']), {});
    const second = new InstanceLease(stores, sessionId); assert.equal(await second.acquire(), false);
    await stores.leases.updateOne({ _id: sessionId }, { $set: { expiresAt: new Date(0) } });
    assert.equal(await second.acquire(), true);
    await assert.rejects(auth.saveCreds(), /instancia/);
    await assert.rejects(auth.state.keys.set({ 'pre-key': { 'new': key } }), /instancia/);
    assert.equal(await stores.auth.countDocuments({ keyId: 'new' }), 0);
    await second.release(); assert.equal(await lease.acquire(), true);
    auth = await mongoAuthState({ mongoose, stores, lease, sessionId, lib });
    await auth.invalidate();
    const fresh = await mongoAuthState({ mongoose, stores, lease, sessionId, lib });
    assert.equal(fresh.state.creds.registered, false);
    assert.equal(await stores.auth.countDocuments({ generation: 1 }) > 0, true);
    console.log('Sesión: claves binarias, guardado inmediato, restauración, borrado de claves, exclusión y revocación conservando respaldo verificados.');

    await stores.outbox.deleteMany({});
    const outbox = new Outbox({ stores, sessionId, lib, logger: silent, fail: e => failures.push(e), ackTimeoutMs: 1 });
    const row = { _id: 'outgoing-test', sessionId, sequence: 1, slot: 0, wireId: lib.generateMessageIDV2(),
        state: 'pending', attempts: 0, nextAttemptAt: new Date(), payload: JSON.stringify({ to: 'fixture@g.us', content: { text: 'respuesta' } }) };
    await stores.outbox.insertOne(row);
    const ids = [];
    const socket = { ws: { isOpen: true }, sendMessage: async (_to, content, opts) => {
        ids.push(opts.messageId); await outbox.remember({ conversation: content.text });
    } };
    await outbox.tick(socket); assert.equal((await stores.outbox.findOne({ _id: row._id })).state, 'awaiting_ack');
    const restarted = new Outbox({ stores, sessionId, lib, logger: silent, fail: e => failures.push(e), ackTimeoutMs: 1 });
    await stores.outbox.updateOne({ _id: row._id }, { $set: { nextAttemptAt: new Date(0) } });
    socket.sendMessage = async (_to, _content, opts) => { ids.push(opts.messageId); await restarted.ack(opts.messageId); };
    await restarted.tick(socket);
    assert.deepEqual(ids, [row.wireId, row.wireId]); assert.equal((await stores.outbox.findOne({ _id: row._id })).state, 'sent');
    assert.equal((await restarted.getMessage({ id: row.wireId })).conversation, 'respuesta');
    const failed = { ...row, _id: 'retry-test', wireId: lib.generateMessageIDV2(), sequence: 2 };
    await stores.outbox.insertOne(failed); socket.sendMessage = async () => { throw new Error('red caída'); };
    await restarted.tick(socket); assert.equal((await stores.outbox.findOne({ _id: failed._id })).state, 'pending');
    await stores.outbox.updateOne({ _id: failed._id }, { $set: { attempts: 8, nextAttemptAt: new Date(0) } });
    await restarted.tick(socket); assert.equal((await stores.outbox.findOne({ _id: failed._id })).state, 'failed');
    console.log('Salida: ACK recibido antes de terminar el envío, recuperación sin ACK con el mismo ID, protobuf para reenvíos y fallo de red verificados.');
}

async function runtimeTests() {
    await User.deleteMany({}); await lease.release();
    const portSocket = net.createServer(); await new Promise(resolve => portSocket.listen(0, '127.0.0.1', resolve));
    const port = portSocket.address().port; await new Promise(resolve => portSocket.close(resolve));
    const uri = new URL(process.env.MONGODB_URI); uri.pathname = `/${database}`;
    const supervisor = new Supervisor({ entry: path.join(__dirname, 'fixtures', 'runtime-worker.cjs'),
        baseDelay: 30, maxDelay: 30, checkInterval: 100, shutdownTimeout: 5000, logger: silent,
        spawn: (entry, args) => fork(entry, args, { stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
            env: { ...process.env, MONGODB_URI: uri.href, BOT_PHONE: '34123456789', SESSION_ID: 'runtime-test', PORT: String(port) } }) });
    function waitState(child, state) {
        return withTimeout(new Promise(resolve => {
            const listener = m => { if (m?.type === 'heartbeat' && m.state === state) { child.off('message', listener); resolve(); } };
            child.on('message', listener);
        }), 30000, `Estado ${state}`);
    }
    async function authenticate(child) { const ready = waitState(child, 'ready'); child.send({ type: 'authenticate' }); await ready; }
    try {
        supervisor.start(); let child = supervisor.child;
        await waitState(child, 'awaiting_qr');
        assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
        assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 503);
        await authenticate(child); assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 200);
        const qr = waitState(child, 'awaiting_qr'); child.send({ type: 'disconnect' }); await qr;
        assert.equal(supervisor.child.pid, child.pid, 'Una caída de red no debe reiniciar Node.'); await authenticate(child);
        child.send({ type: 'incoming', id: 'runtime-score', body: '+1' });
        await eventually(async () => (await User.findById(userId))?.totalScore === 1, 15000);
        let respawn = once(supervisor, 'spawn'); child.send({ type: 'fatal' });
        [child] = await withTimeout(respawn, 30000, 'Reinicio por error interno');
        await waitState(child, 'awaiting_qr'); await authenticate(child);
        child.send({ type: 'incoming', id: 'runtime-score', body: '+1' });
        await new Promise(resolve => setTimeout(resolve, 500)); assert.equal((await User.findById(userId)).totalScore, 1);
        supervisor.heartbeatTimeout = 700; respawn = once(supervisor, 'spawn'); child.send({ type: 'hang' });
        [child] = await withTimeout(respawn, 10000, 'Reinicio por bloqueo del event loop');
        supervisor.heartbeatTimeout = 90000;
        // Tras SIGKILL la lease expira; el nuevo proceso mantiene HTTP en standby.
        await eventually(async () => { try { return (await (await fetch(`http://127.0.0.1:${port}/healthz`)).json()).state === 'standby'; } catch { return false; } }, 30000);
        assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 503);
        const standbyQr = waitState(child, 'awaiting_qr');
        await stores.leases.updateOne({ _id: 'runtime-test' }, { $set: { expiresAt: new Date(0) } });
        await standbyQr; await authenticate(child);
        console.log('Proceso real: HTTP, QR, reconexión sin reiniciar Node, escritura, duplicados, fallo interno, bloqueo y standby verificados (socket simulado).');
    } finally {
        const stopped = once(supervisor, 'stopped'); supervisor.stop(); await withTimeout(stopped, 10000, 'Cierre del supervisor');
    }
}

async function main() {
    if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI para las pruebas de integración.');
    const originalNow = moment.now; moment.now = () => +new Date(date);
    mongoose.set('transactionAsyncLocalStorage', true); mongoose.set('bufferCommands', false);
    try {
        await mongoose.connect(process.env.MONGODB_URI, { dbName: database, serverSelectionTimeoutMS: 15000 });
        assert.equal(mongoose.connection.db.databaseName, database);
        await Promise.all([User.init(), MessageReceipt.init(), Fact.init()]);
        lib = await loadBaileys(); stores = await initStores(mongoose, sessionId); lease = new InstanceLease(stores, sessionId);
        assert.equal(await lease.acquire(), true);
        const renew = setInterval(() => lease.renew().catch(e => failures.push(e)), 5000);
        try { await businessTests(); await persistenceTests(); } finally { clearInterval(renew); }
        await runtimeTests(); assert.deepEqual(failures, []);
        console.log('Integración completa en base temporal. La cuenta y las colecciones de producción no se han utilizado.');
    } finally {
        moment.now = originalNow;
        try {
            if (mongoose.connection.readyState === 1) {
                assert(/^bot_check_[a-f0-9]{24}$/.test(database)); assert.equal(mongoose.connection.db.databaseName, database);
                await mongoose.connection.db.dropDatabase();
            }
        } finally { await mongoose.disconnect(); }
    }
}
main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
