const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const MessageRoutes = require("./routes/Routes");
const { connectDB } = require("./config/database");
const handleSocketEvents = require("./services/SocketService");

const app = express();
const port = process.env.PORT || 5000;

// Socket.IO setup
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        credentials: true
    },
});

app.set('io', io);

// Middleware
app.use(cookieParser());
app.use(express.json({ limit: 'Infinity' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

// Handle socket events
io.on("connection", (socket) => handleSocketEvents(socket, io));

// Routes 
app.use("/message", MessageRoutes);

// Connect to MSSQL DB
connectDB();

// Start server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
