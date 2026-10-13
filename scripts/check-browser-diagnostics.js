const assert = require('node:assert/strict');
const { watchBrowser } = require('../src/browser-diagnostics');
const { readResources } = require('../src/resources');

async function checkBrowserDiagnostics(browser) {
    const page = await browser.newPage();
    let stopping = false;
    const failures = [], logs = [];
    try {
        const session = await watchBrowser({ pupBrowser: browser, pupPage: page }, {
            fail: error => failures.push(error),
            reportResources: async () => {},
            logger: { error: value => logs.push(value) },
            isStopping: () => stopping
        });
        assert(session, 'Chrome debe permitir obtener el motivo de la caída.');
        const { targetInfos } = await session.send('Target.getTargets');
        assert(targetInfos.some(target => target.type === 'page'));
        assert.equal(failures.length, 0); assert.equal(logs.length, 0);
        const resources = await readResources();
        assert(resources.nodeRssMiB > 0);
        console.log(`Diagnóstico CDP y lectura de recursos comprobados: ${JSON.stringify(resources)}`);
    } finally {
        stopping = true;
        await page.close().catch(() => {});
    }
}

module.exports = { checkBrowserDiagnostics };
