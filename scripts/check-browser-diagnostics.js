const assert = require('node:assert/strict');
const { once } = require('node:events');
const { watchBrowser } = require('../src/browser-diagnostics');
const { withTimeout } = require('../src/timeout');

async function checkBrowserDiagnostics(browser) {
    const page = await browser.newPage();
    let stopping = false, resourceReports = 0;
    const failures = [], logs = [];
    try {
        const session = await watchBrowser({ pupBrowser: browser, pupPage: page }, {
            fail: error => failures.push(error),
            reportResources: async () => { resourceReports++; },
            logger: { error: value => logs.push(value) },
            isStopping: () => stopping
        });
        assert(session, 'Chrome debe permitir obtener el motivo de la caída.');
        const nativeCrash = once(session, 'Target.targetCrashed');
        const pageCrash = once(page, 'error');
        const pageSession = await page.createCDPSession();
        // Crash only this account-free test page; keep the browser alive to inspect the event.
        void pageSession.send('Page.crash').catch(() => {});
        const [[details]] = await withTimeout(Promise.all([nativeCrash, pageCrash]), 5000, 'Diagnóstico de caída real');
        assert.equal(typeof details.status, 'string');
        assert.equal(typeof details.errorCode, 'number');
        assert(failures.some(error => error.message === 'Page crashed!'));
        assert(logs.some(line => line.includes('Proceso de Chrome caído')));
        assert.equal(resourceReports, 1);
        console.log(`Diagnóstico comprobado con caída real de una página de prueba: ${JSON.stringify({ status: details.status, errorCode: details.errorCode })}`);
    } finally {
        stopping = true;
        await page.close().catch(() => {});
    }
}

module.exports = { checkBrowserDiagnostics };
