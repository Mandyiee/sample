import express from "express";
import net from 'node:net';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const EPORT = process.env.EPORT || 8000;
let EServer = null;
let EClient = null;

// Add CORS support
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'HEAD'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Add error handling for the TCP server
const server = net.createServer(socket => {
    console.log(`ESP Server connected`);
    EServer = socket;

    socket.setKeepAlive(true, 60000); // Keep connection alive
    socket.setTimeout(300000); // 5-minute timeout

    socket.on("data", (data) => {
        try {
            const message = data.toString().trim();
            console.log("ESP32 Raw Data:", message);

            
            if (isJson(message)) {
                console.log("ESP32 JSON Data:", message);

                // Forward the valid JSON to the client
                if (EClient && !EClient.destroyed) {
                    EClient.write(`data: ${message}\n\n`);
                }
            } else {
                console.warn("Invalid JSON received from ESP32:", message);
            }
        } catch (error) {
            console.error("Error processing ESP32 data:", error);
        }
    });

    socket.on("end", () => {
        console.log("ESP32 disconnected");
        EServer = null;
    });

    socket.on("error", (err) => {
        console.error("Socket error:", err.message);
        EServer = null;
    });

    socket.on("timeout", () => {
        console.log("Socket timeout");
        socket.end();
        EServer = null;
    });
});

// Add error handling for the server
server.on('error', (err) => {
    console.error('TCP Server error:', err);
});

server.listen(EPORT, '0.0.0.0', () => {
    console.log(`Server for ESP32 listening on port ${EPORT}`);
});

// Function to validate JSON
function isJson(str) {
    try {
        JSON.parse(str);
        return true;
    } catch (e) {
        return false;
    }
}

app.get('/', (req, res) => {
    res.render("index");
});

app.post("/send", (req, res) => {
    try {
        const command = JSON.stringify(req.body);
        console.log("Sending command:", command);

        if (!EServer || EServer.destroyed) {
            return res.status(503).json({ message: "ESP32 is not connected" });
        }

        EServer.write(command + '\n', (err) => {
            if (err) {
                console.error("Error sending command:", err);
                return res.status(500).json({ message: "Failed to send command", error: err.message });
            }
            res.status(200).json({ message: "Command sent successfully" });
        });
    } catch (error) {
        console.error("Error in /send endpoint:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

app.get('/events', (req, res) => {
    try {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (EClient && !EClient.destroyed) {
            EClient.end();
        }

        EClient = res;

        req.on('close', () => {
            if (EClient === res) {
                EClient = null;
            }
        });

        res.write('data: {"status":"connected"}\n\n');
    } catch (error) {
        console.error("Error in /events endpoint:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing servers...');
    server.close(() => console.log('TCP server closed'));
});
