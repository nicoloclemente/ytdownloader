const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const downloadRoutes = require('./api/download');  // Importa il file di routing API
const formatsRoutes = require('./api/formats');
const infoRoutes = require('./api/info');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: ["http://localhost:3000", "https://ytdtool.vercel.app"], // Permetti solo richieste da localhost:3000
        methods: ["GET", "POST"],
    }
});

// Espone gli headers al frontend correttamente
app.use((req, res, next) => {
    res.header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
    next();
});

// Configurazione CORS per Express
app.use(cors({
    origin: ["http://localhost:3000", "https://ytdtool.vercel.app"], // Permetti solo richieste da localhost:3000
    methods: ["GET", "POST"]
}));

// Usa il routing delle API
app.use('/api/download', downloadRoutes(io));
app.use('/api/formats', formatsRoutes);
app.use('/api/info', infoRoutes);

// Avvia il server
server.listen(5001, () => {
    console.log('Server in ascolto sulla porta 5001');
});