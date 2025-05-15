// utils/sessionUtils.js
const fs = require('fs');
const path = require('path');
const formatPhoneNumber = require('./phoneFormatter');

const cleanCacheDirectories = () => {
    const cacheDirectories = [
        path.join(process.cwd(), '.wwebjs_auth'),
        path.join(process.cwd(), '.wwebjs_cache'),
        path.join(process.cwd(), 'session-')
    ];

    cacheDirectories.forEach(dir => {
        try {
            if (fs.existsSync(dir)) {
                console.log(`Removing cache directory: ${dir}`);
                fs.rmSync(dir, { recursive: true, force: true });
            }
        } catch (err) {
            console.error(`Error removing directory ${dir}:`, err);
        }
    });
};

const processMessageQueue = async (clientId, client, messageQueue) => {
    if (!messageQueue[clientId]) return;
    for (const { number, message } of messageQueue[clientId]) {
        const formattedNumber = formatPhoneNumber(number);
        const chatId = `${formattedNumber}@c.us`;
        try {
            await client.sendMessage(chatId, message);
            console.log(`Queued message sent to ${number}`);
        } catch (err) {
            console.error(`Failed to send queued message to ${number}: ${err.message}`);
        }
    }
    delete messageQueue[clientId];
};

module.exports = {
    cleanCacheDirectories,
    processMessageQueue
};
