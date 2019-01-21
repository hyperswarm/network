# @hyperswarm/guts

The low level networking guts of the Hyperswarm stack as a seperate module

```
npm install @hyperswarm/guts
```

## Usage

``` js
const guts = require('@hyperswarm/guts')

const network = guts()

network.bind(function () {
  // topic should be a 32 byte buffer
  network.lookupOne(topic, function (err, peer) {
    if (err) throw err
    network.connect(peer, function (err, socket) {
      if (err) throw err
      socket.write('Hello World!')
    })
  })
})
```

## API

#### `network = guts([options])`

Create a new guts instance.

Options include:

``` js
{
  bind () {
    // called when the network is bound
  },
  close () {
    // called when the network is fully closed
  },
  socket (socket) {
    // called when an incoming socket is received
  }
}
```

#### `network.bind([preferredPort], [callback])`

Bind to a preferred port. Must be called before connecting.

Safe to call multiple times. If already bound or binding it will call
the callback when fully bound.

#### `network.close([callback])`

Fully close the network.

Safe to call multiple times.

#### `network.connect(peer, callback)`

Connect to a peer. Will do UDP holepunching.

Callback is called with `(err, socket, isTCP)`. If the underlying socket is a TCP socket `isTCP` will be true, if it is a UTP socket it will be false.

#### `announcer = network.announce(topic)`

Start announcing the network on the Hyperswarm discovery network.

#### `lookup = network.lookup(topic)`

Start doing a lookup on the Hyperswarm discovery network.

#### `network.lookupOne(topic, callback)`

Lookup a single peer on the Hyperswarm discovery network.

## License

MIT
