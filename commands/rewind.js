const { getContactInfo } = require('../src/contact');
const User = require('../models/User');
const moment = require('moment-timezone');
const config = require('../config');

const REWIND_START_DATE = moment.tz('2025-12-21 20:30', 'YYYY-MM-DD HH:mm', config.TIMEZONE);

/**
 * Obtiene la posición del usuario en el top global.
 * @param {String} userId - ID del usuario.
 * @returns {Number} Posición del usuario (1-based).
 */
async function getUserRank(userId) {
    const users = await User.find().sort({ totalScore: -1, _id: 1 }); // Eliminado .lean()
    const rank = users.findIndex(user => user._id === userId) + 1;
    return rank;
}

/**
 * Encuentra al rival más cercano del usuario y calcula la distancia promedio.
 * @param {String} userId - ID del usuario.
 * @param {Map} userMonthlyScores - Puntuaciones mensuales del usuario.
 * @returns {Object} Contiene el displayName del rival y la distancia promedio.
 */
async function getClosestRival(userId, userMonthlyScores) {
    const currentYear = moment().tz(config.TIMEZONE).year();

    // Filtrar meses hasta noviembre para excluir diciembre
    const filteredMonths = Array.from(userMonthlyScores.keys()).filter(month => {
        const monthMoment = moment(month, 'MMMM', 'es');
        return monthMoment.year() === currentYear && monthMoment.month() !== 11; // 11 = Diciembre (0-based)
    });

    // Obtener las puntuaciones mensuales del usuario excluyendo diciembre
    const userScores = filteredMonths.map(month => userMonthlyScores.get(month));

    // Obtener todos los usuarios excluyendo el actual
    const otherUsers = await User.find({ _id: { $ne: userId } });

    let closestRival = null;
    let smallestDifference = Infinity;
    let averageDistance = 0;

    for (const otherUser of otherUsers) {
        // Asegurarse de que otherUser.monthlyScores es un Map
        if (!(otherUser.monthlyScores instanceof Map)) {
            continue; // Saltar si no es un Map
        }

        const otherScores = filteredMonths.map(month => otherUser.monthlyScores.get(month) || 0);

        // Calcular la diferencia absoluta total entre los meses
        const differences = userScores.map((score, idx) => Math.abs(score - otherScores[idx]));
        const totalDifference = differences.reduce((acc, diff) => acc + diff, 0);
        const avgDiff = differences.length > 0 ? (totalDifference / differences.length) : 0;

        if (totalDifference < smallestDifference) {
            smallestDifference = totalDifference;
            closestRival = otherUser.displayName !== 'Usuario' ? otherUser.displayName : otherUser._id;
            averageDistance = avgDiff;
        }
    }

    return {
        rivalName: closestRival || 'N/A',
        avgDistance: averageDistance.toFixed(2)
    };
}

