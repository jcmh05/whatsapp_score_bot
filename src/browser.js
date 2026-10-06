function browserOptions({ executablePath, noSandbox = false, dumpio = false } = {}) {
    // Railway's /dev/shm is small; use its writable temporary filesystem instead.
    const args = process.platform === 'linux' ? ['--disable-dev-shm-usage'] : [];
    if (noSandbox) args.push('--no-sandbox', '--disable-setuid-sandbox');
    return { headless: true, pipe: true, executablePath, dumpio, args };
}

module.exports = { browserOptions };
