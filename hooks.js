module.exports.triggerPlayHook = function(socket){
  let slot = Buffer.from([0x00,0x00])
  let pack = makePacket(0x32,null,socket)
}