module.exports = {
    match: /^\/rewind$/i,
    callback: async (client, message, context) => {
        try {
          const now = moment().tz(config.TIMEZONE);

          if (now.isBefore(REWIND_START_DATE)) {
              // Calcular tiempo restante
              const duration = moment.duration(REWIND_START_DATE.diff(now));
              const days = Math.floor(duration.asDays());
              const hours = duration.hours();
              const minutes = duration.minutes();

              const timeLeftMessage = `El comando /rewind estará disponible en ${days} día${days !== 1 ? 's' : ''}, ${hours} hora${hours !== 1 ? 's' : ''} y ${minutes} minuto${minutes !== 1 ? 's' : ''}.`;
              await message.reply(timeLeftMessage);
              return;
          }

            // Identificar al usuario que envió el mensaje
            const { id: senderId, name: displayName } = await getContactInfo(client, message);

            if (config.SHOW_LOGS) {
                console.log(`Usuario identificado para /rewind: ${displayName} (${senderId})`);
            }

            // Buscar el usuario en la base de datos
            const user = await User.findById(senderId);

            if (!user) {
                if (config.SHOW_LOGS) {
                    console.log(`Usuario no encontrado en la base de datos: ${senderId}`);
                }
                await message.reply('No tienes datos registrados aún.');
                return;
            }

            const currentYear = now.year();

            // Obtener la posición del usuario en el top global
            const rank = await getUserRank(senderId);
            const totalUsers = await User.countDocuments();

            // Mensaje especial según la posición
            let rankMessage = '';
            if (rank === 1) {
                rankMessage = '¡Felicidades por quedar en *primer* puesto! 🥇';
            } else if (rank === 2) {
                rankMessage = '🥈';
            } else if (rank === 3) {
                rankMessage = '🥉';
            } else if (rank === totalUsers) {
                rankMessage = '¡Felicidades por quedar en *última* posición!';
            } else {
                rankMessage = `Has quedado en la posición *${rank}* de ${totalUsers}. ¡Sigue así!`;
            }

            // Estadísticas mensuales
            const monthlyScores = user.monthlyScores || new Map();
            const months = Array.from(monthlyScores.keys()).filter(month => {
                const monthMoment = moment(month, 'MMMM', 'es');
                return monthMoment.isValid() && monthMoment.month() !== 11 && monthMoment.year() === currentYear; // Excluir Diciembre
            });

            if (months.length === 0) {
                await message.reply('No tienes suficientes datos mensuales para generar estadísticas.');
                if (config.SHOW_LOGS) {
                    console.log(`Usuario ${displayName} (${senderId}) no tiene datos mensuales válidos.`);
                }
                return;
            }

            const yearScores = months.reduce((acc, month) => {
                const score = monthlyScores.get(month);
                acc.push({ month, score });
                return acc;
            }, []);

            // Encontrar el mes con mejor y peor puntuación
            let bestMonth = null;
            let worstMonth = null;
            let maxScore = -Infinity;
            let minScore = Infinity;

            yearScores.forEach(({ month, score }) => {
                if (score > maxScore) {
                    maxScore = score;
                    bestMonth = month;
                }
                if (score < minScore) {
                    minScore = score;
                    worstMonth = month;
                }
            });

            // Calcular estabilidad de puntuaciones (desviación estándar)
            const scoresArray = yearScores.map(entry => entry.score);
            const meanScore = scoresArray.reduce((acc, val) => acc + val, 0) / scoresArray.length;
            const variance = scoresArray.reduce((acc, val) => acc + Math.pow(val - meanScore, 2), 0) / scoresArray.length;
            const stdDeviation = Math.sqrt(variance).toFixed(2);
            let stabilityMessage = stdDeviation < 5
                ? 'has mantenido una consistencia notable, '
                : stdDeviation < 10
                    ? ' han mostrado una buena estabilidad a lo largo del año, '
                    : ' han variado significativamente a lo largo del año, ';

            stabilityMessage += ` contando con ${stdDeviation} puntos de variación entre los distintos meses`

            // Estadísticas por horario
            const hoursMap = user.hours || new Map();
            const totalPointsWithHours = Array.from(hoursMap.values()).reduce((a, b) => a + b, 0);

            let morningPoints = 0;
            let afternoonPoints = 0;
            let nightPoints = 0;

            for (let i = 0; i < 24; i++) {
                const points = hoursMap.get(`h${i}`) || 0;
                if (i >= 6 && i < 13) { // Mañana: 6-12
                    morningPoints += points;
                } else if (i >= 13 && i < 20) { // Tarde: 13-19
                    afternoonPoints += points;
                } else { // Noche: 20-5
                    nightPoints += points;
                }
            }

            const morningPercentage = totalPointsWithHours ? ((morningPoints / totalPointsWithHours) * 100).toFixed(2) : 0;
            const afternoonPercentage = totalPointsWithHours ? ((afternoonPoints / totalPointsWithHours) * 100).toFixed(2) : 0;
            const nightPercentage = totalPointsWithHours ? ((nightPoints / totalPointsWithHours) * 100).toFixed(2) : 0;

            // Hora con más puntos
            let starHour = '00:00';
            let maxHourPoints = -Infinity;
            for (let i = 0; i < 24; i++) {
                const points = hoursMap.get(`h${i}`) || 0;
                if (points > maxHourPoints) {
                    maxHourPoints = points;
                    starHour = `${i.toString().padStart(2, '0')}:00`;
                }
            }

            // Promedio de tiempo por punto
            const dayOfYear = now.dayOfYear();
            const activeHoursPerDay = 24 - 8; // Excluyendo 8 horas de sueño
            const totalActiveHours = activeHoursPerDay * dayOfYear;
            const averageHoursPerPoint = user.totalScore ? (totalActiveHours / user.totalScore) : 0;
            const avgHours = Math.floor(averageHoursPerPoint);
            const avgMinutes = Math.floor((averageHoursPerPoint - avgHours) * 60);

            // Encontrar al rival más cercano y su distancia promedio
            const { rivalName, avgDistance } = await getClosestRival(senderId, monthlyScores);

            // Construir el mensaje de rewind
            let rewindMessage = `Hola ${displayName}, este año has quedado top ${rank} ${rankMessage}\n\n`;
            rewindMessage += `Aquí te van algunos datos sobre tus puntuaciones en ${currentYear}:\n\n`;
            rewindMessage += `- Cada mes sueles sumar entre ${minScore} y ${maxScore} puntos. Siendo *${bestMonth}* el mes que mejor te ha ido y siendo *${worstMonth}* el mes que peor te fue.\n\n`;
            rewindMessage += `- Tu rival más cercano ha sido *${rivalName}*, con quien en promedio has estado a ${avgDistance} puntos de distancia medios cada mes.\n\n`;
            rewindMessage += `- Has sumado el ${morningPercentage}% por la mañana, el ${afternoonPercentage}% por la tarde y el ${nightPercentage}% por la noche, siendo las *${starHour}* tu hora estrella.\n\n`;
            rewindMessage += `- En promedio sumas un punto cada ${avgHours} horas y ${avgMinutes} minutos.\n\n`;
            rewindMessage += `- Tus puntuaciones ${stabilityMessage}\n\n`;
            rewindMessage += `¡Gracias por participar y que el próximo año sea aún mejor! 🎉`;

            await message.reply(rewindMessage);

            if (config.SHOW_LOGS) {
                console.log(`Comando /rewind ejecutado por ${displayName} (${senderId})`);
            }

        } catch (error) {
            if (config.SHOW_LOGS) {
                console.error('Error al ejecutar el comando /rewind:', error);
            }
            await message.reply('Hubo un error al generar tus estadísticas de rewind. Por favor, intenta nuevamente.');
        }
    }
};
