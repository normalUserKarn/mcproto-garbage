if (process.argv.length !== 5) {
  console.log(`Usage: node ${process.argv[1]} <ip> <port> <count>`);
  process.exit(1);
}

// Fixes errors with blessed
process.env.TERM = 'xterm'
const net = require("net");
const zlib = require("zlib");
const crypto = require('crypto');
const fs = require("fs");
const util = require('util');
const blessed = require('blessed');
const { v4: uuidv4 } = require('uuid');
const { translations } = require('./versioning.js');

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);
const port = 3000;

const logLines = [[], [], [], []];
const MAX_LINES = 100;

// Serve static HTML
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// WebSocket for pushing logs live
io.on('connection', (socket) => {
  logLines.forEach((lines, i) => {
    socket.emit('init', { index: i, lines });
  });
});

function log(boxIndex, msg) {
  const formatted = formatMsg(msg);
  const lines = logLines[boxIndex];
  lines.push(formatted);
  if (lines.length > MAX_LINES) lines.shift();
  io.emit('log', { index: boxIndex, line: formatted });
}

// Set or overwrite a specific line in a box
function setLine(boxIndex, lineIndex, msg) {
  const formatted = formatMsg(msg);
  const lines = logLines[boxIndex];

  // Fill in any missing lines
  while (lines.length <= lineIndex) lines.push('');
  lines[lineIndex] = formatted;

  // Trim excess lines
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);

  io.emit('replace', { index: boxIndex, lines });
}

// Format any type
function formatMsg(msg) {
  if (Buffer.isBuffer(msg)) return util.inspect(msg);
  if (typeof msg === 'object') {
    try {
      return JSON.stringify(msg, null, 2);
    } catch {
      return util.inspect(msg);
    }
  }
  return String(msg);
}function log(boxIndex, msg) {
  const formatted = formatMsg(msg);
  const lines = logLines[boxIndex];
  lines.push(formatted);
  if (lines.length > MAX_LINES) lines.shift();
  io.emit('log', { index: boxIndex, line: formatted });
}

// Set or overwrite a specific line in a box
function setLine(boxIndex, lineIndex, msg) {
  const formatted = formatMsg(msg);
  const lines = logLines[boxIndex];

  // Fill in any missing lines
  while (lines.length <= lineIndex) lines.push('');
  lines[lineIndex] = formatted;

  // Trim excess lines
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);

  io.emit('replace', { index: boxIndex, lines });
}

// Format any type
function formatMsg(msg) {
  if (Buffer.isBuffer(msg)) return util.inspect(msg);
  if (typeof msg === 'object') {
    try {
      return JSON.stringify(msg, null, 2);
    } catch {
      return util.inspect(msg);
    }
  }
  return String(msg);
}

http.listen(port, () => {
  console.log(`server running at http://localhost:${port}`);
});


// cleanup
process.on('exit', () => {
  process.stdout.write(`${ESC}[?25h`); // show cursor
});
process.on('SIGINT', () => process.exit());


// function setLine(line,test){
//   console.log(test)
// }
// function log(line,test){
//   console.log(test)
// }


let agent;
let request = [];


function derToPem(derBuffer) {
  const base64 = derBuffer.toString('base64');
  const lines = base64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

function getRsaKeySize(derBuffer) {
  const pem = derToPem(derBuffer);
  const keyObj = crypto.createPublicKey(pem);
  return keyObj.asymmetricKeyDetails.modulusLength; // in bits
}

function encryptWithPublicKey(derBytes, data) {
  const pemKey = derToPem(derBytes);
  return crypto.publicEncrypt(
    {
      key: pemKey,
      padding: crypto.constants.RSA_PKCS1_PADDING, // Required by the protocol
    },
    data
  );
}

function inflate(buffer) {
  return zlib.inflateSync(buffer); // or zlib.unzipSync(buffer) if unsure of format
}

function createDecryptor(sharedSecret) {
  const decipher = crypto.createDecipheriv('aes-128-cfb8', sharedSecret, sharedSecret);
  return (buffer) => Buffer.from(decipher.update(buffer));
}

function createEncryptor(sharedSecret) {
  const cipher = crypto.createCipheriv('aes-128-cfb8', sharedSecret, sharedSecret);
  return (buffer) => Buffer.from(cipher.update(buffer));
}


function makePacket(id,data,socket,debug) {
  // log(1,"sent FULL " + id)
  // log(2,data)
  let dat
  if (data) {
    dat = Buffer.concat([Buffer.from([id]),data])
  } else {
    dat = Buffer.from([id])
  }
  if (socket) {
    let datlength
    if (socket.compressionThresh) {
      if(dat.length < socket.compressionThresh){
        datlength = 0
      } else {
        datlength = dat.length
        log(1,"packet you tried to send was too big")
      }
      dat = Buffer.concat([makeVarInt(datlength),dat]) 
    }
    dat = Buffer.concat([makeVarInt(dat.length),dat])
    if (socket.pk) {
      dat = socket.encrypt(dat)
    }
  } else {
    dat = Buffer.concat([makeVarInt(dat.length),dat]) 
  }
  return dat
}

function readVarInt(buffer, offset = 0) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  let byte;

  do {
    if (pos >= buffer.length) throw new Error("Buffer too short for VarInt");
    byte = buffer[pos++];
    result |= (byte & 0x7F) << shift;
    shift += 7;
  } while (byte & 0x80);

  return { value: result, bytesRead: pos - offset, left: buffer.slice(pos-offset), sliced: buffer.slice((pos - offset) + result), data: buffer.slice(pos - offset).slice(0,result) };
}

