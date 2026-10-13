const { withTimeout } = require('./timeout');

function unavailable(code, message) {
    return Object.assign(new Error(message), { code });
}

async function checkWhatsApp(client, { timeoutMs = 10000 } = {}) {
    let snapshot;
    try {
        snapshot = await withTimeout(client.pupPage.evaluate(() => {
            const bridge = window.WWebJS;
            let state = null;
            try { state = window.require?.('WAWebSocketModel')?.Socket?.state ?? null; } catch {}
            return {
                state,
                bridge: ['getChat', 'getContact', 'sendMessage', 'getMessageModel']
                    .every(name => typeof bridge?.[name] === 'function'),
                version: window.Debug?.VERSION || 'desconocida'
            };
        }), timeoutMs, 'Respuesta del navegador de WhatsApp');
    } catch (error) {
        throw unavailable('WA_BROWSER_UNAVAILABLE', `El navegador de WhatsApp no responde: ${error.message}`);
    }
    if (!snapshot.bridge) {
        throw unavailable('WA_BRIDGE_MISSING', 'WhatsApp ha perdido las funciones del bot al recargar la página.');
    }
    if (snapshot.state !== 'CONNECTED') {
        throw unavailable('WA_OFFLINE', `Estado de WhatsApp: ${snapshot.state || 'no disponible'}.`);
    }
    return snapshot;
}

function isWhatsAppUnavailable(error) {
    return ['WA_BROWSER_UNAVAILABLE', 'WA_BRIDGE_MISSING'].includes(error?.code) ||
        /Cannot read properties of undefined \(reading '(?:getChat|getContact|sendMessage)'\)|Execution context was destroyed|Target closed|Session closed/i
            .test(error?.message || '');
}

module.exports = { checkWhatsApp, isWhatsAppUnavailable };
