const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { settings } = require('./settings');
const { createHandler } = require('./handler');
const { ensureCurrentYear } = require('./year');
const { scorePeriod } = require('./time');
const { MongoSessionStore } = require('./session-store');
const { withTimeout } = require('./timeout');
const { browserOptions } = require('./browser');

function safeError(error) {
    return String(error?.stack || error).replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/g, '<MongoDB URI omitida>');
}

async function run({ clientFactory = clientOptions => new Client(clientOptions) } = {}) {
    let options;
    try { options = settings(); } catch (error) { console.error(error.message); process.exitCode = 2; return; }
    axios.defaults.timeout = 15000;
    axios.defaults.maxContentLength = 20 * 1024 * 1024;
    mongoose.set('bufferCommands', false);
    const status = { state: 'starting', ready: false };
    let client, server, heartbeat, watchdog, startupTimer, probeBusy = false, stopped = false, unhealthySince;
    let currentYear;
    const startedAt = Date.now();
    const logError = (...args) => console.error(...args.map(safeError));
    const logger = { error: logError };
    const sendHeartbeat = () => {
        if (process.connected) process.send({ type: 'heartbeat', state: status.state, ready: status.ready }, () => {});
    };
    const setState = state => { status.state = state; status.ready = state === 'ready'; sendHeartbeat(); };

    async function stop(code, reason) {
        if (stopped) return;
        stopped = true;
        setState('stopping');
        console.log(reason);
        clearInterval(heartbeat); clearInterval(watchdog); clearTimeout(startupTimer);
        const deadline = setTimeout(() => process.exit(code), 12000);
        try {
            if (client) await withTimeout(client.destroy(), 8000, 'Cierre de WhatsApp');
            await mongoose.disconnect();
            if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
        } catch (error) { logError('Error durante el cierre:', error); }
        clearTimeout(deadline);
        process.exit(code);
    }
    const fail = error => { logError(error); void stop(1, 'Se reiniciará el bot para recuperar la conexión.'); };
    process.on('SIGINT', () => void stop(0, 'Bot detenido.'));
    process.on('SIGTERM', () => void stop(0, 'Bot detenido.'));
    process.on('message', message => { if (message?.type === 'shutdown') void stop(0, 'Bot detenido.'); });
    process.on('uncaughtException', fail);
    process.on('unhandledRejection', fail);
    heartbeat = setInterval(sendHeartbeat, 10000);
    sendHeartbeat();
    const app = express();
    app.get('/', (_req, res) => res.send(status.ready ? 'Bot de WhatsApp está funcionando.' : `Bot de WhatsApp: ${status.state}.`));
    app.get('/healthz', (_req, res) => res.json({ alive: true, state: status.state, uptime: Math.floor((Date.now() - startedAt) / 1000) }));
    app.get('/readyz', (_req, res) => {
        const database = mongoose.connection.readyState === 1;
        res.status(status.ready && database ? 200 : 503).json({ ready: status.ready && database, state: status.state, database });
    });
    server = app.listen(options.port, () => console.log(`Servidor HTTP en el puerto ${options.port}`));
    server.on('error', error => {
        logError(error);
        void stop(error.code === 'EADDRINUSE' ? 2 : 1, 'No se pudo abrir el puerto HTTP.');
    });

    async function prepareYear() {
        if (mongoose.connection.readyState !== 1) throw new Error('MongoDB no está conectado.');
        const year = scorePeriod().year;
        if (currentYear !== year) { await ensureCurrentYear(); currentYear = year; }
    }
    function armStartupTimeout() {
        clearTimeout(startupTimer);
        startupTimer = setTimeout(() => fail(new Error('WhatsApp no terminó de inicializarse en tres minutos.')), 180000);
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000,
            socketTimeoutMS: 30000, maxPoolSize: 10 });
        console.log('MongoDB conectado.');
        await Promise.all([require('../models/User').init(), require('../models/MessageReceipt').init()]);
        await prepareYear();
        const authOptions = { clientId: options.sessionId, dataPath: options.dataPath };
        const authStrategy = options.authStrategy === 'local' ? new LocalAuth(authOptions) : new RemoteAuth({
            ...authOptions, store: new MongoSessionStore({ mongoose, dataPath: options.dataPath }), backupSyncIntervalMs: options.backupMs
        });
        client = clientFactory({ authStrategy, puppeteer: browserOptions(options) });
        const handler = createHandler({ beforeMessage: prepareYear, logger });
        client.on('message', message => {
            if (['ready', 'offline'].includes(status.state) && !stopped) void handler(client, message).catch(fail);
        });
        client.on('qr', qr => {
            clearTimeout(startupTimer);
            setState('awaiting_qr');
            qrcode.generate(qr, { small: true });
            console.log('En el teléfono del bot: WhatsApp > Dispositivos vinculados > Vincular un dispositivo.');
        });
        client.on('authenticated', () => { setState('authenticated'); armStartupTimeout(); });
        client.on('remote_session_saved', () => console.log('Sesión de WhatsApp respaldada en MongoDB.'));
        client.on('ready', () => void (async () => {
            const wid = client.info?.wid;
            let phone = wid?.user;
            if (wid?._serialized?.endsWith('@lid')) {
                const [mapping] = await client.getContactLidAndPhone([wid._serialized]);
                phone = mapping?.pn?.split('@')[0];
            }
            if (options.botPhone && phone !== options.botPhone) {
                await stop(2, 'La cuenta vinculada no coincide con BOT_PHONE. Vincula el número correcto.');
                return;
            }
            clearTimeout(startupTimer);
            client.pupBrowser?.on('disconnected', () => { if (!stopped) fail(new Error('Chromium se ha cerrado.')); });
            client.pupPage?.on('error', fail);
            setState('ready');
            unhealthySince = undefined;
            console.log('Bot listo.');
        })().catch(fail));
        client.on('auth_failure', () => fail(new Error('La sesión de WhatsApp no pudo restaurarse. Puede ser necesario vincularla de nuevo.')));
        client.on('disconnected', reason => fail(new Error(`WhatsApp desconectado: ${reason}`)));
        client.on('error', fail);
        watchdog = setInterval(async () => {
            if (stopped || probeBusy || !['ready', 'offline'].includes(status.state)) return;
            probeBusy = true;
            try {
                const waState = await withTimeout(client.getState(), 10000, 'Estado de WhatsApp');
                if (waState !== 'CONNECTED' || mongoose.connection.readyState !== 1) throw new Error('WhatsApp o MongoDB desconectado.');
                unhealthySince = undefined;
                setState('ready');
                await prepareYear();
            } catch (error) {
                unhealthySince ??= Date.now();
                setState('offline');
                logError('Comprobación de conexión:', error);
                if (Date.now() - unhealthySince >= 90000) fail(error);
            } finally { probeBusy = false; }
        }, 30000);
        armStartupTimeout();
        await client.initialize();
    } catch (error) { fail(error); }
}

module.exports = { run, safeError };
