const { Client, RemoteAuth } = require('whatsapp-web.js')
const jwt = require('jsonwebtoken');
const formatPhoneNumber = require('../utils/phoneFormatter');
const clientInstances = {};
const readyClientsMap = new Map();
const messageQueue = {};
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const MssqlStore = require('../store/MssqlStore');

// Very important - set these environment variables before anything else
process.env.WWEBJS_CACHE_PATH = 'false';
process.env.WA_AUTORUN = 'false';

// Remove any lingering local session/cache dirs
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

// Process queued messages
const processMessageQueue = async (clientId, client) => {
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



const createClientSession = async (clientId, io) => {
    // If client is already ready, return it immediately
    if (readyClientsMap.has(clientId)) return readyClientsMap.get(clientId);
    if (clientInstances[clientId]) return clientInstances[clientId];

    let client;

    const tableInfo = {
        table: 'wsp_sessions',
        session_column: 'session_name',
        data_column: 'data',
        updated_at_column: 'updated_at'
    }

    async function ensureSessionTableExists(pool) {
        const result = await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'wsp_sessions')
            BEGIN
                CREATE TABLE wsp_sessions (
                    session_name NVARCHAR(255) PRIMARY KEY,
                    data NVARCHAR(MAX) NOT NULL,
                    updated_at DATETIME DEFAULT GETDATE()
                )
            END
        `);
    }

    await ensureSessionTableExists(pool);
    const store = new MssqlStore({ pool: pool, tableInfo: tableInfo });

    try {
        client = new Client({
            authStrategy: new RemoteAuth({
                clientId,
                store,
                backupSyncIntervalMs: 86400000, // once every 24 hours
                dataPath: '/tmp/my/whatsapp/sessions', // ❌ Avoid current folder

            }),
            puppeteer: {
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
                timeout: 60000, // increase timeout
                // These options prevent automatic cache creation:
                webVersionCache: {
                    type: 'none' // Completely disable web version caching
                },
                // Add this to prevent any local file storage:
                cacheEnabled: false,
                // Disable session file writing:
                sessionData: null
            },
        });

        client.on('INITIALIZING', (qr) => {
            console.log("INITIALIZING");
        });
        client.on('qr', (qr) => {
            console.log("QR Received !");
            io.emit('qr', { clientId, qr });
        });

        client.on('auth_failure', async (msg) => {
            console.error(`AUTH FAILURE for ${clientId}:`, msg);
            delete clientInstances[clientId];
            readyClientsMap.delete(clientId);
            io.emit('auth_failure', { clientId, reason: msg });
        });

        client.on('error', async (err) => {
            console.error(`Client error for ${clientId}:`, err.message);
            if (err.code === 'ENOENT') {
                console.log(`ENOENT recovery for ${clientId}`);
                delete clientInstances[clientId];
                readyClientsMap.delete(clientId);
                return await createClientSession(clientId, io);
            }
        });

        client.on('message_create', message => {
            if (message.body === '!ping') {
                client.sendMessage(message.from, 'pong');
            }
        });

        client.on('loading_screen', (qr) => {
            console.log("loading_screen");
            io.emit('loading_screen', { isLoading: true })
        });

        client.on('ready', async () => {
            console.log(`Client ready for ${clientId}`);
            readyClientsMap.set(clientId, client);

            const token = jwt.sign({
                clientId,
                mobile: client.info?.wid?.user || 'unknown',
                timestamp: Date.now()
            }, process.env.MY_SECRET_KEY, { expiresIn: '30d' });
            console.log("token",token);

            io.emit('ready', {
                clientId,
                token,
                pushname: client.info?.pushname || 'Unknown',
                user: client.info?.wid?.user || 'Unknown'
            });

            await processMessageQueue(clientId, client);
        });

        client.on('disconnected', async (reason) => {
            console.log(`Client disconnected: ${clientId}`);
            delete clientInstances[clientId];
            readyClientsMap.delete(clientId);
            io.emit('disconnected', { clientId, reason });
        });

        await client.initialize();
        clientInstances[clientId] = client;
        return client;
    } catch (error) {
        console.error(`Failed to initialize client [${clientId}]:`, error.message);
        if (error.code === 'ENOENT') {
            delete clientInstances[clientId];
            readyClientsMap.delete(clientId);
            return await createClientSession(clientId, io);
        }
        throw error;
    }
};

module.exports = { createClientSession, readyClientsMap, messageQueue };
