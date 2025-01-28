import express from "express";
import EventEmitter, { getEventListeners } from "node:events";
import net from 'node:net';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8080;
const EPORT = 8000;
let EServer = null;
let EClient = null;


app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

const server = net.createServer(socket => {   
    console.log(`ESP Server connected`);
    EServer = socket;                          

    socket.on("data", (data) => {            
        let message = data.toString();
        try {
            console.log("ESP32:", message);
            if (EClient) {                     
                EClient.write(`data: ${message}\n`);
            }
        } catch (error) {
            console.error("Error parsing ESP32 data:", error);
        }
    });

    socket.on("end", () => {
        console.log("ESP32 disconnected");
        EServer = null;
    });
        
    socket.on("error", (err) => {
        console.error("Socket error:", err.message);
    });
});

server.listen(EPORT, () => {
    console.log(`Server for ESP32 listening on port ${EPORT}`);
});

app.get('/', (req, res) => {
    res.render("index");
});

app.post("/send", (req, res) => {
    let command = req.body;
    command = JSON.stringify(command);
    console.log(command);
    if (EServer) {
        EServer.write(command + '\n', (err) => {
            if (err) {
                return res.status(500).json({ message: "Failed to send command", error: err.message });
            }
            res.status(200).json({message: "Command sent successfully" });
        });
    } else {
        res.status(500).json({ message: "Esp32 is not connected" });
    }
});

app.get('/events', (req, res) => {            
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    EClient = res;

    req.on('close', () => {
        EClient = null;
    });
});


app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

