const Fact = require('../models/Fact');
const config = require('../config');

const log = (...args) => {
    if (config.SHOW_LOGS) {
        console.log(...args);
    }
};

module.exports = {
    match: /^\/addfact:(.+)$/i,
    callback: async (client, message) => {
        try {
            const senderId = message.from.includes('@g.us') ? message.author : message.from;

            if (!senderId) {
                log('No se pudo determinar el senderId del mensaje.');
                await message.reply('Error al procesar el comando. No se pudo identificar al remitente.');
                return;
            }

            // Verificar si el administrador está definido en el archivo .env
            const adminId = process.env.ADMIN;

            if (!adminId) {
                log('El comando /addfact fue ejecutado pero no se ha configurado un administrador.');
                await message.reply('Error: No se ha configurado un administrador en el sistema.');
                return;
            }

            // Comprobar si el usuario que envió el mensaje es el administrador
            if (senderId !== adminId) {
                log(`El comando /addfact fue rechazado. SenderId: ${senderId}. Se esperaba: ${adminId}.`);
                await message.reply(`Este comando solo puede ser ejecutado por el administrador del bot`);
                return;
            }

            log(`El comando /addfact fue aceptado. SenderId: ${senderId}. Se esperaba: ${adminId}.`);

            // Extraer el texto después de ":"
            const match = message.body.match(/^\/addfact:(.+)$/i);
            if (!match || !match[1].trim()) {
                log(`El comando /addfact falló por falta de contenido. SenderId: ${senderId}.`);
                await message.reply('Por favor, proporciona un texto válido. Ejemplo: /addfact:Este es un dato curioso.');
                return;
            }

            const factText = match[1].trim();

            const newFact = new Fact({ text: factText });
            await newFact.save();

            log(`Nuevo hecho añadido correctamente por ${senderId}: "${factText}".`);

            await message.reply('Dato añadido ✅');
        } catch (error) {
            log(`Error al añadir un dato. SenderId: ${message.from || 'indefinido'}. Error: ${error.message}`);
            console.error('Error al añadir un dato:', error);
            await message.reply('Error al añadir el dato ❌. Por favor, intenta nuevamente.');
        }
    }
};
