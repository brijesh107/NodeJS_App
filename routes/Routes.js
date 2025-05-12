const express = require("express");
const { sendMessage, sendBulkMessages, checkClientStatus, logoutClient } = require("../Controllers/messageController");
const { isAuthorised } = require("../middleware/Authentication");

const router = express.Router();

router.post("/send-message", sendMessage);
router.post("/send-bulk-message", isAuthorised, sendBulkMessages);
router.get("/client-status", isAuthorised, checkClientStatus);
router.get("/disconnect", isAuthorised, logoutClient);

module.exports = router;