function countUtf16Units(str) {
  let count = 0;
  for (const char of str) {
    const code = char.codePointAt(0);
    count += code > 0xFFFF ? 2 : 1;
  }
  return count;
}

function readString(buffer, maxCodeUnits = 32767, offset = 0) {
  const { value: byteLength, bytesRead } = readVarInt(buffer, offset);
  const start = offset + bytesRead;
  const end = start + byteLength;

  if (end > buffer.length) throw new Error("String exceeds buffer length");

  const str = buffer.slice(start, end).toString('utf8');

  if (countUtf16Units(str) > maxCodeUnits) {
    throw new Error("String exceeds max UTF-16 code units");
  }

  return { string: str, bytesRead: end - offset, byteLen: byteLength, sliced: buffer.slice(end - offset) };
}

function makeVarInt(data) {
  if (data < 0x80) {
    return Buffer.from([data]);
  }
  let bytes = [];
  while (data > 0) {
    bytes.push(0x80 | (data & 0x7f));
    data >>= 7;
  }
  bytes[bytes.length - 1] &= 0x7f;
  return Buffer.from(bytes);
}

function makeString(str, maxCodeUnits = 32767) {
  // Count UTF-16 code units
  const codeUnits = [...str].reduce((sum, char) => {
    const code = char.codePointAt(0);
    return sum + (code > 0xFFFF ? 2 : 1);
  }, 0);

  if (codeUnits > maxCodeUnits) {
    throw new Error(`String exceeds max UTF-16 code units (${codeUnits}/${maxCodeUnits})`);
  }

  const utf8Bytes = Buffer.from(str, 'utf8');
  const lengthBuf = makeVarInt(utf8Bytes.length);
  return Buffer.concat([lengthBuf, utf8Bytes]);
}

function getVarIntLength(value) {
  let length = 0;
  do {
    value >>= 7;
    length++;
  } while (value !== 0);
  return length;
}


function prefix(data){
  return Buffer.concat([makeVarInt(data.length),data])
}

function generateRandomString(length) {
  const characters =
    //"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    "meowMEOW";
  let randomString = "";
  for (let i = 0; i < length; i++) {
    randomString += characters.charAt(
      Math.floor(Math.random() * characters.length),
    );
  }
  return randomString;
}

const proto = 767;
const sockets = [];
const packet = translations[proto]

function main() {
  const ip = process.argv[2];
  var port = parseInt(process.argv[3]);
  const count = parseInt(process.argv[4]);

  // Make handshake packet
  let pack = Buffer.concat([makeVarInt(proto),makeString(ip),Buffer.from([port >> 8, port & 0xFF]),Buffer.from([0x02])])
  const handshake = makePacket(0x00,pack)

  for (let i = 1; i <= count; i++) {
    // setTimeout(() => {
      doink(ip, port, i, handshake, count, sockets,"i ate an " + i);
    // }, 250 * i);
  }
}

let botCount = 1


