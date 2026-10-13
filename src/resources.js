const fs = require('node:fs/promises');

function numberOrNull(value) {
    if (!value || value.trim() === 'max') return null;
    const number = Number(value.trim());
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function mib(value) { return value === null ? null : Math.round(value / 1024 / 1024); }
function counters(value) {
    return Object.fromEntries((value || '').trim().split('\n').filter(Boolean).map(line => {
        const [key, count] = line.trim().split(/\s+/);
        return [key, numberOrNull(count)];
    }));
}

async function readResources({ platform = process.platform, readFile = fs.readFile, rss = process.memoryUsage().rss } = {}) {
    const result = { nodeRssMiB: mib(rss) };
    if (platform !== 'linux') return { ...result, containerMetrics: 'no disponibles en este sistema' };
    const names = ['memory.current', 'memory.max', 'memory.peak', 'memory.events'];
    const values = await Promise.all(names.map(name =>
        readFile(`/sys/fs/cgroup/${name}`, 'utf8').catch(() => null)));
    if (values[0] === null) return { ...result, containerMetrics: 'cgroup v2 no disponible' };
    const events = counters(values[3]);
    return { ...result, containerMiB: mib(numberOrNull(values[0])), limitMiB: mib(numberOrNull(values[1])),
        peakMiB: mib(numberOrNull(values[2])), oomEvents: events.oom ?? null, oomKills: events.oom_kill ?? null };
}

function resourceReporter({ read = readResources, logger = console } = {}) {
    let initialOomKills;
    return async label => {
        try {
            const resources = await read();
            if (initialOomKills === undefined && resources.oomKills !== null && resources.oomKills !== undefined) {
                initialOomKills = resources.oomKills;
            }
            if (initialOomKills !== undefined && resources.oomKills !== null && resources.oomKills !== undefined) {
                resources.oomKillsSinceStart = Math.max(0, resources.oomKills - initialOomKills);
            }
            logger.log(`Recursos (${label}): ${JSON.stringify(resources)}`);
        } catch (error) {
            logger.error(`No se pudieron leer los recursos del contenedor: ${error.message}`);
        }
    };
}

module.exports = { readResources, resourceReporter };
