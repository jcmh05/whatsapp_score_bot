// /commands/status.js
const os = require('os');
const moment = require('moment');
const mongoose = require('mongoose');
const { exec } = require('child_process');
const config = require('../config');

// Función de registro condicional
const log = (...args) => {
    if (config.SHOW_LOGS) {
        console.log(...args);
    }
};

module.exports = {
    match: /^\/status$/i,
    callback: async (client, message, context) => {
        try {
            // Obtener información básica sobre el bot y el entorno de ejecución
            const uptime = moment.duration(process.uptime(), 'seconds').humanize();
            const systemInfo = {
                platform: os.platform(),
                arch: os.arch(),
                cpu: os.cpus()[0].model,
                memory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
                freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
                uptime: uptime,
                nodeVersion: process.version,
                npmVersion: require('child_process').execSync('npm -v').toString().trim(),
                serverHostname: os.hostname(),
                environment: process.env.NODE_ENV || 'development'
            };

            // Verificar si la base de datos MongoDB está conectada
            const dbStatus = await mongoose.connection.readyState;
            const dbStatusText = dbStatus === 1 ? 'Conectado' : 'Desconectado';

            // Obtener el tiempo de actividad del sistema
            const serverUptime = os.uptime();
            const serverUptimeText = moment.duration(serverUptime, 'seconds').humanize();

            // Verificar el uso del CPU
            const cpuUsage = os.loadavg()[0].toFixed(2);

            // Verificar la versión de MongoDB sin usar "mongo" en el shell
            let mongoVersion = 'Desconocida';
            try {
                const result = await mongoose.connection.db.admin().serverInfo();
                mongoVersion = result.version;
            } catch (error) {
                console.error('Error al obtener la versión de MongoDB:', error);
            }

            // Construir el mensaje de estado
            let reply = `
*Estado del Bot y Sistema:*

📊 *Información del Bot:*
- Versión de Node.js: ${systemInfo.nodeVersion}
- Versión de npm: ${systemInfo.npmVersion}
- Tiempo de actividad del Bot: ${systemInfo.uptime}
- Plataforma: ${systemInfo.platform}
- Arquitectura: ${systemInfo.arch}
- CPU: ${systemInfo.cpu}
- Memoria total: ${systemInfo.memory}
- Memoria libre: ${systemInfo.freeMemory}

💾 *Base de Datos MongoDB:*
- Estado: ${dbStatusText}
- Versión de MongoDB: ${mongoVersion}

💻 *Información del Servidor:*
- Nombre del Servidor: ${systemInfo.serverHostname}
- Uptime del servidor: ${serverUptimeText}
- Uso del CPU: ${cpuUsage} (promedio 1 minuto)
- Entorno de ejecución: ${systemInfo.environment}
`;

            // Enviar la respuesta con la información del estado
            await message.reply(reply);
        } catch (error) {
            console.error('Error al obtener el estado del bot:', error);
            await message.reply('Hubo un error al obtener el estado del bot. Por favor, inténtalo más tarde.');
        }
    }
};
