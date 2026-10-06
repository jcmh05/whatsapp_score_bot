async function withTimeout(task, ms, label) {
    let timer;
    try {
        return await Promise.race([task, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label}: tiempo de espera agotado.`)), ms);
        })]);
    } finally { clearTimeout(timer); }
}

module.exports = { withTimeout };
