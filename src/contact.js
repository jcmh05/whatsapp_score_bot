async function getContactInfo(client, message) {
    const rawId = message.from?.endsWith('@g.us') ? message.author : message.from;
    if (!rawId) throw new Error('No se pudo identificar al autor del mensaje.');
    const contact = await client.getContactById(rawId);
    let id = rawId;
    if (rawId.endsWith('@lid')) {
        const [mapping] = await client.getContactLidAndPhone([rawId]);
        if (!mapping?.pn?.endsWith('@c.us')) {
            // Nunca crear otra cuenta con un LID que separaría sus datos anteriores.
            throw new Error('WhatsApp todavía no permite resolver el teléfono del remitente.');
        }
        id = mapping.pn;
    }
    return { id, name: contact.pushname || contact.verifiedName || contact.name || 'Usuario' };
}

module.exports = { getContactInfo };
