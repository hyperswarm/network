const utp = require('utp-native')
const net = require('net')
const Nanoresource = require('nanoresource')
const discovery = require('@hyperswarm/discovery')

module.exports = (opts, handlers) => new NetworkResource(opts, handlers)

class NetworkResource extends Nanoresource {
  constructor (opts) {
    if (!opts) opts = {}
    super()
    this.preferredPort = opts.preferredPort || 0
    this.tcp = net.createServer()
    this.utp = utp()
    this.discovery = null
    this.options = opts
    this.sockets = new Set()

    this._onopen = opts.open || noop
    this._onclose = opts.close || noop
    this._onsocket = opts.socket || noop
    this._onbind = opts.bind || noop

    this.utp.on('connection', this._onincoming.bind(this, false))
    this.tcp.on('connection', this._onincoming.bind(this, true))
  }

  _onincoming (isTCP, socket) {
    this.sockets.add(socket)
    socket.on('close', this._removeSocket.bind(this, socket))
    this._onsocket(socket, isTCP)
  }

  address () {
    return this.tcp.address()
  }

  connect (peer, cb) {
    const self = this
    const tcp = net.connect(peer.port, peer.host)
    let connected = false
    let closes = 1

    tcp.on('error', tcp.destroy)
    tcp.on('connect', onconnect)
    tcp.on('close', onclose)

    if (!peer.referrer) return

    closes++
    this.open(onopen)

    function onopen (err) {
      if (err) {
        if (!--closes) return cb(new Error('Could not connect'))
        return
      }

      self.discovery.holepunch(peer, onholepunch)
    }

    function onholepunch (err) {
      if (connected) return

      if (err) {
        if (!--closes) return cb(err)
        return
      }

      const utp = self.utp.connect(peer.port, peer.host)

      utp.on('error', utp.destroy)
      utp.on('connect', onconnect)
      utp.on('close', onclose)
    }

    function onconnect () {
      const socket = this

      if (self.closed || connected) return socket.destroy()

      connected = true
      self.sockets.add(socket)
      cb(null, socket, tcp === socket)
    }

    function onclose () {
      self.sockets.delete(this) // only one of the sockets are added but this still works
      if (!--closes && !connected) cb(new Error('All sockets failed'))
    }
  }

  announce (key) {
    if (!this.discovery) throw new Error('Bind before announcing')
    const localPort = this.tcp.address().port
    return this.discovery.announce(key, { localPort })
  }

  lookupOne (key, cb) {
    if (!this.discovery) throw new Error('Bind before doing a lookup')
    this.discovery.lookupOne(key, cb)
  }

  lookup (key, cb) {
    if (!this.discovery) throw new Error('Bind before doing a lookup')
    this.discovery.lookup(key, cb)
  }

  bind (preferredPort, cb) {
    if (typeof preferredPort === 'function') {
      return this.open(preferredPort)
    }
    this.preferredPort = preferredPort || 0
    this.open(cb)
  }

  _open (cb) {
    const self = this

    let tries = 1
    listenBoth(this.tcp, this.utp, this.preferredPort, retry)

    function retry (err) {
      if (!err) return onlisten()
      if (++tries === 5) return cb(err)
      listenBoth(self.tcp, self.utp, 0, retry)
    }

    function onlisten () {
      self.discovery = discovery({ socket: self.utp })
      self._onopen()
      self._onbind()
      cb(null)
    }
  }

  _removeSocket (socket) {
    this.sockets.delete(socket)
  }

  _close (cb) {
    const self = this

    this.discovery.destroy()
    this.discovery.on('close', ondiscoveryclose)

    function ondiscoveryclose () {
      let missing = 2

      for (const socket of self.sockets) socket.destroy()
      self.sockets.clear()

      self.tcp.close()
      self.utp.close()

      self.tcp.on('close', onclose)
      self.utp.on('close', onclose)

      function onclose () {
        if (--missing) return
        self.discovery = null
        self._onclose()
        cb(null)
      }
    }
  }
}

function listenBoth (tcp, utp, port, cb) {
  listen(tcp, port, function (err) {
    if (err) return cb(err)

    listen(utp, tcp.address().port, function (err) {
      if (err) {
        tcp.once('close', cb)
        tcp.close()
        return
      }

      cb(null)
    })
  })
}

function listen (server, port, cb) {
  server.on('listening', done)
  server.on('error', done)
  server.listen(port)

  function done (err) {
    server.removeListener('listening', done)
    server.removeListener('error', done)
    cb(err)
  }
}

function noop () {}
