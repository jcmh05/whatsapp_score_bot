const User = require('../models/User');
const moment = require('moment');
const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');

module.exports = {
    match: /^\/progress$/i,
    callback: async (client, message, context) => {
        try {
            const currentMonthIndex = moment().month();
            const currentYear = moment().year();

            // Necesitamos al menos haber concluido dos meses
            if (currentMonthIndex < 2) {
                await message.reply('No es posible generar la gráfica hasta que hayan finalizado al menos dos meses del año.');
                return;
            }

            // Array con todos los meses del año en minúsculas (tal como se guardan en monthlyScores)
            const allMonths = [
                'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
            ];

            const allUsers = await User.find();

            const datasets = allUsers.map(user => {
                const data = allMonths.map((month, index) => {
                    if (index < currentMonthIndex) {
                        // Hasta el mes anterior al actual
                        return user.monthlyScores.get(month) || 0;
                    } else {
                        // Mes actual y meses siguientes → vacío
                        return null;
                    }
                });

                return {
                    label: user.displayName || user._id,
                    data: data,
                    fill: false,
                    borderWidth: 2
                };
            });

            // Configuración para la gráfica de líneas
            const lineChartConfig = {
                type: 'line',
                data: {
                    labels: allMonths.map(m => m.charAt(0).toUpperCase() + m.slice(1)), // Capitalizar los nombres
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `Evolución de Puntos - Año ${currentYear}`
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            };

            // Generar URL de QuickChart
            const lineChartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(lineChartConfig))}`;

            // Descargar la imagen de la gráfica
            const response = await axios.get(lineChartUrl, { responseType: 'arraybuffer' });
            const chartBuffer = Buffer.from(response.data, 'binary');

            // Crear imagen para enviar a WhatsApp
            const media = new MessageMedia('image/png', chartBuffer.toString('base64'), 'progress_chart.png');

            // Enviar la imagen al chat
            await client.sendMessage(message.from, media, {
                caption: `📊 *Progreso actual - ${currentYear}*`
            });

        } catch (error) {
            console.error('Error al generar la gráfica de progreso:', error);
            await message.reply('Hubo un error al generar la gráfica de progreso. Por favor, inténtalo nuevamente más tarde.');
        }
    }
};
