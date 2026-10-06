const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, commands } = require('../src/handler');
const { getContactInfo } = require('../src/contact');
const { settings } = require('../src/settings');
const { safeError } = require('../src/runtime');
const silent = { error() {} };
function message(body, events = []) {
    return { body, from: 'group@g.us', author: '34123456789@c.us', id: { _serialized: 'example' }, type: 'chat',
        reply: async value => events.push(value), react: async value => events.push(`react:${value}`) };
}
test('mantiene todos los patrones de comandos anteriores', () => {
    const inputs = ['hola', 'ping', '/addfact:dato', '/average', '/commands', '/fact', '/fluky:a,b',
        '/hours', '/hourschart', '/mes', '/noreply', '/ping', '/progress', '/reply', '/rewind',
        '/rewindchart', '/status', '/top', '/weather', '/weather:Jaen', '/week', '/weekchart', '/year:2025'];
    const matched = inputs.filter(body => commands.some(c => c.match.test(body)));
    assert.deepEqual(matched, inputs.filter(i => i !== '/ping'));
    assert.equal(commands.length, 21);
});
test('resuelve el LID de WhatsApp al teléfono que identifica los datos históricos', async () => {
    const client = { getContactById: async () => ({ pushname: 'Juanma' }),
        getContactLidAndPhone: async () => [{ lid: '987@lid', pn: '34123456789@c.us' }] };
    const m = { ...message('1'), author: '987@lid' };
    assert.deepEqual(await getContactInfo(client, m), { id: '34123456789@c.us', name: 'Juanma' });
    client.getContactLidAndPhone = async () => [{}];
    await assert.rejects(getContactInfo(client, m), /teléfono/);
});
test('procesa dos mensajes seguidos en orden y un error no atasca la cola', async () => {
    const events = [];
    const handler = createHandler({ logger: silent, identify: async () => ({ id: 'test', name: 'Test' }),
        record: async ({ body }) => { events.push(`save:${body}`); if (body === '1') throw new Error('db'); return { score: 2 }; } });
    await Promise.all([handler({}, message('1', events)), handler({}, message('2', events))]);
    assert.equal(events[0], 'save:1');
    assert.equal(events[2], 'save:2'); assert.equal(events.at(-1), 'react:✅');
});
test('si falla la felicitación el punto ya está guardado y sigue intentando confirmar', async () => {
    const events = [];
    const handler = createHandler({ logger: silent, identify: async () => ({}), extra: async () => '',
        record: async () => { events.push('saved'); return { score: 50, congratulations: true, user: { displayName: 'Test', totalScore: 50 } }; } });
    await handler({ sendMessage: async () => { events.push('send'); throw new Error('disconnected'); } }, message('+1', events));
    assert.deepEqual(events, ['saved', 'send', '50✅']);
});
test('/noreply y /reply conservan el control de confirmaciones y no eliminan el registro', async () => {
    const events = [];
    let records = 0;
    const handler = createHandler({ logger: silent, identify: async () => ({}),
        record: async () => { records++; return { score: records }; } });
    await handler({}, message('/noreply', events));
    await handler({}, message('+1', events));
    const afterMuted = events.length;
    await handler({}, message('/reply', events));
    await handler({}, message('+1', events));
    assert.equal(records, 2); assert.equal(afterMuted, 1); assert.equal(events.at(-1), '2✅');
});
test('un duplicado o un mensaje propio no provoca otra confirmación ni otra felicitación', async () => {
    const events = [];
    let records = 0;
    const handler = createHandler({ logger: silent, identify: async () => ({}),
        record: async () => { records++; return { duplicate: true }; } });
    await handler({}, message('+1', events));
    await handler({}, { ...message('+1', events), fromMe: true });
    assert.equal(records, 1); assert.deepEqual(events, []);
});
test('configura una sesión distinta por cuenta y valida errores antes de arrancar', () => {
    const options = settings({ MONGODB_URI: 'mongodb://localhost/test', BOT_PHONE: '+1 (202) 555-0100' });
    assert.equal(options.botPhone, '12025550100'); assert.equal(options.sessionId, 'bot-12025550100');
    assert.throws(() => settings({}), /MONGODB_URI/);
    assert.throws(() => settings({ MONGODB_URI: 'mongodb://localhost/test', PORT: 'bad' }), /PORT/);
    const error = safeError(new Error('mongodb+srv://user:secret@cluster/test'));
    assert(error.includes('<MongoDB URI omitida>'));
    assert(!error.includes('secret'));
});
