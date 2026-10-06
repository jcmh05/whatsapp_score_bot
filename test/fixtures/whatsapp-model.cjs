// Ejecuta Client/Message y el código inyectado de la librería; simula solo servicios de WhatsApp.
const vm = require('node:vm');
const { Client, Message } = require('whatsapp-web.js');
const { LoadUtils } = require('whatsapp-web.js/src/util/Injected/Utils');
const GROUP = '120363000000000000@g.us';
const PHONE = '34123456789@c.us';

function transport({ privateMediaId = undefined } = {}) {
    const sent = [], reactions = [], messages = new Map();
    let sequence = 0;
    const wid = value => ({ $1: value, user: value.split('@')[0], server: value.split('@')[1],
        isLid: () => value.endsWith('@lid'), isGroup: () => value.endsWith('@g.us'), isStatus: () => false });
    class MsgKey {
        constructor({ to, id }) { this.fromMe = true; this.remote = to; this.id = id; this.$1 = `true_${to.$1}_${id}`; }
        static async newId() { return `outgoing-${++sequence}`; }
    }
    const chat = { id: wid(GROUP), groupMetadata: { isLidAddressingMode: false } };
    const modules = {
        WAWebChatGetters: { getIsNewsletter: () => false, getIsBroadcast: () => false },
        WALinkify: { findLink: () => null, findLinks: () => [] },
        WAWebUserPrefsMeUser: { getMaybeMeLidUser: () => wid('12345@lid'), getMaybeMePnUser: () => wid(PHONE) },
        WAWebWidFactory: { createWid: wid, asUserWidOrThrow: value => value },
        WAWebMsgKey: MsgKey,
        WAWebGetEphemeralFieldsMsgActionsUtils: { getEphemeralFields: () => ({}) },
        WAWebStreamModel: { Stream: { markAvailable() {}, markUnavailable() {} } },
        WAWebUpdateUnreadChatAction: { async sendSeen() {} },
        WAWebMsgReply: { canReplyMsg: () => true },
        WAWebSendReactionMsgAction: { sendReactionToMsg: async (message, emoji) => reactions.push({ id: message.id.$1, emoji }) },
        WAWebCollections: {
            Chat: { get: () => chat },
            Msg: { get: id => messages.get(id), getMessagesById: async ids => ({ messages: ids.map(id => messages.get(id)).filter(Boolean) }) }
        },
        WAWebSendMsgChatAction: {
            addAndSendMsgToChat(_chat, payload) {
                // El modelo de medios real puede aportar __x_id e id undefined o de otro modelo.
                // El Msg de WhatsApp da prioridad al campo privado aunque esté presente sin valor.
                const modelId = Object.hasOwn(payload, '__x_id') ? payload.__x_id : payload.id;
                if (!modelId?.id) throw new Error("Data passed to getter must include an id property (it's how we memoize) but got undefined");
                const model = { ...payload, serialize: () => ({ ...payload }) };
                messages.set(modelId.$1, model); sent.push(payload);
                return [Promise.resolve(model), Promise.resolve({ ack: 1 })];
            }
        }
    };
    const window = { require: name => {
        if (!(name in modules)) throw new Error(`Falta servicio de prueba: ${name}`);
        return modules[name];
    } };
    const context = vm.createContext({ window, console });
    vm.runInContext(`(${LoadUtils.toString()})()`, context);
    window.WWebJS.processMediaData = async () => ({
        __x_id: privateMediaId, id: privateMediaId, type: 'image', preview: 'preview',
        clientUrl: 'https://media.invalid/file', uploadhash: 'upload-hash', mediaHandle: 'media-handle',
        toJSON: () => ({ type: 'image', id: privateMediaId })
    });
    const client = new Client();
    client.pupPage = { evaluate: (fn, ...args) => vm.runInContext(`(${fn.toString()})`, context)(...args) };
    client.getContactById = async () => ({ pushname: 'Test' });
    client.getContactLidAndPhone = async () => [{ lid: '12345@lid', pn: PHONE }];

    function incoming(body, { remote = GROUP, author = PHONE, id = `incoming-${++sequence}`, timestamp = 1791306000 } = {}) {
        const key = { fromMe: false, remote: wid(remote), id, $1: `false_${remote}_${id}` };
        const data = { id: key, from: wid(remote), to: wid(PHONE), author: wid(author),
            body, type: 'chat', t: timestamp, mentionedJidList: [] };
        const model = { ...data, unsafe: () => data, msgContextInfo: () => ({ quotedStanzaID: id }) };
        messages.set(key.$1, model);
        return new Message(client, data);
    }
    return { client, incoming, sent, reactions, window };
}

module.exports = { transport, GROUP, PHONE };
