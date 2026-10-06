// Pruebas optativas en una base temporal. No se usan las colecciones de producción.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const axios = require('axios');
const User = require('../models/User');
const MessageReceipt = require('../models/MessageReceipt');
const { recordScore } = require('../src/score');
const { ensureCurrentYear } = require('../src/year');
const { MongoSessionStore } = require('../src/session-store');
const { safeError } = require('../src/runtime');
const { Supervisor } = require('../src/supervisor');
const { withTimeout } = require('../src/timeout');
const { createHandler } = require('../src/handler');
const { transport } = require('../test/fixtures/whatsapp-model.cjs');
const { NO_TEMPORAL_DATA } = require('../src/statistics');
const database = `bot_check_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
let tempPath;

async function main() {
    if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI para las pruebas de integración.');
    try {
        await mongoose.connect(process.env.MONGODB_URI, { dbName: database, serverSelectionTimeoutMS: 15000 });
        assert.equal(mongoose.connection.db.databaseName, database);
        await Promise.all([User.init(), MessageReceipt.init()]);
        await User.create({ _id: '34123456789@c.us', displayName: 'Test', scoreYear: 2026,
            monthlyScores: { enero: 30, octubre: 19 }, totalScore: 49, hours: {}, week: {}, importMetadata: { test: true } });
        const input = { id: '34123456789@c.us', name: 'Test', body: '+1', date: '2026-10-06T19:00:00+02:00' };
        const [first, duplicate] = await Promise.all([
            recordScore({ ...input, messageId: 'same' }), recordScore({ ...input, messageId: 'same' })]);
        assert.equal([first, duplicate].filter(r => r.duplicate).length, 1);
        let user = await User.findById(input.id);
        assert.equal(user.totalScore, 50); assert.equal(user.hours.get('h19'), 1);
        assert.equal(user.lastCongratulated, 50); assert.equal(user.importMetadata.test, true);
        await Promise.all([1, 2, 3].map(i => recordScore({ ...input, messageId: `concurrent-${i}` })));
        user = await User.findById(input.id);
        assert.equal(user.totalScore, 53);
        await recordScore({ ...input, body: '25', messageId: 'numeric' });
        user = await User.findById(input.id);
        assert.equal(user.totalScore, 55); assert.equal(user.hours.get('h19'), 4);
        await assert.rejects(recordScore({ ...input, date: '2027-01-01T12:00:00Z', messageId: 'wrong-year' }), /año/);
        assert.equal(await MessageReceipt.countDocuments({ _id: 'wrong-year' }), 0);
        assert.equal((await User.findById(input.id)).totalScore, 55);
        console.log('MongoDB: transacciones, concurrencia, deduplicación, metadatos y rollback verificados.');

        // La ruta completa Message -> handler -> transacción -> reply/react de la librería.
        await User.updateOne({ _id: input.id }, { $set: { hours: {}, week: {} } });
        const wa = transport();
        const originalGetForStats = axios.get;
        let downloads = 0;
        const errors = [];
        const handle = createHandler({ logger: { error: (...args) => errors.push(args) } });
        axios.get = async () => { downloads++; throw new Error('No se debe descargar una gráfica sin datos.'); };
        try {
            for (const command of ['hourschart', 'weekchart', 'hours', 'week']) {
                await handle(wa.client, wa.incoming(`/${command}`));
            }
            assert.equal(downloads, 0);
            assert.equal(wa.sent.length, 4);
            assert(wa.sent.every(message => message.body === NO_TEMPORAL_DATA));
            const increment = wa.incoming('+1');
            await handle(wa.client, increment);
            assert.equal((await User.findById(input.id)).totalScore, 56);
            await handle(wa.client, increment);
            assert.equal((await User.findById(input.id)).totalScore, 56);
            const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXOQAAAAASUVORK5CYII=', 'base64');
            axios.get = async () => { downloads++; return { data: png }; };
            for (const command of ['hourschart', 'weekchart', 'progress']) {
                await handle(wa.client, wa.incoming(`/${command}`));
            }
            assert.equal(downloads, 3);
            assert.equal(wa.sent.filter(message => message.type === 'image').length, 3);
            await handle(wa.client, wa.incoming('-1'));
            assert.equal((await User.findById(input.id)).totalScore, 55);
            await handle(wa.client, wa.incoming('25'));
            assert.equal((await User.findById(input.id)).totalScore, 55);
            assert.equal(wa.reactions.at(-1).emoji, '✅');
            assert.deepEqual(errors, []);
            assert(wa.sent.every(message => !String(message.body).startsWith('Hubo un error')));
            console.log('Message/Client reales: +1, -1, número, duplicado, datos ausentes y envío de hourschart/weekchart/progress verificados.');
        } finally { axios.get = originalGetForStats; }

        await ensureCurrentYear('2027-01-01T12:00:00Z');
        user = await User.findById(input.id);
        assert.equal(user.scoreYear, 2027); assert.equal(user.totalScore, 0); assert.equal(user.monthlyScores.size, 0);
        const archived = await mongoose.connection.db.collection('users2026').findOne({ _id: input.id });
        assert.equal(archived.totalScore, 55); assert.equal(archived.monthlyScores.octubre, 25);
        await ensureCurrentYear('2027-01-01T12:00:00Z');
        assert.equal(await mongoose.connection.db.collection('users2026').countDocuments(), 1);
        console.log('Cambio de año: archivo y reinicio atómicos e idempotentes verificados.');

        // /year se puede ejecutar repetidamente, con el mismo resultado y modelo.
        await mongoose.connection.db.collection('users2025').insertOne({ _id: input.id, displayName: 'Test', totalScore: 60, monthlyScores: { enero: 60 } });
        const historical = transport();
        const chartUrls = [];
        const originalGet = axios.get;
        axios.get = async url => { chartUrls.push(url); return { data: Buffer.from('image-test') }; };
        try {
            for (let i = 0; i < 2; i++) await require('../commands/year').callback(
                historical.client, historical.incoming('/year:2025'));
        } finally { axios.get = originalGet; }
        const replies = historical.sent.filter(message => message.type === 'chat');
        const images = historical.sent.filter(message => message.type === 'image');
        assert.equal(replies.length, 2); assert.equal(images.length, 4);
        assert(replies.every(message => message.body.includes('Test') && message.body.includes('60')));
        assert(chartUrls.every(url => new URL(url).searchParams.get('version') === '4'));
        console.log('/year: dos ejecuciones seguidas, ranking y gráficas verificados.');

        tempPath = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-session-check-'));
        const store = new MongoSessionStore({ mongoose, dataPath: tempPath });
        const session = 'RemoteAuth-test';
        const zip = path.join(tempPath, `${session}.zip`);
        await fs.writeFile(zip, 'first-backup'); await store.save({ session });
        await fs.writeFile(zip, 'second-backup'); await store.save({ session });
        assert(await store.sessionExists({ session }));
        assert.equal(await mongoose.connection.db.collection(`whatsapp-${session}.files`).countDocuments(), 1);
        const extracted = path.join(tempPath, 'restored.zip');
        await store.extract({ session, path: extracted });
        assert.equal(await fs.readFile(extracted, 'utf8'), 'second-backup');
        await store.delete({ session }); assert.equal(await store.sessionExists({ session }), false);
        console.log('Sesión remota: guardar, reemplazar, restaurar y borrar en GridFS verificados.');

        await User.deleteMany({});
        const socket = net.createServer();
        await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
        const port = socket.address().port;
        await new Promise(resolve => socket.close(resolve));
        const uri = new URL(process.env.MONGODB_URI); uri.pathname = `/${database}`;
        const supervisor = new Supervisor({ entry: path.join(__dirname, '..', 'test', 'fixtures', 'runtime-worker.cjs'),
            baseDelay: 50, maxDelay: 50, checkInterval: 100, shutdownTimeout: 5000,
            logger: { log() {}, error() {} },
            spawn: (entry, args) => fork(entry, args, { stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
                env: { ...process.env, MONGODB_URI: uri.href, BOT_PHONE: '34123456789', PORT: String(port), AUTH_STRATEGY: 'local' } }) });
        function waitState(child, state) {
            return withTimeout(new Promise(resolve => {
                const listener = message => {
                    if (message?.type === 'heartbeat' && message.state === state) {
                        child.off('message', listener); resolve();
                    }
                };
                child.on('message', listener);
            }), 20000, `Estado ${state}`);
        }
        async function authenticate(child) {
            const ready = waitState(child, 'ready'); child.send({ type: 'authenticate' }); await ready;
        }
        try {
            supervisor.start();
            let child = supervisor.child;
            await waitState(child, 'awaiting_qr');
            let health = await fetch(`http://127.0.0.1:${port}/healthz`);
            assert.equal(health.status, 200); assert.equal((await health.json()).state, 'awaiting_qr');
            assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 503);
            await authenticate(child);
            assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 200);
            let respawned = once(supervisor, 'spawn'); child.send({ type: 'browser_crash' });
            [child] = await withTimeout(respawned, 20000, 'Reinicio por caída de navegador');
            await waitState(child, 'awaiting_qr'); await authenticate(child);
            supervisor.heartbeatTimeout = 1500;
            respawned = once(supervisor, 'spawn'); child.send({ type: 'hang' });
            [child] = await withTimeout(respawned, 10000, 'Reinicio por proceso bloqueado');
            // Restaurar el margen normal para que la carga de módulos pueda terminar.
            supervisor.heartbeatTimeout = 90000;
            await waitState(child, 'awaiting_qr'); await authenticate(child);
            console.log('Proceso real: HTTP, espera de QR, readiness, reinicio por caída y bloqueo verificados (WhatsApp simulado).');
        } finally {
            const stopped = once(supervisor, 'stopped'); supervisor.stop();
            await withTimeout(stopped, 10000, 'Cierre del supervisor de pruebas');
        }
    } finally {
        try {
            if (mongoose.connection.readyState === 1) {
                assert(/^bot_check_[a-f0-9]{24}$/.test(database));
                assert.equal(mongoose.connection.db.databaseName, database);
                await mongoose.connection.db.dropDatabase();
            }
        } finally { await mongoose.disconnect(); }
        if (tempPath) {
            // Solo los archivos creados por esta prueba, sin borrado recursivo.
            for (const name of ['RemoteAuth-test.zip', 'restored.zip']) await fs.unlink(path.join(tempPath, name)).catch(() => {});
            await fs.rmdir(tempPath);
        }
    }
}
main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
