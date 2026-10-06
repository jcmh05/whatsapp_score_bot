const path = require('node:path');

function settings(env = process.env) {
    if (!env.MONGODB_URI) throw new Error('Falta MONGODB_URI en .env.');
    const botPhone = (env.BOT_PHONE || '').replace(/[\s()+-]/g, '');
    if (botPhone && !/^\d{8,15}$/.test(botPhone)) throw new Error('BOT_PHONE debe ser un número internacional válido.');
    const sessionId = env.SESSION_ID || (botPhone ? `bot-${botPhone}` : 'bot');
    if (!/^[-_\w]+$/.test(sessionId)) throw new Error('SESSION_ID solo admite letras, números, guiones y guiones bajos.');
    const authStrategy = env.AUTH_STRATEGY || 'local';
    if (!['local', 'remote'].includes(authStrategy)) throw new Error('AUTH_STRATEGY debe ser local o remote.');
    const port = Number(env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT no es válido.');
    const backupMs = Number(env.REMOTE_BACKUP_MS || 300000);
    if (!Number.isSafeInteger(backupMs) || backupMs < 60000) throw new Error('REMOTE_BACKUP_MS debe ser al menos 60000.');
    return { botPhone, sessionId, authStrategy, port, backupMs,
        dataPath: path.resolve(env.AUTH_DATA_PATH || '.wwebjs_auth'),
        executablePath: env.PUPPETEER_EXECUTABLE_PATH || undefined,
        noSandbox: env.PUPPETEER_NO_SANDBOX === 'true',
        dumpio: env.PUPPETEER_DUMPIO === 'true' };
}

module.exports = { settings };
