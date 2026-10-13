let library;
function loadBaileys() { return library ??= import('@whiskeysockets/baileys'); }
module.exports = { loadBaileys };
