const mongoose = require('mongoose');

module.exports = {
    match: /^\/year:(\d{4})$/i,
    callback: async (client, message, context) => {
        const yearMatch = message.body.match(/^\/year:(\d{4})$/i);
        const year = yearMatch ? yearMatch[1] : null;

        if (!year) {
            await message.reply('Por favor, especifica un año válido. Ejemplo: /year:2023');
            return;
        }

        const collectionName = `users${year}`;
        let UserYearModel;

        try {
            // Verificar si la colección existe
            const collections = await mongoose.connection.db.listCollections().toArray();
            const collectionExists = collections.some(col => col.name === collectionName);

            if (!collectionExists) {
                await message.reply(`No se encontraron datos para el año ${year}.`);
                return;
            }

            // Crear un modelo dinámico para la colección del año
            UserYearModel = mongoose.model(
                `UserYear${year}`,
                new mongoose.Schema({}, { strict: false }),
                collectionName
            );

            // Obtener los usuarios ordenados por totalScore
            const topUsers = await UserYearModel.find().sort({ totalScore: -1 }).limit(10);

            if (topUsers.length === 0) {
                await message.reply(`No hay datos disponibles para mostrar el top del año ${year}.`);
                return;
            }

            // Crear el mensaje de respuesta
            let reply = `*📆 Top de Usuarios - Año ${year}:*\n`;
            topUsers.forEach((user, index) => {
                const name = user.displayName || user._id || 'Usuario';
                let medal = '';

                if (index === 0) medal = '🥇 ';
                else if (index === 1) medal = '🥈 ';
                else if (index === 2) medal = '🥉 ';

                reply += `${index + 1}. ${medal}${name} - Total: ${user.totalScore}\n`;
            });

            await message.reply(reply);

        } catch (error) {
            console.error('Error al ejecutar el comando /year:', error);
            await message.reply('Hubo un error al obtener los datos del año solicitado. Por favor, intenta nuevamente.');
        }
    }
};
