const { run } = require('../../src/runtime');
const { FakeSocket } = require('./socket.cjs');
let socket;
process.on('message', message => {
    if (message?.type === 'authenticate') socket?.open();
    if (message?.type === 'disconnect') socket?.disconnect();
    if (message?.type === 'fatal') throw new Error('Fallo simulado del proceso.');
    if (message?.type === 'hang') { while (true) {} }
    if (message?.type === 'incoming' && socket?.ws.isOpen) socket.ev.emit('messages.upsert', {
        type: 'notify', messages: [{ key: { id: message.id, remoteJid: 'fixture@g.us', participant: '34123456789@s.whatsapp.net' },
            messageTimestamp: Math.floor(Date.now() / 1000), pushName: 'Test', message: { conversation: message.body } }]
    });
});
run({ timings: { heartbeatMs: 100, maintenanceMs: 500, queueMs: 50, standbyMs: 100 },
    socketFactory: config => {
        socket = new FakeSocket(config, process.env.BOT_PHONE);
        setImmediate(() => socket.ev.emit('connection.update', { qr: 'integration-test' }));
        return socket;
    } });
