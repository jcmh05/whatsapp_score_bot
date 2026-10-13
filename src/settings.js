function settings(env = process.env) {
    if (!env.MONGODB_URI) throw new Error('Falta MONGODB_URI en .env.');
    const botPhone = (env.BOT_PHONE || '').replace(/[\s()+-]/g, '');
    if (botPhone && !/^\d{8,15}$/.test(botPhone)) throw new Error('BOT_PHONE debe ser un número internacional válido.');
    const sessionId = env.SESSION_ID || (botPhone ? `bot-${botPhone}` : 'bot');
    if (!/^[-_\w]{1,100}$/.test(sessionId)) throw new Error('SESSION_ID solo admite hasta 100 letras, números, guiones y guiones bajos.');
    const port = Number(env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT no es válido.');
    // La sesión siempre reside en MongoDB. Las variables antiguas de Chrome se ignoran.
    return { botPhone, sessionId, port };
}
module.exports = { settings };
