// @ts-check
import { print } from '../../../logger.js';
import { version, connect, waitUntil, targetToString } from '../../../util.js';
import { WebSocket, createWebSocketStream } from 'ws';
/**
 * @typedef {import('node:stream').Duplex} Duplex
 * @param {import('../../../types.js').Proxy} proxy
 * @param {import('../../../types.js').Target} next
 * @param {AbortSignal} signal
 * @param {Duplex} [socket]
 * @returns {Promise<Duplex>}
 * */
export async function createConnection(proxy, next, signal, socket){
    let _socket = await connect(proxy, signal, socket);
    const ws = new WebSocket(`wss://${proxy.hostname}:${proxy.port}/`, { //@ts-ignore
        createConnection: ()=>_socket, signal, headers:{  Host: next.hostname+':'+next.port, 'User-Agent': 'fog/v'+version }
    });
    await waitUntil(ws, 'open', signal);
    print(['ws', 'conn'], {level: -1}, '%s via proxy %s', targetToString(next), targetToString(proxy));
    return createWebSocketStream(ws, {autoDestroy: true});
}