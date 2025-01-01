const User = require('../models/User');

module.exports = {
    match: /^\/week$/i,
    callback: async (client, message, context) => {
        try {
            let senderId;
            let displayName;

            if (message.from.includes('@g.us')) {
                senderId = message.author;
                if (!senderId) {
                    await message.reply('No se pudo identificar al autor del mensaje.');
                    return;
                }
                const contact = await client.getContactById(senderId);
                displayName = contact.pushname || contact.verifiedName || contact.name || 'Usuario';
            } else {
                senderId = message.from;
                const contact = await message.getContact();
                displayName = contact.pushname || contact.verifiedName || contact.name || 'Usuario';
            }

            const user = await User.findById(senderId);

            if (!user) {
                await message.reply('No tienes datos registrados aún.');
                return;
            }

            const weekMap = user.week || new Map();
            const daysOfWeek = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
            const counts = daysOfWeek.map(day => weekMap.get(day) || 0);
            const maxCount = Math.max(...counts);

            let scale = 1;
            if (maxCount > 8) {
                scale = 8 / maxCount;
            }

            let reply = `*📅 Registro de Días para ${displayName}:*\n`;

            daysOfWeek.forEach((day, index) => {
                const count = weekMap.get(day) || 0;
                let numEmojis = Math.ceil(count * scale);
                if (maxCount > 8 && numEmojis > 8) {
                    numEmojis = 8;
                }
                const bar = numEmojis > 0 ? '⬛'.repeat(numEmojis) : '⬜';
                reply += `${day.charAt(0).toUpperCase() + day.slice(1)} | ${bar} (${count})\n`;
            });

            await message.reply(reply);
        } catch (error) {
            console.error('Error al generar la gráfica con emojis:', error);
            await message.reply('Hubo un error al generar tu gráfica de días.');
        }
    }
};
