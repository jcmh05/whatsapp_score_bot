module.exports = {
    match: /^\/fluky:(.*)$/i,
    callback: async (client, message, context) => {
        const input = message.body.trim().replace('/fluky:', '').trim();

        if (!input) {
            await message.reply('Por favor, proporciona las opciones separadas por comas. Ejemplo: /fluky:opcion1,opcion2,opcion3');
            return;
        }

        // Dividir las opciones por coma
        const options = input.split(',').map(option => option.trim()).filter(option => option.length > 0);

        if (options.length < 2) {
            await message.reply('Por favor, proporciona al menos dos opciones separadas por comas.');
            return;
        }

        if (options.length > 30) {
            await message.reply('No puedo elegir entre tantas opciones');
            return;
        }

        // Seleccionar aleatoriamente una opción
        const selectedOption = options[Math.floor(Math.random() * options.length)];

        // Respuestas aleatorias para las distintas opciones
        const responses = [
          `Eligo la opción *${selectedOption}*`,
          `Creo que en este caso es mejor escoger *${selectedOption}*`,
          `Por si las moscas, *${selectedOption}*`,
          `Voto por *${selectedOption}*`,
          `La respuesta está clara: *${selectedOption}*`,
          `Mi elección es *${selectedOption}*`,
          `Definitivamente *${selectedOption}* es la mejor opción`,
          `No tengo dudas, *${selectedOption}* es la elección correcta`,
          `Mi instinto me dice que *${selectedOption}* es la mejor opción`,
          `Si fuera por mí, elegiría *${selectedOption}*`,
          `Mi voto va para *${selectedOption}*`,
          `Nada me detiene, *${selectedOption}* es la indicada`,
          `Me convence *${selectedOption}*`,
          `Estoy convencido, *${selectedOption}* es la mejor elección`,
          `Parece que *${selectedOption}* tiene el destino a su favor`,
          `Mi decisión está tomada: *${selectedOption}*`,
          `Después de pensarlo un segundo, *${selectedOption}* es la opción`,
          `No podría dejar pasar la oportunidad de elegir *${selectedOption}*`,
          `Con esa opción, *${selectedOption}*, no hay pierde`,
          `En esta situación, no hay otra opción más que *${selectedOption}*`,
          `Si me dan a elegir, *${selectedOption}* tiene mi voto`,
          `Después de pensarlo, elijo *${selectedOption}* con toda seguridad`,
          `Mi mente ha hablado y dice *${selectedOption}*`,
          `No hay nada mejor que *${selectedOption}* en este momento`,
          `Ya era hora de elegir *${selectedOption}*`,
          `Después de un exhaustivo análisis, *${selectedOption}* es la respuesta`,
          `Es lo más sensato, *${selectedOption}* es mi opción`,
          `¡Me quedo con *${selectedOption}* sin pensarlo!`,
          `Mi suerte me dice que *${selectedOption}* es la indicada`,
          `Si pudiera elegir mil veces, siempre elegiría *${selectedOption}*`,
          `Para mí no hay duda, *${selectedOption}* es la correcta`,
          `¡Por supuesto! *${selectedOption}* es la elección ganadora`,
          `Aquí no hay misterio, *${selectedOption}* es la correcta`,
          `Es una elección fácil: *${selectedOption}*`,
          `Nada se compara a *${selectedOption}* en este momento`,
          `¡El destino lo ha decidido! *${selectedOption}* es la mejor`,
          `No hay forma de que *${selectedOption}* sea una mala elección`,
          `De todo lo que hay, me quedo con *${selectedOption}*`,
          `Si la vida me da una opción, elijo *${selectedOption}*`,
          `Con todo, mi voto es para *${selectedOption}*`,
          `¿Quién soy yo para no elegir *${selectedOption}*?`,
          `La opción es clara: *${selectedOption}*`,
          `Sin más, *${selectedOption}* para mí`,
          `Como un sabio dijo una vez: *${selectedOption}*`,
          `Que se haga justicia, *${selectedOption}* es la mejor`,
          `No hay vuelta atrás, *${selectedOption}* es lo que elijo`
        ];

        // Seleccionar una respuesta aleatoria
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];

        await message.reply(randomResponse);
    }
};
