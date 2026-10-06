const moment = require('moment');
require('moment/locale/es');
require('moment-timezone');

moment.locale('es');
// Todos los comandos usan el mismo calendario aunque el servidor esté en UTC.
const timezone = process.env.TIMEZONE || 'Europe/Madrid';
if (!moment.tz.zone(timezone)) throw new Error('TIMEZONE no es una zona horaria válida.');
moment.tz.setDefault(timezone);

module.exports = {
    MONTH_START_DAY: 1,
    TIMEZONE: timezone,
    DEFAULT_CITY: 'Jaen',
    SHOW_LOGS: false
};
