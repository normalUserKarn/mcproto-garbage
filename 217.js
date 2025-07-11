if (process.argv.length !== 5) {
  console.log(`Usage: node ${process.argv[1]} <ip> <port> <count>`);
  process.exit(1);
}

const net = require("net");
const http = require("http");
const zlib = require("zlib");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const playerUUID = uuidv4();
let agent;
let request = [];

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

  return { value: result, bytesRead: pos - offset };
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

  return { string: str, bytesRead: end - offset, byteLen: byteLength };
}
function getVarIntLength(value) {
  let length = 0;
  do {
    value >>= 7;
    length++;
  } while (value !== 0);
  return length;
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
    //setTimeout(() => {
    doink(ip, port, i, handshake, count, data, sockets);
    //}, 4 * i);
  }
}

function doink(ip, port, i, handshake, count, data, sockets) {
  const nick = generateRandomString(8);

  const options = {
    host: ip,
    port: port,
  };
  try {
    process.stdout.write(`\r[${i}/${count}] Connecting bot: ${nick}\n`);
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
      /*if (
        (data[1] != 0 || data.length > 64) &&
        socket.compression &&
        !(data[2] == 0 && data[3] == 2)
      ) {
        const compressedLength = readVarInt(data, 0);
        let offset = getVarIntLength(compressedLength);
        const uncompressedLength = readVarInt(data, compressedLength);
        offset += getVarIntLength(uncompressedLength);

        const compressedData = data.slice(offset, offset + compressedLength);
        console.log(getVarIntLength(compressedLength));
        let boop = zlib.inflateSync(compressedData); // Decompress using zlib
        console.log(boop);
      }*/
      console.log(data);
      console.log(data.length)

      if (socket.state == "login") {
        /*if (data[2] == 0x04) {
          if (socket.state == "configuration") {
            socket.write(data);
          } else {
            console.log("fix: " + socket.state);
            socket.write(data);
          }
        }
        if (data[2] == 0x69) {
          console.log(data);
        }
        if (data[2] == 39 || data[2] == 26 || data[2] == 4) {
          //if (socket.state == "play") console.log(data);
          console.log("pls fix");
          pack = data;
          pack[2] = 0x18;
          console.log(pack);
          //socket.write(pack);
          console.log("i need to revive me selfs");
        }*/
        let varnt = readVarInt(data)
        let darnt = (data.slice(varnt.bytesRead + 1))
        //Data with data length sliced off
        // console.log(darnt)
        if (data[2] == 0x01) {
          if (socket.state == "login") {
            // let decEnc = Buffer.from([0x02, 0x00, 0x01]);
            // console.log(data)
            let strng = darnt.slice(1)
            // let pfxarray = 
            let pfxvarint = readVarInt(strng)
            let pkdat = strng.slice(pfxvarint.bytesRead)
            let pk = pkdat.slice(0,pfxvarint.value)
            let sliced = pkdat.slice(pfxvarint.value + pfxvarint.bytesRead)
            let verifytknvarint = readVarInt(sliced)
            let verifytkndat = sliced.slice(verifytknvarint.bytesRead)
            sliced = sliced.slice(verifytknvarint.bytesRead + verifytknvarint.value)
            

            

            // socket.write(decEnc);
          }
        }
        /*if (data[2] == 0x0e) {
          pack = data;
          pack[2] = 7;
          socket.write(pack);
        }
        if (data[2] == 0x0c) {
        }
        if (data[2] == 0x02) {
          //console.log("Acknowledged Logon");
          socket.write(Buffer.from([0x02, 0x00, 0x03]));
          socket.state = "configuration";
          //Writing Client Info
          const packet = Buffer.concat([
            Buffer.from([0x0f, 0x00]), // Packet length (adjusted to match payload length)
            Buffer.from([0x00]), // No compression byte
            Buffer.from([0x05]), // Length of locale string ("en_GB")
            Buffer.from("en_GB", "utf-8"), // Locale string
            Buffer.from([0x08]), // View distance (Byte)
            Buffer.from([0x00]), // Chat mode (VarInt, assuming 0 for enabled)
            Buffer.from([0x01]), // Chat colors (Boolean, enabled)
            Buffer.from([0x40]), // Displayed skin parts (bitmask)
            Buffer.from([0x00]), // Main hand (VarInt, assuming 0 for left)
            Buffer.from([0x00]), // Enable text filtering (Boolean, disabled)
            Buffer.from([0x01]), // Allow server listings (Boolean, enabled)
          ]);
        }
        if (data[1] == 0x03 && !socket.compression) {
          if (socket.state == "login") {
            socket.compression = true;
          }
        }
        if (data[2] == 0x03) {
          if (socket.state == "configuration") {
            socket.write(Buffer.from([0x02, 0x00, 0x03]));
            socket.state = "play";
          }
        } */
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
        console.log(`\nsocket close because it's literally fucking stupid`);
      }
    });
  } catch (e) {
    console.error(
      `Error with bot ${i}: Failed to create SOCKS connection: ${e.message}`,
    );
  }
}

main();
