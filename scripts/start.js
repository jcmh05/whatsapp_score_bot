const { Supervisor } = require('../src/supervisor');
const supervisor = new Supervisor();
supervisor.on('fatal', code => { console.error('Corrige la configuración antes de volver a iniciar.'); process.exitCode = code; });
process.on('SIGINT', () => supervisor.stop());
process.on('SIGTERM', () => supervisor.stop());
supervisor.start();
