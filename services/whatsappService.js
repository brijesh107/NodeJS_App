const { Client, RemoteAuth } = require('../funcation');
const jwt = require('jsonwebtoken');
const { pool, tableInfo } = require('../config/database');
const MssqlStore = require('../store/MssqlStore');
const { cleanCacheDirectories, processMessageQueue } = require('../utils/helper');
const puppeteerConfig = require('../utils/puppeteerConfig');

// Clean up cache directories at the top
cleanCacheDirectories();

// Environment setup
process.env.WWEBJS_CACHE_PATH = 'false';
process.env.WA_AUTORUN = 'false';

const clientInstances = {};
const readyClientsMap = new Map();
const messageQueue = {};

const createClientSession = async (clientId, io) => {
    // If client is already ready, return it immediately
    if (readyClientsMap.has(clientId)) return readyClientsMap.get(clientId);
    if (clientInstances[clientId]) return clientInstances[clientId];

    let client;
    const store = new MssqlStore({ pool: pool, tableInfo: tableInfo, Socket: io });

    try {
        client = new Client({
            authStrategy: new RemoteAuth({
                clientId,
                store,
                backupSyncIntervalMs: 86400000, // once every 24 hours
                dataPath: '/tmp/my/whatsapp/sessions', // ❌ Avoid current folder
            }),
            puppeteer: puppeteerConfig
        });


        client.on('INITIALIZING', () => {
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

        client.on('loading_screen', () => {
            console.log("loading_screen");
            io.emit('loading_screen', { isLoading: true })
        });

        client.on('ready', async () => {
            console.log(`Client ready for ${clientId}`);
            readyClientsMap.set(clientId, client);
            console.log("client", client);
            const token = jwt.sign({
                clientId,
                mobile: client.info?.wid?.user || 'unknown',
                timestamp: Date.now()
            }, process.env.MY_SECRET_KEY, { expiresIn: '30d' });
            io.emit('ready', {
                clientId,
                token,
                pushname: client.info?.pushname || 'Unknown',
                user: client.info?.wid?.user || 'Unknown'
            });

            await processMessageQueue(clientId, client , messageQueue);
        });

        client.on("remote_session_saved", () => {
            console.log("remote_session_saved !");
        })

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
