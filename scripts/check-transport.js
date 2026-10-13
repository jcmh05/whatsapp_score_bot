const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sharp = require('sharp');
const { loadBaileys } = require('../src/baileys');

// Comprobación reproducible de las dependencias nativas. Sin cuenta, red ni MongoDB.
async function checkTransport() {
    const lib = await loadBaileys();
    const creds = lib.initAuthCreds();
    const restored = JSON.parse(JSON.stringify(creds, lib.BufferJSON.replacer), lib.BufferJSON.reviver);
    assert(Buffer.isBuffer(restored.noiseKey.private));
    assert.deepEqual(restored.signedIdentityKey, creds.signedIdentityKey);
    const to = '12025550100@s.whatsapp.net', me = '12025550101@s.whatsapp.net';
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#704020' } }).png().toBuffer();
    let uploads = 0;
    const upload = async filename => {
        const data = await fs.readFile(filename); assert(data.length > 0); uploads++;
        return { mediaUrl: 'https://example.invalid/image', directPath: '/image' };
    };
    const samples = [{ text: 'pong' }, { image, mimetype: 'image/png', caption: 'Progreso' },
        { react: { text: '✅', key: { id: 'incoming', remoteJid: to, fromMe: false } } }];
    for (const content of samples) {
        const id = lib.generateMessageIDV2();
        const message = await lib.generateWAMessage(to, content, { userJid: me, messageId: id, upload });
        const encoded = lib.proto.WebMessageInfo.encode(message).finish();
        const decoded = lib.proto.WebMessageInfo.decode(encoded);
        assert.equal(decoded.key.id, id);
        if (content.image) assert(decoded.message.imageMessage.jpegThumbnail.length > 0);
        if (content.react) assert.equal(decoded.message.reactionMessage.text, '✅');
    }
    assert.equal(uploads, 1);
    console.log(`Transporte comprobado: credenciales binarias, cifrado de imagen, miniatura, texto, reacción y protobuf. RSS ${Math.round(process.memoryUsage().rss / 1048576)} MiB. Sin navegador ni cuenta real.`);
}
if (require.main === module) checkTransport().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { checkTransport };
