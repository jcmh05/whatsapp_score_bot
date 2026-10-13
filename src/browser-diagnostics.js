const { withTimeout } = require('./timeout');

async function watchBrowser(client, { fail, reportResources, logger = console, isStopping = () => false }) {
    const browser = client.pupBrowser, page = client.pupPage;
    if (!browser || !page) return;
    // Register before WhatsApp loads, including crashes before authenticated/ready.
    page.on('error', error => { if (!isStopping()) fail(error); });
    browser.on('disconnected', () => { if (!isStopping()) fail(new Error('Chromium se ha cerrado.')); });
    if (!browser.target) return; // The integration fixture has no CDP connection.
    try {
        const session = await withTimeout(browser.target().createCDPSession(), 5000, 'Diagnóstico de Chrome');
        session.on('Target.targetCrashed', ({ status, errorCode }) => {
            logger.error(`Proceso de Chrome caído: ${JSON.stringify({ status, errorCode })}`);
            void reportResources('Chrome caído');
        });
        await withTimeout(session.send('Target.setDiscoverTargets', { discover: true }), 5000, 'Diagnóstico de Chrome');
        return session;
    } catch (error) {
        logger.error(`No se pudo registrar el diagnóstico de Chrome: ${error.message}`);
    }
}

module.exports = { watchBrowser };
