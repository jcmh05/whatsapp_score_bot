const { NO_TEMPORAL_DATA, hasRecordedValues } = require('../src/statistics');
const { getContactInfo } = require('../src/contact');
const User = require('../models/User');

module.exports = {
    match: /^\/hours$/i,
    callback: async (client, message, context) => {
        try {
            const { id: senderId, name: displayName } = await getContactInfo(client, message);

            const user = await User.findById(senderId);

            if (!user) {
                await message.reply('No tienes datos registrados aún.');
                return;
            }

            const hoursMap = user.hours || new Map();
            const counts = Array.from({ length: 24 }, (_, i) => hoursMap.get(`h${i}`) || 0);
            if (!hasRecordedValues(counts)) {
                await message.reply(NO_TEMPORAL_DATA);
                return;
            }

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
