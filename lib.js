let logLines = [[], [], [], []];
module.exports.logLines = logLines
const MAX_LINES = 1000;

const zlib = require("zlib");
const crypto = require('crypto');
const util = require('util');
const { WebSocket } = require('ws')

module.exports.clearLog = function(boxIndex) {
  logLines[boxIndex] = [];
  broadcast(wss, 'clear', { index: boxIndex });
}

module.exports.broadcast = function(wss, event, data) {
  const message = JSON.stringify({ event, data });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

module.exports.log = function(boxIndex, msg) {
  const formatted = formatMsg(msg);
  const lines = logLines[boxIndex];
  lines.push(formatted);
  if (lines.length > MAX_LINES) lines.shift();
  broadcast(wss, 'log', { index: boxIndex, line: formatted });
}

// Set or overwrite a specific line in a box
module.exports.setLine = function(boxIndex, lineIndex, msg) {
  const formatted = formatMsg(msg);
  const lines = logLines[boxIndex];

  // Fill in any missing lines
  while (lines.length <= lineIndex) lines.push('');
  lines[lineIndex] = formatted;

  // Trim excess lines
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);

  broadcast(wss, 'replace', { index: boxIndex, lines });
}

// Format any type
module.exports.formatMsg = function(msg) {
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

let agent;
let request = [];


module.exports.derToPem = function(derBuffer) {
  const base64 = derBuffer.toString('base64');
  const lines = base64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

module.exports.getRsaKeySize = function(derBuffer) {
  const pem = derToPem(derBuffer);
  const keyObj = crypto.createPublicKey(pem);
  return keyObj.asymmetricKeyDetails.modulusLength; // in bits
}

module.exports.encryptWithPublicKey = function(derBytes, data) {
  const pemKey = derToPem(derBytes);
  return crypto.publicEncrypt(
    {
      key: pemKey,
      padding: crypto.constants.RSA_PKCS1_PADDING, // Required by the protocol
    },
    data
  );
}

module.exports.inflate = function(buffer) {
  return zlib.inflateSync(buffer); // or zlib.unzipSync(buffer) if unsure of format
}

module.exports.createDecryptor = function(sharedSecret) {
  const decipher = crypto.createDecipheriv('aes-128-cfb8', sharedSecret, sharedSecret);
  return (buffer) => Buffer.from(decipher.update(buffer));
}

module.exports.createEncryptor = function(sharedSecret) {
  const cipher = crypto.createCipheriv('aes-128-cfb8', sharedSecret, sharedSecret);
  return (buffer) => Buffer.from(cipher.update(buffer));
}


module.exports.makePacket = function(id,data,socket,debug) {
  // log(1,id)
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

module.exports.readVarInt = function(buffer, offset = 0) {
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

module.exports.countUtf16Units = function(str) {
  let count = 0;
  for (const char of str) {
    const code = char.codePointAt(0);
    count += code > 0xFFFF ? 2 : 1;
  }
  return count;
}

module.exports.readString = function(buffer, maxCodeUnits = 32767, offset = 0) {
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

module.exports.makeVarInt = function(data) {
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

module.exports.makeString = function(str, maxCodeUnits = 32767) {
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

module.exports.getVarIntLength = function(value) {
  let length = 0;
  do {
    value >>= 7;
    length++;
  } while (value !== 0);
  return length;
}


module.exports.prefix = function(data){
  return Buffer.concat([makeVarInt(data.length),data])
}

module.exports.generateRandomString = function(length) {
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


