const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { browserOptions } = require('../src/browser');
const { checkWhatsAppLifecycle } = require('./check-whatsapp-lifecycle');
const { checkBrowserDiagnostics } = require('./check-browser-diagnostics');

async function checkBrowser() {
    const browser = await puppeteer.launch(browserOptions({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        noSandbox: process.env.PUPPETEER_NO_SANDBOX === 'true',
        dumpio: process.env.PUPPETEER_DUMPIO === 'true'
    }));
    try {
        const page = await browser.newPage();
        await page.setContent('<!doctype html><title>Comprobación de Chrome</title><p id="result">Chrome listo</p>');
        assert.equal(await page.$eval('#result', element => element.textContent), 'Chrome listo');
        console.log(`Chrome comprobado: ${await browser.version()}`);
        await page.close();
        await checkWhatsAppLifecycle(browser);
        await checkBrowserDiagnostics(browser);
    } finally {
        await browser.close();
    }
}

checkBrowser().catch(error => {
    console.error('Falló la comprobación de Chrome/WhatsApp:', error);
    process.exitCode = 1;
});
