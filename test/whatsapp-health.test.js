const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { checkWhatsApp, isWhatsAppUnavailable } = require('../src/whatsapp-health');
const { createHandler } = require('../src/handler');

function fixture({ state = 'CONNECTED', bridge = true } = {}) {
    const context = vm.createContext({ window: {
        Debug: { VERSION: 'offline-fixture' },
        require: () => ({ Socket: { state } }),
        WWebJS: bridge ? { getChat() {}, getContact() {}, sendMessage() {}, getMessageModel() {} } : undefined
    } });
    return { pupPage: { evaluate: fn => vm.runInContext(`(${fn.toString()})()`, context) } };
}

test('comprueba conexión y funciones reales del bridge antes de declarar WhatsApp listo', async () => {
    const result = await checkWhatsApp(fixture());
    assert.equal(result.state, 'CONNECTED'); assert.equal(result.bridge, true);
    assert.equal(result.version, 'offline-fixture');
    await assert.rejects(checkWhatsApp(fixture({ bridge: false })), error =>
        error.code === 'WA_BRIDGE_MISSING' && isWhatsAppUnavailable(error));
});

test('un navegador bloqueado vence el plazo aunque el proceso de Node siga vivo', async () => {
    await assert.rejects(checkWhatsApp({ pupPage: { evaluate: () => new Promise(() => {}) } }, { timeoutMs: 20 }), error =>
        error.code === 'WA_BROWSER_UNAVAILABLE' && isWhatsAppUnavailable(error));
});

test('distingue un transporte roto de una desconexión temporal y errores de datos', async () => {
    await assert.rejects(checkWhatsApp(fixture({ state: 'OPENING' })), error =>
        error.code === 'WA_OFFLINE' && !isWhatsAppUnavailable(error));
    assert(isWhatsAppUnavailable(new TypeError("Cannot read properties of undefined (reading 'getContact')")));
    assert(isWhatsAppUnavailable(new TypeError("Cannot read properties of undefined (reading 'getChat')")));
    assert(!isWhatsAppUnavailable(new Error('MongoDB desconectado.')));
    assert(!isWhatsAppUnavailable(new Error('Gráfica sin datos.')));
});

test('un bridge perdido activa la recuperación sin guardar puntos ni intentar responder desde la página rota', async () => {
    let records = 0, replies = 0, recoveries = 0;
    const client = fixture({ bridge: false });
    const handle = createHandler({ logger: { error() {} },
        beforeMessage: () => checkWhatsApp(client),
        record: async () => { records++; },
        onUnavailable: error => { assert(isWhatsAppUnavailable(error)); recoveries++; return true; }
    });
    await handle(client, { from: 'fixture@g.us', body: '+1', type: 'chat', reply: async () => { replies++; } });
    assert.equal(recoveries, 1); assert.equal(records, 0); assert.equal(replies, 0);
});

test('si se pierde el bridge al confirmar un punto guardado, recupera sin repetir la escritura', async () => {
    let records = 0, recoveries = 0;
    const handle = createHandler({ logger: { error() {} }, identify: async () => ({ id: 'test' }),
        record: async () => { records++; return { score: 1 }; },
        onUnavailable: error => { assert(isWhatsAppUnavailable(error)); recoveries++; return true; }
    });
    await handle({}, { from: 'fixture@g.us', body: '+1', type: 'chat',
        reply: async () => { throw new TypeError("Cannot read properties of undefined (reading 'getChat')"); } });
    assert.equal(records, 1); assert.equal(recoveries, 1);
});
