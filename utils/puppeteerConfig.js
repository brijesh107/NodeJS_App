// utils/puppeteerConfig.js
module.exports = {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-features=site-per-process',
        '--disable-extensions',
        '--disable-infobars',
        '--disable-application-cache',
        '--disk-cache-size=0',
    ],
    timeout: 60000,                // increase timeout
    webVersionCache: {
        type: 'none',             // Completely disable web version caching
    },
    cacheEnabled: false,         // Add this to prevent any local file storage
    sessionData: null           // Disable session file writing
};
