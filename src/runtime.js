const mongoose = require('mongoose');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { settings } = require('./settings');
const { safeError } = require('./errors');
const { ensureCurrentYear } = require('./year');
const { scorePeriod } = require('./time');
const { loadBaileys } = require('./baileys');
const { initStores, InstanceLease } = require('./stores');
const { WhatsAppConnection } = require('./connection');
const { incomingMessage } = require('./messages');
const { Jobs, recognized } = require('./jobs');
const { Outbox } = require('./outbox');
const { createQueue } = require('./queue');
const { withTimeout } = require('./timeout');
const { resourceReporter } = require('./resources');

async function run({ socketFactory, timings = {} } = {}) {
    let options;
    try { options = settings(); } catch (error) { console.error(error.message); process.exitCode = 2; return; }
    axios.defaults.timeout = 15000; axios.defaults.maxContentLength = 8 * 1024 * 1024;
    mongoose.set('bufferCommands', false);
    mongoose.set('transactionAsyncLocalStorage', true);
    const status = { state: 'starting', ready: false };
    const intervals = [], pending = new Set(), enqueue = createQueue();
    let server, connection, lease, jobs, outbox, stores, stopped = false, maintenanceBusy = false, currentYear;
    const startedAt = Date.now();
    const logger = { error: (...args) => console.error(...args.map(safeError)) };
    const report = resourceReporter({ logger: { log: console.log, error: logger.error } });
    const sendHeartbeat = () => {
        if (process.connected) process.send({ type: 'heartbeat', ...status }, () => {});
    };
    const setState = state => { status.state = state; status.ready = state === 'ready'; sendHeartbeat(); };
    const track = task => {
        pending.add(task); task.then(() => pending.delete(task), () => pending.delete(task)); return task;
    };
    async function stop(code, reason) {
        if (stopped) return;
        stopped = true; setState('stopping'); console.log(reason);
        for (const interval of intervals) clearInterval(interval);
        if (jobs) jobs.stopped = true;
        if (outbox) outbox.stopped = true;
        const deadline = setTimeout(() => process.exit(code), 12000);
        try {
            if (code !== 0) await report('reinicio por error');
            if (connection) await withTimeout(connection.stop(), 5000, 'Cierre de WhatsApp');
            await withTimeout(Promise.allSettled([...pending]), 5000, 'Cierre de trabajos');
            if (lease?.held) await lease.release();
            await mongoose.disconnect();
            if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
        } catch (error) { logger.error('Cierre:', error); }
        clearTimeout(deadline); process.exit(code);
    }
    const fail = error => { if (!stopped) { logger.error(error); void stop(error.exitCode || 1, 'Reinicio del proceso para recuperar un fallo interno.'); } };
    process.on('SIGINT', () => void stop(0, 'Bot detenido.'));
    process.on('SIGTERM', () => void stop(0, 'Bot detenido.'));
    process.on('message', message => { if (message?.type === 'shutdown') void stop(0, 'Bot detenido.'); });
    process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
    intervals.push(setInterval(sendHeartbeat, timings.heartbeatMs || 10000)); sendHeartbeat();
    const app = express();
    app.get('/', (_req, res) => res.send(status.ready ? 'Bot de WhatsApp está funcionando.' : `Bot de WhatsApp: ${status.state}.`));
    app.get('/healthz', (_req, res) => res.json({ alive: true, state: status.state, uptime: Math.floor((Date.now() - startedAt) / 1000) }));
    app.get('/readyz', (_req, res) => {
        const database = mongoose.connection.readyState === 1;
        const ready = status.ready && database && Boolean(lease?.valid) && Boolean(connection?.ready);
        res.status(ready ? 200 : 503).json({ ready, state: status.state, database });
    });
    server = app.listen(options.port, () => console.log(`Servidor HTTP en el puerto ${options.port}`));
    server.on('error', error => { error.exitCode = error.code === 'EADDRINUSE' ? 2 : 1; fail(error); });
    async function prepareYear() {
        const year = scorePeriod().year;
        if (currentYear !== year) { await ensureCurrentYear(); currentYear = year; }
    }
    try {
        const revision = process.env.RAILWAY_GIT_COMMIT_SHA;
        if (/^[a-f0-9]{7,40}$/i.test(revision || '')) console.log(`Revisión del bot: ${revision.slice(0, 7)}`);
        await report('inicio');
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000,
            socketTimeoutMS: 30000, maxPoolSize: 10 });
        mongoose.connection.on('disconnected', () => { if (!stopped) fail(new Error('MongoDB desconectado; se detiene la recepción de mensajes.')); });
        console.log('MongoDB conectado.');
        await Promise.all([require('../models/User').init(), require('../models/MessageReceipt').init(), require('../models/Fact').init()]);
        stores = await initStores(mongoose, options.sessionId);
        lease = new InstanceLease(stores, options.sessionId);
        setState('standby');
        console.log('Esperando la propiedad exclusiva de la sesión.');
        while (!stopped && !await lease.acquire()) await new Promise(resolve => setTimeout(resolve, timings.standbyMs || 2000));
        if (stopped) return;
        intervals.push(setInterval(() => {
            if (stopped || maintenanceBusy) return;
            maintenanceBusy = true;
            track(withTimeout((async () => {
                await lease.renew();
                await mongoose.connection.db.command({ ping: 1 });
                if (connection?.state === 'connecting' && Date.now() - connection.stateSince > 180000) {
                    throw new Error('WhatsApp no terminó la conexión en tres minutos.');
                }
            })(), 15000, 'Comprobación de sesión y MongoDB')).catch(fail).finally(() => { maintenanceBusy = false; });
        }, timings.maintenanceMs || 10000));
        await prepareYear();
        const lib = await loadBaileys();
        outbox = new Outbox({ stores, sessionId: options.sessionId, lib, lease, logger, fail });
        connection = new WhatsAppConnection({ mongoose, stores, lease, options, lib, outbox, fail,
            ...(socketFactory ? { socketFactory } : {}) });
        jobs = new Jobs({ mongoose, stores, lease, sessionId: options.sessionId, lib,
            resolveContact: message => connection.resolveContact(message), prepareYear, logger, fail });
        connection.on('state', setState);
        connection.on('qr', qr => {
            qrcode.generate(qr, { small: true });
            console.log('En el teléfono del bot: WhatsApp > Dispositivos vinculados > Vincular un dispositivo. La sesión se guarda en MongoDB.');
        });
        connection.on('ready', () => { console.log('Bot listo. Conexión directa con WhatsApp; sesión en MongoDB.'); void report('listo'); });
        connection.on('pairing_required', () => console.log('WhatsApp cerró la sesión. Se generará un QR nuevo; los puntajes se conservan.'));
        connection.on('reconnecting', ({ reason, delay }) => console.log(`WhatsApp desconectado (${reason || 'red'}). Reconexión en ${delay / 1000}s.`));
        connection.on('messages', update => {
            if (stopped || !['notify', 'append'].includes(update.type)) return;
            for (const raw of update.messages || []) {
                const message = incomingMessage(raw, lib);
                if (!message || !recognized(message.body)) continue;
                track(enqueue(() => stopped ? undefined : jobs.capture(message))).catch(fail);
            }
        });
        intervals.push(setInterval(() => {
            if (!stopped && !lease.valid) { fail(new Error('La lease ha expirado. Se detiene esta instancia.')); return; }
            if (!stopped && connection.ready) { track(jobs.tick()); track(outbox.tick(connection.current)); }
        }, timings.queueMs || 250));
        intervals.push(setInterval(() => {
            if (stopped) return;
            track(Promise.all([
                stores.inbox.countDocuments({ sessionId: options.sessionId, state: 'failed' }),
                stores.outbox.countDocuments({ sessionId: options.sessionId, state: 'failed' })
            ]).then(([input, output]) => console.log(`Colas fallidas: entrada=${input}, salida=${output}.`))).catch(fail);
            void report('periódico');
        }, 60000));
        await connection.start();
    } catch (error) { fail(error); }
}
module.exports = { run, safeError };
