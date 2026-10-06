const mongoose = require('mongoose');
const User = require('../models/User');
const MessageReceipt = require('../models/MessageReceipt');
const { scorePeriod } = require('./time');

function applyScore(user, body, period, isNew = false) {
    const numeric = /^\d+$/.test(body);
    let score = user.monthlyScores.get(period.month) || 0;
    let congratulations = false;
    if (numeric) {
        score = Number(body);
        if (!Number.isSafeInteger(score)) throw new Error('El número supera el límite permitido.');
    } else if (body === '+1') {
        score++;
        user.hours.set(period.hourKey, (user.hours.get(period.hourKey) || 0) + 1);
        user.week.set(period.dayKey, (user.week.get(period.dayKey) || 0) + 1);
    } else if (body === '-1') {
        if (score === 0) return { score, atZero: true, congratulations: false };
        score--;
        user.hours.set(period.hourKey, Math.max((user.hours.get(period.hourKey) || 0) - 1, 0));
        user.week.set(period.dayKey, Math.max((user.week.get(period.dayKey) || 0) - 1, 0));
    } else {
        throw new Error('Mensaje de puntuación inválido.');
    }
    user.monthlyScores.set(period.month, score);
    user.totalScore = [...user.monthlyScores.values()].reduce((a, b) => a + b, 0);
    if ((isNew && numeric && score >= 50 && score % 50 === 0) ||
        (user.totalScore >= user.lastCongratulated + 50 && user.totalScore % 50 === 0)) {
        congratulations = true;
        user.lastCongratulated = user.totalScore;
    }
    return { score, congratulations, newNumeric: isNew && numeric };
}

async function recordScore({ id, name, body, messageId, date }) {
    if (!messageId) throw new Error('Mensaje sin identificador; no se ha actualizado el contador.');
    const period = scorePeriod(date);
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            result = null;
            if (await MessageReceipt.exists({ _id: messageId }).session(session)) {
                result = { duplicate: true };
                return;
            }
            let user = await User.findById(id).session(session);
            const isNew = !user;
            if (!user) user = new User({ _id: id, displayName: name, scoreYear: period.year,
                monthlyScores: {}, hours: {}, week: {} });
            if (user.scoreYear !== period.year) {
                throw new Error('El año de los datos no coincide con el mensaje. Revisa el archivo anual antes de continuar.');
            }
            if (name !== 'Usuario') user.displayName = name;
            const change = applyScore(user, body, period, isNew);
            await user.save({ session });
            await MessageReceipt.create([{ _id: messageId }], { session });
            result = { ...change, user };
        });
        return result;
    } finally {
        await session.endSession();
    }
}

module.exports = { applyScore, recordScore };
