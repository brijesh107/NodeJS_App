const { jwt } = require("jsonwebtoken");
const { checkClientStatus } = require("../Controllers/messageController");
const { createClientSession, readyClientsMap, clientInstances } = require("../services/whatsappService");

module.exports = async function handleSocketEvents(socket, io) {
    console.log("Socket.io  connected");

    socket.on("createSession", async ({ clientId }) => {
        try {
            const client = checkClientStatus(clientId);
            if (client.ready) {
                console.log("Using existing client:", clientId);
                const token = jwt.sign({
                    clientId,
                    mobile: client.info?.wid?.user || 'unknown',
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
            console.error("❌ Error in createSession:", err.message);
        }
    });
};
