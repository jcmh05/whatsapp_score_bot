const mongoose = require('mongoose');
const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');
const moment = require('moment');

module.exports = {
    match: /^\/year:(\d{4})$/i,
    callback: async (client, message, context) => {
        const yearMatch = message.body.match(/^\/year:(\d{4})$/i);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
        const currentYear = moment().year();

        if (!year) {
            await message.reply('Por favor, especifica un año válido. Ejemplo: /year:2024');
            return;
        }

        if (year >= currentYear) {
            await message.reply('Por favor, introduce un año anterior al actual.');
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

            // Crear el mensaje de respuesta del top
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

            // Generar datos para las gráficas
            const allUsers = await UserYearModel.find();
            const months = [
                'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
            ];

            const colors = [
              'rgba(255, 99, 132, 0.6)',  // Enero - Rojo
              'rgba(54, 162, 235, 0.6)',  // Febrero - Azul
              'rgba(75, 192, 192, 0.6)',  // Marzo - Verde
              'rgba(255, 206, 86, 0.6)',  // Abril - Amarillo
              'rgba(153, 102, 255, 0.6)', // Mayo - Púrpura
              'rgba(255, 159, 64, 0.6)',  // Junio - Naranja
              'rgba(201, 203, 207, 0.6)', // Julio - Gris
              'rgba(100, 149, 237, 0.6)', // Agosto - Azul cielo
              'rgba(255, 140, 0, 0.6)',   // Septiembre - Naranja oscuro
              'rgba(144, 238, 144, 0.6)', // Octubre - Verde claro
              'rgba(220, 20, 60, 0.6)',   // Noviembre - Carmesí
              'rgba(0, 191, 255, 0.6)'    // Diciembre - Azul profundo
          ];


            // Gráfico de líneas: Puntos mensuales por usuario
            const datasetsLineChart = allUsers.map(user => {
                const scores = months.map(month => user.monthlyScores?.[month] || 0);
                return {
                    label: user.displayName || user._id,
                    data: scores,
                    fill: false,
                    borderWidth: 1
                };
            });

            // Gráfico de barras: Puntos por mes y por usuario
            const datasetsBarChart = months.map((month, monthIndex) => {
                const data = allUsers.map(user => user.monthlyScores?.[month] || 0);
                return {
                    label: month.charAt(0).toUpperCase() + month.slice(1),
                    data: data,
                    backgroundColor: colors[monthIndex],
                    borderColor: colors[monthIndex].replace('0.6', '1'), // Bordes más opacos
                    borderWidth: 1
                };
            });

            const userLabels = allUsers.map(user => user.displayName || user._id);

            // Configuración de la gráfica de líneas
            const lineChartConfig = {
                type: 'line',
                data: {
                    labels: months.map(m => m.charAt(0).toUpperCase() + m.slice(1)),
                    datasets: datasetsLineChart
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `Resumen Anual de Puntos - ${year}`
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            };

            // Configuración de la gráfica de barras
            const barChartConfig = {
                type: 'bar',
                data: {
                    labels: userLabels,
                    datasets: datasetsBarChart
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `Puntos Mensuales por Usuario - ${year}`
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        },
                        x: {
                            stacked: true
                        }
                    }
                }
            };

            // Generar las URLs de las gráficas usando QuickChart
            const lineChartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(lineChartConfig))}`;
            const barChartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(barChartConfig))}`;

            // Descargar las imágenes de las gráficas
            const lineChartResponse = await axios.get(lineChartUrl, { responseType: 'arraybuffer' });
            const barChartResponse = await axios.get(barChartUrl, { responseType: 'arraybuffer' });

            const lineChartBuffer = Buffer.from(lineChartResponse.data, 'binary');
            const barChartBuffer = Buffer.from(barChartResponse.data, 'binary');

            // Crear instancias de MessageMedia para enviar las imágenes
            const lineChartMedia = new MessageMedia('image/png', lineChartBuffer.toString('base64'), 'year_summary_line.png');
            const barChartMedia = new MessageMedia('image/png', barChartBuffer.toString('base64'), 'year_summary_bar.png');

            // Enviar las imágenes al usuario
            await client.sendMessage(message.from, lineChartMedia, {
                caption: `📊 *Gráfica Resumen de Puntos por Mes - Año ${year}*`
            });

            await client.sendMessage(message.from, barChartMedia, {
                caption: `📊 *Gráfica Puntos Mensuales por Usuario - Año ${year}*`
            });

        } catch (error) {
            console.error('Error al ejecutar el comando /year:', error);
            await message.reply('Hubo un error al obtener los datos del año solicitado. Por favor, intenta nuevamente.');
        }
    }
};
