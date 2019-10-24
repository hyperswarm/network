'use strict'
const utp = require('utp-native')
const net = require('net')
const Nanoresource = require('nanoresource')
const discovery = require('@hyperswarm/discovery')

const CONNECTION_TIMEOUT = 10000 // TODO: make configurable

module.exports = (opts) => new NetworkResource(opts)

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
    this._announceLocalAddress = !!opts.announceLocalAddress
    this._onbind = opts.bind || noop
    this._onclose = opts.close || noop
    this._onsocket = opts.socket || noop
    this._bootstrap = opts.bootstrap
    this._ephemeral = opts.ephemeral !== false

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
    const timeout = setTimeout(ontimeout, CONNECTION_TIMEOUT)
    let timedout = false
    let connected = false
    let active = [tcp]
    let closes = 1
    tcp.on('error', ontcperror)
    tcp.on('connect', onconnect)
    tcp.on('close', onclose)
    if (!peer.referrer) return
    closes++
    this.open(onopen)

    function onopen (err) {
      if (err) return onerror(err)
      self.discovery.holepunch(peer, onholepunch)
    }

    function ontimeout () {
      timedout = true
      for (const socket of active) socket.destroy()
      cb(new Error('Timeout'))
    }

    function onholepunch (err) {
      if (connected || timedout) return
      if (err) return onerror(err)

      const utp = self.utp.connect(peer.port, peer.host)

      utp.on('error', onutperror)
      utp.on('connect', onconnect)
      utp.on('close', onclose)
      active.push(utp)
    }

    function onconnect () {
      const socket = this
      if (self.closed || connected || timedout) return socket.destroy()

      // eagerly destroy dead sockets by now
      for (const a of active) {
        if (a !== socket) a.destroy()
      }

      clearTimeout(timeout)
      connected = true
      self.sockets.add(socket)
      cb(null, socket, tcp === socket)
    }

    function onerror (err) {
      if (!--closes && !connected && !timedout) {
        clearTimeout(timeout)
        cb(err || new Error('All sockets failed'))
      }
    }

    function onclose () {
      self.sockets.delete(this) // only one of the sockets are added but this still works
      onerror(null)
    }
  }

  announce (key, { lookup = false } = {}) {
    if (!this.discovery) throw new Error('Bind before announcing')
    const localPort = this.tcp.address().port
    const localAddress = this._localAddress()
    return this.discovery.announce(key, { port: 0, localPort, localAddress, lookup })
  }

  lookupOne (key, cb) {
    if (!this.discovery) throw new Error('Bind before doing a lookup')
    const localAddress = this._localAddress()
    this.discovery.lookupOne(key, { localAddress }, cb)
  }

  lookup (key) {
    if (!this.discovery) throw new Error('Bind before doing a lookup')
    const localAddress = this._localAddress()
    return this.discovery.lookup(key, { localAddress })
  }

  bind (preferredPort, cb) {
    if (typeof preferredPort === 'function') {
      return this.open(preferredPort)
    }
    this.preferredPort = preferredPort || 0
    this.open(cb)
  }

  _localAddress () {
    if (!this._announceLocalAddress) return null
    const ip = localIp()
    if (!ip) return null
    return {
      host: ip,
      port: this.tcp.address().port
    }
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
      self.discovery = discovery({
        bootstrap: self._bootstrap,
        ephemeral: self._ephemeral,
        socket: self.utp
      })
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
        tcp.once('close', () => cb(err))
        tcp.close()
        return
      }

      cb(null)
    })
  })
}

function ontcperror (err) {
  if (this.destroyed === false) this.destroy(err)
}

function onutperror (err) {
  if (this.destroyed === false) this.destroy(err)
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

function localIp () {
  const os = require('os')
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    const addrs = nets[name]
    for (const addr of addrs) {
      if (!addr.internal && addr.family === 'IPv4') {
        return addr.address
      }
    }
  }
  return null
}

module.exports.NetworkResource = NetworkResource
