const path = require('node:path');
const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');

// RemoteAuth 1.34 guarda el ZIP en dataPath; el adaptador antiguo buscaba en cwd.
class MongoSessionStore {
    constructor({ mongoose, dataPath }) {
        this.mongoose = mongoose;
        this.dataPath = dataPath;
    }
    bucket(session) {
        if (!/^RemoteAuth(?:-[-\w]+)?$/.test(session)) throw new Error('Nombre de sesión no válido.');
        return new this.mongoose.mongo.GridFSBucket(this.mongoose.connection.db,
            { bucketName: `whatsapp-${session}` });
    }
    async sessionExists({ session }) {
        return (await this.bucket(session).find({ filename: `${session}.zip` }).limit(1).toArray()).length > 0;
    }
    async save({ session }) {
        const bucket = this.bucket(session);
        const upload = bucket.openUploadStream(`${session}.zip`);
        try {
            await pipeline(fs.createReadStream(path.join(this.dataPath, `${session}.zip`)), upload);
        } catch (error) {
            await upload.abort().catch(() => {});
            throw error;
        }
        const previous = await bucket.find({ filename: `${session}.zip`, _id: { $ne: upload.id } }).toArray();
        await Promise.all(previous.map(file => bucket.delete(file._id)));
    }
    async extract({ session, path: destination }) {
        await pipeline(this.bucket(session).openDownloadStreamByName(`${session}.zip`), fs.createWriteStream(destination));
    }
    async delete({ session }) {
        const bucket = this.bucket(session);
        const files = await bucket.find({ filename: `${session}.zip` }).toArray();
        await Promise.all(files.map(file => bucket.delete(file._id)));
    }
}

module.exports = { MongoSessionStore };
