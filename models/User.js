const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Número de teléfono como _id
    displayName: { type: String, default: 'Usuario' }, // Nombre del usuario
    totalScore: { type: Number, default: 0 }, // Puntaje total acumulado
    lastCongratulated: { type: Number, default: 0 }, // Último múltiplo de 50 felicitado
    monthlyScores: {
        type: Map,
        of: Number,
        default: {}
    }
});

module.exports = mongoose.model('User', userSchema);
