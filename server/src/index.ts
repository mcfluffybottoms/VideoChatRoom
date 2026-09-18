import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import router from './routes/router';
import { connectHandlers } from '../services/room-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(router);

connectHandlers(io);

if (process.env.NODE_ENV === 'production') {
    const clientPath = path.join(__dirname, '../../client/dist');

    app.use(express.static(clientPath));

    app.get('/', (req, res) => {
        res.sendFile(path.join(clientPath, 'index.html'));
    });

    app.get('/*splat', (req, res) => {
        res.sendFile(path.join(clientPath, 'index.html'));
    });
}

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
