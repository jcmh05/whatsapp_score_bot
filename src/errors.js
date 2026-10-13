function safeError(error) {
    return String(error?.stack || error).replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/g, '<MongoDB URI omitida>');
}
function permanentError(message) { return Object.assign(new Error(message), { permanent: true }); }
module.exports = { safeError, permanentError };
