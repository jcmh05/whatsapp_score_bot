// Transporte simulado para probar el proceso real, sin conectar con WhatsApp.
const { EventEmitter } = require('node:events');
const { run } = require('../../src/runtime');
class FakeClient extends EventEmitter {
    constructor() {
        super();
        this.info = { wid: { user: process.env.BOT_PHONE, _serialized: `${process.env.BOT_PHONE}@c.us` } };
        this.pupBrowser = new EventEmitter();
        this.pupPage = new EventEmitter();
        this.pupPage.evaluate = async () => ({ state: 'CONNECTED', bridge: true, version: 'runtime-fixture' });
    }
    async initialize() {
        this.emit('qr', 'integration-test');
        process.on('message', message => {
            if (message?.type === 'authenticate') { this.emit('authenticated'); this.emit('ready'); }
            if (message?.type === 'browser_crash') this.pupBrowser.emit('disconnected');
            if (message?.type === 'bridge_lost') {
                this.pupPage.evaluate = async () => ({ state: 'CONNECTED', bridge: false });
                this.emit('message', { body: '+1', from: 'fixture@g.us', author: '34123456789@c.us', type: 'chat',
                    reply: async () => { throw new Error('No se debe responder desde un bridge roto.'); } });
            }
            if (message?.type === 'hang') { while (true) {} }
        });
    }
    async getState() { return 'CONNECTED'; }
    async destroy() {}
}
run({ clientFactory: () => new FakeClient() });
