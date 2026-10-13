const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { Client } = require('whatsapp-web.js');
const { withTimeout } = require('../src/timeout');
const { checkWhatsApp } = require('../src/whatsapp-health');

// Only WhatsApp's services are simulated; Chrome, Client.inject and LoadUtils are real.
const fixture = `<!doctype html><title>Offline WhatsApp lifecycle fixture</title><script>
class Model {
    constructor(values = {}) { Object.assign(this, values); this.listeners = {}; }
    on(name, fn) { (this.listeners[name] ??= new Set()).add(fn); }
    off(name, fn) { this.listeners[name]?.delete(fn); }
    emit(name, ...args) { for (const fn of this.listeners[name] || []) fn(...args); }
}
const Socket = new Model({ state: 'CONNECTED', hasSynced: true });
const Cmd = new Model();
window.Debug = { VERSION: 'offline-fixture' };
const modules = {
    WAWebSocketModel: { Socket }, WAWebCmd: { Cmd },
    WAWebConnModel: { Conn: { serialize: () => ({}) } },
    WAWebUserPrefsMeUser: { getMaybeMePnUser: () => ({ user: '34123456789', _serialized: '34123456789@c.us' }) },
    WAWebOfflineHandler: { OfflineMessageHandler: { getOfflineDeliveryProgress: () => 100 } }
};
window.require = name => modules[name] || {};
</script>`;

async function checkWhatsAppLifecycle(browser) {
    const server = http.createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(fixture);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const page = await browser.newPage();
    const client = new Client({ webVersionCache: { type: 'none' } });
    client.pupPage = page;
    client.pupBrowser = browser;
    client.setDeviceName = async () => {}; // The fixture has no device registration service.
    let listenerAttachments = 0;
    client.attachEventListeners = async () => { listenerAttachments++; };
    let readyEvents = 0;
    client.on('ready', () => { readyEvents++; });
    client.on('error', error => { throw error; });
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
        await page.goto(url);
        const ready = once(client, 'ready');
        await Promise.all([client.inject(), client.inject()]);
        await withTimeout(ready, 3000, 'Sesión ya sincronizada');
        assert.equal(await client.getState(), 'CONNECTED');
        assert(await page.evaluate(() => typeof window.WWebJS?.getChat === 'function' && typeof window.WWebJS?.getContact === 'function'));
        assert.equal(listenerAttachments, 1);
        assert.equal((await checkWhatsApp(client)).bridge, true);

        client._registerFramenavigatedHandler();
        await page.evaluate(async () => {
            const frame = document.createElement('iframe');
            const loaded = new Promise(resolve => frame.onload = resolve);
            frame.src = '/child-frame'; document.body.append(frame); await loaded;
            window.require('WAWebSocketModel').Socket.emit('change:hasSynced');
        });
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(readyEvents, 1, 'Los iframes y eventos repetidos no deben duplicar ready.');
        assert.equal(listenerAttachments, 1);

        const reloaded = once(client, 'ready');
        await page.goto(`${url}/reload`);
        await withTimeout(reloaded, 3000, 'Recuperación tras recargar WhatsApp');
        assert.equal(await client.getState(), 'CONNECTED');
        assert(await page.evaluate(() => typeof window.WWebJS?.getChat === 'function' && typeof window.WWebJS?.getContact === 'function'));
        assert.equal(readyEvents, 2); assert.equal(listenerAttachments, 2);
        const listeners = await page.evaluate(() => {
            const socket = window.require('WAWebSocketModel').Socket;
            return [...socket.listeners['change:hasSynced']].length;
        });
        assert.equal(listeners, 1);
        await page.evaluate(() => { delete window.WWebJS; });
        await assert.rejects(checkWhatsApp(client), { code: 'WA_BRIDGE_MISSING' });
        console.log('WhatsApp comprobado en Chrome real: sesión sincronizada, iframe, eventos repetidos y recuperación tras recarga (sin cuenta).');
    } finally {
        await page.close();
        await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    }
}

module.exports = { checkWhatsAppLifecycle };
