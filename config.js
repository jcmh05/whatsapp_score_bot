const moment = require('moment');
require('moment/locale/es');
require('moment-timezone');

moment.locale('es');

module.exports = {
    MONTH_START_DAY: 6,
    TIMEZONE: 'Europe/Madrid', // Zona horaria para España Peninsular
    DEFAULT_CITY: 'Jaen',
    SHOW_LOGS: true 
};
