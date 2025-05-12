
const formatPhoneNumber = require('../utils/phoneFormatter');
const { createClientSession, readyClientsMap, messageQueue } = require('../services/whatsappService');

const checkClientStatus = (clientId) => {
  const client = readyClientsMap.get(clientId);
  if (!client) {
    return {
      ready: false,
      clientInfo: null,
      message: 'Client session not found or not ready',
    };
  }

  const info = client.info || {};
  const pushname = info.pushname || 'Unknown';
  const mobileNumber = info.wid?.user || 'Unknown';

  return {
    ready: true,
    clientInfo: {
      name: pushname,
      number: mobileNumber,
      platform: info.platform || 'unknown',
    },
    message: 'Client is ready',
  };
};


const sendMessage = async (req, res) => {
  const { clientId, number, message } = req.body;
  // const clientId = req.clientId; // ✅ Get clientId from JWT middleware
  if (!clientId || !number || !message) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const client = await createClientSession(clientId, req.app.get('io'));
    const formattedNumber = formatPhoneNumber(number);
    const chatId = `${formattedNumber}@c.us`;

    if (!readyClientsMap.has(clientId)) {
      // Client is initializing → Queue message
      if (!messageQueue[clientId]) messageQueue[clientId] = [];
      messageQueue[clientId].push({ number, message });
      return res.status(202).json({
        success: false,
        queued: true,
        message: 'Client is not ready yet. Message queued.'
      });
    }

    await client.sendMessage(chatId, message);
    res.status(200).json({ success: true, message: 'Message sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
};

const sendBulkMessages = async (req, res) => {
  const { clientId, recipients = [] } = req.body;

  if (!clientId || recipients.length === 0) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // Pre-calculate estimated time
  const batchSize = 5;
  const delayMs = 1000;
  const totalBatches = Math.ceil(recipients.length / batchSize);
  const estimatedDelayMs = (totalBatches - 1) * delayMs;
  const estimatedSeconds = Math.round(estimatedDelayMs / 1000);
  const estimatedMinutes = (estimatedSeconds / 60).toFixed(2);

  console.log(`Estimated time to send ${recipients.length} messages: ${estimatedSeconds} seconds (${estimatedMinutes} minutes)`);

  const startTime = Date.now();

  try {
    const client = await createClientSession(clientId, req.app.get('io'));

    let successCount = 0;
    let failedNumbers = [];

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const batchPromises = batch.map(async (recipient) => {
        const { MobileNo, Message } = recipient;

        if (!MobileNo || !Message) {
          failedNumbers.push({ number: MobileNo, error: 'Missing MobileNo or Message' });
          return;
        }

        try {
          const formattedNumber = formatPhoneNumber(MobileNo);
          const chatId = `${formattedNumber}@c.us`;
          await client.sendMessage(chatId, Message);
          successCount++;
        } catch (err) {
          console.error(`Failed to send message to ${MobileNo}: ${err.message}`);
          failedNumbers.push({ number: MobileNo, error: err.message });
        }
      });

      await Promise.all(batchPromises);

      if (i + batchSize < recipients.length) {
        await delay(delayMs);
      }
    }

    const endTime = Date.now();
    const totalTimeMs = endTime - startTime;
    const actualSeconds = Math.round(totalTimeMs / 1000);
    const actualMinutes = (actualSeconds / 60).toFixed(2);

    console.log(`✅ Completed sending. Actual time: ${actualSeconds} seconds (${actualMinutes} minutes)`);

    res.status(200).json({
      success: true,
      total: recipients.length,
      successCount,
      failedCount: failedNumbers.length,
      failedNumbers,
      estimatedTime: {
        seconds: estimatedSeconds,
        minutes: estimatedMinutes
      },
      actualTime: {
        seconds: actualSeconds,
        minutes: actualMinutes
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to send bulk messages',
      details: err.message
    });
  }
};



const logoutClient = async (req, res) => {
  const { clientId } = req.query;


  if (!clientId) { return res.status(400).json({ success: false, error: 'Missing clientId parameter' }); }

  try {
    const client = readyClientsMap.get(clientId);

    if (!client) { return res.status(404).json({ success: false, error: 'Client session not found' }); }

    // Close the client connection
    await client.logout();

    // Remove from ready clients map
    readyClientsMap.delete(clientId);

    // Clear any queued messages
    if (messageQueue[clientId]) {
      delete messageQueue[clientId];
    }

    // Notify any connected socket clients about the logout
    if (req.app.get('io')) {
      req.app.get('io').to(clientId).emit('client:logout', {
        clientId,
        status: 'logged_out',
        timestamp: new Date()
      });
    }

    return res.status(200).json({ success: true, message: 'Client logged out successfully' });

  } catch (err) {
    console.error(`Error during logout for client ${clientId}:`, err);
    return res.status(500).json({ success: false, error: 'Failed to logout client', details: err.message });
  }
};

module.exports = { checkClientStatus, sendMessage, sendBulkMessages, logoutClient };
