const mongoose = require('mongoose');
const User = require('../models/User');
const { scorePeriod } = require('./time');

// Archivar y vaciar los contadores juntos; nunca sobrescribir un archivo anual existente.
async function ensureCurrentYear(date) {
    const year = scorePeriod(date).year;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const users = await User.find().session(session);
            for (const user of users) {
                if (!Number.isInteger(user.scoreYear)) {
                    throw new Error('Hay usuarios sin scoreYear. Identifica el año antes de iniciar el bot.');
                }
                if (user.scoreYear > year) throw new Error('La fecha del servidor es anterior al año de los datos.');
                if (user.scoreYear === year) continue;
                const archive = mongoose.connection.db.collection(`users${user.scoreYear}`);
                const archived = await archive.findOne({ _id: user._id }, { session });
                if (archived) throw new Error('Ya existe un archivo anual para este usuario. Revisa los datos antes de reiniciar.');
                await archive.insertOne(user.toObject({ flattenMaps: true }), { session });
                user.scoreYear = year;
                user.totalScore = 0;
                user.lastCongratulated = 0;
                user.monthlyScores = new Map();
                user.hours = new Map();
                user.week = new Map();
                user.importMetadata = undefined;
                await user.save({ session });
            }
        });
    } finally {
        await session.endSession();
    }
}

module.exports = { ensureCurrentYear };
