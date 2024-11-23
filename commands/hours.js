const User = require('../models/User');

module.exports = {
    match: /^\/hours$/i,
    callback: async (client, message, context) => {
        try {
            let senderId;
            let displayName;

            if (message.from.includes('@g.us')) {
                // Mensaje de grupo
                senderId = message.author;
                if (!senderId) {
                    await message.reply('No se pudo identificar al autor del mensaje.');
                    return;
                }
                // Obtener el nombre del contacto
                const contact = await client.getContactById(senderId);
                displayName = contact.pushname || contact.verifiedName || contact.name || 'Usuario';
            } else {
                // Mensaje individual
                senderId = message.from;
                const contact = await message.getContact();
                displayName = contact.pushname || contact.verifiedName || contact.name || 'Usuario';
            }

            const user = await User.findById(senderId);

            if (!user) {
                await message.reply('No tienes datos registrados aún.');
                return;
            }

            const hoursMap = user.hours || new Map();
            const counts = Array.from({ length: 24 }, (_, i) => hoursMap.get(`h${i}`) || 0);
            const maxCount = Math.max(...counts);

            let scale = 1;
            if (maxCount > 8) {
                scale = 8 / maxCount;
            }

            let reply = `*🕒 Registro de Horas para ${displayName}:*\n`;

            for (let i = 0; i < 24; i++) {
                const hourKey = `h${i}`;
                const count = hoursMap.get(hourKey) || 0;
                let numEmojis = Math.ceil(count * scale);

                if (maxCount > 8 && numEmojis > 8) {
                    numEmojis = 8;
                }

                const bar = numEmojis > 0 ? '⬛'.repeat(numEmojis) : '⬜';
                reply += `${i.toString().padStart(2, '0')}:00 | ${bar} (${count})\n`;
            }

            await message.reply(reply);
        } catch (error) {
            console.error('Error al generar la gráfica con emojis:', error);
            await message.reply('Hubo un error al generar tu gráfica de horas.');
        }
    }
};
