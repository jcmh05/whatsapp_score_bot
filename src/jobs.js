const { createHandler, commands } = require('./handler');
const { recordScore } = require('./score');
const { OutputPlan } = require('./messages');
const { withTimeout } = require('./timeout');
const { safeError } = require('./errors');

function recognized(body) { return /^(\+1|-1|\d+)$/.test(body) || commands.some(command => command.match.test(body)); }
function mutates(body) { return /^(\+1|-1|\d+|\/fact|\/addfact:.+|\/reply|\/noreply)$/i.test(body); }

class Jobs {
    constructor({ mongoose, stores, lease, sessionId, lib, resolveContact, prepareYear, logger = console, fail }) {
        Object.assign(this, { mongoose, stores, lease, sessionId, lib, resolveContact, prepareYear, logger, fail });
        this.stopped = false; this.busy = false;
    }
    async capture(message) {
        if (!message || !recognized(message.body)) return false;
        const metadata = await this.stores.state.findOne({ _id: this.sessionId });
        if (message.timestamp * 1000 < Math.floor(+metadata.cutoverAt / 1000) * 1000) return false;
        const id = `${this.sessionId}/${message.id._serialized}`;
        try {
            await this.mongoose.connection.transaction(async session => {
                if (await this.stores.inbox.findOne({ _id: id }, { session })) return;
                await this.lease.fence(session);
                const state = await this.stores.state.findOneAndUpdate({ _id: this.sessionId }, { $inc: { sequence: 1 } },
                    { session, returnDocument: 'after' });
                await this.stores.inbox.insertOne({ _id: id, sessionId: this.sessionId, sequence: state.sequence,
                    message, state: 'pending', attempts: 0, nextAttemptAt: new Date(), receivedAt: new Date() }, { session });
            });
        } catch (error) { if (error.code !== 11000) throw error; }
        return true;
    }
    async commit(job, plan, replySetting, session) {
        if (this.stopped) throw Object.assign(new Error('El proceso está cerrando.'), { fatal: true });
        await this.lease.fence(session);
        if (plan.effects.length) await this.stores.outbox.insertMany(plan.effects.map((effect, slot) => ({
            _id: `${job._id}/${slot}`, sessionId: this.sessionId, sequence: job.sequence, slot,
            wireId: this.lib.generateMessageIDV2(), state: 'pending', attempts: 0, nextAttemptAt: new Date(),
            payload: JSON.stringify(effect, this.lib.BufferJSON.replacer), createdAt: new Date()
        })), { session });
        if (replySetting !== undefined) await this.stores.state.updateOne({ _id: this.sessionId },
            { $set: { shouldReply: replySetting } }, { session });
        await this.stores.inbox.updateOne({ _id: job._id }, { $set: {
            state: 'done', finishedAt: new Date()
        }, $unset: { message: '', lastError: '' } }, { session });
    }
    async execute(job) {
        await this.prepareYear();
        const contact = await this.resolveContact(job.message);
        const metadata = await this.stores.state.findOne({ _id: this.sessionId });
        const run = async session => {
            const plan = new OutputPlan(job.message, contact);
            let replySetting;
            const handle = createHandler({ strict: true, initialShouldReply: metadata.shouldReply,
                logger: this.logger, identify: async () => contact,
                record: input => recordScore({ ...input, session }), onReplySetting: value => { replySetting = value; } });
            await handle(plan, plan.adaptedMessage());
            if (session) await this.commit(job, plan, replySetting, session);
            else await this.mongoose.connection.transaction(transaction => this.commit(job, plan, replySetting, transaction));
        };
        if (mutates(job.message.body)) await this.mongoose.connection.transaction(run);
        else await run();
    }
    async failed(job, attempts, error) {
        await this.mongoose.connection.transaction(async session => {
            const metadata = await this.stores.state.findOne({ _id: this.sessionId }, { session });
            const plan = new OutputPlan(job.message, {});
            const errorReply = /^(\+1|-1|\d+)$/.test(job.message.body) ?
                'Hubo un error al registrar tu puntaje. No se ha modificado; por favor, inténtalo de nuevo.' :
                'Hubo un error al ejecutar el comando. Por favor, inténtalo de nuevo.';
            if (metadata.shouldReply) await plan.adaptedMessage().reply(error.permanent ? error.message :
                errorReply);
            await this.commit(job, plan, undefined, session);
            await this.stores.inbox.updateOne({ _id: job._id }, { $set: {
                state: 'failed', message: job.message, attempts, lastError: safeError(error).slice(0, 500)
            } }, { session });
        });
    }
    async tick() {
        if (this.stopped || this.busy) return;
        this.busy = true;
        try {
            const job = await this.stores.inbox.findOne({ sessionId: this.sessionId, state: { $in: ['pending', 'processing'] } },
                { sort: { sequence: 1 } });
            if (!job || +job.nextAttemptAt > Date.now()) return;
            if (job.attempts >= 3) { await this.failed(job, job.attempts, new Error('El trabajo agotó sus intentos tras reinicios del proceso.')); return; }
            const attempts = job.attempts + 1;
            await this.lease.fence();
            await this.stores.inbox.updateOne({ _id: job._id }, { $set: { state: 'processing', attempts } });
            try {
                await withTimeout(this.execute(job), 60000, 'Procesamiento persistente');
            } catch (error) {
                if (error.fatal || /Procesamiento persistente: tiempo/.test(error.message)) { this.fail(error); return; }
                this.logger.error(`Trabajo fallido (intento ${attempts}):`, error);
                if (error.permanent || attempts >= 3) {
                    await this.failed(job, attempts, error);
                } else await this.stores.inbox.updateOne({ _id: job._id, state: { $ne: 'done' } }, { $set: {
                    state: 'pending', attempts, lastError: safeError(error).slice(0, 500),
                    nextAttemptAt: new Date(Date.now() + attempts * 5000)
                } });
            }
        } catch (error) { this.fail(error); }
        finally { this.busy = false; }
    }
}

module.exports = { Jobs, recognized, mutates };
