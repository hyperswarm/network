'use strict'
const { randomBytes } = require('crypto')
const { promisify } = require('util')
const { Socket } = require('net')
const once = require('events.once')
const { test, only } = require('tap')
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

test('socket recieved – socket option – (address details based connection)', async ({is, plan}) => {
  // there is an unfixed stateful bug which makes
  // this test non-atomic causing the socket method to never be called. 
  // Temporary workaround is to place this test first – TODO: move rest to above 
  // other socket recieved test
  // NOTE: it may be utp-native, as even stripping all modules except utp-native 
  // out of the require cache to get a fresh state fails. We can't strip utp-native
  // from the require cache, it leads to an error (probably to do with Node expecations
  // around native bindings, error is Module did not self register)
  plan(1)
  const network = promisifyApi(guts({
    socket(sock) {
      is(sock instanceof Socket, true)
    }
  }))
  await network.bind()
  const client = promisifyApi(guts())
  const { port } = network.address()
  const host = '127.0.0.1'
  await client.connect({ port, host })
  await network.close()
  await client.close()
})


test('network bound – bind option', async ({pass, plan}) => {
  plan(1)
  const network = promisifyApi(guts({
    bind() { pass('method called') }
  }))
  await network.bind()
  await network.close()
})
test('network closed – close option', async ({pass, plan}) => {
  plan(1)
  const network = promisifyApi(guts({
    close() { pass('method called') }
  }))
  await network.bind()
  await network.close()
})

test('connect two peers with address details', async ({ is, pass }) => {
  const network = promisifyApi(guts())
  await network.bind()
  const client = promisifyApi(guts())
  const { port } = network.address()
  const host = '127.0.0.1'
  const socket = await client.connect({ port, host })
  is(socket instanceof Socket, true, 'got client socket')
  await client.close()
  pass('client closed')
  await network.close()
  pass('network closed')
})

test('connect two peers with via lookup', async ({ is, pass }) => {
  const network = promisifyApi(guts())
  await network.bind()
  const client = promisifyApi(guts())
  const topic = randomBytes(32)
  await once(network.announce(topic), 'update')
  await client.bind()
  const peer = await client.lookupOne(topic)
  const socket = await client.connect(peer)
  is(socket instanceof Socket, true, 'got client socket')
  await client.close()
  pass('client closed')
  await network.close()
  pass('network closed')
})

test('socket recieved – socket option – (lookup based connection)', async ({is, plan}) => {
  plan(1)
  const network = promisifyApi(guts({
    socket(sock) {
      is(sock instanceof Socket, true)
    }
  }))
  await network.bind()
  const client = promisifyApi(guts())
  const topic = randomBytes(32)
  const sub = network.announce(topic)
  await once(sub, 'update')
  await client.bind()
  const peer = await client.lookupOne(topic)
  await client.connect(peer)
  await network.close()
  await client.close()
})

test('send data to network peer', async ({ is, plan }) => {
  plan(1)
  const network = promisifyApi(guts({
    async socket (sock) {
      const [ data ] = await once(sock, 'data')
      is(data.toString(), 'test')
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
  socket.write('test')
  await network.close()
  await client.close()
})

test('send data to client peer', async ({ is }) => {
  const network = promisifyApi(guts({
    socket (socket) {
      socket.write('test')
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
  const [ data ] = await once(socket, 'data')
  is(data.toString(), 'test')
  await network.close()
  await client.close()
})

test('send data bidrectionally between network and client', async ({ is, plan }) => {
  plan(2)
  const network = promisifyApi(guts({
    async socket (socket) {
      const [ data ] = await once(socket, 'data')
      is(data.toString(), 'from client')
      socket.write('from network')
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
  socket.write('from client')
  const [ data ] = await once(socket, 'data')
  is(data.toString(), 'from network')
  await network.close()
  await client.close()
})

test('two networks, connect and close', async ({ ok, pass }) => {
  const network = promisifyApi(guts({
    socket (sock) { ok(sock, 'got server socket') }
  }))
  await network.bind()
  const client = promisifyApi(guts())
  const { port } = network.address()
  const host = '127.0.0.1'
  const socket = await client.connect({ port, host })
  ok(socket, 'got client socket')
  await client.close()
  pass('client closed')
  await network.close()
  pass('network closed')
})

test('referrer node (remote peer)', async ({ ok, pass }) => {
  const network = promisifyApi(guts({
    socket (sock) { ok(sock, 'got server socket') }
  }))
  await network.bind()
  const client = promisifyApi(guts())
  const { port } = network.address()
  const host = '127.0.0.1'
  const socket = await client.connect({ port, host })
  ok(socket, 'got client socket')
  await client.close()
  pass('client closed')
  await network.close()
  pass('network closed')
})


// enable this test when bug is fixed/to fix bug, see first test
// test('bug-fix – statefulness issue: ensure socket method option is called on a instance that is bind after prior instance is bound and closed', async ({is, plan}) => {
//   const x = promisifyApi(guts())
//   await x.bind()
//   await x.close()
//   plan(1)
//   const network = promisifyApi(guts({
//     socket(sock) {
//       is(sock instanceof Socket, true)
//     }
//   }))
//   await network.bind()
//   const client = promisifyApi(guts())
//   const { port } = network.address()
//   const host = '127.0.0.1'
//   await client.connect({ port, host })
//   await network.close()
//   await client.close()
// })