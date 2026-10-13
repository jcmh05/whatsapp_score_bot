function createQueue({ maximum = 1000 } = {}) {
    let tail = Promise.resolve();
    let pending = 0;
    return job => {
        if (pending >= maximum) return Promise.reject(Object.assign(new Error('La cola en memoria ha superado su límite.'), { fatal: true }));
        pending++;
        const next = tail.then(job).finally(() => { pending--; });
        tail = next.catch(() => {});
        return next;
    };
}

module.exports = { createQueue };
