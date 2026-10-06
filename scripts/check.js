const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = join(__dirname, '..');
function check(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', '.wwebjs_auth', '.wwebjs_cache'].includes(item.name)) continue;
        const file = join(dir, item.name);
        if (item.isDirectory()) check(file);
        else if (/\.(?:c?js)$/.test(item.name)) {
            const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
            if (result.status !== 0) process.exit(1);
        }
    }
}
check(root);
console.log('Sintaxis de todos los archivos JavaScript verificada.');
