if (process.argv.length !== 5) {
  console.log(`Usage: node ${process.argv[1]} <ip> <port> <count>`);
  process.exit(1);
}

const net = require("net");
const fs = require("fs");
const util = require('util');
const { v4: uuidv4 } = require('uuid');
const { processPacket } = require('./processPacket.js');
const { translations } = require('./versioning.js');
Object.assign(global, require('./hooks.js'));
Object.assign(global, require('./lib.js'));

const proto = 770;
const sockets = [];

function main() {
  const ip = process.argv[2];
  var port = parseInt(process.argv[3]);
  const count = parseInt(process.argv[4]);

  for (let i = 1; i <= count; i++) {
    // setTimeout(() => {
      doink(ip, port, i, count, sockets,"i ate an " + i);
    // }, 250 * i);
  }
}

let botCount = 1


function doink(ip, port, i, count, sockets,chatMsg) {
  const nick = generateRandomString(8);

  const options = {
    host: ip,
    port: port,
  };
  try {
    setLine(0,0,`\r[${botCount}/${count}] Connecting bot: ${nick}`)
    botCount++
    let socket = net.createConnection(options);
    sockets.push(socket);
    socket.id = i
    socket.tmp = Buffer.from([])
    socket.proto = proto
    socket.chatMsg = chatMsg
    const packet = translations[socket.proto]
    // Make handshake packet
    let handshake = makePacket(
      0x00,Buffer.concat([makeVarInt(proto),makeString(ip),Buffer.from([port >> 8, port & 0xFF]),Buffer.from([0x02])])
    )
    socket.write(handshake);
    socket.state = "login";
    //Write login start
    let uuid = Buffer.from(require('uuid').v4().replace(/-/g, ''), 'hex');
    socket.write(makePacket(0x00,Buffer.concat([makeString(nick),uuid])));


    setInterval(function(){
      if (socket.state == "play") {
        let message = makeString(socket.chatMsg)
        let timestamp = Buffer.alloc(8)
        let salt = Buffer.alloc(8)
        let hasSig = Buffer.from([0x00])
        let messageCount = makeVarInt(0)
        let acknowledgement = Buffer.alloc(3)
        let checksum = Buffer.from([0x00])
        let msg
        if ( socket.proto == 767 ) {
          msg = Buffer.concat([
            message,timestamp,hasSig,messageCount,acknowledgement,salt
          ])
        }
        if ( socket.proto == 770 ) {
          msg = Buffer.concat([
            message,timestamp,salt,hasSig,messageCount,acknowledgement,checksum
          ])
        }
        let packt = makePacket(packet.p.s.chat,msg,socket)
        socket.write(packt)
      }
    },1000)
    socket.on("data", (data) => {

      processPacket(data,socket)

    });
    socket.on("error", (err) => {
      log(0,`Error connecting bot ${i}: ${err.message}`);
    });
    socket.on("close", (res) => {
      if (res) {
        log(1,
          `\nsocket close because it's fucking stupid and ${res.message}`,
        );
      } else {
        botCount-=1
        // process.stdout.write(`\r[${botCount}/${count}] Disconnected bot: ${socket.username}`);
        setLine(0,0,`\r[${botCount}/${count}] Disconnected bot: ${socket.username}`)
        // log(1,`\nsocket close because it's literally fucking stupid`);
      }
    });
  } catch (e) {
    log(0,
      `Error with bot ${i}: Failed to connect: ${e.message}`,
    );
  }
}

main();
