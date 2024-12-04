const User = require('../models/User');
const moment = require('moment');
const config = require('../config');

/**
 * Obtiene el nombre del mes actual considerando el día de inicio.
 * @returns {String} Nombre del mes.
 */
function getCurrentMonth() {
    const now = moment();
    const startOfMonth = moment().date(config.MONTH_START_DAY).startOf('day');

    if (now.isBefore(startOfMonth)) {
        // Si la fecha actual es antes del día de inicio, considera el mes anterior
        return now.subtract(1, 'months').format('MMMM');
    } else {
        return now.format('MMMM');
    }
}

module.exports = {
    match: /^\/mes$/i,
    callback: async (client, message, context) => {
        try {
            const currentMonth = getCurrentMonth();

            const topUsers = await User.find({ [`monthlyScores.${currentMonth}`]: { $exists: true } })
                .sort({ [`monthlyScores.${currentMonth}`]: -1 });

            if (topUsers.length === 0) {
                await message.reply(`No hay datos disponibles para mostrar el top de ${currentMonth}.`);
                return;
            }

            let reply = `*📅Top de ${currentMonth}:*\n`;
            topUsers.forEach((user, index) => {
                const score = user.monthlyScores.get(currentMonth);
                const name = user.displayName !== 'Usuario' ? user.displayName : user._id;
                reply += `${index + 1}. ${name} : ${score}\n`;
            });

            await message.reply(reply);
        } catch (error) {
            console.error('Error al obtener el top mensual:', error);
            await message.reply('Hubo un error al obtener el top del mes.');
        }
    }
};
