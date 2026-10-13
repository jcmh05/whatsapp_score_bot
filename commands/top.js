const User = require('../models/User');

module.exports = {
    match: /^\/top$/i,
    callback: async (client, message, context) => {
        try {
            const topUsers = await User.find().sort({ totalScore: -1 });

            if (topUsers.length === 0) {
                await message.reply('No hay datos disponibles para mostrar el top.');
                return;
            }

            let reply = '*Top Global de Usuarios:*\n';
            topUsers.forEach((user, index) => {
                const name = user.displayName !== 'Usuario' ? user.displayName : user._id;
                let medal = '';

                if (index === 0) {
                    medal = '🥇 ';
                } else if (index === 1) {
                    medal = '🥈 ';
                } else if (index === 2) {
                    medal = '🥉 ';
                }

                reply += `${index + 1}. ${medal}${name} - Total: ${user.totalScore}\n`;
            });

            await message.reply(reply);
        } catch (error) {
            if (client.durable) throw error;
            console.error('Error al obtener el top global:', error);
            await message.reply('Hubo un error al obtener el top global.');
        }
    }
};
