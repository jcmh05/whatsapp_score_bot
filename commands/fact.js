const Fact = require('../models/Fact');

module.exports = {
    match: /^\/fact$/i,
    callback: async (client, message, context) => {
        try {
            // Obtener un hecho aleatorio
            const fact = await Fact.aggregate([{ $sample: { size: 1 } }]);

            if (fact.length === 0) {
                await message.reply('No se me ocurre nada');
                return;
            }

            const factText = fact[0].text;

            // Enviar el hecho al usuario
            await message.reply(factText);

            // Eliminar el hecho de la base de datos
            await Fact.deleteOne({ _id: fact[0]._id });
        } catch (error) {
            console.error('Error al obtener un hecho:', error);
            await message.reply('Hubo un error al obtener un hecho. Por favor, intenta nuevamente.');
        }
    }
};