function doink(ip, port, i, handshake, count, sockets,chatMsg) {
  const nick = generateRandomString(8);

  const options = {
    host: ip,
    port: port,
  };
  try {
    // process.stdout.write(`\r[${botCount}/${count}] Connecting bot: ${nick}`);
    setLine(0,0,`\r[${botCount}/${count}] Connecting bot: ${nick}`)
    botCount++
    let socket = net.createConnection(options);
    sockets.push(socket);
    socket.chatMsg = chatMsg
    // Send handshake packet
    socket.write(handshake);

    // Make login start packet
    socket.state = "login";
    let uuid = Buffer.from(require('uuid').v4().replace(/-/g, ''), 'hex');
    // let uuid = Buffer.alloc(16)
    socket.write(makePacket(0x00,Buffer.concat([makeString(nick),uuid])));
    // Success probably
    setInterval(function(){
      if (socket.state == "play") {
        //Sends chat message
        let message = makeString(socket.chatMsg)
        //In long format
        let timestamp = Buffer.alloc(8)
        let hasSig = Buffer.from([0x00])
        let messageCount = makeVarInt(1)
        //signing thing
        let acknowledgement = Buffer.alloc(3)
        let salt = Buffer.alloc(8)
        let msg = Buffer.concat([
          message,timestamp,hasSig,messageCount,acknowledgement,salt
        ])
        let packet = makePacket(0x06,msg,socket)
        // socket.write(packet)
      }
    },1000)
    socket.on("data", (data) => {

      let fdata
      if (socket.encrypted) {
        fdata = socket.decrypt(data)
      } else {
        fdata = data
      }
      if (socket.compression) {
        fdata = readVarInt(fdata).data
        if (fdata.length >= socket.compressionThresh) {
          fdata = readVarInt(fdata).left
          fdata = inflate(fdata)
          fdata = Buffer.concat([Buffer.from([0x00]),fdata])
        }
      }

      let varnt = readVarInt(fdata)
      // before you ask, there isn't any reasoning for calling this varialble darnt
      let darnt = (fdata.slice(varnt.bytesRead + 1))
      let id = (fdata.slice(varnt.bytesRead)[0])
      log(1,darnt)
      log(1,i+": FULL " + id.toString(16).padStart(2,'0'))


      //Data with data length sliced off
      // log(1,darnt)
      if (socket.state == "login") {
        if (id == 0x00) { 
          //SHIT I GOT KICKED
          let jsonvarint = readVarInt(darnt)
          log(1,"Disconnected during login: " + jsonvarint.data.toString())
        }
        if (id == 0x01) {
          // let decEnc = Buffer.from([0x02, 0x00, 0x01]);
          // let pkarray = 
          let strvarint = readVarInt(darnt)
          let pkvarint = readVarInt(strvarint.left)
          let pkdat = pkvarint.left
          let pk = pkvarint.data
          let sliced = pkvarint.sliced
          let verifytknvarint = readVarInt(sliced)
          let verifytkndat = verifytknvarint.left
          let verifytkn = verifytknvarint.data
          // log(1,verifytknvarint.sliced)
          if(sliced == 1){
            log(1,"AUTHENTICATION REQUIRED, QUITTING")
          }else{
            log(1,"Encrypting connection")
            sharedSecret = crypto.randomBytes(16)
            socket.decrypt = createDecryptor(sharedSecret)
            socket.encrypt = createEncryptor(sharedSecret)
            socket.pk = pk
            socket.encrypted = true
            let secret = encryptWithPublicKey(pk,sharedSecret)
            let tkn = encryptWithPublicKey(pk,verifytkn)
            let pack = Buffer.concat([prefix(secret),prefix(tkn)])
            pack = makePacket(0x01,pack)
            socket.write(pack)
          }
        }
        if (id == 0x03) {
          // Enable Compression
          socket.compressionThresh = readVarInt(darnt).value
          socket.compression = true
          // log(1,"compressing past " + socket.compressionThresh + " bytes")
        } 
        if (id == 0x02) {
          // Login Success
          let uuid = darnt.slice(0,16)
          let sliced = darnt.slice(16,darnt.length)
          let usernamevarint = readVarInt(sliced)
          socket.username = usernamevarint.data.toString()
          // log(1,"logged in as: " + socket.username)
          //so were gonna ignore this for now
          let propertyvarint = readVarInt(usernamevarint.sliced)
          // log(1,propertyvarint)
          //write login acknowledgement
          socket.write(makePacket(0x03,null,socket))
          socket.state = "configuration"
          log(1,"switching to configuration")

          let locale = makeString("en_US")
          let viewdist = Buffer.from([0x04])
          let chatMode = Buffer.from([0x00])
          let chatColors = Buffer.from([0x01])
          let skinParts = Buffer.from([0x00])
          let mainHand = Buffer.from([0x00])
          let textFilter = Buffer.from([0x00])
          let serverListings = Buffer.from([0x01])
          let particleStatus = Buffer.from([0x02])
          if (proto == 767) {
            pack = Buffer.concat(
              [locale,viewdist,chatMode,chatColors,skinParts,mainHand,textFilter,serverListings]
            );
          }
          if (proto == 770) {
            pack = Buffer.concat(
              [locale,viewdist,chatMode,chatColors,skinParts,mainHand,textFilter,serverListings,particleStatus]
            );
          }
          // write client information
          // socket.write(makePacket(0x00,pack,socket))
          // write plugin message (this includes your client brand apparently, minecraft, fabric, feather, etc)
          let ident = makeString("minecraft:brand")
          let brand = makeString("poggersclient")
          // socket.write(makePacket(0x02,Buffer.concat([ident,brand]),socket))
          // write known packs i guess, the zero is to say that the pack length is zero
          socket.write(makePacket(0x07,Buffer.from([0x00]),socket))


        } 
      } else if (socket.state == "configuration") {
        if (id == 0x02) { 
          //SHIT I GOT KICKED
          let jsonvarint = readVarInt(darnt)
          // log(2,readVarInt(darnt))
          // log(2,(fdata))
          log(1,"Disconnected during configuration: " + darnt.slice(8).toString())
          // log(1,jsonvarint.data)
        }
        if (id == 0x05) {
          // Detect and respond to pings with a pong
          socket.write(makePacket(0x05,darnt,socket))
        }
        if (id == 0x03) {
          //Finish configuration/acknowledgement
          socket.write(makePacket(0x03,null,socket))
          // log(1,"configuration completed")
          socket.state = "play"
        }
        if (id == 0x04) {
          //Keep the connection alive ig
          socket.write(makePacket(0x04,darnt,socket))
        }
        if (id == 0x07) {
          // Read the registry data -- BORKED
          // let identifier = readString(darnt).string
          // log(2,identifier)
          // let datavarint = readVarInt(readString(darnt).sliced)
          // let legth = datavarint.value
          // log(2,legth)
          // datavarint = datavarint.left
          // for ( let xx=0; xx<legth; xx++ ) {
          //   log(2,datavarint)
          //   ident = readString(datavarint)
          //   log(2,ident.string)
          //   datavarint = ident.sliced.slice(1)
          //   nbt = readString(datavarint)
          //   log(2,nbt.string)
          //   datavarint = nbt.sliced
          //   // datavarint = { sliced: "egg"}
          //   legth = 2
          // }
        }
        if (id == 0x01) {

        }
        if (id == 0x0E) {
          //Recieve known packs, apparently this is unneccesary/useless!?!?!?! wtf
          // let str = readString(darnt)
          // let entriesvarint = readVarInt(str.sliced)

        }
      } else if (socket.state == "play") {
        // log(1,darnt)
        // log(1,"FULL " + id.toString(16).padStart(2,'0'))
        if (id == 0x1D) { 
          //SHIT I GOT KICKED
          let jsonvarint = readVarInt(darnt)
          log(3,"jsonvarint")
          log(3,"Disconnected: " + jsonvarint.data.toString())
        }
        if (id == 0x26) {
          // log(3,darnt)
          socket.write(makePacket(0x18,darnt,socket))
        }
        if (id == 0x27) {
          //Loads in player after chunk data has been sent
          //not in 1.21.1
          // socket.write(makePacket(0x2A,null,socket))
        }
        if (id == packet.p.c.player_position) {
          //confirming teleportations
          let tpvarint = readVarInt(darnt)
          log(3,'confirmed tp')
          log(3,tpvarint.value)
          socket.write(makePacket(packet.p.s.accept_teleportation,makeVarInt(tpvarint.value),socket))
        }
        if (id == 0x39) {
          //Reading player chats
          let indexvarint = readVarInt(darnt.slice(16))
          let isSignature = indexvarint.left.slice(0,1)
          let nextvarint = readVarInt(indexvarint.left.slice(1))
          if (isSignature == 1) {
            sigvarint = readVarInt(indexvarint.left.slice(1))
            log(2,sigvarint.toString())
            signature = indexvarint.left.slice(1)
            nextvarint = readVarInt(sigvarint.sliced)
            log(2,"there is signature")
          }
          // message = readString(nextvarint.data)
        }
        if (id == 0x6C) {
          //Reading system chats
          log(2,"thingy appeared")
          log(2,readString(darnt).string)
        }
        if (id == 0x6F) {
          //confirming teleportations
          log(3,"server hates me pog?")
        }

      }



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
