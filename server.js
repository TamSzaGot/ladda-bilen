const express = require('express');
const dgram = require('dgram');
const WebSocket = require('ws');
const http = require('http');
const moment = require('moment'); // For date/time manipulation

const app = express();
const port = 3000;

const chargerIp = '192.168.1.79';

const POWER_LIMIT = 14 // kW

// Store clients for broadcasting
const clients = [];
const chargerConfig = [
    {
        place: 'garage',
        start: () => sendUdpMessage('ena 1'),
        stop: () => sendUdpMessage('ena 0')
    },
    {
        place: 'lada',
        start: () => sendUdpMessage('output 1'),
        stop: () => sendUdpMessage('output 0')
    },
]
let chargerState = {
    startTime: null,
    stopTime: null,
    connectedCar: [
        {
            currentCharge: null,    // percentage
            desiredCharge: null,    // percentage
            chargeTime: 0        // minutes
        },
        {
            currentCharge: null,    // percentage
            desiredCharge: null,    // percentage
            chargeTime: 0        // minutes
        },
    ]
};
let currentCharger = 0;
let startTime = null;
let stopTime = null;
let currentCharge1 = null;
let desiredCharge1 = null;
let currentCharge2 = null;
let desiredCharge2 = null;


// Create a UDP socket
const udpSocket = dgram.createSocket('udp4');

// Home Manager 2.0
const MULTICAST_ADDR = '239.12.255.254';
const MULTICAST_PORT = 9522;

let currentCurrentReduction = 0;

const server2 = dgram.createSocket({'type' : 'udp4', 'reuseAddr' : true});

// Join the multicast group
server2.on('listening', () => {
  const address = server2.address();
  console.log(`Listening on ${address.address}:${address.port}`);
  server2.addMembership(MULTICAST_ADDR);
});

function roundHalf(num) {
    return Math.round(num*2)/2;
}

// Handle incoming UDP messages
server2.on('message', (msg, rinfo) => {
  //console.log(`Received message from ${rinfo.address}:${rinfo.port}`);
  //console.log(msg);
  try {
    const length = msg.length;

    if ( length === 608) {
        const meter = msg.readUInt32BE(28);
        const consumption = msg.readUInt32BE(32);
        //const solarGeneration = msg.readUInt16BE(2);  // Example for solar generation
        
        if ( meter == 66560) {
            const power = consumption / 10000;
            // console.log(`Meter: ${meter} Consumption: ${power} kW`);
            const currentReduction = (power > POWER_LIMIT) ? roundHalf(0.69286 * (power - POWER_LIMIT)) : 0; // A
            if ( currentReduction !== currentCurrentReduction) {
                currentCurrentReduction = currentReduction;
                const setCurrent = 16 - currentReduction;
                if (currentCharger == 0) { // Garage
                    console.log(`Set current: ${setCurrent} A`);
                    sendUdpMessage(`curr ${setCurrent * 1000}`);
                } else { // Lada
                    const charge = (setCurrent === 16) ? 1 : 0;
                    console.log(`Set current: ${charge * 16} A`);
                    sendUdpMessage(`output ${charge}`);
                }
            }
         }
        //console.log(`Solar Generation: ${solarGeneration} W`);
    }
  } catch (err) {
    console.log('Error parsing data:', err);
  }
});

// Handle errors
server2.on('error', (err) => {
  console.log(`Server error:\n${err.stack}`);
  server2.close();
});

// Bind to the UDP port and listen for packets
server2.bind(MULTICAST_PORT, () => {
  console.log(`Server is bound to port ${MULTICAST_PORT}`);
});


// Middleware to serve static files
app.use(express.static('public'));
// Serve static files from the public directory
//app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());

let waitingForAck = false;

// Function to resend command until TCH-OK have been received
function resendUdpMessageUntilAck(message){
   var timer = setTimeout(function(){
        if (!waitingForAck) {
            clearTimeout(timer);
//            console.log(`cleared timeout ...`);
        } else {
            sendUdpMessage(message);
        }
    }, 1000);
} 

// Function to send UDP messages
function sendUdpMessage(message) {
    if (['ena 0','ena 1','output 0','output 1', 'curr '].includes(message)) {
        if (!waitingForAck) {
            waitingForAck = true;
//            console.log(`resendUdpMessageUntilAck ...`);
            resendUdpMessageUntilAck(message);
//            console.log(`resendUdpMessageUntilAck done.`);
         }
    }
    const messageBuffer = Buffer.from(message);
    udpSocket.send(messageBuffer, 0, messageBuffer.length, 7090, chargerIp, (err) => {
        if (err) {
            console.error('Error sending UDP message:', err);
        } else {
            const timestamp = new Date().toLocaleString('sv-SE');
            console.log(`${timestamp} Sent: ${message}`);
       }
    });
}

// Handle incoming UDP messages
udpSocket.on('message', (msg, rinfo) => {
    const message = msg.toString();
    if (message.startsWith('TCH-OK :done')) {
        waitingForAck = false;
    }
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
  console.log(`start: ${start}`);
  const date = new Date();
  const currentTime = moment().format('HH:mm');
  console.log(`currentTime: ${currentTime}`);
  if (start < currentTime) {
    // add a day
    console.log(`Add a day.`);
    date.setDate(date.getDate() + 1);
    console.log(`date: ${date}`);

  }
  const startDay = date.toISOString().split('T')[0];

  startTime = new Date(startDay + 'T' + start);
  const msg = `{"startTime": "${moment(startTime).format('HH:mm')}"}`;
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

const charginPower = 9.2; //kW

app.post('/setenergy1', (req, res) => {
    const chargingTime = Math.round(req.body.desiredEnergy * 60 / charginPower); // minutes
    chargerState.connectedCar[0].chargeTime = chargingTime;
    const msg = `{"chargingTime1": ${chargingTime}}`;
    console.log(msg);
    res.send(msg);
    clients.forEach(client => {
        client.send(msg);
    });
});
  
app.post('/setenergy2', (req, res) => {
    const chargingTime = Math.round(req.body.desiredEnergy * 60 / charginPower); // minutes
    chargerState.connectedCar[1].chargeTime = chargingTime;
    const msg = `{"chargingTime2": ${chargingTime}}`;
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
          const chargingTime = chargerState.connectedCar[currentCharger].chargeTime;
          stopTime = moment(now).add(chargingTime, 'minutes')
          if (chargingTime > 0) {
            console.log(`${now.toTimeString()} Start charging ${chargerConfig[currentCharger].place}`);
            chargerConfig[currentCharger].start();
          }
          startTime = null; // Reset start time to prevent multiple triggers
        }
    }
    if (stopTime) {
        const now = new Date();
        if (now >= stopTime) {
            console.log(`${now.toTimeString()} Stop charging ${chargerConfig[currentCharger].place}`);
            chargerConfig[currentCharger].stop();
            stopTime = null; // Reset stop time to prevent multiple triggers
            if (currentCharger < 1) {
                currentCharger++;
                startTime = moment(now).add(2, 'minutes')
            } else {
                currentCharger = 0;
            }
        }
    }
  }, 10000); // Check every 10 second
