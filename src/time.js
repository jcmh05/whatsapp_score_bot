const moment = require('moment-timezone');
const config = require('../config');

function scorePeriod(date = moment()) {
    const now = moment(date).tz(config.TIMEZONE);
    const effective = now.clone();
    if (now.date() < config.MONTH_START_DAY) effective.subtract(1, 'month');
    return { year: effective.year(), month: effective.format('MMMM'),
        hourKey: `h${now.hour()}`, dayKey: now.format('dddd').toLowerCase() };
}

module.exports = { scorePeriod };
