const express = require('express');
const dgram = require('dgram');
const WebSocket = require('ws');
const http = require('http');
const moment = require('moment'); // For date/time manipulation

const app = express();
const port = 3000;

// Create a UDP socket
const udpSocket = dgram.createSocket('udp4');

// Middleware to serve static files
app.use(express.static('public'));
// Serve static files from the public directory
//app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());

// Store clients for broadcasting
const clients = [];
let startTime = null;
let currentCharge1 = null;
let desiredCharge1 = null;
let currentCharge2 = null;
let desiredCharge2 = null;

// Function to send UDP messages
function sendUdpMessage(message) {
    const messageBuffer = Buffer.from(message);
    udpSocket.send(messageBuffer, 0, messageBuffer.length, 7090, '192.168.11.146', (err) => {
        if (err) {
            console.error('Error sending UDP message:', err);
        } else {
            console.log(`Sent: ${message}`);
        }
    });
}

// Handle incoming UDP messages
udpSocket.on('message', (msg, rinfo) => {
    const message = msg.toString();
    const timestamp = new Date().toLocaleString('sv-SE');
    console.log(`${timestamp} Received: ${message}`);
    // Broadcast the message to all connected clients
    clients.forEach(client => {
        client.send(message);
    });
});

// API endpoint to handle button clicks
app.post('/send-message', (req, res) => {
    const { message } = req.body;
    sendUdpMessage(message);
    res.send('Message sent');
});

// API endpoint to set the start time
app.post('/set-start-time', (req, res) => {
  const start = req.body.startTime; // Expecting time in HH:MM format
  const date = new Date();
  const currentTime = moment().format('HH:mm');
  if (start < currentTime) {
    // add a day
    console.log(`Add a day.`);
    date.setDate(date.getDate() + 1);
    console.log(`date: ${date}`);

  }
  const startDay = date.toISOString().split('T')[0];

  startTime = new Date(startDay + 'T' + start);
  const msg = `startTime: ${startTime}`;
  console.log(msg);
  res.send(msg);
  clients.forEach(client => {
    client.send(msg);
    });
});

// API endpoint to get current charge persentage
app.get('/current-charge1', (req, res) => {
res.body.currentCharge = currentCharge1; // Returns current charge in integer %
});
  
app.get('/current-charge2', (req, res) => {
    res.body.currentCharge = currentCharge2; // Returns current charge in integer %
});
  
// API endpoint to set current charge persentage
app.post('/current-charge1', (req, res) => {
    currentCharge1 = req.body.currentCharge; // Expecting current charge in integer %
    const msg = `{"currentCharge1": ${currentCharge1}}`;
    console.log(msg);
    res.send(msg);
    clients.forEach(client => {
        client.send(msg);
    });
});
  
app.post('/current-charge2', (req, res) => {
    currentCharge2 = req.body.currentCharge; // Expecting current charge in integer %
    const msg = `{"currentCharge2": ${currentCharge2}}`;
    console.log(msg);
    res.send(msg);
    clients.forEach(client => {
        client.send(msg);
    });
});

// API endpoint to get desired charge persentage
app.get('/desired-charge1', (req, res) => {
    res.body.desiredCharge = desiredCharge1; // Returns desired charge in integer %
});
  
app.get('/desired-charge2', (req, res) => {
    res.body.desiredCharge = desiredCharge2; // Returns desired charge in integer %
});
  
// API endpoint to set desired charge persentage
app.post('/desired-charge1', (req, res) => {
    desiredCharge1 = req.body.desiredCharge; // Expecting desired charge in integer %
    const msg = `{"desiredCharge1": ${desiredCharge1}}`;
    console.log(msg);
    res.send(msg);
    clients.forEach(client => {
        client.send(msg);
    });
});
  
app.post('/desired-charge2', (req, res) => {
    desiredCharge2 = req.body.desiredCharge; // Expecting desired charge in integer %
    const msg = `{"desiredCharge2": ${desiredCharge2}}`;
    console.log(msg);
    res.send(msg);
    clients.forEach(client => {
        client.send(msg);
    });
});
  
// Create an HTTP server and a WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on('connection', (ws) => {
    clients.push(ws);
    ws.on('close', () => {
        clients.splice(clients.indexOf(ws), 1);
    });
});

// Start the HTTP server
server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// Bind the UDP socket to listen for messages
udpSocket.bind(7090);

// Check time every minute
setInterval(() => {
  if (startTime) {
      const now = new Date();
      if (now >= startTime) {
        sendUdpMessage("ena 1");
        //sendUdpMessage("report 2");
        startTime = null; // Reset start time to prevent multiple triggers
      }
  }
}, 10000); // Check every 10 second
