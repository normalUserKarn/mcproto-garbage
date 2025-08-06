if (process.argv.length !== 5) {
  console.log(`Usage: node ${process.argv[1]} <ip> <port> <count>`);
  process.exit(1);
}

Object.assign(global, require('./processPacket.js'));
Object.assign(global, require('./versioning.js'));
Object.assign(global, require('./hooks.js'));
Object.assign(global, require('./lib.js'));

const net = require("net");
const util = require('util');
const http = require('http')
const fs = require('fs')
const path = require('path');
const { WebSocketServer } = require('ws')

botCount = { v: 0 }
let interval = 0
let ip = process.argv[2];
let port = parseInt(process.argv[3]);
maxBotCount = parseInt(process.argv[4]);
const serverPort = 3000;
const proto = 770;
const sockets = [];

global.server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
 } else if (req.method === 'POST' && req.url === '/reconnect') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { ip, port, count, tmpinterval } = JSON.parse(body);
        maxBotCount = count
        console.log('Reconnect request:', { ip, port, count, interval });
        logLines.forEach(function(log,i){
          clearLog(i)
        })
        for (let sock of sockets) {sock.closedIntentionally = true; sock.end(); triggerSocketCloseHook(sock,botCount,maxBotCount) }
        sockets.length = 0
        for (let i = 0; i < count; i++) {
          setTimeout(() => {
            doink(ip, port, i, count, sockets);
          }, interval * i);
        }
        // Place reconnect logic here
        res.writeHead(200);
        res.end('Reconnect received');
      } catch (err) {
        console.error('Invalid JSON:', err);
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});


server.listen(serverPort, () => {
  console.log(`server running at http://localhost:${port}`);
});

global.wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  // Send initial logLines data to client
  logLines.forEach((lines, i) => {
    ws.send(JSON.stringify({ event: 'init', data: { index: i, lines } }));
  });

  // ws.on('message', (message) => {
    // handle messages from clients
  // });
});





function doink(ip, port, i, count, sockets) {
  const options = {
    host: ip,
    port: port,
  };
  try {
    let socket = net.createConnection(options);
    sockets.push(socket);
    socket.id = i
    socket.ip = ip
    socket.port = port
    socket.proto = proto
    triggerInitHook(socket,botCount,maxBotCount)
    socket.on("data", (data) => {
      processPacket(data,socket)
    });
    socket.on("error", (err) => {
      log(3,`Error connecting bot ${i}: ${err.stack}`);
    });
    socket.on("close", (res) => {
      triggerSocketCloseHook(socket,botCount,maxBotCount,res)
    });
  } catch (e) {
    log(3,
      `Error with bot ${i}: Failed to connect: ${e.stack}`,
    );
  }
}

for (let i = 0; i < maxBotCount; i++) {
  setTimeout(() => {
    doink(ip, port, i, maxBotCount, sockets);
  }, interval * i);
}
