const tape = require('tape')
const guts = require('../')
const { randomBytes } = require('crypto')

tape('discover and connect', function (assert) {
  const network = guts({
    socket (socket) {
      assert.pass('got socket')
      socket.once('data', function (data) {
        assert.same(data, Buffer.from('a'))
        socket.write('b')
      })
    }
  })

  network.bind(function () {
    const client = guts()
    const topic = randomBytes(32)

    network.announce(topic).once('update', function () {
      client.bind(function () {
        client.lookupOne(topic, function (err, peer) {
          assert.error(err, 'no error')
          client.connect(peer, function (err, socket) {
            assert.error(err, 'no error')
            socket.write('a')
            socket.once('data', function (data) {
              assert.same(data, Buffer.from('b'))
              close([ client, network ], () => assert.end())
            })
          })
        })
      })
    })
  })
})

tape('2 networks, connect and close', function (assert) {
  assert.plan(5)

  const network = guts({
    socket (socket) {
      assert.pass('got server socket')
    }
  })

  network.bind(function () {
    const client = guts()

    client.connect({ port: network.address().port, host: '127.0.0.1' }, function (err, socket) {
      assert.error(err, 'no error')
      assert.pass('got client socket')
      client.close(() => assert.pass('client closed'))
      network.close(() => assert.pass('client closed'))
    })
  })
})

function close (nets, cb) {
  let missing = nets.length
  let error = null

  for (const n of nets) n.close(onclose)

  function onclose (err) {
    if (err) error = err
    if (!--missing) cb(error)
  }
}
