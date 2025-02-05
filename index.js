import express from "express";
import net from 'node:net';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import mqtt from "mqtt";
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const clients = [];

// Root CA Certificate for test.mosquitto.org
const MQTT_CA_CERT = `
-----BEGIN CERTIFICATE-----
MIIEAzCCAuugAwIBAgIUBY1hlCGvdj4NhBXkZ88OsEtHGTIwDQYJKoZIhvcNAQEL
BQAwgZAxCzAJBgNVBAYTAkdCMRcwFQYDVQQIDA5Vbml0ZWQgS2luZ2RvbTEOMAwG
A1UEBwwFRGVyYnkxEjAQBgNVBAoMCU1vc3F1aXR0bzELMAkGA1UECwwCQ0ExFjAU
BgNVBAMMDW1vc3F1aXR0by5vcmcxHzAdBgkqhkiG9w0BCQEWEHJvZ2VyQGF0Y2hv
by5vcmcwHhcNMjAwNjA5MTEwNjM5WhcNMzAwNjA3MTEwNjM5WjCBkDELMAkGA1UE
BhMCR0IxFzAVBgNVBAgMDlVuaXRlZCBLaW5nZG9tMQ4wDAYDVQQHDAVEZXJieTES
MBAGA1UECgwJTW9zcXVpdHRvMQswCQYDVQQLDAJDQTEWMBQGA1UEAwwNbW9zcXVp
dHRvLm9yZzEfMB0GCSqGSIb3DQEJARYQcm9nZXJAYXRjaG9vLm9yZzCCASIwDQYJ
KoZIhvcNAQEBBQADggEPADCCAQoCggEBAME0HKmIzfTOwkKLT3THHe+ObdizamPg
UZmD64Tf3zJdNeYGYn4CEXbyP6fy3tWc8S2boW6dzrH8SdFf9uo320GJA9B7U1FW
Te3xda/Lm3JFfaHjkWw7jBwcauQZjpGINHapHRlpiCZsquAthOgxW9SgDgYlGzEA
s06pkEFiMw+qDfLo/sxFKB6vQlFekMeCymjLCbNwPJyqyhFmPWwio/PDMruBTzPH
3cioBnrJWKXc3OjXdLGFJOfj7pP0j/dr2LH72eSvv3PQQFl90CZPFhrCUcRHSSxo
E6yjGOdnz7f6PveLIB574kQORwt8ePn0yidrTC1ictikED3nHYhMUOUCAwEAAaNT
MFEwHQYDVR0OBBYEFPVV6xBUFPiGKDyo5V3+Hf3cwKO3MB8GA1UdIwQYMBaAFPVV
6xBUFPiGKDyo5V3+Hf3cwKO3MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQEL
BQADggEBAGa9kS21N70ThM6/Hj9D7mbVxKLBjVWe2TPsGfbl3rEDfZ+OKRZ2j6AC
6r7jb4TZO3dzF2p6dgbrlU71Y/4K0TdzIjRj3cQ3KSm41JvUQ0hZ/c04iGDg/xWf
+pp58nfPAYwuerruPNWmlStWAXf0UTqRtg4hQDWBuUFDJTuWuuBvEXudz74eh/wK
sMwfu1HFvjy5Z0iMDU8PUDepjVolOCue9ashlS4EB5IECdSR2TItnAIiIwimx839
LdUdRudafMu5T5Xma182OC0/u/xRlEm+tvKGGmfFcN0piqVl8OrSPBgIlb+1IKJE
m/XriWr/Cq4h/JfB7NTsezVslgkBaoU=
-----END CERTIFICATE-----
`;

// Combine broker and reconnect options
const brokerOptions = {
    host: 'test.mosquitto.org',
    port: 8883,
    protocol: 'mqtts',
    ca: [Buffer.from(MQTT_CA_CERT)],
    rejectUnauthorized: true,
    
    // Reconnection options
    reconnectPeriod: 3000,
    keepalive: 60,
    connectTimeout: 4000,
    
    // Client identification
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