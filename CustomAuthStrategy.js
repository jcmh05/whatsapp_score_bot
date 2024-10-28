const { LocalAuth } = require('whatsapp-web.js');
const Session = require('./models/Session');

class CustomAuthStrategy extends LocalAuth {
    constructor(options = {}) {
        super(options);
        this.sessionId = options.sessionId || 'default';
    }

    async loadState() {
        try {
            const session = await Session.findOne({ id: this.sessionId });
            if (session && session.sessionData) {
                return session.sessionData;
            } else {
                return null;
            }
        } catch (error) {
            console.error('Error al cargar la sesión desde MongoDB:', error);
            return null;
        }
    }

    async saveState(sessionData) {
        try {
            let session = await Session.findOne({ id: this.sessionId });
            if (session) {
                session.sessionData = sessionData;
                await session.save();
            } else {
                session = new Session({
                    id: this.sessionId,
                    sessionData: sessionData
                });
                await session.save();
            }
        } catch (error) {
            console.error('Error al guardar la sesión en MongoDB:', error);
        }
    }
}

module.exports = CustomAuthStrategy;
