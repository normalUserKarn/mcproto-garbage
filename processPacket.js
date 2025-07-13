const { translations } = require('./versioning.js');

function processPacket(data,socket) {
  const packet = translations[socket.proto]
  let reprocess = false
  let fdata
  if (socket.encrypted) {
    fdata = socket.decrypt(data)
  } else {
    fdata = data
  }
  let prevarnt = readVarInt(fdata)

  // this fucking pain in the ass!!!!!!!!!!!!!!!, this exists to splice out the zero from uncompressed data and support minecraft fucking giving me two packets at a time AGGAHGAHHGAHGAHGH
  if (prevarnt.sliced.length > 0) {
    reprocess = true
    fdata = Buffer.concat([makeVarInt(prevarnt.value),prevarnt.data])
  }
  if (socket.compression) {
    let fdatavarint = readVarInt(fdata)
    fdata = fdatavarint.data
    if (fdata.length >= socket.compressionThresh) {
      fdata = readVarInt(fdata).data
      fdata = inflate(fdata)
      // fdata = Buffer.concat([data[0],fdata])
    } else {
      fdata = Buffer.concat([makeVarInt(fdata.length - 1),fdata.slice(1)])
    }
  }


  let varnt = readVarInt(fdata)
  // before you ask, there isn't any reasoning for calling this varialble darnt
  let darnt = (varnt.data.slice(1))
  let id = (varnt.data[0])
  if (socket.state != "play") {
    log(1,fdata)
    log(1,socket.id+": FULL " + id.toString(16).padStart(2,'0'))
  }


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
    if (id == 0x0E) {
      //Recieve known packs, apparently this is unneccesary/useless!?!?!?! wtf
      // let str = readString(darnt)
      // let entriesvarint = readVarInt(str.sliced)

    }
  } else if (socket.state == "play") {
    if (id == 0x1D) { 
      //SHIT I GOT KICKED
      let jsonvarint = readVarInt(darnt)
      log(3,"jsonvarint")
      log(3,"Disconnected: " + jsonvarint.data.toString())
    }
    if (id == 0x26) {
      log(3,darnt)
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
  if (reprocess) processPacket(prevarnt.sliced,socket)
}
module.exports = { processPacket };
