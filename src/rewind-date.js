const moment = require('moment-timezone');
const config = require('../config');

function rewindAvailability(command, date = moment()) {
    const now = moment(date).tz(config.TIMEZONE);
    const unlock = now.clone().month(11).date(20).startOf('day');
    if (!now.isBefore(unlock)) return null;
    const duration = moment.duration(unlock.diff(now));
    const days = Math.floor(duration.asDays());
    const hours = duration.hours();
    const minutes = duration.minutes();
    return `El comando ${command} estará disponible el 20 de diciembre de ${now.year()}. ` +
        `Faltan ${days} día${days !== 1 ? 's' : ''}, ${hours} hora${hours !== 1 ? 's' : ''} y ` +
        `${minutes} minuto${minutes !== 1 ? 's' : ''}.`;
}

module.exports = { rewindAvailability };
