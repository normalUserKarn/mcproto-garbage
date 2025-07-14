const { translations } = require('./versioning.js');
const crypto = require('crypto');

function processPacket(data,socket,disableEncryption) {
  let fdata
  if (socket.encrypted && !disableEncryption) {
    fdata = socket.decrypt(data)
  } else {
    fdata = data
  }
  let prevarnt = {}
  if (socket.tmp.length > 0) {
    prevarnt.left = Buffer.concat([socket.tmp,fdata])
    prevarnt.value = socket.tmpMax 
    prevarnt.data = prevarnt.slice(0,prevarnt.value)
  } else {
    prevarnt = readVarInt(fdata)
  }
  if (prevarnt.left.length < prevarnt.value) {
    socket.tmp = prevarnt.left
    socket.tmpMax = prevarnt.value
  } else {
    processCmd(prevarnt.data,socket)
    if (prevarnt.sliced.length > 0) {
      socket.tmp = Buffer.from([])
      processPacket(prevarnt.sliced,socket,true)
    }
  }
}
function processCmd(fdata,socket) {

  const packet = translations[socket.proto]
  // this fucking pain in the ass!!!!!!!!!!!!!!!, this exists to splice out the zero from uncompressed data and support minecraft fucking giving me two packets at a time AGGAHGAHHGAHGAHGH
  if (socket.compression) {
    let fdatavarint = readVarInt(fdata)
    fdata = fdatavarint.left
    if (fdatavarint.value >= socket.compressionThresh) {
      // fdata = readVarInt(fdata).left
      fdata = inflate(fdata)
      // fdata = Buffer.concat([data[0],fdata])
    } // else {
      // fdata = Buffer.concat([makeVarInt(fdata.length - 1),fdata.slice(1)])
    // }
  }
  // console.log(fdata)


  // before you ask, there isn't any reasoning for calling this varialble darnt
  let darnt = (fdata.slice(1))
  let id = (fdata[0])
  // if (socket.state == "play") {
    log(1,fdata)
    log(1,socket.id+": FULL " + id.toString(16).padStart(2,'0'))
  // }


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
      // log(2,darnt)
      socket.write(makePacket(0x05,darnt,socket))
    }
    if (id == 0x03) {
      //Finish configuration/acknowledgement
      socket.write(makePacket(0x03,null,socket))
      // log(1,"configuration completed")
      socket.state = "play"
      triggerPlayHook(socket)
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
      let locale = makeString("en_US")
      let viewdist = Buffer.from([0x04])
      let chatMode = Buffer.from([0x00])
      let chatColors = Buffer.from([0x01])
      let skinParts = Buffer.from([0x00])
      let mainHand = Buffer.from([0x00])
      let textFilter = Buffer.from([0x00])
      let serverListings = Buffer.from([0x01])
      let particleStatus = Buffer.from([0x02])
      if (socket.proto == 767) {
        pack = Buffer.concat(
          [locale,viewdist,chatMode,chatColors,skinParts,mainHand,textFilter,serverListings]
        );
      }
      if (socket.proto == 770) {
        pack = Buffer.concat(
          [locale,viewdist,chatMode,chatColors,skinParts,mainHand,textFilter,serverListings,particleStatus]
        );
      }
      // write client information
      socket.write(makePacket(0x00,pack,socket))
      // write plugin message (this includes your client brand apparently, minecraft, fabric, feather, etc)
      let ident = makeString("minecraft:brand")
      let brand = makeString("poggersclient")
      socket.write(makePacket(0x02,Buffer.concat([ident,brand]),socket))
    }
    if (id == 0x0A) { 
      // Consume all of the cookies
      // socket.write(makePacket(0x01,darnt,socket))
      log(1,"ate a cookie")
    }
    if (id == 0x0E) {
      //Recieve known packs, apparently this is unneccesary/useless!?!?!?! wtf
      // let str = readString(darnt)
      // let entriesvarint = readVarInt(str.sliced)
      // write known packs i guess, the zero is to say that the pack length is zero
      socket.write(makePacket(0x07,Buffer.from([0x00]),socket))

    }
  } else if (socket.state == "play") {
    if (id == packet.p.c.disconnect) { 
      //SHIT I GOT KICKED
      let jsonvarint = readVarInt(darnt)
      //TODO make a text component reader >:
      log(3,"jsonvarint")
      log(3,"Disconnected: " + jsonvarint.left.toString())
    }
    if (id == packet.p.c.keep_alive) {
      //Returns kepp alive id
      socket.write(makePacket(packet.p.s.keep_alive,darnt,socket))
    }
    if (id == packet.p.c.player_position) {
      //confirming teleportations
      let tpvarint = readVarInt(darnt)
      log(3,'confirmed tp')
      socket.write(makePacket(packet.p.s.accept_teleportation,makeVarInt(tpvarint.value),socket))
    }
    if (id == 0x1E) {
      //Reading disguised chats
      // log(2,'disguised chat recvd')
      // let message = readString(darnt)
      // log(2,message.string)
      // let chatType = readVarInt(message.sliced)
      // log(2,chatType)
      // let sender = readString(chatType.left)
      // log(2,sender.string)
    }
    if (id == 0x39) {
      // WARNING CHANGED IN 1.21.5
      //Reading player chats
      // log(2,'chat recvd')
      // let indexvarint = readVarInt(darnt.slice(16))
      // let isSignature = indexvarint.left.slice(0,1)
      // let nextvarint = readVarInt(indexvarint.left.slice(1))
      // if (isSignature == 1) {
      //   sigvarint = readVarInt(indexvarint.left.slice(1))
      //   log(2,sigvarint.toString())
      //   signature = indexvarint.left.slice(1)
      //   nextvarint = readVarInt(sigvarint.sliced)
      //   log(2,"there is signature")
      // }
      // message = readString(nextvarint.data)
    }
    if (id == 0x6C) {
      // WARNING CHANGED IN 1.21.5
      //Reading system chats
      log(2,"thingy appeared")
      // log(2,readString(darnt).string)
    }
    if (id == 0x6F) {
      // WARNING CHANGED IN 1.21.5
      //confirming teleportations
      log(3,"server hates me pog?")
    }

  }
  // if (reprocess) processPacket(prevarnt.sliced,socket)
}
module.exports = { processPacket };
