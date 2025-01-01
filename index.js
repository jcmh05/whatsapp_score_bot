require('dotenv').config();

const { Client } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone'); // Importar moment-timezone
const CustomAuthStrategy = require('./CustomAuthStrategy');
const User = require('./models/User');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

// Función para obtener el nombre del mes actual considerando el día de inicio
function getCurrentMonth() {
    const now = moment().tz(config.TIMEZONE); // Usar la zona horaria de España
    const startOfMonth = moment().tz(config.TIMEZONE).date(config.MONTH_START_DAY).startOf('day');

    if (now.isBefore(startOfMonth)) {
        // Si la fecha actual es antes del día de inicio, considera el mes anterior
        return now.subtract(1, 'months').format('MMMM');
    } else {
        return now.format('MMMM');
    }
}

// Conectar a MongoDB
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI)
    .then(() => console.log('Conectado a MongoDB'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// Inicializar el cliente de WhatsApp con la estrategia personalizada
const client = new Client({
    authStrategy: new CustomAuthStrategy({ sessionId: 'default' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Cargar comandos
const commands = [];
const commandsPath = path.join(__dirname, 'commands');

fs.readdirSync(commandsPath).forEach(file => {
    if (file.endsWith('.js')) {
        const command = require(path.join(commandsPath, file));
        commands.push(command);
    }
});

// Variable global para controlar si responder con "✅"
let shouldReply = true;

// Funciones para modificar la variable shouldReply
function setShouldReply(value) {
    shouldReply = value;
}

function getShouldReply() {
    return shouldReply;
}

// Mostrar el QR en la consola si no está autenticado
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Escanea el QR para autenticar el bot.');
});

// Confirmar que el bot está listo
client.on('ready', () => {
    console.log('Bot de WhatsApp está listo!');
});

// Manejar eventos de mensajes
client.on('message', async message => {
    const msg = message.body.trim();

    // Expresiones regulares para "+1" y "-1"
    const numberIncrementRegex = /^\+1$/;
    const numberDecrementRegex = /^-1$/;

    // Expresión regular para detectar mensajes que son solo números
    const numberRegex = /^\d+$/;

    // Función para procesar incrementos/decrementos
    const processScoreChange = async () => {
        let senderId;
        let displayName;

        if (message.from.includes('@g.us')) {
            // Mensaje de grupo
            senderId = message.author;
            if (!senderId) {
                console.warn('Mensaje de grupo sin author, no se puede procesar.');
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

        // Obtener el mes actual considerando el día de inicio
        const currentMonth = getCurrentMonth();

        // Obtener la hora actual en España Peninsular
        const currentHour = moment().tz(config.TIMEZONE).hour(); // Devuelve un número entre 0 y 23
        const hourKey = `h${currentHour}`;

        // Obtener el día de la semana actual
        const currentDay = moment().tz(config.TIMEZONE).format('dddd').toLowerCase();

        try {
            let user = await User.findById(senderId);

            if (!user) {
                // Crear un nuevo usuario si no existe
                user = new User({
                    _id: senderId,
                    displayName: displayName,
                    totalScore: 0,
                    monthlyScores: {},
                    lastCongratulated: 0,
                    hours: {},
                    week: {}
                });
            } else {
                // Actualizar el displayName si ha cambiado
                if (user.displayName !== displayName && displayName !== 'Usuario') {
                    user.displayName = displayName;
                }
            }

            // Obtener el puntaje actual del mes
            let currentMonthScore = user.monthlyScores.get(currentMonth) || 0;

            if (numberIncrementRegex.test(msg)) {
                // Incrementar el puntaje en 1
                currentMonthScore += 1;
                // Incrementar el contador correspondiente
                user.hours.set(hourKey, (user.hours.get(hourKey) || 0) + 1);
                user.week.set(currentDay, (user.week.get(currentDay) || 0) + 1);
            } else if (numberDecrementRegex.test(msg)) {
                // Decrementar el puntaje en 1 si es mayor que 0
                if (currentMonthScore > 0) {
                    currentMonthScore -= 1;
                    // Decrementar el contador correspondiente, asegurando que no sea negativo
                    user.hours.set(hourKey, Math.max((user.hours.get(hourKey) || 0) - 1, 0));
                    user.week.set(currentDay, Math.max((user.week.get(currentDay) || 0) - 1, 0));
                } else {
                    if (shouldReply) {
                        await message.reply('Ya tienes 0 puntos en este mes, no puedes reducir más.');
                    }
                    return;
                }
            }

            // Actualizar el puntaje del mes actual
            user.monthlyScores.set(currentMonth, currentMonthScore);

            // Recalcular el puntaje total
            user.totalScore = Array.from(user.monthlyScores.values()).reduce((a, b) => a + b, 0);

            // Verificar si el totalScore alcanza un múltiplo de 50 y no ha sido felicitado para este múltiplo
            if (user.totalScore >= user.lastCongratulated + 50 && user.totalScore % 50 === 0) {
                // Enviar felicitación
                await client.sendMessage(message.from, `${user.displayName} acaba de alcanzar los ${user.totalScore} puntos!!!`);
                // Actualizar lastCongratulated
                user.lastCongratulated = user.totalScore;
            }

            // Guardar los cambios
            await user.save();

            // Responder con el puntaje actual
            if (shouldReply) {
                await message.reply(`${currentMonthScore}✅`);
            }
        } catch (error) {
            console.error('Error al actualizar el puntaje:', error);
            if (shouldReply) {
                await message.reply('Hubo un error al actualizar tu puntaje. Por favor, intenta nuevamente.');
            }
        }
    };

    // Función para procesar mensajes numéricos
    const processNumericMessage = async () => {
        let senderId;
        let displayName;

        if (message.from.includes('@g.us')) {
            // Mensaje de grupo
            senderId = message.author; // ID del remitente dentro del grupo
            if (!senderId) {
                console.warn('Mensaje de grupo sin author, no se puede procesar.');
                return;
            }
            // Obtener el nombre del contacto
            const contact = await client.getContactById(senderId);
            displayName = contact.pushname || contact.verifiedName || contact.name || 'Usuario';
        } else {
            // Mensaje individual
            senderId = message.from; // ID del remitente
            const contact = await message.getContact();
            displayName = contact.pushname || contact.verifiedName || contact.name || 'Usuario';
        }

        const score = parseInt(msg, 10);

        // Validar que el puntaje sea un número positivo
        if (isNaN(score) || score < 0) {
            if (shouldReply) {
                await message.reply('Por favor, envía un número válido positivo.');
            }
            return;
        }

        // Actualizar las estadísticas en MongoDB
        try {
            // Obtener el mes actual considerando el día de inicio
            const currentMonth = getCurrentMonth();
            let user = await User.findById(senderId);

            if (user) {
                // Actualizar el puntaje para el mes actual
                user.monthlyScores.set(currentMonth, score);
                // Actualizar el puntaje total
                user.totalScore = Array.from(user.monthlyScores.values()).reduce((a, b) => a + b, 0);
                // Actualizar el displayName si ha cambiado
                if (user.displayName !== displayName && displayName !== 'Usuario') {
                    user.displayName = displayName;
                }

            } else {
                // Crear un nuevo usuario
                user = new User({
                    _id: senderId,
                    displayName: displayName,
                    totalScore: score,
                    monthlyScores: { [currentMonth]: score },
                    lastCongratulated: score >= 50 && score % 50 === 0 ? score : 0,
                    hours: {},
                    week: {}
                });

                // Si el score es múltiplo de 50 al crearse, enviar felicitación
                if (score >= 50 && score % 50 === 0) {
                    await client.sendMessage(message.from, `${user.displayName} acaba de alcanzar los ${score} puntos!!!`);
                }
            }

            // Verificar si el totalScore alcanza un múltiplo de 50 y no ha sido felicitado para este múltiplo
            if (user.totalScore >= user.lastCongratulated + 50 && user.totalScore % 50 === 0) {
                // Enviar felicitación
                await client.sendMessage(message.from, `${user.displayName} acaba de alcanzar los ${user.totalScore} puntos!!!`);
                // Actualizar lastCongratulated
                user.lastCongratulated = user.totalScore;
            }

            // Guardar los cambios
            await user.save();

            // Responder con un "✅" si está habilitado
            if (shouldReply) {
                await message.react('✅');
            }
        } catch (error) {
            console.error('Error al actualizar las estadísticas:', error);
            if (shouldReply) {
                await message.reply('Hubo un error al registrar tu puntaje. Por favor, intenta nuevamente.');
            }
        }
    };

    // Procesar incrementos/decrementos
    if (numberIncrementRegex.test(msg) || numberDecrementRegex.test(msg)) {
        processScoreChange();
        return; // Salir después de manejar "+1" o "-1"
    }

    // Procesar mensajes numéricos
    if (numberRegex.test(msg)) {
        processNumericMessage();
        return;
    }

    // Procesar comandos
    for (const command of commands) {
        if (command.match.test(msg)) {
            try {
                // Ejecutar el comando sin bloquear el ciclo de eventos
                command.callback(client, message, { setShouldReply, getShouldReply });
            } catch (error) {
                console.error('Error al ejecutar el comando:', error);
                if (shouldReply) {
                    message.reply('Hubo un error al ejecutar el comando.');
                }
            }
            break; // Ejecuta solo el primer comando que coincida
        }
    }
});

// Manejar errores del cliente
client.on('error', (error) => {
    console.error('Error del cliente de WhatsApp:', error);
});

// Iniciar el cliente
client.initialize();

// Configurar una ruta básica para mantener el app viva
app.get('/', (req, res) => {
    res.send('Bot de WhatsApp está funcionando.');
});

// Iniciar el servidor Express
app.listen(PORT, () => {
    console.log(`Servidor Express escuchando en el puerto ${PORT}`);
});
