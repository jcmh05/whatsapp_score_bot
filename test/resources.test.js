const test = require('node:test');
const assert = require('node:assert/strict');
const { readResources, resourceReporter } = require('../src/resources');
const { EventEmitter } = require('node:events');
const { watchBrowser } = require('../src/browser-diagnostics');

test('lee el consumo total del contenedor, su límite y los contadores de OOM, no solo la RAM de Node', async () => {
    const files = { 'memory.current': String(480 * 1024 * 1024), 'memory.max': String(512 * 1024 * 1024),
        'memory.peak': String(512 * 1024 * 1024), 'memory.events': 'low 0\nhigh 0\nmax 23\noom 2\noom_kill 1\n' };
    const result = await readResources({ platform: 'linux', rss: 64 * 1024 * 1024,
        readFile: async filename => files[filename.split('/').at(-1)] });
    assert.deepEqual(result, { nodeRssMiB: 64, containerMiB: 480, limitMiB: 512, peakMiB: 512, oomEvents: 2, oomKills: 1 });
});

test('los datos ausentes o un límite no visible no se confunden con cero memoria o cero OOM', async () => {
    const absent = await readResources({ platform: 'linux', rss: 0, readFile: async () => { throw new Error('ENOENT'); } });
    assert.equal(absent.containerMetrics, 'cgroup v2 no disponible'); assert.equal(absent.oomKills, undefined);
    const result = await readResources({ platform: 'linux', rss: 0,
        readFile: async filename => filename.endsWith('memory.current') ? '1048576' : filename.endsWith('memory.max') ? 'max' : '' });
    assert.equal(result.limitMiB, null); assert.equal(result.oomKills, null);
});

test('distingue un OOM de este arranque de los procesos que Linux mató antes', async () => {
    const logs = [];
    let oomKills = 3;
    const report = resourceReporter({ read: async () => ({ oomKills }), logger: { log: line => logs.push(line), error() {} } });
    await report('inicio'); oomKills = 4; await report('caída');
    assert(logs[0].includes('"oomKillsSinceStart":0'));
    assert(logs[1].includes('"oomKillsSinceStart":1'));
});

test('el diagnóstico captura caídas antes de ready y el motivo nativo sin publicar datos de la página', async () => {
    const page = new EventEmitter(), browser = new EventEmitter(), session = new EventEmitter();
    const requests = [], failures = [], logs = [], reports = [];
    let stopping = false;
    session.send = async (name, options) => { requests.push([name, options]); };
    browser.target = () => ({ createCDPSession: async () => session });
    await watchBrowser({ pupBrowser: browser, pupPage: page }, { fail: error => failures.push(error),
        reportResources: async label => { reports.push(label); }, logger: { error: value => logs.push(value) },
        isStopping: () => stopping });
    assert.deepEqual(requests, [['Target.setDiscoverTargets', { discover: true }]]);
    page.emit('error', new Error('Page crashed!'));
    session.emit('Target.targetCrashed', { status: 'oom', errorCode: 137, targetId: 'private-target', url: 'private-url' });
    assert.equal(failures[0].message, 'Page crashed!');
    assert.deepEqual(reports, ['Chrome caído']);
    assert(logs[0].includes('"status":"oom"')); assert(logs[0].includes('137'));
    assert(!logs[0].includes('private'));
    stopping = true;
    browser.emit('disconnected'); page.emit('error', new Error('Target closed'));
    assert.equal(failures.length, 1, 'El cierre no debe provocar un segundo fallo.');
});
