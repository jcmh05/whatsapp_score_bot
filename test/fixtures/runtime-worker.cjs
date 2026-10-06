// Transporte simulado para probar el proceso real, sin conectar con WhatsApp.
const { EventEmitter } = require('node:events');
const { run } = require('../../src/runtime');
class FakeClient extends EventEmitter {
    constructor() {
        super();
        this.info = { wid: { user: process.env.BOT_PHONE, _serialized: `${process.env.BOT_PHONE}@c.us` } };
        this.pupBrowser = new EventEmitter();
        this.pupPage = new EventEmitter();
    }
    async initialize() {
        this.emit('qr', 'integration-test');
        process.on('message', message => {
            if (message?.type === 'authenticate') { this.emit('authenticated'); this.emit('ready'); }
            if (message?.type === 'browser_crash') this.pupBrowser.emit('disconnected');
            if (message?.type === 'hang') { while (true) {} }
        });
    }
    async getState() { return 'CONNECTED'; }
    async destroy() {}
}
run({ clientFactory: () => new FakeClient() });
