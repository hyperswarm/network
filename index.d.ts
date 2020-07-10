import Nanoresource from 'nanoresource'
import UtpNative from 'utp-native'
import { Server, Socket } from 'net'
import { Discovery, Peer, Topic, AnnounceOptions } from '@hyperswarm/discovery'

declare function _exports(opts?: NetworkResourceOptions): NetworkResource;
export default _exports
export { NetworkResource };

export interface NetworkResourceOptions {
  bind?: () => void
  close?: () => void
  socket?: () => void
  bootstrap?: Array<string>
  ephemeral?:boolean
}

declare class NetworkResource extends Nanoresource {
  constructor(opts?: NetworkResourceOptions);
  preferredPort: number;
  tcp: Server;
  utp: UtpNative;
  discovery: Discovery;
  options: NetworkResourceOptions;
  sockets: Set<Socket>;
  private _announceLocalAddress: boolean;
  private _onbind: () => void;
  private _onclose: () => void;
  private _onsocket: () => void;
  private _bootstrap: Array<string>;
  private _ephemeral: boolean;
  private _onincoming(isTCP: boolean, socket: Socket): void;
  address(): {
      host: string;
      port: number;
  };
  /** Connect to a peer. Will do UDP holepunching. If the underlying socket is a TCP socket isTCP will be true, if it is a UTP socket it will be false. */
  connect(peer: Peer, cb: ( err:Error, socket:Socket, isTCP:boolean ) => void ): void;
  /** Start announcing the network on the Hyperswarm discovery network. */
  announce(topic:Buffer, options?: AnnounceOptions): Topic;
  /** Start doing a lookup on the Hyperswarm discovery network. */
  lookupOne(topic:Buffer, cd?: () => void ): void;
  /** Lookup a single peer on the Hyperswarm discovery network. */
  lookup(topic:Buffer, opts?: boolean): Topic;
  /** Bind to a preferred port. Must be called before connecting. Safe to call multiple times. If already bound or binding it will call the callback when fully bound. */
  bind(preferredPort?: number, cb?: () => void ): void;
  private _localAddress(): {
    host: string;
    port: number;
  };
  private _open(cb: any): void;
  private _removeSocket(socket: any): void;
  private _close(cb: any): void;
}
