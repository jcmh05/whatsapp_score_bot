const fs = require('node:fs');
const path = require('node:path');
const moment = require('moment-timezone');
const { getContactInfo } = require('./contact');
const { recordScore } = require('./score');
const { createQueue } = require('./queue');
const { withTimeout } = require('./timeout');
const { generateRandomCongratsExtra } = require('./congratulations');

const commands = fs.readdirSync(path.join(__dirname, '..', 'commands'))
    .filter(f => f.endsWith('.js')).sort().map(f => require(`../commands/${f}`));

function createHandler({ beforeMessage = async () => {}, record = recordScore,
    identify = getContactInfo, commandList = commands, extra = generateRandomCongratsExtra,
    logger = console } = {}) {
    let shouldReply = true;
    const enqueue = createQueue();
    const context = { setShouldReply: value => { shouldReply = value; }, getShouldReply: () => shouldReply };
    async function safely(action) {
        try { await withTimeout(action(), 15000, 'Respuesta de WhatsApp'); }
        catch (error) { logger.error('Error enviando respuesta:', error); }
    }
    return (client, message) => enqueue(async () => {
        if (message.fromMe || !message.from || message.from === 'status@broadcast' ||
            !['chat', undefined].includes(message.type)) return;
        const body = (message.body || '').trim();
        const scoreMessage = /^(\+1|-1|\d+)$/.test(body);
        const command = !scoreMessage && commandList.find(cmd => cmd.match.test(body));
        if (!scoreMessage && !command) return;
        try {
            await beforeMessage();
            if (command) {
                await withTimeout(command.callback(client, message, context), 60000, 'Ejecución del comando');
                return;
            }
            const contact = await withTimeout(identify(client, message), 15000, 'Identificación del remitente');
            const date = message.timestamp ? moment.unix(message.timestamp) : moment();
            const result = await record({ ...contact, body, date, messageId: message.id?._serialized });
            if (result.duplicate) return;
            if (result.atZero) {
                if (shouldReply) await safely(() => message.reply('Ya tienes 0 puntos en este mes, no puedes reducir más.'));
                return;
            }
            // El dato ya está confirmado en MongoDB. Un fallo de WhatsApp no lo deshace.
            if (result.congratulations) {
                let text = `${result.user.displayName} acaba de alcanzar los ${result.user.totalScore} puntos!!!`;
                if (body === '+1' || body === '-1') {
                    try { text += await withTimeout(extra(result.user), 15000, 'Extra felicitación'); }
                    catch (error) { logger.error('Error extra felicitación:', error); }
                }
                await safely(() => client.sendMessage(message.from, text));
            }
            if (shouldReply) {
                await safely(() => /^\d+$/.test(body) ? message.react('✅') : message.reply(`${result.score}✅`));
            }
        } catch (error) {
            logger.error('Error procesando mensaje:', error);
            if (shouldReply) await safely(() => message.reply(command ? 'Hubo un error al ejecutar el comando.' :
                'Hubo un error al registrar tu puntaje. Por favor, inténtalo de nuevo.'));
        }
    });
}

module.exports = { createHandler, commands };
