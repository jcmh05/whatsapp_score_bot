module.exports = {
    match: /^\/reply$/i,
    callback: async (client, message, context) => {
        const { setShouldReply } = context;
        setShouldReply(true);
        await message.reply('✅ Las respuestas automáticas han sido activadas.');
    }
};
