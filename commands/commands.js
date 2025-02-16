module.exports = {
    match: /^\/commands$/i,
    callback: async (client, message, context) => {
        const commandsList = [
            '- ping - Responde con "pong".',
            '- +1 - Añade un punto al mes actual',
            '- -1 - Resta un punto al mes actual',
            '- /top - Muestra el ranking global de usuarios.',
            '- /mes - Muestra el ranking del mes actual.',
            '- /noreply - Desactiva la respuesta automática "✅".',
            '- /reply - Activa la respuesta automática "✅".',
            '- /fact - Da un dato aleatorio',
            '- /hours - Informa sobre las horas donde se suman los puntos',
            '- /hourschart - Gráfico en forma de imagen sobre el horario',
            '- /status - Informa sobre el estado del bot',
            '- /weather:nombre_ciudad - Previsión del tiempo para un lugar',
            '- /fluky:op1,op2,op3... - Selecciona una opción aleatoriamente',
            '- /rewind - Devuelve estadísticas de una persona a final de año',
            '- /rewindchart - Devuelve una gráfica resumen de una persona a final de año',
            '- /week - Muesta los puntos sumados por día de la semana',
            '- /weekchart - Muestra una gráfica de los puntos sumados por día de la semana',
            '- /commands - Muestra esta lista de comandos.'
        ];

        let reply = '*Lista de Comandos:*\n';
        commandsList.forEach(cmd => {
            reply += `${cmd}\n`;
        });

        await message.reply(reply);
    }
};
