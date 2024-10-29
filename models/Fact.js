const mongoose = require('mongoose');

const factSchema = new mongoose.Schema({
    text: { type: String, required: true }
});

module.exports = mongoose.model('Fact', factSchema);
