const User = require('../models/User');
const moment = require('moment');
const config = require('../config');

/**
 * Función para capitalizar la primera letra de una cadena.
 * @param {String} string - La cadena a capitalizar.
 * @returns {String} - La cadena con la primera letra en mayúscula.
 */
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = {
    match: /^\/average$/i,
    callback: async (client, message, context) => {
        try {
            let senderId;

            if (message.from.includes('@g.us')) {
                // Mensaje de grupo
                senderId = message.author; // ID del remitente dentro del grupo
                if (!senderId) {
                    console.warn('Mensaje de grupo sin author, no se puede procesar.');
                    return;
                }
            } else {
                // Mensaje individual
                senderId = message.from; // ID del remitente
            }

            let user = await User.findById(senderId);

            if (!user) {
                await message.reply('No tienes datos registrados aún.');
                return;
            }

            const totalScore = user.totalScore || 0;
            const monthlyScores = user.monthlyScores || {};

            // Mapear nombres de meses en español a números de mes (0-11)
            const monthNameToNumber = {
                enero: 0,
                febrero: 1,
                marzo: 2,
                abril: 3,
                mayo: 4,
                junio: 5,
                julio: 6,
                agosto: 7,
                septiembre: 8,
                octubre: 9,
                noviembre: 10,
                diciembre: 11
            };

            const monthOrder = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

            const MONTH_START_DAY = config.MONTH_START_DAY; // Por ejemplo, 6

            const currentDate = moment(); // Fecha actual
            const currentYear = currentDate.year();

            let totalDays = 0;
            let monthDays = {};

            for (let i = 0; i < monthOrder.length; i++) {
                const monthName = monthOrder[i];
                const monthNumber = monthNameToNumber[monthName];

                // Fecha de inicio para el mes
                let startDate = moment([currentYear, monthNumber, MONTH_START_DAY]);

                // Fecha de fin para el mes
                let endDate;
                if (monthNumber === 11) {
                    // Diciembre
                    endDate = moment([currentYear + 1, 0, MONTH_START_DAY]); // Enero del próximo año
                } else {
                    endDate = moment([currentYear, monthNumber + 1, MONTH_START_DAY]);
                }

                // Si la fecha actual es antes del inicio del mes, no procesar más meses
                if (currentDate.isBefore(startDate)) {
                    break;
                }

                // Ajustar endDate si la fecha actual es antes de endDate
                if (currentDate.isBefore(endDate)) {
                    endDate = currentDate.clone();
                }

                // Calcular el número de días en el mes
                let days = endDate.diff(startDate, 'days');

                // Evitar valores negativos
                if (days < 0) {
                    days = 0;
                }

                // Acumular total de días
                totalDays += days;

                // Almacenar días por mes
                monthDays[monthName] = days;
            }

            if (totalDays === 0) {
                await message.reply('No hay suficientes datos para calcular tu promedio global.');
                return;
            }

            // Calcular promedio global
            const globalAverage = totalScore / totalDays;

            // Preparar promedios por mes
            let perMonthAverages = '';

            // Ordenar los meses según el orden calendario
            const userMonths = Object.keys(monthlyScores).sort((a, b) => monthNameToNumber[a] - monthNameToNumber[b]);

            userMonths.forEach(monthName => {
                const score = monthlyScores[monthName];
                const days = monthDays[monthName] || 0;

                if (days > 0) {
                    let average = score / days;
                    perMonthAverages += `- ${capitalizeFirstLetter(monthName)}: ${average.toFixed(2)} puntos/día\n`;
                } else {
                    perMonthAverages += `- ${capitalizeFirstLetter(monthName)}: No hay suficientes datos para calcular el promedio.\n`;
                }
            });

            // Preparar el mensaje de respuesta
            const displayName = user.displayName || 'Usuario';

            let reply = `*${displayName}, tu promedio global es ${globalAverage.toFixed(2)} puntos por día.*\n\n`;
            reply += `*Tus promedios por mes son:*\n`;
            reply += perMonthAverages;

            await message.reply(reply);

        } catch (error) {
            console.error('Error al calcular el promedio:', error);
            await message.reply('Hubo un error al calcular tu promedio.');
        }
    }
};
