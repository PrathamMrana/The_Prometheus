const fetch = require('node-fetch');

const fetchWithRetry = async (url, options = {}, retries = 3, timeoutMs = 8000) => {
    for (let i = 0; i < retries; i++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                ...options,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    ...options.headers
                },
                signal: controller.signal
            });
            clearTimeout(timeout);
            return res;
        } catch (err) {
            clearTimeout(timeout);
            if (i === retries - 1) throw err;
            console.log(`[Retry ${i + 1}/${retries}] ${url.slice(0, 80)}...`);
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
};

module.exports = fetchWithRetry;
