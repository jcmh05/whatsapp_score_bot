const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageMedia } = require('whatsapp-web.js');
const { createHandler } = require('../src/handler');
const { rewindAvailability } = require('../src/rewind-date');
const { transport, GROUP } = require('./fixtures/whatsapp-model.cjs');

test('Message real normaliza $1 y permite responder y reaccionar al identificador original', async () => {
    const wa = transport();
    const message = wa.incoming('+1');
    assert.equal(message.id._serialized, message.id.$1);
    assert.equal(message.from, GROUP); assert.equal(message.author, '34123456789@c.us');
    await message.reply('20✅'); await message.react('✅');
    assert.equal(wa.sent[0].body, '20✅');
    assert.equal(wa.sent[0].quotedStanzaID, message.id.id);
    assert.equal(wa.reactions[0].id, message.id.$1);
});
test('Client.sendMessage real acepta medios con ID privado undefined o de otro modelo y conserva los campos de subida', async () => {
    for (const privateMediaId of [undefined, { id: 'media-id', $1: 'media-id' }]) {
        const wa = transport({ privateMediaId });
        const result = await wa.client.sendMessage(GROUP, new MessageMedia('image/png', 'aW1hZ2U=', 'chart.png'), { caption: 'Gráfica' });
        assert(result.id._serialized.startsWith('true_'));
        assert(!Object.hasOwn(wa.sent[0], '__x_id'));
        assert.equal(wa.sent[0].id.id, 'outgoing-1');
        assert.equal(wa.sent[0].caption, 'Gráfica');
        assert.equal(wa.sent[0].clientUrl, 'https://media.invalid/file');
        assert.equal(wa.sent[0].uploadhash, 'upload-hash');
        assert.equal(wa.sent[0].mediaHandle, 'media-handle');
    }
});
test('el handler pasa un ID válido al guardar +1, -1 y un número con el formato actual de WhatsApp', async () => {
    const wa = transport(); const received = []; const errors = [];
    const handle = createHandler({ logger: { error: error => errors.push(error) },
        record: async input => { received.push(input); return { score: Number(input.body) || 20 }; } });
    for (const body of ['+1', '-1', '23']) await handle(wa.client, wa.incoming(body));
    assert.deepEqual(received.map(input => input.body), ['+1', '-1', '23']);
    assert(received.every(input => input.messageId.startsWith('false_')));
    assert.equal(wa.sent.length, 2); assert.equal(wa.reactions.length, 1);
    assert.deepEqual(errors, []);
});
test('rewind permanece cerrado hasta el 20 de diciembre de cada año en Madrid', () => {
    assert.match(rewindAvailability('/rewind', '2026-10-06T21:00:00+02:00'), /20 de diciembre de 2026.*Faltan/);
    assert(rewindAvailability('/rewindchart', '2026-12-19T23:59:59+01:00'));
    assert.equal(rewindAvailability('/rewind', '2026-12-20T00:00:00+01:00'), null);
    assert.match(rewindAvailability('/rewind', '2027-01-01T12:00:00+01:00'), /20 de diciembre de 2027/);
});
test('/rewind y /rewindchart contestan con cuenta atrás antes de consultar usuarios o generar imágenes', async () => {
    const moment = require('moment-timezone'); const originalNow = moment.now;
    moment.now = () => Date.parse('2026-10-06T21:00:00+02:00');
    try {
        const wa = transport();
        for (const name of ['rewind', 'rewindchart']) await require(`../commands/${name}`).callback(wa.client, wa.incoming(`/${name}`));
        assert.equal(wa.sent.length, 2);
        assert(wa.sent.every(message => message.body.includes('20 de diciembre de 2026') && message.body.includes('Faltan')));
    } finally { moment.now = originalNow; }
});
