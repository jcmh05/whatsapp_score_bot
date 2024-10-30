module.exports = {
    match: /^\/commands$/i,
    callback: async (client, message, context) => {
        const commandsList = [
            'ping - Responde con "pong".',
            '+1 - Añade un punto al mes actual',
            '-1 - Resta un punto al mes actual',
            '/top - Muestra el ranking global de usuarios.',
            '/mes - Muestra el ranking del mes actual.',
            '/noreply - Desactiva la respuesta automática "✅".',
            '/reply - Activa la respuesta automática "✅".',
            '/fact - Da un dato aleatorio',
            '/commands - Muestra esta lista de comandos.'
        ];

        let reply = '*Lista de Comandos:*\n';
        commandsList.forEach(cmd => {
            reply += `${cmd}\n`;
        });

        await message.reply(reply);
    }
};
