module.exports = {
    match: /^ping$/i,
    callback: async (client, message) => {
        await message.reply('pong');
    }
};
