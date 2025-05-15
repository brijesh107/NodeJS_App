require('dotenv').config(); // Load environment variables
const jwt = require('jsonwebtoken'); // Import JWT
const { checkClientStatus } = require("../Controllers/messageController");
const { createClientSession, readyClientsMap, clientInstances } = require("../services/whatsappService");
const { pool, tableInfo } = require("../config/database");
const sql = require('mssql');

module.exports = async function handleSocketEvents(socket, io) {
    console.log("Socket.io  connected");

    socket.on("createSession", async ({ clientId }) => {
        try {
            const client = checkClientStatus(clientId);
            const request = pool.request();
            request.input('session_name', sql.NVarChar, clientId);
            const result = await request.query(
                `SELECT COUNT([${tableInfo.session_name}]) as count 
                         FROM [${tableInfo.table}] 
                         WHERE [${tableInfo.session_name}] = @session_name`
            );
            console.log("result", result);
            if (result.recordset[0].count !== 0) {
                console.log("Using existing client:", clientId);
                const token = jwt.sign({
                    clientId,
                    // mobile: client.info?.wid?.user || 'unknown',
                    timestamp: Date.now()
                }, process.env.MY_SECRET_KEY, { expiresIn: '30d' });
                console.log("token", token);

                io.emit('ready', {
                    clientId,
                    token,
                    pushname: client.info?.pushname || 'Unknown',
                    user: client.info?.wid?.user || 'Unknown'
                });
            } else {
                console.log("Creating new client session:", clientId);
                const client = await createClientSession(clientId, io);
                // Attach error listener
                client.on("error", async (err) => {
                    console.error(`Client error for ${clientId}:`, err.message);
                    if (err.code === "ENOENT") {
                        console.log(`Recovering from ENOENT for ${clientId}`);
                        delete clientInstances[clientId];
                        readyClientsMap.delete(clientId);
                        await createClientSession(clientId, io);
                    }
                });
            }
        } catch (err) {
            console.log(err);
            console.error("❌ Error in createSession:", err.message);
        }
    });
};
