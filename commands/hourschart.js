const { NO_TEMPORAL_DATA, hasRecordedValues } = require('../src/statistics');
const { getContactInfo } = require('../src/contact');
const User = require('../models/User');
const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');
const config = require('../config');

module.exports = {
    match: /^\/hourschart$/i,
    callback: async (client, message, context) => {
        try {
            const { id: senderId, name: displayName } = await getContactInfo(client, message);

            if (config.SHOW_LOGS) {
                console.log(`Usuario identificado: ${displayName} (${senderId})`);
            }

            // Buscar el usuario en la base de datos
            const user = await User.findById(senderId);

            if (!user) {
                if (config.SHOW_LOGS) {
                    console.log(`Usuario no encontrado en la base de datos: ${senderId}`);
                }
                await message.reply('No tienes datos registrados aún.');
                return;
            }

            if (config.SHOW_LOGS) {
                console.log(`Generando gráfica de horas para el usuario: ${displayName}`);
            }

            // Preparar los datos para la gráfica
            const hoursMap = user.hours || new Map();
            const labels = [];
            const data = [];

            for (let i = 0; i < 24; i++) {
                labels.push(`${i}:00`);
                data.push(hoursMap.get(`h${i}`) || 0);
            }

            if (!hasRecordedValues(data)) {
                await message.reply(NO_TEMPORAL_DATA);
                return;
            }

            // Crear la configuración del gráfico
            const chartConfig = {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Puntos por Hora',
                        data: data,
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    title: {
                        display: true,
                        text: `Registro de Horas para ${displayName}`
                    },
                    scales: {
                        yAxes: [{
                            ticks: {
                                beginAtZero: true,
                                precision: 0
                            },
                            scaleLabel: {
                                display: true,
                                labelString: 'Puntos'
                            }
                        }],
                        xAxes: [{
                            scaleLabel: {
                                display: true,
                                labelString: 'Hora del Día'
                            }
                        }]
                    }
                }
            };

            // Generar la URL de QuickChart
            const chartUrl = `https://quickchart.io/chart?version=2&format=png&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

            if (config.SHOW_LOGS) {
                console.log(`URL de la gráfica generada: ${chartUrl}`);
            }

            // Descargar la imagen del gráfico
            const response = await axios.get(chartUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            if (config.SHOW_LOGS) {
                console.log('Imagen descargada correctamente.');
            }

            // Crear una instancia de MessageMedia
            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'hourschart.png');

            if (config.SHOW_LOGS) {
                console.log('Enviando la imagen al usuario.');
            }

            // Enviar la imagen al usuario
            await client.sendMessage(message.from, media, {
                caption: `📊 *Registro de Horas para ${displayName}:*`
            });

            if (config.SHOW_LOGS) {
                console.log('Imagen enviada exitosamente.');
            }

        } catch (error) {
            if (config.SHOW_LOGS) {
                console.error('Error al generar y enviar la gráfica de horas:', error);
            }
            await message.reply('Hubo un error al generar tu gráfica de horas.');
        }
    }
};
