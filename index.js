const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
try {
    const { run, safeError } = require('./src/runtime');
    run().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
} catch (error) {
    console.error('No se pudo cargar la configuración del bot:', error.message);
    process.exitCode = 2;
}
