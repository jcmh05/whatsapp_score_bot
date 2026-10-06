const { EventEmitter } = require('node:events');
const { fork, spawnSync } = require('node:child_process');
const path = require('node:path');

function killWorker(child) {
    // Cerrar también Chromium si Node está bloqueado: no dejar un perfil ocupado al reiniciar.
    if (Number.isInteger(child.pid)) {
        if (process.platform === 'win32') {
            spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } else {
            try { process.kill(-child.pid, 'SIGKILL'); return; } catch {}
        }
    }
    child.kill('SIGKILL');
}

class Supervisor extends EventEmitter {
    constructor({ entry = path.join(__dirname, '..', 'index.js'), baseDelay = 5000, maxDelay = 60000,
        heartbeatTimeout = 90000, checkInterval = 15000, stableAfter = 60000, shutdownTimeout = 15000,
        spawn = fork, logger = console } = {}) {
        super();
        Object.assign(this, { entry, baseDelay, maxDelay, heartbeatTimeout, checkInterval, stableAfter, shutdownTimeout, spawn, logger });
        this.attempt = 0;
        this.stopped = false;
    }
    start() {
        if (this.stopped || this.child) return;
        this.lastHeartbeat = Date.now();
        this.readySince = null;
        const child = this.spawn(this.entry, [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            detached: process.platform !== 'win32' });
        this.child = child;
        this.emit('spawn', child);
        child.on('message', message => {
            if (message?.type !== 'heartbeat') return;
            this.lastHeartbeat = Date.now();
            if (message.ready) this.readySince ??= Date.now();
            else this.readySince = null;
            if (this.readySince && Date.now() - this.readySince >= this.stableAfter) this.attempt = 0;
        });
        child.on('error', error => { this.logger.error('No se pudo ejecutar el bot:', error.message); });
        this.watchdog = setInterval(() => {
            if (Date.now() - this.lastHeartbeat > this.heartbeatTimeout) {
                this.logger.error('El proceso no responde. Reiniciando.');
                killWorker(child);
            }
        }, this.checkInterval);
        child.once('exit', (code, signal) => {
            clearInterval(this.watchdog); clearTimeout(this.forceStop);
            this.child = null;
            this.emit('exit', { code, signal });
            if (this.stopped) { this.emit('stopped'); return; }
            if (code === 2) {
                this.stopped = true;
                this.emit('fatal', code);
                return;
            }
            const delay = Math.min(this.baseDelay * 2 ** Math.min(this.attempt++, 10), this.maxDelay);
            this.logger.log(`Bot detenido (${code ?? signal}). Nuevo intento en ${delay / 1000}s.`);
            this.retry = setTimeout(() => this.start(), delay);
        });
    }
    stop() {
        this.stopped = true;
        clearTimeout(this.retry); clearInterval(this.watchdog);
        if (!this.child) { this.emit('stopped'); return; }
        const child = this.child;
        if (child.connected) child.send({ type: 'shutdown' }, error => { if (error) child.kill('SIGTERM'); });
        else child.kill('SIGTERM');
        this.forceStop = setTimeout(() => killWorker(child), this.shutdownTimeout);
    }
}

module.exports = { Supervisor };
