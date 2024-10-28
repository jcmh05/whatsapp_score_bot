const User = require('../models/User');

module.exports = {
    match: /^\/top$/i,
    callback: async (client, message, context) => {
        try {
            // Obtener los top 10 usuarios por totalScore descendente
            const topUsers = await User.find().sort({ totalScore: -1 }).limit(10);

            if (topUsers.length === 0) {
                await message.reply('No hay datos disponibles para mostrar el top.');
                return;
            }

            let reply = '*Top Global de Usuarios:*\n';
            topUsers.forEach((user, index) => {
                const name = user.displayName !== 'Usuario' ? user.displayName : user._id;
                reply += `${index + 1}. ${name} - Total: ${user.totalScore}\n`;
            });

            await message.reply(reply);
        } catch (error) {
            console.error('Error al obtener el top global:', error);
            await message.reply('Hubo un error al obtener el top global.');
        }
    }
};
