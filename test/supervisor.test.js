const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { Supervisor } = require('../src/supervisor');
const logger = { log() {}, error() {} };
function child() {
    const c = new EventEmitter(); c.connected = true;
    c.kill = signal => { c.signal = signal; setImmediate(() => c.emit('exit', null, signal)); };
    c.send = () => setImmediate(() => c.emit('exit', 0, null));
    return c;
}
test('relanza el proceso después de una caída y se detiene sin otro reinicio', async () => {
    const children = [];
    const s = new Supervisor({ spawn: () => { const c = child(); children.push(c); return c; },
        baseDelay: 5, maxDelay: 10, logger });
    s.start();
    const restarted = once(s, 'spawn');
    children[0].emit('exit', 1, null);
    await restarted;
    assert.equal(children.length, 2);
    const stopped = once(s, 'stopped'); s.stop(); await stopped;
    assert.equal(s.child, null); assert.equal(s.stopped, true);
});
test('mata un proceso que deja de emitir señales de vida', async () => {
    const c = child();
    const s = new Supervisor({ spawn: () => c, heartbeatTimeout: 10, checkInterval: 5, baseDelay: 100, logger });
    const exited = once(s, 'exit'); s.start(); await exited;
    assert.equal(c.signal, 'SIGKILL'); s.stop();
});
test('un error de configuración para el supervisor y evita un bucle de reintentos', async () => {
    const c = child(); const s = new Supervisor({ spawn: () => c, logger });
    const fatal = once(s, 'fatal'); s.start(); c.emit('exit', 2, null);
    assert.deepEqual(await fatal, [2]); assert.equal(s.stopped, true);
});
