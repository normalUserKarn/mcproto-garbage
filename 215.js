//this file kinda works... but its old and lame
if (process.argv.length !== 5) {
  console.log(`Usage: node ${process.argv[1]} <ip> <port> <count>`);
  process.exit(1);
}

const net = require("net");
const http = require("http");
const zlib = require("zlib");
const crypto = require('crypto');
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const playerUUID = uuidv4();
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
        console.log("packet you tried to send was too big")
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

function main() {
  const ip = process.argv[2];
  var port = parseInt(process.argv[3]);
  const count = parseInt(process.argv[4]);

  const proto = 770;
  const sockets = [];

  // Make handshake packet
  let data = Buffer.from([0x00]);
  // Add proto version
  data = Buffer.concat([data, makeVarInt(proto)]);
  // Add proto string
  data = Buffer.concat([data, Buffer.from([ip.length]), Buffer.from(ip)]);
  data = Buffer.concat([data, Buffer.alloc(2)]);
  // Add port
  data.writeInt16BE(port, data.length - 2);
  // Set status Login
  data = Buffer.concat([data, Buffer.from([0x02])]);
  const handshake = Buffer.concat([Buffer.from([data.length]), data]);

  for (let i = 1; i <= count; i++) {
    // setTimeout(() => {
      doink(ip, port, i, handshake, count, data, sockets);
    // }, 25 * i);
  }
}

let botCount = 1


function doink(ip, port, i, handshake, count, data, sockets) {
  const nick = generateRandomString(8);

  const options = {
    host: ip,
    port: port,
  };
  try {
    process.stdout.write(`\r[${botCount}/${count}] Connecting bot: ${nick}`);
    botCount++
    let socket = net.createConnection(options);
    sockets.push(socket);

    // Send handshake packet
    socket.write(handshake);

    // Make login start packet
    socket.state = "login";
    let data = Buffer.from([0x00]);
    socket.compression = false;
    data = Buffer.concat([data, Buffer.from([nick.length]), Buffer.from(nick)]);
    data = Buffer.concat([data, Buffer.alloc(16)]);
    data = Buffer.concat([Buffer.from([data.length]), data]);
    socket.write(data);
    //Success probably
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
      // console.log(fdata);
      // console.log("FULL " + id)


      //Data with data length sliced off
      // console.log(darnt)
      if (socket.state == "login") {
        if (id == 0x00) { 
          //SHIT I GOT KICKED
          let jsonvarint = readVarInt(darnt)
          console.log("Disconnected during login: " + jsonvarint.data.toString())
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
          // console.log(verifytknvarint.sliced)
          if(sliced == 1){
            console.log("AUTHENTICATION REQUIRED, QUITTING")
          }else{
            // console.log("Encrypting connection")
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
          // console.log("compressing past " + socket.compressionThresh + " bytes")
        } 
        if (id == 0x02) {
          // Login Success
          let uuid = darnt.slice(0,16)
          let sliced = darnt.slice(16,darnt.length)
          let usernamevarint = readVarInt(sliced)
          socket.username = usernamevarint.data.toString()
          // console.log("logged in as: " + socket.username)
          //so were gonna ignore this for now
          let propertyvarint = readVarInt(usernamevarint.sliced)
          // console.log(propertyvarint)
          //write login acknowledgement
          socket.write(makePacket(0x03,null,socket))
          socket.state = "configuration"
          // console.log("switching to configuration")
          // write plugin message (this includes your client brand apparently, minecraft, fabric, feather, etc)
          let ident = makeString("minecraft:brand")
          let brand = makeString("an incredibly poggers bot")
          let pack = Buffer.concat([ident,brand])
          socket.write(makePacket(0x02,pack,socket))
          // write client information
          let locale = makeString("en_US")
          let viewdist = Buffer.from([0x04])
          let chatMode = Buffer.from([0x00])
          let chatColors = Buffer.from([0x01])
          let skinParts = Buffer.from([0x00])
          let mainHand = Buffer.from([0x00])
          let textFilter = Buffer.from([0x00])
          let serverListings = Buffer.from([0x01])
          let particleStatus = Buffer.from([0x02])
          pack = Buffer.concat(
            [locale,viewdist,chatMode,chatColors,skinParts,mainHand,textFilter,serverListings,particleStatus]
          );
          socket.write(makePacket(0x00,pack,socket))
          // write known packs i guess
          socket.write(makePacket(0x07,Buffer.from([0x00]),socket))
        } 
      }
      if (socket.state == "configuration") {
        if (id == 0x03) {
          //Finish configuration/acknowledgement
          socket.write(makePacket(0x03,null,socket))
          // console.log("configuration completed")
          socket.state = "play"
        }
        if (id == 0x04) {
          //Keep the connection alive ig
          socket.write(makePacket(0x04,darnt,socket))
        }
        if (id == 0x0E) {
          //Recieve known packs, apparently this is unneccesary/useless!?!?!?! wtf
          // let str = readString(darnt)
          // let entriesvarint = readVarInt(str.sliced)
        }
      }
      if (socket.state == "play") {
        // console.log(darnt)
        // console.log("FULL " + id.toString(16).padStart(2,'0'))
        if (id == 0x26) {
          console.log(darnt)
        }
        if (id == 0x27) {
          //Loads in player after chunk data has been sent
          // socket.write(makePacket(0x2A,null,socket))
        }
        if (id == 0x41) {
          //confirming teleportations
          let tpvarint = readVarInt(darnt)
          socket.write(makePacket(0x00,makeVarInt(tpvarint.value),socket))
        }
        if (id == 0x6F) {
          //confirming teleportations
          console.log("server hates me pog?")
        }
      }



    });
    socket.on("error", (err) => {
      console.error(`Error connecting bot ${i}: ${err.message}`);
    });
    socket.on("close", (res) => {
      if (res) {
        console.log(
          `\nsocket close because it's fucking stupid and ${res.message}`,
        );
      } else {
        process.stdout.write(`\r[${botCount}/${count}] Disconnected bot: ${socket.username}`);
        botCount-=1
        // console.log(`\nsocket close because it's literally fucking stupid`);
      }
    });
  } catch (e) {
    console.error(
      `Error with bot ${i}: Failed to create SOCKS connection: ${e.message}`,
    );
  }
}

main();
