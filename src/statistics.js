const NO_TEMPORAL_DATA = 'No tienes registrados datos sobre este año aún, prueba más adelante.';

function hasRecordedValues(counts) {
    return counts.some(count => Number.isFinite(count) && count > 0);
}

module.exports = { NO_TEMPORAL_DATA, hasRecordedValues };
