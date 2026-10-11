const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { Readable } = require('node:stream');
const { once } = require('node:events');
const archiver = require('archiver');
const { RemoteAuth } = require('whatsapp-web.js');
const { MongoSessionStore } = require('../src/session-store');

test('RemoteAuth restaura un ZIP guardado en un contenedor sin carpeta de sesión y puede volver a restaurarlo', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-session-restore-test-'));
    t.after(async () => {
        const resolved = await fs.realpath(root);
        assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
        assert(path.basename(resolved).startsWith('bot-session-restore-test-'));
        await fs.rm(resolved, { recursive: true, force: true });
    });

    const archive = archiver('zip');
    const chunks = [];
    archive.on('data', chunk => chunks.push(chunk));
    archive.append('example-test-profile', { name: 'Default/IndexedDB/auth.txt' });
    const ended = once(archive, 'end');
    await archive.finalize();
    await ended;
    const backup = Buffer.concat(chunks);
    const filename = 'RemoteAuth-restore-test.zip';
    let downloads = 0;
    // Only the database transport is simulated. The ZIP, filesystem and RemoteAuth are real.
    class GridFSBucket {
        find(query) {
            return {
                limit() { return this; },
                async toArray() { return query.filename === filename ? [{ filename }] : []; }
            };
        }
        openDownloadStreamByName(name) {
            assert.equal(name, filename);
            downloads++;
            return Readable.from([backup]);
        }
    }
    const mongoose = { mongo: { GridFSBucket }, connection: { db: {} } };
    const dataPath = path.join(root, 'new-container', '.wwebjs_auth');
    await assert.rejects(fs.access(dataPath), { code: 'ENOENT' });
    const store = new MongoSessionStore({ mongoose, dataPath });
    const strategy = new RemoteAuth({ clientId: 'restore-test', dataPath, store, backupSyncIntervalMs: 60000 });
    const client = { options: { puppeteer: {} } };
    strategy.setup(client);

    for (let attempt = 0; attempt < 2; attempt++) {
        await strategy.beforeBrowserInitialized();
        const profile = path.join(dataPath, 'RemoteAuth-restore-test');
        assert.equal(client.options.puppeteer.userDataDir, profile);
        assert.equal(await fs.readFile(path.join(profile, 'Default', 'IndexedDB', 'auth.txt'), 'utf8'), 'example-test-profile');
        await assert.rejects(fs.access(path.join(dataPath, filename)), { code: 'ENOENT' });
        assert(await store.sessionExists({ session: 'RemoteAuth-restore-test' }));
    }
    assert.equal(downloads, 2);
});
