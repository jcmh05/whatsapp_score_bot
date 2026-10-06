const { getContactInfo } = require('../src/contact');
const User = require('../models/User');
const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');
const moment = require('moment-timezone');
const config = require('../config');

// Fecha y hora específicas para habilitar el comando
const REWINDCHART_START_DATE =  moment.tz('2025-12-21 20:30', 'YYYY-MM-DD HH:mm', config.TIMEZONE);

module.exports = {
    match: /^\/rewindchart$/i,
    callback: async (client, message, context) => {
        try {
            const now = moment().tz(config.TIMEZONE);

            if (now.isBefore(REWINDCHART_START_DATE)) {
                // Calcular tiempo restante
                const duration = moment.duration(REWINDCHART_START_DATE.diff(now));
                const days = Math.floor(duration.asDays());
                const hours = duration.hours();
                const minutes = duration.minutes();

                const timeLeftMessage = `El comando /rewindchart estará disponible en ${days} día${days !== 1 ? 's' : ''}, ${hours} hora${hours !== 1 ? 's' : ''} y ${minutes} minuto${minutes !== 1 ? 's' : ''}.`;
                await message.reply(timeLeftMessage);
                return;
            }

            // Identificar al usuario que envió el mensaje
            const { id: senderId, name: displayName } = await getContactInfo(client, message);

            // Buscar el usuario en la base de datos
            const user = await User.findById(senderId);

            if (!user) {
                await message.reply('No tienes datos registrados aún.');
                return;
            }

            // Obtener los datos mensuales del usuario
            const monthlyScores = user.monthlyScores || new Map();
            const months = [
                'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
            ];
            const scores = months.map(month => monthlyScores.get(month) || 0);

            // Crear la configuración de la gráfica
            const chartConfig = {
                type: 'bar',
                data: {
                    labels: months.map(m => m.charAt(0).toUpperCase() + m.slice(1)),
                    datasets: [
                        {
                            type: 'bar',
                            label: 'Puntos por Mes',
                            data: scores,
                            backgroundColor: 'rgba(75, 192, 192, 0.6)',
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 1
                        },
                        {
                            type: 'line',
                            label: 'Tendencia',
                            data: scores,
                            borderColor: 'rgba(255, 99, 132, 1)',
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `Estadísticas Anuales de ${displayName}`
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            };

            // Generar la URL de QuickChart
            const chartUrl = `https://quickchart.io/chart?version=4&format=png&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

            // Descargar la imagen del gráfico
            const response = await axios.get(chartUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            // Crear una instancia de MessageMedia
            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'rewindchart.png');

            // Enviar la imagen al usuario
            await client.sendMessage(message.from, media, {
                caption: `📊 *Gráfica Anual para ${displayName}:*`
            });

        } catch (error) {
            console.error('Error al ejecutar el comando /rewindchart:', error);
            await message.reply('Hubo un error al generar tu gráfica anual. Por favor, intenta nuevamente.');
        }
    }
};
