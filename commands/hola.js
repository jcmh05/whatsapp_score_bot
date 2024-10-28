module.exports = {
    match: /^hola$/i,
    callback: async (client, message) => {
        await message.reply('hey');
    }
};
