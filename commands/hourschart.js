const User = require('../models/User');
const path = require('path');

module.exports = {
    match: /^\/hourschart$/i,
    callback: async (client, message, context) => {
         try {
             let senderId;
             let displayName;

             if (message.from.includes('@g.us')) {
                 // Mensaje de grupo
                 senderId = message.author;
                 if (!senderId) {
                     await message.reply('No se pudo identificar al autor del mensaje.');
                     return;
                 }
                 // Obtener el nombre del contacto
                 const contact = await client.getContactById(senderId);
                 displayName = contact.pushname || contact.verifiedName || contact.name || 'Usuario';
             } else {
                 // Mensaje individual
                 senderId = message.from;
                 const contact = await message.getContact();
                 displayName = contact.pushname || contact.verifiedName || contact.name || 'Usuario';
             }

             const user = await User.findById(senderId);

             if (!user) {
                 await message.reply('No tienes datos registrados aún.');
                 return;
             }

             const hoursMap = user.hours || new Map();
             const labels = [];
             const data = [];

             for (let i = 0; i < 24; i++) {
                 labels.push(`${i}:00`);
                 data.push(hoursMap.get(`h${i}`) || 0);
             }

             // Crear la URL de QuickChart
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

             const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

             // Enviar la imagen al grupo
             await client.sendMessage(message.from, chartUrl, {
                 caption: `📊 *Registro de Horas para ${displayName}:*`
             });

         } catch (error) {
             console.error('Error al generar y enviar la gráfica de horas:', error);
             await message.reply('Hubo un error al generar tu gráfica de horas.');
         }
     }
 };
