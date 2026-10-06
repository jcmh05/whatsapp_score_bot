function createQueue() {
    let tail = Promise.resolve();
    return job => {
        const next = tail.then(job);
        tail = next.catch(() => {});
        return next;
    };
}

module.exports = { createQueue };
