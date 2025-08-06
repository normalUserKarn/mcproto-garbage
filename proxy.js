const net = require('net');

//Ill add more to this later hehe
// Configuration
const LISTEN_PORT = 25565; // Port for clients to connect to
const TARGET_HOST = 'server ip'; // Replace with real server
const TARGET_PORT = 25565;

// Create proxy server
const server = net.createServer(clientSocket => {
    console.log('Client connected:', clientSocket.remoteAddress);

    const serverSocket = net.createConnection(TARGET_PORT, TARGET_HOST, () => {
        console.log('Connected to Minecraft server');
    });

    // Forward data client → server
    clientSocket.on('data', data => {
        console.log('Client → Server:', data);
        serverSocket.write(data);
    });

    // Forward data server → client
    serverSocket.on('data', data => {
        console.log('Server → Client:', data);
        clientSocket.write(data);
    });

    // Handle closures
    clientSocket.on('close', () => {
        console.log('Client disconnected');
        serverSocket.end();
    });

    serverSocket.on('close', () => {
        console.log('Server disconnected');
        clientSocket.end();
    });

    // Errors
    clientSocket.on('error', err => console.error('Client error:', err.message));
    serverSocket.on('error', err => console.error('Server error:', err.message));
});

server.listen(LISTEN_PORT, () => {
    console.log(`Proxy listening on port ${LISTEN_PORT}`);
});
