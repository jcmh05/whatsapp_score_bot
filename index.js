require('dotenv').config();

const { Client } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const CustomAuthStrategy = require('./CustomAuthStrategy');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Mostrar el QR en la consola si no está autenticado
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Escanea el QR para autenticar el bot.');
});

// Confirmar que el bot está listo
client.on('ready', () => {
    console.log('Bot de WhatsApp está listo!');
});

// Manejar mensajes entrantes
client.on('message', async message => {
    const msg = message.body.toLowerCase();

    for (const command of commands) {
        if (command.match.test(msg)) {
            try {
                await command.callback(client, message);
            } catch (error) {
                console.error('Error al ejecutar el comando:', error);
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
