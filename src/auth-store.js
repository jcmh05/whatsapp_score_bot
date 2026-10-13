const { createHash } = require('node:crypto');
const { createQueue } = require('./queue');

async function mongoAuthState({ mongoose, stores, lease, sessionId, lib, onError = () => {} }) {
    const metadata = await stores.state.findOne({ _id: sessionId });
    const generation = metadata.authGeneration;
    const id = (category, keyId) => createHash('sha256').update(`${sessionId}:${generation}:${category}:${keyId}`).digest('hex');
    const encode = value => JSON.stringify(value, lib.BufferJSON.replacer);
    const decode = value => JSON.parse(value, lib.BufferJSON.reviver);
    const existing = await stores.auth.findOne({ _id: id('creds', 'main') });
    const creds = existing ? decode(existing.value) : lib.initAuthCreds();
    const enqueue = createQueue();
    let tail = Promise.resolve(), failure;
    function write(operations) {
        const task = enqueue(() => mongoose.connection.transaction(async session => {
            if (failure) throw failure;
            await lease.fence(session);
            if (operations.length) await stores.auth.bulkWrite(operations, { session, ordered: true });
        }));
        tail = task;
        task.catch(error => { failure ||= error; onError(error); });
        return task;
    }
    const row = (category, keyId, value) => ({ updateOne: { filter: { _id: id(category, keyId) }, update: { $set: {
        sessionId, generation, category, keyId, value, updatedAt: new Date()
    } }, upsert: true } });
    return {
        state: { creds, keys: {
            async get(category, ids) {
                await tail;
                if (failure) throw failure;
                const rows = await stores.auth.find({ sessionId, generation, category, keyId: { $in: ids } }).toArray();
                const result = {};
                for (const entry of rows) {
                    let value = decode(entry.value);
                    if (category === 'app-state-sync-key') value = lib.proto.Message.AppStateSyncKeyData.fromObject(value);
                    result[entry.keyId] = value;
                }
                return result;
            },
            set(data) {
                const operations = [];
                for (const [category, entries] of Object.entries(data)) {
                    for (const [keyId, value] of Object.entries(entries)) {
                        operations.push(value == null ? { deleteOne: { filter: { _id: id(category, keyId) } } } :
                            row(category, keyId, encode(value)));
                    }
                }
                return write(operations);
            }
        } },
        saveCreds: () => write([row('creds', 'main', encode(creds))]),
        flush: () => tail,
        async invalidate() {
            await tail;
            await mongoose.connection.transaction(async session => {
                await lease.fence(session);
                await stores.state.updateOne({ _id: sessionId, authGeneration: generation },
                    { $inc: { authGeneration: 1 } }, { session });
            });
        }
    };
}

module.exports = { mongoAuthState };
