const mongoose = require('mongoose');

// Se escribe en la misma transacción que el contador: un mensaje repetido no suma dos veces.
const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    processedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }
});

module.exports = mongoose.model('MessageReceipt', schema);
