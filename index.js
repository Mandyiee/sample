import express from "express";
import net from 'node:net';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import mqtt from "mqtt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const clients = [];

// Combine broker and reconnect options
const brokerOptions = {
    host: 'test.mosquitto.org',
    port: 8883, // Secure TLS/SSL port
    protocol: 'mqtts', // Use MQTT over TLS/SSL
    rejectUnauthorized: true, // Verify broker's certificate
    
    // Reconnection options
    reconnectPeriod: 3000,
    keepalive: 60,
    connectTimeout: 4000,
    
    // Optional: client ID and clean session
    clientId: `mqtt_client_${Math.random().toString(16).slice(3)}`,
    clean: true
};

// Add CORS support
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'HEAD'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

const topic_sensor = "smartix/data";
const topic_command = "smartix/command";

// Create client with combined options
const client = mqtt.connect('mqtts://test.mosquitto.org', brokerOptions);

client.on("connect", () => {
    console.log(`Connected to MQTT broker at ${brokerOptions.host}`);
    client.subscribe(topic_sensor, (err) => {
        if (!err) {
            console.log(`Subscribed to topic: ${topic_sensor}`);
        } else {
            console.error("Subscription error", err);
        }
    });
});

client.on('message', (topic, message) => {
    console.log(`Received on ${topic}: ${message.toString()}`);
    clients.forEach(client => {
        client.write(`data: ${message}\n\n`);
    });
});

client.on('error', (err) => {
    console.error("MQTT Error:", err);
});

// SSE endpoint for real-time data
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    clients.push(res);
    
    req.on('close', () => {
        clients.splice(clients.indexOf(res), 1);
    });
    
    res.write('data: {"status":"connected"}\n\n');
});

function sendMQTTMessage(topic, message) {
    return new Promise((resolve, reject) => {
        client.publish(topic, message, (err) => {
            if (err) {
                console.error("Error sending command:", err);
                return reject(err);
            }
            resolve();
        });
    });
}

// Endpoint to send commands via MQTT
app.post("/send", async (req, res) => {
    try {
        const command = JSON.stringify(req.body);
        console.log("Sending command:", command);
        
        if (!client.connected) {
            return res.status(503).json({ message: "MQTT broker is not connected" });
        }
        
        await sendMQTTMessage(topic_command, command);
        res.status(200).json({ message: "Command sent successfully" });
    } catch (error) {
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

app.get('/', (req, res) => {
    res.render("index");
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing servers...');
    clients.forEach(client => client.end());
    client.end();
    console.log('Servers closed.');
});