// @ts-check
import http from 'node:http';
import { Duplex } from 'node:stream';
import { format, print } from '../../../logger.js';
import { version, connect, waitUntil, targetToString } from '../../../util.js';
/**
 * @param {import('../../../types.js').Proxy} proxy
 * @param {import('../../../types.js').Target} next
 * @param {AbortSignal} signal
 * @param {Duplex} [socket]
 * @returns {Promise<Duplex>}
 * */
export async function createConnection(proxy, next, signal, socket) {
    /** @type {Duplex} */
    let _socket = await connect(proxy, signal, socket);
    const request = http.request({
        hostname: proxy.hostname,
        port: proxy.port, signal,
        method: 'POST', headers: { Target: next.hostname + ':' + next.port, 'User-Agent': 'fog/v' + version },
        // @ts-ignore createConnection() can return any value as long as it is a Duplex.
        createConnection: () => _socket,
    });
    if (proxy.authorization) request.setHeader('Proxy-Authorization', proxy.authorization);
    request.flushHeaders();
    const [response] = await waitUntil(request, 'response');
    response.once('error', onError);
    request.once('error', onError);
    if(response.statusCode !== 200){
        request.destroy(); response.destroy();
        print({level: -1}, ['scifin', 'errRespHeaders'], 'Headers: %o', response.headers);
        throw new Error(format({level: 2}, ['err'], 'Status code during handshake with %s: %d', targetToString(proxy), response.statusCode));
    }
    print({level: -1}, ['scifin','conn'], '%s:%s via proxy %s:%s', next.hostname, next.port, proxy.hostname, proxy.port);
    const duplex = Duplex.from({ readable: response, writable: request });
    function onError(/** @type {NodeJS.ErrnoException} */ err) {
        duplex.destroy(err);
        request.off('error', onError);
        response.off('error', onError);
        print({level: 2}, ['scifin', 'err'], err.code || err.message);
    }
    return duplex;
}