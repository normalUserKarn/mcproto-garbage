module.exports.triggerInitHook = function(socket,botCount,maxBotCount){
  const nick = generateRandomString(8);
  botCount.v++
  setLine(0,0,`\r[${botCount.v}/${maxBotCount}] Connecting bot: ${nick}`)
  socket.tmp = Buffer.from([])
  const packet = translations[socket.proto]
  // Make handshake packet
  let handshake = makePacket(
    0x00,Buffer.concat([makeVarInt(socket.proto),makeString(socket._host),Buffer.from([socket.port >> 8, socket.port & 0xFF]),Buffer.from([0x02])])
  )
  socket.write(handshake);
  socket.state = "login";
  //Write login start
  let uuid = Buffer.from(require('uuid').v4().replace(/-/g, ''), 'hex');
  socket.write(makePacket(0x00,Buffer.concat([makeString(nick),uuid])));
}

module.exports.triggerPlayHook = function(socket){
  setTimeout(function(){
  console.log('poggee')
  let chatCmd = (makePacket(0x05,makeString("register poggeee poggeee")))
  socket.write(chatCmd)
  },5000)
}

module.exports.triggerSocketCloseHook = function(socket,botCount,count,res){
  botCount.v-=1
  if (socket.closedIntentionally) return
  if (res) {
    log(1,
      `\nsocket close because it's fucking stupid and ${res}`,
    );
  } else {
    setLine(0,0,`\r[${botCount.v}/${maxBotCount}] Disconnected bot: ${socket.username}`)
  }
}

module.exports.triggerTimedHooks = function(socket,time){
  setInterval(function(){
    if (socket.state == "play") {
      let message = makeString('pog')
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
}
