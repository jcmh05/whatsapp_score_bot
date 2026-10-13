const { MessageMedia } = require('./media');

function legacyJid(jid) {
    if (!jid) return jid;
    return jid.replace(/:\d+@/, '@').replace('@s.whatsapp.net', '@c.us');
}
function wireJid(jid) { return jid?.replace('@c.us', '@s.whatsapp.net'); }

function incomingMessage(raw, lib) {
    if (!raw?.key?.id || !raw.key.remoteJid || raw.key.fromMe || raw.key.remoteJid === 'status@broadcast' || raw.key.remoteJid.endsWith('@newsletter')) return null;
    const content = lib.normalizeMessageContent(raw.message);
    const body = content?.conversation ?? content?.extendedTextMessage?.text;
    if (typeof body !== 'string' || body.length > 65536) return null;
    const group = raw.key.remoteJid.endsWith('@g.us');
    const sender = group ? raw.key.participant : raw.key.remoteJid;
    const hint = group ? raw.key.participantAlt : raw.key.remoteJidAlt;
    const timestamp = Number(raw.messageTimestamp || 0);
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null;
    const from = legacyJid(raw.key.remoteJid);
    return { body: body.trim(), from, author: group ? legacyJid(sender) : undefined,
        type: 'chat', timestamp, fromMe: false, pushName: raw.pushName || 'Usuario',
        sender: legacyJid(sender), phoneHint: legacyJid(hint),
        id: { _serialized: `false_${from}_${raw.key.id}` },
        key: { remoteJid: raw.key.remoteJid, id: raw.key.id, fromMe: false, ...(group ? { participant: raw.key.participant } : {}) } };
}

class OutputPlan {
    constructor(message, contact) { this.message = message; this.contact = contact; this.effects = []; this.durable = true; }
    async sendMessage(to, content, options = {}) {
        let payload;
        if (content instanceof MessageMedia) {
            const image = Buffer.from(content.data, 'base64');
            if (image.length > 8 * 1024 * 1024) throw new Error('La imagen supera el tamaño permitido.');
            payload = { image, mimetype: content.mimetype, fileName: content.filename, caption: options.caption || '' };
        } else payload = { text: String(content) };
        this.effects.push({ to: wireJid(to), content: payload });
        return { id: { _serialized: 'queued' } };
    }
    async getContactById() { return { pushname: this.contact.name }; }
    async getContactLidAndPhone(ids) { return ids.map(lid => ({ lid, pn: this.contact.id })); }
    adaptedMessage() {
        const message = { ...this.message };
        message.reply = async text => {
            this.effects.push({ to: wireJid(message.from), content: { text: String(text) },
                quoted: { key: message.key, message: { conversation: message.body } } });
        };
        message.react = async text => {
            this.effects.push({ to: wireJid(message.from), content: { react: { text, key: message.key } } });
        };
        return message;
    }
}

module.exports = { legacyJid, wireJid, incomingMessage, OutputPlan };
