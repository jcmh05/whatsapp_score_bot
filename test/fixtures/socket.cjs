const { EventEmitter } = require('node:events');
class FakeSocket {
    constructor(config, phone = '12025550100') {
        this.config = config; this.ev = new EventEmitter(); this.ws = new EventEmitter();
        this.ws.isOpen = false; this.user = { id: `${phone}:1@s.whatsapp.net` };
        this.sent = []; this.ended = false;
        this.signalRepository = { lidMapping: { getPNForLID: async () => '34123456789@s.whatsapp.net' } };
    }
    open() { this.ws.isOpen = true; this.ev.emit('connection.update', { connection: 'open' }); }
    disconnect(reason = 408) {
        this.ws.isOpen = false;
        this.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: reason } } } });
    }
    end() { this.ended = true; this.ws.isOpen = false; }
    async groupMetadata(id) { return { id, participants: [{ id: '34123456789@s.whatsapp.net' }] }; }
    async sendMessage(to, content, options) {
        await this.config.patchMessageBeforeSending(content);
        this.sent.push({ to, content, options });
        this.ws.emit('CB:ack,class:message', { attrs: { id: options.messageId } });
        return { key: { id: options.messageId } };
    }
}
async function eventually(predicate, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (!await predicate()) {
        if (Date.now() > deadline) throw new Error('No llegó el estado esperado.');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}
module.exports = { FakeSocket, eventually };
