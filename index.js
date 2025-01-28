import express from "express";
import EventEmitter from "node:events";
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

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

const server = net.createServer(socket => {
    console.log(`ESP Server connected`);
    EServer = socket;
    
    let buffer = '';
    let isHeadersComplete = false;
    
    socket.on("data", (data) => {
        try {
            const dataStr = data.toString();
            
            // If we haven't processed headers yet
            if (!isHeadersComplete) {
                const headerEnd = dataStr.indexOf('\r\n\r\n');
                if (headerEnd !== -1) {
                    // Found the end of headers, skip them
                    buffer = dataStr.substring(headerEnd + 4);
                    isHeadersComplete = true;
                }
                return;
            }
            
            buffer += dataStr;
            
            // Process complete JSON objects
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                let jsonString = buffer.substring(0, newlineIndex).trim();
                buffer = buffer.substring(newlineIndex + 1);
                
                if (jsonString && !jsonString.startsWith('Host:')) {
                    try {
                        let parsedData = JSON.parse(jsonString);
                        console.log("ESP32:", parsedData);
                        
                        if (EClient && !EClient.destroyed) {
                            EClient.write(`data: ${JSON.stringify(parsedData)}\n\n`);
                        }
                    } catch (parseError) {
                        console.error("Error parsing JSON:", jsonString, parseError);
                    }
                }
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
});

server.listen(EPORT, '0.0.0.0', () => {
    console.log(`Server for ESP32 listening on port ${EPORT}`);
});

app.get('/', (req, res) => {
    res.render("index");
});

app.post("/send", (req, res) => {
    try {
        let command = req.body;
        command = JSON.stringify(command);
        
        if (!EServer || EServer.destroyed) {
            return res.status(503).json({ message: "ESP32 is not connected" });
        }
        
        EServer.write(command + '\n', (err) => {
            if (err) {
                return res.status(500).json({ message: "Failed to send command", error: err.message });
            }
            res.status(200).json({message: "Command sent successfully" });
        });
    } catch (error) {
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