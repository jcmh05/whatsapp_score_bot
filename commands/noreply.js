module.exports = {
    match: /^\/noreply$/i,
    callback: async (client, message, context) => {
        const { setShouldReply } = context;
        setShouldReply(false);
        await message.reply('✅ Las respuestas automáticas han sido desactivadas.');
    }
};
