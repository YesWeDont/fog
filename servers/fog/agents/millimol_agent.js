// @ts-check
import http from 'node:http';
import { format, print } from '../../../logger.js';
import { version, connect, waitUntil, targetToString } from '../../../util.js';
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
    let request = http.request({
        hostname: proxy.hostname, signal,
        port: proxy.port, method:'GET', 
        path: next.hostname+':'+next.port, // @ts-ignore createConnection() can return any value as long as it is a Duplex.
        createConnection: ()=>_socket,
        headers:{ Host: next.hostname+':'+next.port, 'User-Agent': 'fog/v'+version, upgrade: 'millimol' }
    });
    if(proxy.authorization) request.setHeader('Proxy-Authorization', proxy.authorization);
    request.end();
    const [response, res_socket] = await waitUntil(request, 'upgrade', signal);
    if(response.statusCode !== 200){
        request.destroy();
        print({level: -1}, ['http', 'errRespHeaders'], 'Headers: %o', response.headers);
        throw new Error(format({level: 2}, ['err'], 'Status code during handshake with %s: %d', targetToString(proxy), response.statusCode));
    }
    print({level:-1}, ['http', 'conn'], '%s via proxy %s', targetToString(next), targetToString(proxy));
    function cleanup(wasError){
        if(!wasError) res_socket.off('error', onError);
        _socket.destroy(); // clean up other underlying sockets etc
    }
    function onError(err){ print({level:2}, ['http', 'err'], err.code || err.message); }
    res_socket.once('error', onError);
    res_socket.once('close', cleanup);
    return res_socket;
}