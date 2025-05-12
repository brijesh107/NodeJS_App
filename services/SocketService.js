const { checkClientStatus } = require("../Controllers/messageController");
const { createClientSession, readyClientsMap, clientInstances } = require("../services/whatsappService");

module.exports = async function handleSocketEvents(socket, io) {
    console.log("Socket.io  connected");

    socket.on("createSession", async ({ clientId }) => {
        try {
            // const status = checkClientStatus(clientId);
            // if (status.ready) {
            //     console.log("Using existing client:", clientId);
            //     io.emit("ready", {
            //         clientId,
            //         ready: status.ready,
            //         clientInfo: status.clientInfo,
            //         message: status.message
            //     });
            // } else {
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
            // }
        } catch (err) {
            console.error("❌ Error in createSession:", err.message);
        }
    });
};
