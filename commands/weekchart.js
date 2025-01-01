const User = require('../models/User');
const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');
const config = require('../config');

module.exports = {
    match: /^\/weekchart$/i,
    callback: async (client, message, context) => {
        try {
            let senderId;
            let displayName;

            if (message.from.includes('@g.us')) {
                senderId = message.author;
                if (!senderId) {
                    if (config.SHOW_LOGS) {
                        console.log('Mensaje de grupo sin author, no se puede procesar.');
                    }
                    await message.reply('No se pudo identificar al autor del mensaje.');
                    return;
                }
                const contact = await client.getContactById(senderId);
                displayName = contact.pushname || contact.verifiedName || contact.name || 'Usuario';
            } else {
                senderId = message.from;
                const contact = await message.getContact();
                displayName = contact.pushname || contact.verifiedName || contact.name || 'Usuario';
            }

            if (config.SHOW_LOGS) {
                console.log(`Usuario identificado: ${displayName} (${senderId})`);
            }

            const user = await User.findById(senderId);

            if (!user) {
                if (config.SHOW_LOGS) {
                    console.log(`Usuario no encontrado en la base de datos: ${senderId}`);
                }
                await message.reply('No tienes datos registrados aún.');
                return;
            }

            if (config.SHOW_LOGS) {
                console.log(`Generando gráfica de días para el usuario: ${displayName}`);
            }

            const weekMap = user.week || new Map();
            const labels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
            const data = labels.map(day => weekMap.get(day.toLowerCase()) || 0);

            const chartConfig = {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Puntos por Día',
                        data: data,
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    title: {
                        display: true,
                        text: `Registro de Días para ${displayName}`
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
                                labelString: 'Día de la Semana'
                            }
                        }]
                    }
                }
            };

            const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

            if (config.SHOW_LOGS) {
                console.log(`URL de la gráfica generada: ${chartUrl}`);
            }

            const response = await axios.get(chartUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            if (config.SHOW_LOGS) {
                console.log('Imagen descargada correctamente.');
            }

            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'weekchart.png');

            if (config.SHOW_LOGS) {
                console.log('Enviando la imagen al usuario.');
            }

            await client.sendMessage(message.from, media, {
                caption: `📊 *Registro de Días para ${displayName}:*`
            });

            if (config.SHOW_LOGS) {
                console.log('Imagen enviada exitosamente.');
            }

        } catch (error) {
            if (config.SHOW_LOGS) {
                console.error('Error al generar y enviar la gráfica de días:', error);
            }
            await message.reply('Hubo un error al generar tu gráfica de días.');
        }
    }
};
