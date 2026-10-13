const { EventEmitter } = require('node:events');
const pino = require('pino');
const { mongoAuthState } = require('./auth-store');
const { BoundedCache } = require('./cache');
const { legacyJid, wireJid } = require('./messages');
const User = require('../models/User');
const { createQueue } = require('./queue');
const { safeError } = require('./errors');

class WhatsAppConnection extends EventEmitter {
    constructor({ mongoose, stores, lease, options, lib, outbox, fail,
        socketFactory = lib.default, authFactory = mongoAuthState, reconnectBaseMs = 1000 }) {
        super(); Object.assign(this, { mongoose, stores, lease, options, lib, outbox, fail, socketFactory, authFactory, reconnectBaseMs });
        this.current = null; this.stopped = false; this.connecting = false; this.attempt = 0;
        this.logger = pino({ level: 'warn', serializers: {
            err: error => ({ message: safeError(error) }), error: error => ({ message: safeError(error) })
        }, redact: ['node', 'auth', 'creds', 'keys', 'qr'] });
        this.signalCache = new BoundedCache({ maximum: 1000 });
        this.retryCache = new BoundedCache({ maximum: 500, ttlSeconds: 3600 });
        this.deviceCache = new BoundedCache({ maximum: 500 });
        this.groupCache = new BoundedCache({ maximum: 100 });
        this.callCache = new BoundedCache({ maximum: 100 });
        this.placeholderCache = new BoundedCache({ maximum: 100 });
    }
    get ready() { return this.state === 'ready' && Boolean(this.current?.ws?.isOpen); }
    setState(state) { this.state = state; this.stateSince = Date.now(); this.emit('state', state); }
    async start() {
        if (this.stopped || this.connecting || this.current) return;
        this.connecting = true;
        try {
            this.setState('connecting');
            this.auth = await this.authFactory({ mongoose: this.mongoose, stores: this.stores, lease: this.lease,
                sessionId: this.options.sessionId, lib: this.lib, onError: this.fail });
            if (this.stopped) return;
            this.signalCache.flushAll();
            const socket = this.socketFactory({
                auth: { creds: this.auth.state.creds,
                    keys: this.lib.makeCacheableSignalKeyStore(this.auth.state.keys, this.logger, this.signalCache) },
                logger: this.logger, browser: this.lib.Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                // El bootstrap y los datos de contactos aportan las correspondencias LID/PN.
                // Sus mensajes se descartan: solo messages.upsert alimenta la cola de comandos.
                shouldSyncHistoryMessage: ({ syncType }) => [
                    this.lib.proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP,
                    this.lib.proto.HistorySync.HistorySyncType.NON_BLOCKING_DATA,
                    this.lib.proto.HistorySync.HistorySyncType.PUSH_NAME
                ].includes(syncType),
                markOnlineOnConnect: false, emitOwnEvents: false, enableRecentMessageCache: false,
                connectTimeoutMs: 20000, defaultQueryTimeoutMs: 15000, keepAliveIntervalMs: 20000,
                msgRetryCounterCache: this.retryCache, userDevicesCache: this.deviceCache,
                callOfferCache: this.callCache, placeholderResendCache: this.placeholderCache,
                maxMsgRetryCount: 3,
                shouldIgnoreJid: jid => jid === 'status@broadcast' || jid.endsWith('@newsletter') || jid.endsWith('@broadcast'),
                getMessage: key => this.outbox.getMessage(key),
                patchMessageBeforeSending: message => this.outbox.remember(message),
                cachedGroupMetadata: async jid => {
                    let group = this.groupCache.get(jid);
                    if (!group && this.current?.ws.isOpen) {
                        group = await this.current.groupMetadata(jid);
                        this.groupCache.set(jid, group);
                    }
                    return group;
                }
            });
            this.current = socket;
            const auth = this.auth;
            const guarded = action => (...args) => {
                if (this.stopped || this.current !== socket) return;
                Promise.resolve().then(() => {
                    if (!this.stopped && this.current === socket) return action(...args);
                }).catch(this.fail);
            };
            const lifecycle = createQueue();
            socket.ev.on('creds.update', guarded(() => auth.saveCreds()));
            socket.ev.on('connection.update', guarded(update => lifecycle(() => {
                if (!this.stopped && this.current === socket) return this.update(socket, auth, update);
            })));
            socket.ev.on('messages.upsert', guarded(update => lifecycle(() => {
                // Esperar a la validación de BOT_PHONE antes de aceptar mensajes de la cuenta.
                if (!this.stopped && this.current === socket && this.ready) this.emit('messages', update);
            })));
            socket.ws.on('CB:ack,class:message', guarded(node => this.outbox.ack(node.attrs?.id, node.attrs?.error)));
            socket.ev.on('messages.update', guarded(async updates => {
                for (const { key, update } of updates) {
                    if (update.status >= this.lib.proto.WebMessageInfo.Status.SERVER_ACK) await this.outbox.ack(key.id);
                    else if (update.status === this.lib.proto.WebMessageInfo.Status.ERROR) await this.outbox.ack(key.id, update.messageStubParameters?.[0] || 'error');
                }
            }));
            socket.ev.on('groups.update', guarded(updates => { for (const group of updates) this.groupCache.del(group.id); }));
            socket.ev.on('group-participants.update', guarded(update => this.groupCache.del(update.id)));
        } finally { this.connecting = false; }
    }
    async update(socket, auth, update) {
        if (update.qr) { this.setState('awaiting_qr'); this.emit('qr', update.qr); }
        if (update.connection === 'open') {
            await auth.flush();
            let jid = socket.user?.id || auth.state.creds.me?.id;
            if (this.lib.isLidUser(jid || '')) jid = await socket.signalRepository.lidMapping.getPNForLID(jid);
            const phone = this.lib.jidDecode(jid || '')?.user;
            if (this.stopped || this.current !== socket || !socket.ws.isOpen) return;
            if (this.options.botPhone && phone !== this.options.botPhone) {
                throw Object.assign(new Error('La cuenta vinculada no coincide con BOT_PHONE.'), { fatal: true, exitCode: 2 });
            }
            this.setState('ready'); this.readySince = Date.now(); this.emit('ready');
        }
        if (update.connection === 'close') {
            const reason = update.lastDisconnect?.error?.output?.statusCode;
            this.setState('offline');
            await this.detach();
            if (reason === this.lib.DisconnectReason.connectionReplaced || reason === this.lib.DisconnectReason.multideviceMismatch) {
                throw Object.assign(new Error(`WhatsApp rechazó esta instancia (${reason}). Revisa los dispositivos vinculados.`), { fatal: true, exitCode: 2 });
            }
            if ([this.lib.DisconnectReason.loggedOut, this.lib.DisconnectReason.badSession].includes(reason)) {
                await auth.invalidate();
                this.emit('pairing_required');
            }
            if (this.readySince && Date.now() - this.readySince > 60000) this.attempt = 0;
            const delay = reason === this.lib.DisconnectReason.restartRequired ? 0 :
                Math.min(60000, this.reconnectBaseMs * 2 ** Math.min(this.attempt++, 6));
            this.emit('reconnecting', { reason, delay });
            if (!this.stopped) this.retry = setTimeout(() => this.start().catch(this.fail), delay);
        }
    }
    async resolveContact(message) {
        const raw = wireJid(message.sender);
        let phone = message.phoneHint?.endsWith('@c.us') ? message.phoneHint :
            message.sender?.endsWith('@c.us') ? message.sender : null;
        if (!phone && raw && this.current) phone = legacyJid(await this.current.signalRepository.lidMapping.getPNForLID(raw));
        if (!phone?.endsWith('@c.us')) throw new Error('WhatsApp todavía no permite resolver el teléfono del remitente.');
        let name = message.pushName;
        if (!name || name === 'Usuario') name = (await User.findById(phone))?.displayName || 'Usuario';
        return { id: phone, name };
    }
    async detach() {
        const socket = this.current; this.current = null;
        if (socket) socket.end(new Error('Cierre de conexión del bot.'));
        if (this.auth) await this.auth.flush();
    }
    async stop() {
        this.stopped = true; clearTimeout(this.retry);
        await this.detach();
        for (const cache of [this.signalCache, this.retryCache, this.deviceCache, this.groupCache, this.callCache, this.placeholderCache]) cache.close();
    }
}

module.exports = { WhatsAppConnection };
