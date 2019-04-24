'use strict'
const { randomBytes } = require('crypto')
const { promisify } = require('util')
const { test } = require('tap')
const once = require('events.once')
const guts = require('..')

const promisifyApi = (o) => {
  const connect = promisify(o.connect)
  const lookupOne = promisify(o.lookupOne)
  const lookup = promisify(o.lookup)
  const bind = promisify(o.bind)
  const close = promisify(o.close)
  return {
    __proto__: o,
    connect, 
    lookupOne,
    lookup,
    bind,
    close
  }
}

const close = (nets) => Promise.all(nets.map((n) => n.close()))

test('discover and connect', async ({pass, same}) => {
  const network = promisifyApi(guts({
    async socket (socket) {
      pass('got socket')
      const [ data ] = await once(socket, 'data')
      same(data, Buffer.from('a'))
      socket.write('b')
    }
  }))
  await network.bind()
  const client = promisifyApi(guts())
  const topic = randomBytes(32)
  const sub = network.announce(topic)
  await once(sub, 'update')
  await client.bind()
  const peer = await client.lookupOne(topic)
  const socket = await client.connect(peer)
  socket.write('a')
  const [ data ] = await once(socket, 'data')
  same(data, Buffer.from('b'))
  await close([ client, network ])
})

test('2 networks, connect and close', async ({ ok, pass }) => {
  const network = promisifyApi(guts({
    socket (sock) {  ok(sock, 'got server socket') }
  }))
  await network.bind()
  const client = promisifyApi(guts())
  const { port } = network.address()
  const host =  '127.0.0.1'
  const socket = await client.connect({ port, host })
  ok(socket, 'got client socket')
  await client.close()
  pass('client closed')
  await network.close()
  pass('network closed')
})
